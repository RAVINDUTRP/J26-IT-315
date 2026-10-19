"""
Preprocessing Pipeline and Chronological Splitter.
Guarantees leakage-free data partitioning, feature-specific imputation,
standard scaling, and persistent preprocessing artifact export.
"""

import sys
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional
import numpy as np
import pandas as pd
import joblib
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.preprocessing import StandardScaler, RobustScaler
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline

_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from src.utils import get_project_root, load_model_config

logger = logging.getLogger("contamination_risk.preprocessing")


class ChronologicalSplitter:
    """
    Performs time-ordered dataset partitioning without shuffling,
    preventing future data points from bleeding into training history.
    """

    def __init__(self, test_ratio: float = 0.20, val_ratio: float = 0.15):
        self.test_ratio = test_ratio
        self.val_ratio = val_ratio
        self.train_ratio = 1.0 - (test_ratio + val_ratio)

    def split(
        self, df: pd.DataFrame, time_col: str = "timestamp"
    ) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        """
        Partition dataframe into Train, Validation, and Test subsets chronologically.
        """
        df_sorted = df.sort_values(by=time_col).reset_index(drop=True)
        unique_times = df_sorted[time_col].drop_duplicates().sort_values().values
        n_times = len(unique_times)

        train_cutoff_idx = int(n_times * self.train_ratio)
        val_cutoff_idx = int(n_times * (self.train_ratio + self.val_ratio))

        train_time_max = unique_times[train_cutoff_idx]
        val_time_max = unique_times[val_cutoff_idx]

        train_df = df_sorted[df_sorted[time_col] < train_time_max].copy()
        val_df = df_sorted[(df_sorted[time_col] >= train_time_max) & (df_sorted[time_col] < val_time_max)].copy()
        test_df = df_sorted[df_sorted[time_col] >= val_time_max].copy()

        logger.info(
            f"Chronological split: Train={len(train_df)} ({train_df[time_col].min()} to {train_df[time_col].max()}), "
            f"Val={len(val_df)} ({val_df[time_col].min()} to {val_df[time_col].max()}), "
            f"Test={len(test_df)} ({test_df[time_col].min()} to {test_df[time_col].max()})"
        )
        return train_df, val_df, test_df


class EnvironmentalPreprocessor:
    """
    Fit-Transform Preprocessing pipeline fitted exclusively on training data.
    """

    def __init__(self, feature_names: List[str], scaler_type: str = "standard"):
        self.feature_names = feature_names
        self.scaler_type = scaler_type
        self.imputer = SimpleImputer(strategy="median")
        self.scaler = StandardScaler() if scaler_type == "standard" else RobustScaler()
        self.is_fitted = False
        self.root_dir = get_project_root()

    def fit(self, X: pd.DataFrame) -> "EnvironmentalPreprocessor":
        """Fit imputer and scaler only on training features."""
        X_mat = X[self.feature_names].values
        self.imputer.fit(X_mat)
        imputed = self.imputer.transform(X_mat)
        self.scaler.fit(imputed)
        self.is_fitted = True
        return self

    def transform(self, X: pd.DataFrame) -> np.ndarray:
        """Impute and scale incoming feature matrix."""
        if not self.is_fitted:
            raise RuntimeError("Preprocessor must be fitted before calling transform.")
        X_mat = X[self.feature_names].values
        imputed = self.imputer.transform(X_mat)
        scaled = self.scaler.transform(imputed)
        return scaled

    def fit_transform(self, X: pd.DataFrame) -> np.ndarray:
        return self.fit(X).transform(X)

    def save(self, filepath: Optional[Path] = None) -> Path:
        """Persist preprocessor to disk via joblib."""
        out_path = filepath or (self.root_dir / "models" / "preprocessing" / "preprocessor.joblib")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, out_path)
        logger.info(f"Saved fitted preprocessor to {out_path}.")
        return out_path

    @classmethod
    def load(cls, filepath: Optional[Path] = None) -> "EnvironmentalPreprocessor":
        """Load fitted preprocessor from disk."""
        in_path = filepath or (get_project_root() / "models" / "preprocessing" / "preprocessor.joblib")
        if not in_path.exists():
            raise FileNotFoundError(f"Preprocessor artifact not found at {in_path}.")
        return joblib.load(in_path)
