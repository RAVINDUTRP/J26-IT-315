"""
Hybrid Ensemble and LSTM Sequence Architecture Engine.
Integrates temporal deep learning sequences with gradient-boosted trees,
fits stacking meta-learners on validation out-of-fold predictions, and persists
the final production ensemble.
"""

import sys
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional, Union
import numpy as np
import pandas as pd
import joblib

from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss, roc_auc_score

_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from src.utils import get_project_root, load_model_config

logger = logging.getLogger("contamination_risk.hybrid_ensemble")


def create_sequences_by_location(
    df: pd.DataFrame,
    feature_cols: List[str],
    target_col: str,
    sequence_length: int = 12
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Construct 3D temporal sequences (samples, timesteps, features) strictly within
    each monitoring location to eliminate boundary leakage across geographic sites.
    """
    X_seqs = []
    y_seqs = []
    indices = []

    for loc_id, group in df.groupby("location_id"):
        group_features = group[feature_cols].values
        group_targets = group[target_col].values
        group_idx = group.index.values

        for i in range(len(group) - sequence_length + 1):
            seq = group_features[i : i + sequence_length]
            target = group_targets[i + sequence_length - 1]
            idx = group_idx[i + sequence_length - 1]

            X_seqs.append(seq)
            y_seqs.append(target)
            indices.append(idx)

    return np.array(X_seqs, dtype=np.float32), np.array(y_seqs, dtype=np.float32), np.array(indices)


class LSTMTemporalClassifier:
    """
    Keras/TensorFlow LSTM for sequential water contamination risk prediction.
    """

    def __init__(self, sequence_length: int, num_features: int, config: Optional[Dict[str, Any]] = None):
        self.sequence_length = sequence_length
        self.num_features = num_features
        self.config = config or load_model_config().get("lstm", {})
        self.model = None
        self.is_trained = False
        self.root_dir = get_project_root()
        self.models_dir = self.root_dir / "models" / "lstm"
        self.models_dir.mkdir(parents=True, exist_ok=True)

    def build_model(self) -> Any:
        """Construct LSTM graph with regularization."""
        try:
            import tensorflow as tf
            from tensorflow.keras.models import Sequential
            from tensorflow.keras.layers import Input, LSTM, Dense, Dropout, BatchNormalization
            from tensorflow.keras.optimizers import Adam

            units = self.config.get("units", [64, 32])
            dropout = self.config.get("dropout", 0.20)
            lr = self.config.get("learning_rate", 0.001)

            model = Sequential([
                Input(shape=(self.sequence_length, self.num_features)),
                LSTM(units[0], return_sequences=True),
                Dropout(dropout),
                BatchNormalization(),
                LSTM(units[1], return_sequences=False),
                Dropout(dropout),
                Dense(self.config.get("dense_units", 16), activation="relu"),
                Dense(1, activation="sigmoid")
            ])
            model.compile(
                optimizer=Adam(learning_rate=lr),
                loss="binary_crossentropy",
                metrics=["accuracy", tf.keras.metrics.AUC(name="auc")]
            )
            self.model = model
            return model
        except Exception as e:
            logger.warning(f"Could not build Keras LSTM model: {e}")
            self.model = None
            return None

    def train(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray,
        y_val: np.ndarray,
        class_weight: Optional[Dict[int, float]] = None
    ) -> Any:
        """Train LSTM network with early stopping."""
        if self.model is None:
            self.build_model()
        if self.model is None:
            raise RuntimeError("TensorFlow is not available in the current environment.")

        from tensorflow.keras.callbacks import EarlyStopping

        patience = self.config.get("patience", 5)
        epochs = self.config.get("epochs", 30)
        batch_size = self.config.get("batch_size", 32)

        callbacks = [EarlyStopping(monitor="val_loss", patience=patience, restore_best_weights=True)]

        logger.info(f"Training LSTM network (Sequence={self.sequence_length}, Features={self.num_features})...")
        history = self.model.fit(
            X_train, y_train,
            validation_data=(X_val, y_val),
            epochs=epochs,
            batch_size=batch_size,
            class_weight=class_weight,
            callbacks=callbacks,
            verbose=0
        )
        self.is_trained = True
        return history

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """Predict positive class probabilities."""
        if self.model is None or not self.is_trained:
            raise RuntimeError("LSTM model is not trained.")
        preds = self.model.predict(X, verbose=0).flatten()
        return preds

    def save(self) -> Path:
        """Save Keras weights and architecture."""
        out_path = self.models_dir / "lstm_model.keras"
        self.model.save(str(out_path))
        logger.info(f"Saved LSTM model to {out_path}.")
        return out_path


class HybridEnsemble:
    """
    Ensemble combining tabular XGBoost predictions with temporal sequence models
    via optimal probability blending or logistic stacking.
    """

    def __init__(self, method: str = "weighted_blend", blend_weight_xgb: float = 0.65):
        self.method = method
        self.blend_weight_xgb = blend_weight_xgb
        self.stacking_meta_model = None
        self.base_models = {}
        self.root_dir = get_project_root()
        self.models_dir = self.root_dir / "models" / "hybrid"
        self.models_dir.mkdir(parents=True, exist_ok=True)

    def optimize_blend_weights(
        self, y_val: np.ndarray, prob_xgb_val: np.ndarray, prob_alt_val: np.ndarray
    ) -> float:
        """
        Search for optimal blending weight w in [0, 1] on VALIDATION SET ONLY to maximize ROC-AUC / minimize Log-Loss.
        """
        best_w = 0.5
        best_auc = -1.0

        for w in np.linspace(0.0, 1.0, 21):
            blended = w * prob_xgb_val + (1.0 - w) * prob_alt_val
            auc = roc_auc_score(y_val, blended)
            if auc > best_auc:
                best_auc = auc
                best_w = w

        logger.info(f"Optimized validation blend weight: w_xgb={best_w:.2f} (Val ROC-AUC={best_auc:.4f})")
        self.blend_weight_xgb = best_w
        return best_w

    def fit_stacking_meta_learner(
        self, y_val: np.ndarray, prob_xgb_val: np.ndarray, prob_alt_val: np.ndarray
    ) -> LogisticRegression:
        """
        Train stacking Logistic Regression meta-learner strictly on out-of-fold/validation predictions.
        """
        X_meta = np.column_stack([prob_xgb_val, prob_alt_val])
        meta = LogisticRegression(C=1.0, random_state=42)
        meta.fit(X_meta, y_val)
        self.stacking_meta_model = meta
        logger.info(f"Trained stacking meta-learner. Coefficients: {meta.coef_[0]}")
        return meta

    def predict_proba(
        self, X_or_prob_xgb: np.ndarray, prob_alt: Optional[np.ndarray] = None
    ) -> np.ndarray:
        """
        Combine predictions according to configured ensemble strategy.
        Supports both:
        - Scikit-learn estimator interface: predict_proba(X) where X is feature matrix
        - Direct probability blending: predict_proba(prob_xgb, prob_alt)
        Returns (n_samples, 2) array of [prob_neg, prob_pos].
        """
        if prob_alt is not None:
            prob_xgb = X_or_prob_xgb
            if self.method == "stacking" and self.stacking_meta_model is not None:
                X_meta = np.column_stack([prob_xgb, prob_alt])
                p1 = self.stacking_meta_model.predict_proba(X_meta)[:, 1]
            else:
                w = self.blend_weight_xgb
                p1 = w * prob_xgb + (1.0 - w) * prob_alt
            return np.column_stack([1.0 - p1, p1])

        # Otherwise X_or_prob_xgb is feature matrix X
        X = X_or_prob_xgb
        if "xgboost" not in self.base_models:
            raise RuntimeError("Base models not attached to HybridEnsemble.")

        xgb_model = self.base_models["xgboost"]
        xgb_p = xgb_model.predict_proba(X)
        prob_xgb = xgb_p[:, 1] if xgb_p.ndim == 2 else xgb_p

        alt_model = self.base_models.get("alternative", self.base_models.get("random_forest", None))
        if alt_model is not None:
            alt_p = alt_model.predict_proba(X)
            prob_alt_calc = alt_p[:, 1] if alt_p.ndim == 2 else alt_p
        else:
            prob_alt_calc = prob_xgb

        if self.method == "stacking" and self.stacking_meta_model is not None:
            X_meta = np.column_stack([prob_xgb, prob_alt_calc])
            p1 = self.stacking_meta_model.predict_proba(X_meta)[:, 1]
        else:
            w = self.blend_weight_xgb
            p1 = w * prob_xgb + (1.0 - w) * prob_alt_calc

        return np.column_stack([1.0 - p1, p1])

    def predict(self, X: np.ndarray) -> np.ndarray:
        """Predict binary classification labels using 0.5 decision threshold."""
        probs = self.predict_proba(X)
        return (probs[:, 1] >= 0.5).astype(int)

    def save(self, metadata: Dict[str, Any]) -> Tuple[Path, Path]:
        """Save hybrid ensemble parameters and production metadata."""
        model_path = self.models_dir / "selected_hybrid_model.joblib"
        joblib.dump(self, model_path)

        meta_path = self.models_dir / "model_metadata.json"
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2)

        logger.info(f"Saved hybrid ensemble to {model_path}.")
        return model_path, meta_path

    @classmethod
    def load(cls, filepath: Optional[Path] = None) -> "HybridEnsemble":
        """Load hybrid ensemble from disk."""
        in_path = filepath or (get_project_root() / "models" / "hybrid" / "selected_hybrid_model.joblib")
        return joblib.load(in_path)
