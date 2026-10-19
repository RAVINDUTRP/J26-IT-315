"""
Automated unit tests for temporal feature engineering, rolling windows, and leakage safety.
"""

import sys
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from src.feature_engineering import EnvironmentalFeatureEngineer


@pytest.fixture
def sample_timeseries_df():
    # 2 locations, 40 steps each (10 hours at 15-min sampling)
    records = []
    for loc in ["SITE_001", "SITE_002"]:
        for i in range(40):
            records.append({
                "timestamp": pd.Timestamp("2026-05-15 00:00") + pd.Timedelta(minutes=15 * i),
                "location_id": loc,
                "latitude": 6.9271 if loc == "SITE_001" else 6.9315,
                "longitude": 79.8612 if loc == "SITE_001" else 79.8550,
                "ph": 7.4 + (0.2 if loc == "SITE_001" else -0.2),
                "turbidity_ntu": 15.0 + (i * 1.5 if i >= 20 else 0.0),
                "tds_ppm": 200.0,
                "ec_us_cm": 400.0,
                "water_temp_c": 28.0,
                "rainfall_mm": 10.0 if (15 <= i < 20) else 0.0,
                "sensor_confidence": 0.95,
                "sensor_status": "OK",
                "future_contamination_event": 1 if i >= 25 else 0,
                "future_risk_score": 80.0 if i >= 25 else 10.0,
                "future_risk_category": "HIGH" if i >= 25 else "LOW"
            })
    return pd.DataFrame(records)


def test_calendar_features_extraction(sample_timeseries_df):
    fe = EnvironmentalFeatureEngineer()
    cal = fe.extract_calendar_features(sample_timeseries_df)
    assert "hour" in cal.columns
    assert "month" in cal.columns
    assert "is_monsoon" in cal.columns
    assert "hour_sin" in cal.columns
    assert "hour_cos" in cal.columns
    # May is Southwest Monsoon in Sri Lanka
    assert (cal["is_monsoon"] == 1).all()


def test_rolling_rainfall_calculation(sample_timeseries_df):
    fe = EnvironmentalFeatureEngineer()
    transformed, feat_names = fe.transform(sample_timeseries_df)

    site1 = transformed[transformed["location_id"] == "SITE_001"].reset_index(drop=True)
    # At step 19, rainfall occurred at steps 15, 16, 17, 18, 19 (each 10mm)
    # rain_1h_mm should sum the last 4 steps (steps 16, 17, 18, 19 -> 40mm)
    assert site1.loc[19, "rain_1h_mm"] == 40.0
    # rain_3h_mm should sum 12 steps -> 50mm
    assert site1.loc[19, "rain_3h_mm"] == 50.0


def test_lagged_features_no_future_leakage(sample_timeseries_df):
    fe = EnvironmentalFeatureEngineer()
    transformed, _ = fe.transform(sample_timeseries_df)

    site1 = transformed[transformed["location_id"] == "SITE_001"].reset_index(drop=True)
    # turbidity_lag_1h at index 10 must equal turbidity_ntu at index 6 (1h = 4 steps)
    assert site1.loc[10, "turbidity_lag_1h"] == site1.loc[6, "turbidity_ntu"]


def test_per_location_isolation(sample_timeseries_df):
    fe = EnvironmentalFeatureEngineer()
    transformed, _ = fe.transform(sample_timeseries_df)

    # SITE_002 initial values must not bleed from SITE_001 end values
    site2 = transformed[transformed["location_id"] == "SITE_002"].reset_index(drop=True)
    assert site2.loc[0, "ph"] == pytest.approx(7.2, 0.01)
