"""Separate unsupervised anomaly detection for measurements and engineered features."""

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest


def detect_anomalies(df: pd.DataFrame, feature_columns: list[str] | None = None,
                     contamination: float = 0.05, random_state: int = 42) -> pd.DataFrame:
    result = df.copy()
    feature_columns = feature_columns or [
        c for c in ("pH", "turbidity", "electrical_conductivity", "TDS",
                    "water_temperature", "rainfall_mm") if c in result
    ]
    if not feature_columns:
        raise ValueError("No numeric measurements are available for anomaly detection.")
    values = result[feature_columns].apply(pd.to_numeric, errors="coerce")
    valid = values.notna().all(axis=1)
    if valid.sum() < 5:
        raise ValueError("At least 5 complete observations are required for anomaly detection.")
    model = IsolationForest(contamination=min(max(contamination, 0.001), 0.5),
                            random_state=random_state)
    model.fit(values.loc[valid])
    result["anomaly_flag"], result["anomaly_score"] = False, np.nan
    result.loc[valid, "anomaly_flag"] = model.predict(values.loc[valid]) == -1
    result.loc[valid, "anomaly_score"] = -model.decision_function(values.loc[valid])
    result["anomaly_kind"] = np.where(result["anomaly_flag"], "pollution_pattern", "none")
    return result
