"""
Component 04: Machine Learning Model Training Module.
Trains, tunes, and serializes Random Forest and XGBoost classifiers
for 4-class disaster response priority prediction (P1, P2, P3, P4).
"""

import json
import logging
from pathlib import Path
from typing import Dict, Any, Tuple, Optional, Union
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import StratifiedKFold, cross_val_score
import xgboost as xgb
import yaml

from src.component04_ml import get_project_root
from src.component04_ml.preprocessing import DecisionDataPreprocessor

logger = logging.getLogger("component04.model_training")

LABEL_TO_INT = {"P1": 0, "P2": 1, "P3": 2, "P4": 3}
INT_TO_LABEL = {0: "P1", 1: "P2", 2: "P3", 3: "P4"}


def train_models(
    train_df: Optional[pd.DataFrame] = None,
    val_df: Optional[pd.DataFrame] = None,
    config: Optional[Dict[str, Any]] = None,
    models_dir: Optional[Path] = None,
    train_data_path: Optional[Union[str, Path]] = None,
    output_models_dir: Optional[Union[str, Path]] = None,
    random_seed: int = 42,
    cv_folds: int = 5
) -> Dict[str, Any]:
    """
    Fits preprocessing pipeline and trains Random Forest and XGBoost classifiers.
    Saves serialized models and metadata to models_dir.
    """
    root_dir = get_project_root()
    if models_dir is None and output_models_dir is not None:
        models_dir = Path(output_models_dir)
    models_dir = models_dir or (root_dir / "models")
    models_dir.mkdir(parents=True, exist_ok=True)

    if train_df is None:
        if train_data_path is not None:
            train_df = pd.read_csv(train_data_path)
        else:
            train_path = root_dir / "data" / "processed" / "train_scenarios.csv"
            train_df = pd.read_csv(train_path)

    y_train_raw = train_df["priority_level"].values
    y_train = np.array([LABEL_TO_INT[lbl] for lbl in y_train_raw])

    # 1. Fit Preprocessor exclusively on training scenarios
    logger.info("Fitting DecisionDataPreprocessor on training scenarios...")
    preprocessor = DecisionDataPreprocessor()
    X_train_scaled = preprocessor.fit_transform(train_df)
    feature_names = preprocessor.fitted_feature_names

    preprocessor_path = models_dir / "preprocessor.joblib"
    preprocessor.save(preprocessor_path)
    logger.info(f"Saved preprocessor ({len(feature_names)} features) to {preprocessor_path}")

    # 2. Train Random Forest Classifier
    rf_params = config.get("models", {}).get("random_forest", {}) if config else {}
    rf_kwargs = {
        "n_estimators": rf_params.get("n_estimators", 150),
        "max_depth": rf_params.get("max_depth", 12),
        "min_samples_split": rf_params.get("min_samples_split", 5),
        "min_samples_leaf": rf_params.get("min_samples_leaf", 2),
        "random_state": rf_params.get("random_state", 42),
        "n_jobs": -1
    }
    logger.info(f"Training Random Forest Classifier with params: {rf_kwargs}...")
    rf_model = RandomForestClassifier(**rf_kwargs)
    rf_model.fit(X_train_scaled, y_train)

    rf_path = models_dir / "random_forest_model.joblib"
    joblib.dump(rf_model, rf_path)
    logger.info(f"Saved Random Forest model to {rf_path}")

    # 3. Train XGBoost Classifier
    xgb_params = config.get("models", {}).get("xgboost", {}) if config else {}
    xgb_kwargs = {
        "n_estimators": xgb_params.get("n_estimators", 150),
        "max_depth": xgb_params.get("max_depth", 6),
        "learning_rate": xgb_params.get("learning_rate", 0.08),
        "subsample": xgb_params.get("subsample", 0.85),
        "colsample_bytree": xgb_params.get("colsample_bytree", 0.85),
        "random_state": xgb_params.get("random_state", 42),
        "n_jobs": -1,
        "eval_metric": "mlogloss",
        "objective": "multi:softprob",
        "num_class": 4
    }
    logger.info(f"Training XGBoost Classifier with params: {xgb_kwargs}...")
    xgb_model = xgb.XGBClassifier(**xgb_kwargs)

    if val_df is not None:
        y_val_raw = val_df["priority_level"].values
        y_val = np.array([LABEL_TO_INT[lbl] for lbl in y_val_raw])
        X_val_scaled = preprocessor.transform(val_df)
        xgb_model.fit(
            X_train_scaled, y_train,
            eval_set=[(X_val_scaled, y_val)],
            verbose=False
        )
    else:
        xgb_model.fit(X_train_scaled, y_train, verbose=False)

    xgb_path = models_dir / "xgboost_model.joblib"
    joblib.dump(xgb_model, xgb_path)
    logger.info(f"Saved XGBoost model to {xgb_path}")

    # 4. Cross-Validation Benchmarking
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    rf_cv_scores = cross_val_score(rf_model, X_train_scaled, y_train, cv=skf, scoring="f1_macro")
    xgb_cv_scores = cross_val_score(xgb_model, X_train_scaled, y_train, cv=skf, scoring="f1_macro")

    rf_mean_f1 = float(np.mean(rf_cv_scores))
    xgb_mean_f1 = float(np.mean(xgb_cv_scores))

    logger.info(f"5-Fold CV Macro F1 -> Random Forest: {rf_mean_f1:.4f}, XGBoost: {xgb_mean_f1:.4f}")

    # Select Primary Model based on cross-validation macro F1
    if xgb_mean_f1 >= rf_mean_f1:
        selected_model = xgb_model
        selected_name = "xgboost_classifier"
        selected_model_path = xgb_path
    else:
        selected_model = rf_model
        selected_name = "random_forest_classifier"
        selected_model_path = rf_path

    primary_path = models_dir / "selected_model.joblib"
    joblib.dump(selected_model, primary_path)
    logger.info(f"Selected {selected_name} as primary production model -> {primary_path}")

    # 5. Save Metadata
    metadata = {
        "selected_model_name": selected_name,
        "classes": ["P1", "P2", "P3", "P4"],
        "class_mapping": LABEL_TO_INT,
        "n_training_samples": len(train_df),
        "n_features": len(feature_names),
        "feature_names": feature_names,
        "cv_macro_f1": {
            "random_forest": round(rf_mean_f1, 4),
            "xgboost": round(xgb_mean_f1, 4)
        },
        "rf_hyperparameters": rf_kwargs,
        "xgb_hyperparameters": xgb_kwargs
    }

    meta_path = models_dir / "model_metadata.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    return {
        "preprocessor": preprocessor,
        "random_forest": rf_model,
        "xgboost": xgb_model,
        "selected_model": selected_model,
        "selected_name": selected_name,
        "metadata": metadata
    }


train_decision_models = train_models

