"""Risk scoring and Component 04-compatible assessment records."""

from datetime import datetime, timezone
import pandas as pd
from .anomaly import detect_anomalies


def risk_category(score: float, thresholds=(0.35, 0.65, 0.85)) -> str:
    if score < thresholds[0]:
        return "low"
    if score < thresholds[1]:
        return "moderate"
    if score < thresholds[2]:
        return "high"
    return "critical"


def assess(site_id: str, history: pd.DataFrame, bundle: dict, horizon_h: int = 3) -> dict:
    """Predict future risk; confidence remains null because calibration is not implemented."""
    features = history[bundle["feature_columns"]].tail(1)
    score = float(bundle["pipeline"].predict_proba(features)[0, 1])
    anomaly_df = detect_anomalies(history)
    anomaly = anomaly_df.iloc[-1]
    return {
        "site_id": site_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "location": {"location_id": site_id},
        "horizon_h": horizon_h,
        "risk_score": score,
        "risk_category": risk_category(score),
        "confidence": None,
        "explanation": [],
        "anomaly": {"flag": bool(anomaly["anomaly_flag"]), "kind": str(anomaly["anomaly_kind"]),
                    "score": None if pd.isna(anomaly["anomaly_score"]) else float(anomaly["anomaly_score"])},
        "model_version": bundle.get("model_kind", "unknown"),
    }
