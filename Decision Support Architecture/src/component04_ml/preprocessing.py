"""
Component 04: Preprocessing & Data Transformation Pipeline.
Implements a strict, leakage-safe scikit-learn compatible preprocessor
fitted exclusively on training data and serializable via Joblib.
"""

from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Union
import joblib
import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from src.component04_ml.feature_engineering import engineer_decision_features

NUMERICAL_COLS = [
    "contamination_probability",
    "prediction_confidence",
    "estimated_exposed_population",
    "communication_delay_seconds",
    "rainfall_mm",
    "environmental_change_score",
    "sensor_data_freshness_seconds",
    "missing_input_count",
    "risk_exposure_index",
    "infrastructure_hazard_index",
    "telemetry_staleness_index",
    "rainfall_runoff_hazard",
    "total_resources_available"
]

CATEGORICAL_COLS = [
    "contamination_risk_category",
    "infrastructure_importance",
    "communication_status",
    "catchment_zone"
]

BINARY_COLS = [
    "alternative_water_available",
    "inspection_team_available",
    "treatment_resource_available",
    "resource_bottleneck_flag"
]

EXCLUDED_COLS = ["scenario_id", "generation_timestamp", "priority_level"]


class DecisionDataPreprocessor(BaseEstimator, TransformerMixin):
    """
    Fits imputation, scaling, and categorical encoding on training scenarios.
    Ensures identical feature schema alignment during inference.
    """

    def __init__(self):
        self.num_cols = NUMERICAL_COLS
        self.cat_cols = CATEGORICAL_COLS
        self.bin_cols = BINARY_COLS
        self.column_transformer: Optional[ColumnTransformer] = None
        self.fitted_feature_names: List[str] = []
        self.is_fitted = False

    def _build_pipeline(self) -> ColumnTransformer:
        num_pipeline = Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler())
        ])

        cat_pipeline = Pipeline([
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False))
        ])

        bin_pipeline = Pipeline([
            ("imputer", SimpleImputer(strategy="most_frequent"))
        ])

        transformer = ColumnTransformer(
            transformers=[
                ("num", num_pipeline, self.num_cols),
                ("cat", cat_pipeline, self.cat_cols),
                ("bin", bin_pipeline, self.bin_cols)
            ],
            remainder="drop"
        )
        return transformer

    def fit(self, X: pd.DataFrame, y=None) -> "DecisionDataPreprocessor":
        """Fits imputer, scalers, and encoders exclusively on X_train."""
        X_eng = engineer_decision_features(X)
        self.column_transformer = self._build_pipeline()
        self.column_transformer.fit(X_eng)
        self.is_fitted = True

        # Extract output feature names
        names = []
        # Numerical
        names.extend(self.num_cols)
        # Categorical one-hot
        cat_encoder = self.column_transformer.named_transformers_["cat"].named_steps["encoder"]
        for cat_col, cats in zip(self.cat_cols, cat_encoder.categories_):
            for c in cats:
                names.append(f"{cat_col}_{c}")
        # Binary
        names.extend(self.bin_cols)
        self.fitted_feature_names = names

        return self

    def _ensure_compatibility(self) -> None:
        """
        Cross-version patch for scikit-learn estimators.
        Fixes AttributeError: 'SimpleImputer' object has no attribute '_fill_dtype'
        when an object serialized on scikit-learn < 1.8 is deserialized on >= 1.8.
        """
        if self.column_transformer is None:
            return

        transformers = getattr(self.column_transformer, "transformers_", [])
        if not transformers and hasattr(self.column_transformer, "transformers"):
            transformers = self.column_transformer.transformers

        for item in transformers:
            if not isinstance(item, (tuple, list)) or len(item) < 2:
                continue
            trans = item[1]
            if trans in ("drop", "passthrough") or trans is None:
                continue

            steps = getattr(trans, "steps", None)
            if steps:
                for _, step_obj in steps:
                    self._patch_imputer(step_obj)
            else:
                self._patch_imputer(trans)

    @staticmethod
    def _patch_imputer(estimator: Any) -> None:
        if estimator is None:
            return
        if hasattr(estimator, "statistics_") and not hasattr(estimator, "_fill_dtype"):
            stats = getattr(estimator, "statistics_", None)
            if stats is not None and hasattr(stats, "dtype"):
                estimator._fill_dtype = stats.dtype
            else:
                estimator._fill_dtype = np.float64

    def transform(self, X: pd.DataFrame) -> np.ndarray:
        """Applies fitted transformations to incoming DataFrame."""
        if not self.is_fitted or self.column_transformer is None:
            raise RuntimeError("Preprocessor has not been fitted yet. Call fit() first.")
        self._ensure_compatibility()
        X_eng = engineer_decision_features(X)

        # Ensure all expected columns exist so ColumnTransformer and Imputers can process them
        for col in self.num_cols:
            if col not in X_eng.columns:
                X_eng[col] = np.nan
        for col in self.cat_cols:
            if col not in X_eng.columns:
                X_eng[col] = np.nan
        for col in self.bin_cols:
            if col not in X_eng.columns:
                X_eng[col] = np.nan

        return self.column_transformer.transform(X_eng)

    def fit_transform(self, X: pd.DataFrame, y=None) -> np.ndarray:
        return self.fit(X, y).transform(X)

    def save(self, filepath: Union[str, Path]) -> None:
        """Persists fitted preprocessor to disk."""
        filepath = Path(filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, filepath)

    @classmethod
    def load(cls, filepath: Union[str, Path]) -> "DecisionDataPreprocessor":
        """Loads fitted preprocessor from disk with cross-version compatibility patching."""
        preprocessor = joblib.load(filepath)
        if isinstance(preprocessor, DecisionDataPreprocessor):
            preprocessor._ensure_compatibility()
        return preprocessor
