"""
Unit tests for Component 04 Data Validation Module.
"""

import sys
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from src.component04_ml.data_validation import DataValidator


@pytest.fixture
def valid_dataframe():
    return pd.DataFrame({
        "scenario_id": ["SCEN_00001", "SCEN_00002"],
        "contamination_probability": [0.85, 0.12],
        "contamination_risk_category": ["HIGH", "LOW"],
        "prediction_confidence": [0.92, 0.88],
        "estimated_exposed_population": [12000, 450],
        "infrastructure_importance": ["CRITICAL", "MINOR"],
        "communication_status": ["ONLINE", "ONLINE"],
        "communication_delay_seconds": [15.0, 5.0],
        "rainfall_mm": [40.0, 0.0],
        "environmental_change_score": [-0.45, 0.20],
        "alternative_water_available": [0, 1],
        "inspection_team_available": [1, 1],
        "treatment_resource_available": [1, 1],
        "sensor_data_freshness_seconds": [30.0, 20.0],
        "missing_input_count": [0, 0],
        "priority_level": ["P1", "P4"]
    })


def test_valid_dataset_passes(valid_dataframe):
    validator = DataValidator()
    report = validator.validate_dataset(valid_dataframe)
    assert report["is_valid"] is True
    assert len(report["critical_issues"]) == 0


def test_invalid_categorical_fails(valid_dataframe):
    validator = DataValidator()
    df_invalid = valid_dataframe.copy()
    df_invalid.loc[0, "priority_level"] = "INVALID_CLASS"
    report = validator.validate_dataset(df_invalid)
    assert report["is_valid"] is False
    assert any("priority_level" in issue for issue in report["critical_issues"])


def test_out_of_bounds_numerical_fails(valid_dataframe):
    validator = DataValidator()
    df_invalid = valid_dataframe.copy()
    df_invalid.loc[0, "contamination_probability"] = 1.85  # Outside [0, 1]
    report = validator.validate_dataset(df_invalid)
    assert report["is_valid"] is False
    assert any("contamination_probability" in issue for issue in report["critical_issues"])


def test_inference_payload_validation():
    validator = DataValidator()
    # Good payload
    ok, w = validator.validate_inference_payload({
        "contamination_probability": 0.65,
        "infrastructure_importance": "CRITICAL"
    })
    assert ok is True

    # Bad payload (missing mandatory probability)
    ok_bad, w_bad = validator.validate_inference_payload({
        "estimated_exposed_population": 5000
    })
    assert ok_bad is False
