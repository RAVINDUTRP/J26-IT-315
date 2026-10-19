"""
Unit tests for Component 04 Production Inference Engine.
"""

import sys
from pathlib import Path
import pandas as pd
import pytest

_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from src.component04_ml.inference import DecisionInferenceEngine


@pytest.fixture
def sample_critical_scenario():
    return {
        "scenario_id": "TEST_CRITICAL_01",
        "catchment_zone": "Kelani_Estuary_Municipal_Intake",
        "contamination_probability": 0.92,
        "contamination_risk_category": "HIGH",
        "prediction_confidence": 0.95,
        "estimated_exposed_population": 40000,
        "infrastructure_importance": "CRITICAL",
        "communication_status": "ONLINE",
        "communication_delay_seconds": 10.0,
        "rainfall_mm": 50.0,
        "environmental_change_score": -0.60,
        "alternative_water_available": 0,
        "inspection_team_available": 1,
        "treatment_resource_available": 1,
        "sensor_data_freshness_seconds": 25.0,
        "missing_input_count": 0
    }


def test_inference_engine_prediction(sample_critical_scenario):
    models_dir = _root_dir / "models"
    if not (models_dir / "selected_model.joblib").exists():
        pytest.skip("Model not yet trained.")

    engine = DecisionInferenceEngine()
    result = engine.predict_scenario(sample_critical_scenario)

    assert "predicted_priority" in result
    assert result["predicted_priority"] in ["P1", "P2", "P3", "P4"]
    assert "class_probabilities" in result
    assert isinstance(result["class_probabilities"], dict)
    assert len(result["class_probabilities"]) == 4

    prob_sum = sum(result["class_probabilities"].values())
    assert 0.99 <= prob_sum <= 1.01

    assert "reasons" in result
    assert isinstance(result["reasons"], list)
    assert len(result["reasons"]) > 0

    assert "priority_content" in result
    assert isinstance(result["priority_content"], dict)
    assert "recommended_actions" in result["priority_content"]
    assert len(result["priority_content"]["recommended_actions"]) > 0


def test_inference_repeatability(sample_critical_scenario):
    models_dir = _root_dir / "models"
    if not (models_dir / "selected_model.joblib").exists():
        pytest.skip("Model not yet trained.")

    engine = DecisionInferenceEngine()
    res1 = engine.predict_scenario(sample_critical_scenario)
    res2 = engine.predict_scenario(sample_critical_scenario)

    assert res1["predicted_priority"] == res2["predicted_priority"]
    assert res1["class_probabilities"] == res2["class_probabilities"]


def test_invalid_input_raises_error():
    models_dir = _root_dir / "models"
    if not (models_dir / "selected_model.joblib").exists():
        pytest.skip("Model not yet trained.")

    engine = DecisionInferenceEngine()
    with pytest.raises(ValueError):
        engine.predict_scenario({"invalid_key": 999})


def test_missing_optional_inputs():
    models_dir = _root_dir / "models"
    if not (models_dir / "selected_model.joblib").exists():
        pytest.skip("Model not yet trained.")

    engine = DecisionInferenceEngine()
    scen_missing = {
        "scenario_id": "TEST_MISSING",
        "catchment_zone": "Sedawatta_Floodplain_Basin",
        "contamination_probability": 0.55,
        "estimated_exposed_population": 5000,
        "infrastructure_importance": "STANDARD",
        "missing_input_count": 3
    }
    res = engine.predict_scenario(scen_missing)
    assert res["predicted_priority"] in ["P1", "P2", "P3", "P4"]
    assert "class_probabilities" in res


def test_stale_data_scenario():
    models_dir = _root_dir / "models"
    if not (models_dir / "selected_model.joblib").exists():
        pytest.skip("Model not yet trained.")

    engine = DecisionInferenceEngine()
    scen_stale = {
        "scenario_id": "TEST_STALE",
        "catchment_zone": "Pugoda_Textile_Corridor",
        "contamination_probability": 0.60,
        "sensor_data_freshness_seconds": 7200.0,
        "communication_status": "DEGRADED"
    }
    res = engine.predict_scenario(scen_stale)
    assert res["operational_flags"]["stale_telemetry"] is True
    assert res["operational_flags"]["communication_degraded"] is True


def test_resource_constrained_scenario():
    models_dir = _root_dir / "models"
    if not (models_dir / "selected_model.joblib").exists():
        pytest.skip("Model not yet trained.")

    engine = DecisionInferenceEngine()
    scen_res = {
        "scenario_id": "TEST_BOTTLENECK",
        "contamination_probability": 0.80,
        "alternative_water_available": 0,
        "inspection_team_available": 0,
        "treatment_resource_available": 0
    }
    res = engine.predict_scenario(scen_res)
    assert res["operational_flags"]["resource_bottleneck"] is True
    assert res["predicted_priority"] in ["P1", "P2"]


def test_batch_inference(sample_critical_scenario):
    models_dir = _root_dir / "models"
    if not (models_dir / "selected_model.joblib").exists():
        pytest.skip("Model not yet trained.")

    engine = DecisionInferenceEngine()
    scen_low = {
        "scenario_id": "TEST_LOW",
        "contamination_probability": 0.05,
        "estimated_exposed_population": 500,
        "infrastructure_importance": "MINOR"
    }
    batch_df = pd.DataFrame([sample_critical_scenario, scen_low])
    results = engine.predict_batch(batch_df)
    assert len(results) == 2
    assert results[0]["predicted_priority"] == "P1"
    assert results[1]["predicted_priority"] == "P4"


def test_model_loading_failure(tmp_path):
    with pytest.raises(FileNotFoundError):
        DecisionInferenceEngine(models_dir=tmp_path / "non_existent_dir")

