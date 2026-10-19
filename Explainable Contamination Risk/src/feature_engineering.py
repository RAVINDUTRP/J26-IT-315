"""
Temporal Feature Engineering Engine.
Generates leakage-safe rolling meteorology, lagged water quality indices,
change rates, and seasonal markers partitioned by monitoring location.
"""

import sys
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import pandas as pd

_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from src.utils import get_project_root, load_feature_config

logger = logging.getLogger("contamination_risk.feature_engineering")


class EnvironmentalFeatureEngineer:
    """
    Constructs multi-scale temporal features with strict prevention of future data leakage.
    Ensures per-location grouping and valid time indexing.
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or load_feature_config()
        self.root_dir = get_project_root()
        self.sampling_min = self.config.get("sampling_interval_min", 15)
        self.steps_per_hour = int(60 / self.sampling_min)  # 4 steps per hour for 15-min sampling

    def extract_calendar_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Derive cyclical and seasonal time attributes."""
        ts = pd.to_datetime(df["timestamp"])
        hour = ts.dt.hour
        month = ts.dt.month
        dayofweek = ts.dt.dayofweek

        # Sri Lanka Seasonality:
        # Southwest Monsoon: May (5) to September (9)
        # Northeast Monsoon: December (12) to February (2)
        # First Inter-monsoon: March (3) to April (4)
        # Second Inter-monsoon: October (10) to November (11)
        is_sw_monsoon = month.isin([5, 6, 7, 8, 9]).astype(int)
        is_ne_monsoon = month.isin([12, 1, 2]).astype(int)
        is_monsoon = (is_sw_monsoon | is_ne_monsoon).astype(int)

        calendar_df = pd.DataFrame(index=df.index)
        calendar_df["hour"] = hour
        calendar_df["day_of_week"] = dayofweek
        calendar_df["month"] = month
        calendar_df["is_weekend"] = dayofweek.isin([5, 6]).astype(int)
        calendar_df["is_monsoon"] = is_monsoon

        # Cyclical harmonic encodings for smooth continuity across 24h & 12m
        calendar_df["hour_sin"] = np.sin(2 * np.pi * hour / 24.0)
        calendar_df["hour_cos"] = np.cos(2 * np.pi * hour / 24.0)
        calendar_df["month_sin"] = np.sin(2 * np.pi * (month - 1) / 12.0)
        calendar_df["month_cos"] = np.cos(2 * np.pi * (month - 1) / 12.0)

        return calendar_df

    def engineer_location_features(self, group: pd.DataFrame) -> pd.DataFrame:
        """
        Compute temporal features within a single monitoring location to ensure
        spatial and causal boundary isolation.
        """
        group = group.sort_values(by="timestamp").copy()

        # 1. Rolling Cumulative Rainfall
        rain = group["rainfall_mm"]
        group["rain_1h_mm"] = rain.rolling(window=1 * self.steps_per_hour, min_periods=1).sum()
        group["rain_3h_mm"] = rain.rolling(window=3 * self.steps_per_hour, min_periods=1).sum()
        group["rain_6h_mm"] = rain.rolling(window=6 * self.steps_per_hour, min_periods=1).sum()
        group["rain_24h_mm"] = rain.rolling(window=24 * self.steps_per_hour, min_periods=1).sum()

        # Rainfall change rate (intensity surge)
        group["rainfall_intensity"] = group["rain_1h_mm"] / 1.0  # mm/h
        group["rainfall_change_rate"] = group["rain_1h_mm"] - group["rain_1h_mm"].shift(self.steps_per_hour).fillna(0.0)

        # 2. Lagged Water Quality Features (1h and 3h lags)
        lag_1h = 1 * self.steps_per_hour
        lag_3h = 3 * self.steps_per_hour

        group["turbidity_lag_1h"] = group["turbidity_ntu"].shift(lag_1h)
        group["ph_lag_1h"] = group["ph"].shift(lag_1h)
        group["tds_lag_1h"] = group["tds_ppm"].shift(lag_1h)
        group["ec_lag_1h"] = group["ec_us_cm"].shift(lag_1h)

        group["turbidity_lag_3h"] = group["turbidity_ntu"].shift(lag_3h)
        group["ph_lag_3h"] = group["ph"].shift(lag_3h)

        # 3. Rolling Means (3h smoothing window)
        window_3h = 3 * self.steps_per_hour
        group["turbidity_avg_3h"] = group["turbidity_ntu"].rolling(window=window_3h, min_periods=1).mean()
        group["ph_avg_3h"] = group["ph"].rolling(window=window_3h, min_periods=1).mean()
        group["tds_avg_3h"] = group["tds_ppm"].rolling(window=window_3h, min_periods=1).mean()
        group["ec_avg_3h"] = group["ec_us_cm"].rolling(window=window_3h, min_periods=1).mean()

        # 4. Water Quality Derivative / Change Rates (Delta over 1h)
        group["turbidity_change_rate"] = group["turbidity_ntu"] - group["turbidity_lag_1h"]
        group["ph_change_rate"] = group["ph"] - group["ph_lag_1h"]
        group["tds_change_rate"] = group["tds_ppm"] - group["tds_lag_1h"]
        group["ec_change_rate"] = group["ec_us_cm"] - group["ec_lag_1h"]

        # Backfill initial lag steps using earliest valid values to preserve series length
        lag_cols = [
            "turbidity_lag_1h", "ph_lag_1h", "tds_lag_1h", "ec_lag_1h",
            "turbidity_lag_3h", "ph_lag_3h", "turbidity_change_rate",
            "ph_change_rate", "tds_change_rate", "ec_change_rate"
        ]
        for c in lag_cols:
            group[c] = group[c].bfill()

        return group

    def transform(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, List[str]]:
        """
        Execute full temporal feature engineering pipeline across all locations.
        Returns transformed DataFrame and list of feature names.
        """
        logger.info("Starting temporal feature engineering...")
        df_sorted = df.sort_values(by=["location_id", "timestamp"]).copy()

        # Group-wise temporal calculations
        location_dfs = []
        for loc_id, group in df_sorted.groupby("location_id"):
            loc_engineered = self.engineer_location_features(group)
            location_dfs.append(loc_engineered)

        result_df = pd.concat(location_dfs, axis=0).sort_values(by=["timestamp", "location_id"]).reset_index(drop=True)

        # Calendar features
        calendar_df = self.extract_calendar_features(result_df)
        for col in calendar_df.columns:
            result_df[col] = calendar_df[col]

        # Identify numerical feature list for ML models
        exclude_cols = [
            "timestamp", "location_id", "sensor_status", "weather_data_type",
            "future_contamination_event", "future_risk_score", "future_risk_category"
        ]
        feature_names = [c for c in result_df.columns if c not in exclude_cols]

        logger.info(f"Engineered {len(feature_names)} features across {len(result_df)} records.")
        return result_df, feature_names

    def save_features(self, df: pd.DataFrame, feature_names: List[str]) -> Path:
        """Save processed features and feature schema metadata."""
        proc_dir = self.root_dir / "data" / "processed"
        meta_dir = self.root_dir / "models" / "metadata"
        proc_dir.mkdir(parents=True, exist_ok=True)
        meta_dir.mkdir(parents=True, exist_ok=True)

        out_path = proc_dir / "engineered_features.csv"
        df.to_csv(out_path, index=False)
        logger.info(f"Saved engineered features to {out_path}.")

        schema = {
            "feature_names": feature_names,
            "feature_count": len(feature_names),
            "sampling_interval_min": self.sampling_min,
            "target_variables": [
                "future_contamination_event", "future_risk_score", "future_risk_category"
            ]
        }
        schema_path = meta_dir / "feature_schema.json"
        with open(schema_path, "w", encoding="utf-8") as f:
            json.dump(schema, f, indent=2)
        logger.info(f"Saved feature schema to {schema_path}.")
        return out_path


def engineer_features() -> Tuple[pd.DataFrame, List[str]]:
    """Helper entry point for notebook feature generation."""
    from src.data_loader import load_raw_data
    raw_df = load_raw_data()
    fe = EnvironmentalFeatureEngineer()
    df_feat, names = fe.transform(raw_df)
    fe.save_features(df_feat, names)
    return df_feat, names
