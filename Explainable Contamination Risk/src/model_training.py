"""
Baseline and Gradient Boosted Tree Model Training Engine.
Trains, evaluates, and persists Logistic Regression, Random Forest, and XGBoost
classifiers for 3-hour contamination risk prediction.
"""

import sys
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional
import numpy as np
import pandas as pd
import joblib

from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, average_precision_score, confusion_matrix, brier_score_loss
)
import xgboost as xgb

_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from src.utils import get_project_root, load_model_config

logger = logging.getLogger("contamination_risk.model_training")


def compute_metrics(y_true: np.ndarray, y_prob: np.ndarray, threshold: float = 0.5) -> Dict[str, float]:
    """Compute exhaustive binary classification performance metrics."""
    y_pred = (y_prob >= threshold).astype(int)
    cm = confusion_matrix(y_true, y_pred)
    tn, fp, fn, tp = cm.ravel() if cm.shape == (2, 2) else (cm[0, 0], 0, 0, 0)

    fpr = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0

    metrics = {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "precision": round(float(precision_score(y_true, y_pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_true, y_pred, zero_division=0)), 4),
        "f1_score": round(float(f1_score(y_true, y_pred, zero_division=0)), 4),
        "roc_auc": round(float(roc_auc_score(y_true, y_prob)), 4) if len(np.unique(y_true)) > 1 else 0.5,
        "pr_auc": round(float(average_precision_score(y_true, y_prob)), 4) if len(np.unique(y_true)) > 1 else 0.0,
        "false_positive_rate": round(fpr, 4),
        "brier_score": round(float(brier_score_loss(y_true, y_prob)), 4),
        "true_positives": int(tp),
        "false_positives": int(fp),
        "true_negatives": int(tn),
        "false_negatives": int(fn)
    }
    return metrics


class BaselineModelsTrainer:
    """Trains fair baselines using current raw water-quality observations only."""

    RAW_FEATURES = ["ph", "turbidity_ntu", "tds_ppm", "ec_us_cm", "water_temp_c"]

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or load_model_config().get("baseline", {})
        self.root_dir = get_project_root()
        self.models_dir = self.root_dir / "models" / "baseline"
        self.models_dir.mkdir(parents=True, exist_ok=True)

    def train_logistic_regression(
        self, X_train: np.ndarray, y_train: np.ndarray
    ) -> LogisticRegression:
        """Train balanced Logistic Regression baseline."""
        cfg = self.config.get("logistic_regression", {})
        model = LogisticRegression(
            C=cfg.get("C", 1.0),
            max_iter=cfg.get("max_iter", 1000),
            class_weight="balanced",
            random_state=42
        )
        model.fit(X_train, y_train)
        return model

    def train_random_forest(
        self, X_train: np.ndarray, y_train: np.ndarray
    ) -> RandomForestClassifier:
        """Train Random Forest baseline."""
        cfg = self.config.get("random_forest", {})
        model = RandomForestClassifier(
            n_estimators=cfg.get("n_estimators", 150),
            max_depth=cfg.get("max_depth", 10),
            min_samples_split=cfg.get("min_samples_split", 5),
            class_weight="balanced",
            random_state=42,
            n_jobs=-1
        )
        model.fit(X_train, y_train)
        return model

    def save_model(self, model: Any, filename: str) -> Path:
        """Save baseline model to disk."""
        out_path = self.models_dir / filename
        joblib.dump(model, out_path)
        logger.info(f"Saved baseline model to {out_path}.")
        return out_path


class XGBoostModelTrainer:
    """Trains high-capacity gradient boosted tree classifier with all engineered features."""

    def __init__(self, feature_names: List[str], config: Optional[Dict[str, Any]] = None):
        self.feature_names = feature_names
        self.config = config or load_model_config().get("xgboost", {})
        self.root_dir = get_project_root()
        self.models_dir = self.root_dir / "models" / "xgboost"
        self.models_dir.mkdir(parents=True, exist_ok=True)

    def train(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray,
        y_val: np.ndarray
    ) -> Tuple[xgb.XGBClassifier, Dict[str, Any]]:
        """Train XGBoost model with early stopping on validation set."""
        pos_ratio = (len(y_train) - sum(y_train)) / max(1, sum(y_train))
        scale_pos_weight = self.config.get("scale_pos_weight", pos_ratio)

        model = xgb.XGBClassifier(
            n_estimators=self.config.get("n_estimators", 250),
            max_depth=self.config.get("max_depth", 5),
            learning_rate=self.config.get("learning_rate", 0.05),
            subsample=self.config.get("subsample", 0.85),
            colsample_bytree=self.config.get("colsample_bytree", 0.85),
            scale_pos_weight=scale_pos_weight,
            eval_metric="logloss",
            random_state=42,
            early_stopping_rounds=self.config.get("early_stopping_rounds", 25),
            n_jobs=-1
        )

        logger.info(f"Fitting XGBoost classifier with scale_pos_weight={scale_pos_weight:.2f}...")
        model.fit(
            X_train, y_train,
            eval_set=[(X_train, y_train), (X_val, y_val)],
            verbose=False
        )

        # Feature importances
        importance_dict = dict(zip(self.feature_names, [float(x) for x in model.feature_importances_]))
        sorted_importance = dict(sorted(importance_dict.items(), key=lambda item: item[1], reverse=True))

        metadata = {
            "model_type": "XGBClassifier",
            "best_iteration": int(model.best_iteration) if hasattr(model, "best_iteration") else None,
            "feature_names": self.feature_names,
            "top_10_features": dict(list(sorted_importance.items())[:10]),
            "scale_pos_weight": float(scale_pos_weight)
        }
        return model, metadata

    def save_model(self, model: xgb.XGBClassifier, metadata: Dict[str, Any]) -> Tuple[Path, Path]:
        """Save fitted XGBoost model and training metadata."""
        model_path = self.models_dir / "xgboost_model.joblib"
        joblib.dump(model, model_path)

        meta_path = self.models_dir / "xgboost_metadata.json"
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2)

        logger.info(f"Saved XGBoost model to {model_path}.")
        return model_path, meta_path
