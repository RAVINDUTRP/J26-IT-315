"""Temporal feature engineering for Component 03."""

import numpy as np
import pandas as pd

ALIASES = {
    "site_id": "location_id", "site": "location_id",
    "ph": "pH", "turbidity_ntu": "turbidity",
    "ec_us_cm": "electrical_conductivity", "tds_ppm": "TDS",
    "temp_c": "water_temperature", "rainfall_mm_h": "rainfall_mm",
}


def standardize_columns(df: pd.DataFrame) -> pd.DataFrame:
    result = df.copy().rename(columns={k: v for k, v in ALIASES.items() if k in df})
    if "timestamp" in result:
        result["timestamp"] = pd.to_datetime(result["timestamp"], errors="coerce", utc=True)
    if "location_id" not in result:
        result["location_id"] = "default"
    return result


def build_features(df: pd.DataFrame, windows: tuple[int, ...] = (3, 6, 12)) -> pd.DataFrame:
    """Build temporal features separately per location in chronological order."""
    result = standardize_columns(df)
    if "timestamp" not in result:
        raise ValueError("A timestamp column is required for temporal features.")
    result = result.sort_values(["location_id", "timestamp"]).reset_index(drop=True)
    groups = result.groupby("location_id", sort=False)
    if "rainfall_mm" not in result:
        result["rainfall_mm"] = 0.0
    result["rainfall_intensity"] = result["rainfall_mm"]
    result["rainfall_increase_rate"] = groups["rainfall_mm"].diff().fillna(0)
    for window in windows:
        result[f"accumulated_rainfall_{window}h"] = groups["rainfall_mm"].transform(
            lambda s: s.rolling(window, min_periods=1).sum()
        )
    for column in ("turbidity", "pH", "electrical_conductivity", "TDS"):
        if column not in result:
            continue
        result[f"{column}_lag_1"] = groups[column].shift(1)
        result[f"{column}_change"] = groups[column].diff()
        result[f"{column}_ma_3"] = groups[column].transform(
            lambda s: s.rolling(3, min_periods=1).mean()
        )
    result["hour"] = result["timestamp"].dt.hour
    result["day_of_week"] = result["timestamp"].dt.dayofweek
    result["month"] = result["timestamp"].dt.month
    angle = result["hour"] * 2 * np.pi / 24
    result["hour_sin"], result["hour_cos"] = np.sin(angle), np.cos(angle)
    return result


def add_future_target(df: pd.DataFrame, horizon_steps: int = 3) -> pd.DataFrame:
    """Create the maximum validated contamination label in the next observations."""
    if "contamination_label" not in df:
        raise ValueError("A contamination_label column is required to create a future target.")
    result = standardize_columns(df).sort_values(["location_id", "timestamp"]).copy()
    result["future_contamination"] = result.groupby("location_id", sort=False)[
        "contamination_label"
    ].transform(lambda s: s.shift(-1).rolling(horizon_steps, min_periods=horizon_steps).max())
    return result
