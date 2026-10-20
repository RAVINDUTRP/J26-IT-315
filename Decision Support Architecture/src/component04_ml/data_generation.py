"""
Component 04: Synthetic Disaster Scenario Generation Module.
Generates reproducible, multi-dimensional disaster response scenarios
fusing upstream contamination risk predictions with socio-technical context.
"""

import logging
from pathlib import Path
from typing import Dict, Any, Tuple, Optional
import numpy as np
import pandas as pd
import yaml

from src.component04_ml import get_project_root

logger = logging.getLogger("component04.data_generation")


def generate_scenario_dataset(
    num_scenarios: int = 4000,
    random_seed: int = 42,
    output_path: Optional[Path] = None,
    data_dict_path: Optional[Path] = None
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Generates a realistic synthetic disaster decision-support dataset with
    comprehensive scenario diversity (critical, comms failure, stale data,
    resource constraints, moderate, and baseline monitoring).

    Returns:
        Tuple of (scenario_dataframe, data_dictionary_dataframe)
    """
    rng = np.random.default_rng(random_seed)
    root_dir = get_project_root()
    output_path = output_path or (root_dir / "data" / "raw" / "synthetic_disaster_scenarios.csv")
    data_dict_path = data_dict_path or (root_dir / "data" / "processed" / "data_dictionary.csv")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    data_dict_path.parent.mkdir(parents=True, exist_ok=True)

    logger.info(f"Generating {num_scenarios} synthetic disaster decision scenarios (seed={random_seed})...")

    # Catchment zones across the tropical river basin
    zones = [
        "Kelani_Upper_Industrial_Inflow",
        "Kelani_Mid_Reach_Agricultural",
        "Kelani_Estuary_Municipal_Intake",
        "Hamilton_Canal_Tidal_Mixing",
        "Pugoda_Textile_Corridor",
        "Sedawatta_Floodplain_Basin"
    ]
    catchment_zone = rng.choice(zones, size=num_scenarios, p=[0.25, 0.20, 0.20, 0.15, 0.10, 0.10])

    # 1. Upstream Contamination Risk Predictions (from Component 03)
    # Mixture: 45% low background, 30% moderate, 25% acute surge events
    cluster_choice = rng.choice(["low", "medium", "high"], size=num_scenarios, p=[0.45, 0.30, 0.25])
    contamination_probability = np.zeros(num_scenarios)
    for i, c in enumerate(cluster_choice):
        if c == "low":
            contamination_probability[i] = rng.beta(1.5, 8.0)  # Mean ~0.15
        elif c == "medium":
            contamination_probability[i] = rng.uniform(0.35, 0.70)
        else:
            contamination_probability[i] = rng.beta(7.0, 2.0)  # Mean ~0.78

    contamination_probability = np.clip(contamination_probability, 0.01, 0.99).round(4)

    # Derived or reported risk category
    contamination_risk_category = []
    for p in contamination_probability:
        if p >= 0.70:
            contamination_risk_category.append("HIGH")
        elif p >= 0.35:
            contamination_risk_category.append("MEDIUM")
        else:
            contamination_risk_category.append("LOW")

    # Prediction confidence (reported by upstream model)
    prediction_confidence = np.clip(
        rng.normal(loc=0.88, scale=0.08, size=num_scenarios), 0.50, 0.99
    ).round(3)

    # 2. Exposed Population & Socio-Demographics
    # Log-normal distribution reflecting rural hamlets (100s) to urban centers (100k+)
    raw_pop = np.exp(rng.normal(loc=8.2, scale=1.3, size=num_scenarios))
    estimated_exposed_population = np.clip(raw_pop, 50, 350000).astype(int)

    # 3. Critical Infrastructure Importance
    infra_types = ["CRITICAL", "MAJOR", "STANDARD", "MINOR"]
    # Critical includes drinking water treatment intakes & major hospitals
    infrastructure_importance = rng.choice(infra_types, size=num_scenarios, p=[0.20, 0.30, 0.35, 0.15])

    # 4. Telemetry Communication State & LoRa Link Delay
    comm_states = ["ONLINE", "DEGRADED", "OFFLINE"]
    communication_status = rng.choice(comm_states, size=num_scenarios, p=[0.70, 0.20, 0.10])
    
    communication_delay_seconds = np.zeros(num_scenarios)
    for i, cs in enumerate(communication_status):
        if cs == "ONLINE":
            communication_delay_seconds[i] = rng.uniform(2.0, 60.0)
        elif cs == "DEGRADED":
            communication_delay_seconds[i] = rng.uniform(60.0, 900.0)
        else:
            communication_delay_seconds[i] = rng.uniform(900.0, 7200.0)
    communication_delay_seconds = communication_delay_seconds.round(1)

    # 5. Hydrometeorological & Environmental Context
    # Tropical monsoonal rainfall distribution
    has_rain = rng.choice([0, 1], size=num_scenarios, p=[0.55, 0.45])
    rainfall_mm = np.where(
        has_rain == 1,
        rng.exponential(scale=24.0, size=num_scenarios),
        0.0
    )
    rainfall_mm = np.clip(rainfall_mm, 0.0, 220.0).round(1)

    # Environmental change score: Rate of water quality anomaly / degradation
    # Negative indicates severe deterioration; positive indicates stable/improving
    environmental_change_score = np.clip(
        rng.normal(loc=0.0, scale=0.35, size=num_scenarios) - (contamination_probability * 0.4),
        -1.0, 1.0
    ).round(4)

    # 6. Response Logistics & Resource Availability
    # Important: Resources do NOT lower hazard level; they define dispatch constraints
    alternative_water_available = rng.choice([0, 1], size=num_scenarios, p=[0.60, 0.40])
    inspection_team_available = rng.choice([0, 1], size=num_scenarios, p=[0.30, 0.70])
    treatment_resource_available = rng.choice([0, 1], size=num_scenarios, p=[0.35, 0.65])

    # 7. Data Freshness & Missingness Indicators
    sensor_data_freshness_seconds = np.clip(
        rng.exponential(scale=300.0, size=num_scenarios) + communication_delay_seconds,
        10.0, 18000.0
    ).round(1)

    missing_input_count = rng.choice([0, 1, 2, 3, 4], size=num_scenarios, p=[0.72, 0.18, 0.06, 0.03, 0.01])

    # Introduce realistic missing values into optional fields based on missing_input_count
    for i in range(num_scenarios):
        cnt = missing_input_count[i]
        if cnt >= 1:
            if rng.random() < 0.5:
                prediction_confidence[i] = np.nan
        if cnt >= 2:
            if rng.random() < 0.5:
                environmental_change_score[i] = np.nan

    # 8. Deterministic Transparent Labeling Policy (Initial Target: priority_level)
    # Priority Levels: P1 (Critical), P2 (High), P3 (Moderate), P4 (Low)
    # The policy reflects standard Disaster Risk Reduction (DRR) severity formulations:
    # Severity = Hazard * Exposure * Vulnerability + Uncertainty Penalty
    
    priority_level = []
    
    infra_weight_map = {"CRITICAL": 1.0, "MAJOR": 0.70, "STANDARD": 0.40, "MINOR": 0.15}
    
    for i in range(num_scenarios):
        p_contam = contamination_probability[i]
        pop = estimated_exposed_population[i]
        inf_val = infra_weight_map[infrastructure_importance[i]]
        rain = rainfall_mm[i]
        comm = communication_status[i]
        freshness = sensor_data_freshness_seconds[i]
        
        # Normalized population exposure log-scale (0 to 1)
        pop_norm = np.clip(np.log10(max(10, pop)) / np.log10(350000), 0.0, 1.0)
        
        # Rainfall flood runoff factor
        rain_factor = np.clip(rain / 100.0, 0.0, 1.0)
        
        # Uncertainty penalty (stale data or communication blindspot increases urgency)
        comm_penalty = 0.15 if comm == "OFFLINE" else (0.08 if comm == "DEGRADED" else 0.0)
        stale_penalty = 0.10 if freshness > 1800.0 else 0.0
        
        # Core Hazard Urgency Metric (0 to 100)
        raw_score = (
            p_contam * 42.0 +
            pop_norm * 26.0 +
            inf_val * 20.0 +
            rain_factor * 8.0 +
            comm_penalty * 20.0 +
            stale_penalty * 10.0
        )
        
        # Rule Overrides (Domain Expert Principles):
        # 1. Critical Contamination (>0.80) with high population (>15,000) is always P1
        if p_contam >= 0.80 and pop >= 15000:
            level = "P1"
        # 2. Critical Drinking Intake with High Contamination (>0.70) is always P1
        elif p_contam >= 0.70 and infrastructure_importance[i] == "CRITICAL":
            level = "P1"
        # 3. High contamination (>0.65) or critical infrastructure with high score is P1/P2
        elif raw_score >= 68.0:
            level = "P1"
        elif raw_score >= 48.0 or (p_contam >= 0.55 and pop >= 8000):
            level = "P2"
        elif raw_score >= 30.0 or p_contam >= 0.30:
            level = "P3"
        else:
            level = "P4"
            
        priority_level.append(level)

    # Compile DataFrame
    scenario_ids = [f"SCEN_{i+1:05d}" for i in range(num_scenarios)]
    timestamps = [f"2026-10-18T{10 + (i % 12):02d}:{(i % 60):02d}:00+05:30" for i in range(num_scenarios)]

    df = pd.DataFrame({
        "scenario_id": scenario_ids,
        "generation_timestamp": timestamps,
        "catchment_zone": catchment_zone,
        "contamination_probability": contamination_probability,
        "contamination_risk_category": contamination_risk_category,
        "prediction_confidence": prediction_confidence,
        "estimated_exposed_population": estimated_exposed_population,
        "infrastructure_importance": infrastructure_importance,
        "communication_status": communication_status,
        "communication_delay_seconds": communication_delay_seconds,
        "rainfall_mm": rainfall_mm,
        "environmental_change_score": environmental_change_score,
        "alternative_water_available": alternative_water_available,
        "inspection_team_available": inspection_team_available,
        "treatment_resource_available": treatment_resource_available,
        "sensor_data_freshness_seconds": sensor_data_freshness_seconds,
        "missing_input_count": missing_input_count,
        "priority_level": priority_level
    })

    # Save CSV
    df.to_csv(output_path, index=False)
    logger.info(f"Saved {len(df)} synthetic scenarios to {output_path}")

    # Build Data Dictionary
    data_dict = pd.DataFrame([
        {
            "feature_name": "scenario_id",
            "data_type": "string",
            "accepted_range": "SCEN_00001 - SCEN_99999",
            "unit": "None",
            "category": "Identifier",
            "description": "Unique scenario identification tag (excluded from ML training)."
        },
        {
            "feature_name": "generation_timestamp",
            "data_type": "datetime (ISO 8601)",
            "accepted_range": "Valid timestamp",
            "unit": "ISO 8601",
            "category": "Identifier",
            "description": "Timestamp when scenario state was logged (excluded from ML training)."
        },
        {
            "feature_name": "catchment_zone",
            "data_type": "string (categorical)",
            "accepted_range": "6 river basin zones",
            "unit": "None",
            "category": "Context",
            "description": "Geographical river monitoring sector."
        },
        {
            "feature_name": "contamination_probability",
            "data_type": "float",
            "accepted_range": "0.0000 – 1.0000",
            "unit": "Probability",
            "category": "Upstream Hazard",
            "description": "Probability of river contamination within 3-hour horizon predicted by Component 03."
        },
        {
            "feature_name": "contamination_risk_category",
            "data_type": "string (categorical)",
            "accepted_range": "LOW, MEDIUM, HIGH",
            "unit": "Categorical",
            "category": "Upstream Hazard",
            "description": "Categorical contamination alert level from Component 03."
        },
        {
            "feature_name": "prediction_confidence",
            "data_type": "float (nullable)",
            "accepted_range": "0.000 – 1.000",
            "unit": "Confidence Score",
            "category": "Upstream Hazard",
            "description": "Reported model reliability score for upstream prediction."
        },
        {
            "feature_name": "estimated_exposed_population",
            "data_type": "integer",
            "accepted_range": "50 – 500,000",
            "unit": "Persons",
            "category": "Exposure",
            "description": "Estimated human population relying on affected downstream river reach."
        },
        {
            "feature_name": "infrastructure_importance",
            "data_type": "string (categorical)",
            "accepted_range": "CRITICAL, MAJOR, STANDARD, MINOR",
            "unit": "Ordinal Tier",
            "category": "Vulnerability",
            "description": "Asset criticality rating of municipal intakes, hospitals, and water distribution points."
        },
        {
            "feature_name": "communication_status",
            "data_type": "string (categorical)",
            "accepted_range": "ONLINE, DEGRADED, OFFLINE",
            "unit": "Categorical",
            "category": "Telemetry Quality",
            "description": "Health of the LoRa mesh network transmission link to the monitoring boat."
        },
        {
            "feature_name": "communication_delay_seconds",
            "data_type": "float",
            "accepted_range": "0.0 – 86400.0",
            "unit": "Seconds",
            "category": "Telemetry Quality",
            "description": "Observed latency elapsed during multi-hop LoRa forwarding to the base station."
        },
        {
            "feature_name": "rainfall_mm",
            "data_type": "float",
            "accepted_range": "0.0 – 300.0",
            "unit": "mm",
            "category": "Environmental",
            "description": "Precipitation intensity recorded over the catchment basin."
        },
        {
            "feature_name": "environmental_change_score",
            "data_type": "float (nullable)",
            "accepted_range": "-1.0000 – 1.0000",
            "unit": "Normalized Score",
            "category": "Environmental",
            "description": "Multivariate anomaly score indicating rate of environmental water quality deviation."
        },
        {
            "feature_name": "alternative_water_available",
            "data_type": "binary integer",
            "accepted_range": "0 or 1",
            "unit": "Boolean",
            "category": "Response Logistics",
            "description": "Whether municipal backup water bows or secondary supply channels exist."
        },
        {
            "feature_name": "inspection_team_available",
            "data_type": "binary integer",
            "accepted_range": "0 or 1",
            "unit": "Boolean",
            "category": "Response Logistics",
            "description": "Availability of an on-call emergency chemical inspection team."
        },
        {
            "feature_name": "treatment_resource_available",
            "data_type": "binary integer",
            "accepted_range": "0 or 1",
            "unit": "Boolean",
            "category": "Response Logistics",
            "description": "Availability of mobile chemical neutralization or filtration units."
        },
        {
            "feature_name": "sensor_data_freshness_seconds",
            "data_type": "float",
            "accepted_range": "0.0 – 86400.0",
            "unit": "Seconds",
            "category": "Telemetry Quality",
            "description": "Elapsed age of the boat sensor telemetry observation."
        },
        {
            "feature_name": "missing_input_count",
            "data_type": "integer",
            "accepted_range": "0 – 10",
            "unit": "Count",
            "category": "Telemetry Quality",
            "description": "Number of missing or imputed sensor inputs detected in the scenario."
        },
        {
            "feature_name": "priority_level",
            "data_type": "string (categorical target)",
            "accepted_range": "P1, P2, P3, P4",
            "unit": "Priority Class",
            "category": "Target Variable",
            "description": "Disaster response priority classification (P1=Critical, P2=High, P3=Moderate, P4=Low)."
        }
    ])

    data_dict.to_csv(data_dict_path, index=False)
    logger.info(f"Saved data dictionary ({len(data_dict)} features) to {data_dict_path}")

    return df, data_dict


generate_synthetic_scenarios = generate_scenario_dataset


if __name__ == "__main__":
    generate_scenario_dataset()
