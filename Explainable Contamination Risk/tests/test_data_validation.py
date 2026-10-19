"""
Automated unit tests for data validation, physical constraints, and quality checks.
"""

import sys
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from src.data_validation import EnvironmentalDataValidator


@pytest.fixture
def sample_valid_df():
    return pd.DataFrame({
        "timestamp": pd.date_range("2026-01-01 00:00", periods=20, freq="15min"),
        "location_id": ["SITE_001"] * 20,
        "ph": [7.2 + 0.1 * np.sin(i) for i in range(20)],
        "turbidity_ntu": [12.0 + i * 0.5 for i in range(20)],
        "tds_ppm": [150.0 + i for i in range(20)],
        "ec_us_cm": [300.0 + 2 * i for i in range(20)],
        "water_temp_c": [27.0] * 20,
        "rainfall_mm": [0.0 if i < 15 else 5.0 for i in range(20)],
        "sensor_confidence": [0.95] * 20,
        "sensor_status": ["OK"] * 20
    })


def test_schema_validation_success(sample_valid_df):
    validator = EnvironmentalDataValidator()
    valid, missing = validator.validate_schema(sample_valid_df)
    assert valid is True
    assert len(missing) == 0


def test_schema_validation_missing_columns(sample_valid_df):
    validator = EnvironmentalDataValidator()
    df_missing = sample_valid_df.drop(columns=["ph", "turbidity_ntu"])
    valid, missing = validator.validate_schema(df_missing)
    assert valid is False
    assert "ph" in missing
    assert "turbidity_ntu" in missing


def test_physical_range_violations():
    validator = EnvironmentalDataValidator()
    df_invalid = pd.DataFrame({
        "ph": [-1.0, 7.0, 16.5],       # -1.0 and 16.5 are impossible pH values
        "turbidity_ntu": [10.0, -5.0, 1500.0],  # Negative & > 1000 NTU invalid
        "rainfall_mm": [-2.0, 0.0, 50.0]        # Negative rainfall invalid
    })
    violations = validator.check_physical_ranges(df_invalid)
    assert violations["ph"]["violations_count"] == 2
    assert violations["turbidity_ntu"]["violations_count"] == 2
    assert violations["rainfall_mm"]["violations_count"] == 1


def test_missing_values_detection(sample_valid_df):
    validator = EnvironmentalDataValidator()
    df_nulls = sample_valid_df.copy()
    df_nulls.loc[0:2, "ph"] = np.nan
    df_nulls.loc[5, "turbidity_ntu"] = np.nan

    summary = validator.check_missing_values(df_nulls)
    ph_row = summary[summary["column"] == "ph"].iloc[0]
    assert ph_row["missing_count"] == 3


def test_outlier_flagging_preserves_rows(sample_valid_df):
    validator = EnvironmentalDataValidator()
    # Insert an extreme turbidity spike representing contamination
    df_spike = sample_valid_df.copy()
    df_spike.loc[10, "turbidity_ntu"] = 350.0

    flags = validator.flag_outliers_without_deletion(df_spike, columns=["turbidity_ntu"], threshold_iqr=3.0)
    # Ensure length is unchanged and row 10 is flagged
    assert len(flags) == len(sample_valid_df)
    assert flags.loc[10, "turbidity_ntu_is_extreme"] == True
