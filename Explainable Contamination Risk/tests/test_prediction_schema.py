"""
Automated unit tests for inference output JSON schema and scientific integrity rules.
"""

import sys
import json
from pathlib import Path
import pytest

_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from src.utils import get_project_root
from src.inference import ContaminationRiskInferenceEngine


def test_prediction_output_json_schema():
    root = get_project_root()
    hybrid_path = root / "models" / "hybrid" / "selected_hybrid_model.joblib"
    if not hybrid_path.exists():
        pytest.skip("Model artifact not yet available.")

    sample_path = root / "data" / "inference_samples" / "sample_input.json"
    if not sample_path.exists():
        sample_path = root / "inference" / "sample_input.json"
    with open(sample_path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    engine = ContaminationRiskInferenceEngine()
    result = engine.predict(payload)

    # 1. Mandatory top-level keys
    required_keys = [
        "prediction_timestamp",
        "location_id",
        "latitude",
        "longitude",
        "current_water_quality",
        "current_wqi_score",
        "current_water_quality_status",
        "current_contamination_detected",
        "prediction_horizon_hours",
        "future_contamination_probability",
        "future_risk_score",
        "future_risk_category",
        "prediction_confidence",
        "anomaly_detected",
        "sensor_anomaly_detected",
        "top_contributing_features",
        "model_name",
        "data_provenance"
    ]
    for k in required_keys:
        assert k in result, f"Mandatory key '{k}' missing from inference output."

    # Validate Current Water Quality schema
    cwq = result["current_water_quality"]
    assert "wqi_score" in cwq and isinstance(cwq["wqi_score"], (int, float))
    assert "status" in cwq and cwq["status"] in ["EXCELLENT", "GOOD", "FAIR", "POOR", "VERY_POOR"]
    assert "contamination_detected" in cwq and isinstance(cwq["contamination_detected"], bool)
    assert "sub_indices" in cwq and isinstance(cwq["sub_indices"], dict)

    # 2. Strict type & range constraints
    assert isinstance(result["prediction_timestamp"], str)
    assert isinstance(result["location_id"], str)
    assert isinstance(result["latitude"], (int, float))
    assert isinstance(result["longitude"], (int, float))
    assert result["prediction_horizon_hours"] == 3

    assert isinstance(result["future_contamination_probability"], float)
    assert 0.0 <= result["future_contamination_probability"] <= 1.0

    assert isinstance(result["future_risk_score"], float)
    assert 0.0 <= result["future_risk_score"] <= 100.0

    assert result["future_risk_category"] in ["LOW", "MEDIUM", "HIGH"]

    # 3. Scientific Integrity Check: prediction_confidence must NOT be an invented number
    assert result["prediction_confidence"] is None, (
        "Per specification, prediction_confidence must be null unless formal statistical uncertainty is calibrated."
    )

    assert isinstance(result["anomaly_detected"], bool)
    assert isinstance(result["sensor_anomaly_detected"], bool)
    assert isinstance(result["top_contributing_features"], list)
    assert isinstance(result["model_name"], str)
