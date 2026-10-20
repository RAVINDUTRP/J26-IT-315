"""
Unit tests for Component 04 Model Loading and Serialization.
"""

import sys
import json
from pathlib import Path
import joblib
import pytest

_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from src.component04_ml.preprocessing import DecisionDataPreprocessor


def test_preprocessor_serialization(tmp_path):
    preprocessor = DecisionDataPreprocessor()
    # Dummy fit
    import pandas as pd
    df = pd.DataFrame({
        "contamination_probability": [0.5],
        "prediction_confidence": [0.8],
        "estimated_exposed_population": [1000],
        "communication_delay_seconds": [10.0],
        "rainfall_mm": [0.0],
        "environmental_change_score": [0.0],
        "sensor_data_freshness_seconds": [30.0],
        "missing_input_count": [0],
        "contamination_risk_category": ["MEDIUM"],
        "infrastructure_importance": ["STANDARD"],
        "communication_status": ["ONLINE"],
        "catchment_zone": ["Kelani_Estuary_Municipal_Intake"],
        "alternative_water_available": [1],
        "inspection_team_available": [1],
        "treatment_resource_available": [1]
    })
    preprocessor.fit(df)
    save_file = tmp_path / "test_preproc.joblib"
    preprocessor.save(save_file)
    assert save_file.exists()

    loaded = DecisionDataPreprocessor.load(save_file)
    assert loaded.is_fitted is True
    assert len(loaded.fitted_feature_names) == len(preprocessor.fitted_feature_names)


def test_models_exist_if_trained():
    models_dir = _root_dir / "models"
    preproc_file = models_dir / "preprocessor.joblib"
    primary_file = models_dir / "selected_model.joblib"

    if not preproc_file.exists() or not primary_file.exists():
        pytest.skip("Models not yet trained. Run scripts/train_models.py first.")

    preprocessor = DecisionDataPreprocessor.load(preproc_file)
    assert preprocessor.is_fitted is True

    model = joblib.load(primary_file)
    assert hasattr(model, "predict")

    meta_file = models_dir / "model_metadata.json"
    if meta_file.exists():
        with open(meta_file, "r", encoding="utf-8") as f:
            meta = json.load(f)
        assert "classes" in meta
        assert meta["classes"] == ["P1", "P2", "P3", "P4"]
