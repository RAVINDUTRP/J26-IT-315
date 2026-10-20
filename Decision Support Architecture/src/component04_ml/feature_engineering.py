"""
Component 04: Feature Engineering Module.
Derives domain-specific interaction features, socio-hydrological exposure metrics,
data staleness penalties, and resource operational strain indices.
"""

import numpy as np
import pandas as pd


INFRA_WEIGHTS = {
    "CRITICAL": 1.00,
    "MAJOR": 0.70,
    "STANDARD": 0.40,
    "MINOR": 0.15
}


def engineer_decision_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Transforms raw scenario features into domain-engineered decision metrics.
    Operates row-wise without lookahead or cross-row leakage.
    Safely handles missing or partial columns during offline inference.
    """
    data = df.copy()

    p_contam = pd.to_numeric(data.get("contamination_probability", pd.Series(np.nan, index=data.index)), errors="coerce")
    pop = pd.to_numeric(data.get("estimated_exposed_population", pd.Series(100.0, index=data.index)), errors="coerce").fillna(100.0)
    
    # 1. Socio-Hydrological Exposure Index
    log_pop = np.log10(np.clip(pop, 10.0, None))
    data["risk_exposure_index"] = (p_contam * log_pop).round(4)

    # 2. Critical Infrastructure Hazard Product
    infra_raw = data.get("infrastructure_importance", pd.Series("STANDARD", index=data.index))
    infra_series = infra_raw.map(INFRA_WEIGHTS).fillna(0.40)
    data["infrastructure_hazard_index"] = (p_contam * infra_series).round(4)

    # 3. Telemetry Staleness & Communication Uncertainty Penalty
    delay_sec = pd.to_numeric(data.get("communication_delay_seconds", pd.Series(0.0, index=data.index)), errors="coerce").fillna(0.0)
    freshness_sec = pd.to_numeric(data.get("sensor_data_freshness_seconds", pd.Series(0.0, index=data.index)), errors="coerce").fillna(0.0)
    
    delay_norm = np.clip(delay_sec / 3600.0, 0.0, 1.0)
    freshness_norm = np.clip(freshness_sec / 7200.0, 0.0, 1.0)
    data["telemetry_staleness_index"] = ((delay_norm * 0.5) + (freshness_norm * 0.5)).round(4)

    # 4. Precipitation Runoff Wash Index
    rain = pd.to_numeric(data.get("rainfall_mm", pd.Series(0.0, index=data.index)), errors="coerce").fillna(0.0)
    data["rainfall_runoff_hazard"] = (p_contam * (rain / 50.0)).round(4)

    # 5. Operational Resource Strain Count
    alt_water = pd.to_numeric(data.get("alternative_water_available", pd.Series(1, index=data.index)), errors="coerce").fillna(1)
    insp_team = pd.to_numeric(data.get("inspection_team_available", pd.Series(1, index=data.index)), errors="coerce").fillna(1)
    treat_res = pd.to_numeric(data.get("treatment_resource_available", pd.Series(1, index=data.index)), errors="coerce").fillna(1)
    
    data["total_resources_available"] = alt_water + insp_team + treat_res
    # Bottleneck flag: High contamination with severely constrained resources
    data["resource_bottleneck_flag"] = (
        (p_contam.fillna(0.0) >= 0.50) & (data["total_resources_available"] <= 1)
    ).astype(int)

    return data
