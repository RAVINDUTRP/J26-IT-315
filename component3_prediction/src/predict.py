from datetime import datetime, timezone


def assess(site_id: str, history) -> dict:
    """Entry point used by the backend. TODO(C3): load model, build features, predict, explain, detect anomaly."""
    return {
        "site_id": site_id, "timestamp": datetime.now(timezone.utc).isoformat(), "horizon_h": 6,
        "risk_score": 0.0, "risk_category": "low", "confidence": 0.0,
        "explanation": [], "anomaly": {"flag": False, "kind": "none", "score": 0.0},
    }
