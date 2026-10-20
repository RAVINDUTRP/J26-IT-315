"""
Automated unit tests for standalone inference engine and production predictions.
"""

import sys
import json
from pathlib import Path
import numpy as np
import pytest

_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from src.utils import get_project_root
from src.inference import ContaminationRiskInferenceEngine, run_inference, compute_water_quality_index


@pytest.fixture
def sample_payload():
    root = get_project_root()
    sample_path = root / "data" / "inference_samples" / "sample_input.json"
    if not sample_path.exists():
        sample_path = root / "inference" / "sample_input.json"
    with open(sample_path, "r", encoding="utf-8") as f:
        return json.load(f)


def test_inference_engine_prediction(sample_payload):
    root = get_project_root()
    hybrid_path = root / "models" / "hybrid" / "selected_hybrid_model.joblib"
    xgb_path = root / "models" / "xgboost" / "xgboost_model.joblib"
    if not hybrid_path.exists() and not xgb_path.exists():
        pytest.skip("Models not yet trained.")

    engine = ContaminationRiskInferenceEngine()
    result = engine.predict(sample_payload)

    # Current Water Quality checks
    assert "current_water_quality" in result
    assert "current_wqi_score" in result
    assert "current_water_quality_status" in result
    assert "current_contamination_detected" in result
    assert 0.0 <= result["current_wqi_score"] <= 100.0
    assert result["current_water_quality_status"] in ["EXCELLENT", "GOOD", "FAIR", "POOR", "VERY_POOR"]
    assert isinstance(result["current_contamination_detected"], bool)

    # Future Forecast checks
    assert "future_contamination_probability" in result
    assert "future_risk_score" in result
    assert "future_risk_category" in result
    assert result["future_risk_category"] in ["LOW", "MEDIUM", "HIGH"]
    assert 0.0 <= result["future_contamination_probability"] <= 1.0
    assert 0.0 <= result["future_risk_score"] <= 100.0


def test_inference_repeatability(sample_payload):
    root = get_project_root()
    hybrid_path = root / "models" / "hybrid" / "selected_hybrid_model.joblib"
    if not hybrid_path.exists():
        pytest.skip("Model artifact not yet available.")

    engine = ContaminationRiskInferenceEngine()
    res1 = engine.predict(sample_payload)
    res2 = engine.predict(sample_payload)

    assert res1["future_contamination_probability"] == res2["future_contamination_probability"]
    assert res1["future_risk_score"] == res2["future_risk_score"]
    assert res1["future_risk_category"] == res2["future_risk_category"]


def test_missing_field_graceful_handling(sample_payload):
    root = get_project_root()
    hybrid_path = root / "models" / "hybrid" / "selected_hybrid_model.joblib"
    if not hybrid_path.exists():
        pytest.skip("Model artifact not yet available.")

    engine = ContaminationRiskInferenceEngine()
    stripped_payload = sample_payload.copy()
    # Remove recent history section
    if "recent_history_1h" in stripped_payload:
        del stripped_payload["recent_history_1h"]

    result = engine.predict(stripped_payload)
    assert "future_contamination_probability" in result
    # Check that input_warnings contains notices about imputed fields
    assert len(result["input_warnings"]) > 0


def test_sensor_fault_detection(sample_payload):
    root = get_project_root()
    hybrid_path = root / "models" / "hybrid" / "selected_hybrid_model.joblib"
    if not hybrid_path.exists():
        pytest.skip("Model artifact not yet available.")

    engine = ContaminationRiskInferenceEngine()
    faulty_payload = json.loads(json.dumps(sample_payload))
    # Invalidate pH to 16.5
    faulty_payload["current_observation"]["ph"] = 16.5
    faulty_payload["current_observation"]["sensor_confidence"] = 0.40

    result = engine.predict(faulty_payload)
    assert result["sensor_anomaly_detected"] is True
    assert len(result["sensor_fault_diagnostics"]) >= 1


def test_compute_water_quality_index():
    # Pristine/Clean water
    pristine_obs = {
        "ph": 7.2,
        "turbidity_ntu": 3.0,
        "tds_ppm": 85.0,
        "ec_us_cm": 150.0,
        "water_temp_c": 26.5
    }
    pristine_res = compute_water_quality_index(pristine_obs)
    assert pristine_res["wqi_score"] >= 80.0
    assert pristine_res["status"] in ["EXCELLENT", "GOOD"]
    assert pristine_res["contamination_detected"] is False

    # Heavily contaminated water
    polluted_obs = {
        "ph": 4.1,
        "turbidity_ntu": 120.0,
        "tds_ppm": 950.0,
        "ec_us_cm": 1800.0,
        "water_temp_c": 34.0
    }
    polluted_res = compute_water_quality_index(polluted_obs)
    assert polluted_res["wqi_score"] < 50.0
    assert polluted_res["status"] in ["POOR", "VERY_POOR"]
    assert polluted_res["contamination_detected"] is True

