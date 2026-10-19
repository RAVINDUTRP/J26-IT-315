"""
Automated unit tests for saved model artifact loading and validation.
"""

import sys
import json
from pathlib import Path
import numpy as np
import pandas as pd
import pytest
import joblib

_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from src.utils import get_project_root
from src.preprocessing import EnvironmentalPreprocessor
from src.anomaly_detection import DualTrackAnomalyDetector
from src.hybrid_ensemble import HybridEnsemble


def test_feature_schema_validity():
    root = get_project_root()
    schema_path = root / "models" / "metadata" / "feature_schema.json"
    assert schema_path.exists(), "Feature schema JSON must exist."

    with open(schema_path, "r", encoding="utf-8") as f:
        schema = json.load(f)

    assert "feature_names" in schema
    assert isinstance(schema["feature_names"], list)
    assert len(schema["feature_names"]) > 20
    assert schema["sampling_interval_min"] == 15


def test_preprocessor_loading_and_transform():
    root = get_project_root()
    preproc_path = root / "models" / "preprocessing" / "preprocessor.joblib"
    if not preproc_path.exists():
        pytest.skip("Preprocessor artifact not yet created by training pipeline.")

    preprocessor = EnvironmentalPreprocessor.load(preproc_path)
    assert preprocessor.is_fitted is True

    # Test dummy input with schema columns
    dummy_data = {col: [1.0] for col in preprocessor.feature_names}
    df_dummy = pd.DataFrame(dummy_data)
    transformed = preprocessor.transform(df_dummy)

    assert transformed.shape == (1, len(preprocessor.feature_names))
    assert not np.isnan(transformed).any()


def test_hybrid_ensemble_loading():
    root = get_project_root()
    model_path = root / "models" / "hybrid" / "selected_hybrid_model.joblib"
    if not model_path.exists():
        pytest.skip("Hybrid model artifact not yet created by training pipeline.")

    model = HybridEnsemble.load(model_path)
    assert model is not None
    assert hasattr(model, "predict_proba")
    assert hasattr(model, "predict")
