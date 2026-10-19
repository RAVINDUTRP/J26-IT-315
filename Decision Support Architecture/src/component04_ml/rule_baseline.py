"""
Component 04: Transparent Rule-Based Prioritization Baseline.
Provides a deterministic, expert-heuristic benchmark based on disaster risk reduction (DRR)
principles. Considers hazard probability, population exposure, infrastructure criticality,
communication reliability, and telemetry freshness.
"""

from pathlib import Path
from typing import Dict, Any, List, Union, Optional
import numpy as np
import pandas as pd
import yaml

from src.component04_ml import get_project_root


class RuleBasedPrioritizer:
    """
    Transparent rule-based baseline engine for disaster response prioritization.
    """

    def __init__(self, config_path: Optional[Union[str, Path]] = None):
        self.root_dir = get_project_root()
        config_path = config_path or (self.root_dir / "config" / "decision_rules.yaml")
        
        if Path(config_path).exists():
            with open(config_path, "r", encoding="utf-8") as f:
                self.config = yaml.safe_load(f)
        else:
            self.config = self._default_config()

        self.weights = self.config.get("scoring_weights", {
            "contamination_weight": 0.35,
            "population_weight": 0.25,
            "infrastructure_weight": 0.20,
            "environmental_change_weight": 0.10,
            "data_quality_penalty_weight": 0.10
        })
        self.thresholds = self.config.get("thresholds", {
            "p1_critical_min_score": 70.0,
            "p2_high_min_score": 50.0,
            "p3_moderate_min_score": 30.0
        })
        self.infra_scores = self.config.get("infrastructure_scores", {
            "CRITICAL": 100.0,
            "MAJOR": 70.0,
            "STANDARD": 40.0,
            "MINOR": 15.0
        })

    def _default_config(self) -> Dict[str, Any]:
        return {
            "scoring_weights": {
                "contamination_weight": 0.35,
                "population_weight": 0.25,
                "infrastructure_weight": 0.20,
                "environmental_change_weight": 0.10,
                "data_quality_penalty_weight": 0.10
            },
            "thresholds": {
                "p1_critical_min_score": 70.0,
                "p2_high_min_score": 50.0,
                "p3_moderate_min_score": 30.0
            },
            "infrastructure_scores": {
                "CRITICAL": 100.0,
                "MAJOR": 70.0,
                "STANDARD": 40.0,
                "MINOR": 15.0
            }
        }

    def evaluate_scenario(self, row: Union[pd.Series, Dict[str, Any]]) -> Dict[str, Any]:
        """
        Evaluates a single scenario row and returns predicted priority class,
        underlying composite severity score, and triggered override rules.
        """
        p_contam = float(row.get("contamination_probability", 0.0))
        pop = float(row.get("estimated_exposed_population", 0.0))
        infra_type = str(row.get("infrastructure_importance", "STANDARD"))
        comm = str(row.get("communication_status", "ONLINE"))
        freshness = float(row.get("sensor_data_freshness_seconds", 0.0))
        missing_cnt = float(row.get("missing_input_count", 0.0))
        rain = float(row.get("rainfall_mm", 0.0))
        
        # 1. Contamination Hazard Component (0 - 100)
        h_score = p_contam * 100.0

        # 2. Population Exposure Component (Log scale 0 - 100)
        pop_score = np.clip((np.log10(max(10.0, pop)) / np.log10(350000.0)) * 100.0, 0.0, 100.0)

        # 3. Infrastructure Vulnerability Component (0 - 100)
        infra_score = self.infra_scores.get(infra_type, 40.0)

        # 4. Environmental Severity (Rainfall runoff factor)
        rain_score = np.clip((rain / 100.0) * 100.0, 0.0, 100.0)

        # 5. Data Uncertainty & Penalty Component (0 - 100)
        comm_penalty = 80.0 if comm == "OFFLINE" else (40.0 if comm == "DEGRADED" else 0.0)
        fresh_penalty = 50.0 if freshness > 1800.0 else 0.0
        missing_penalty = min(60.0, missing_cnt * 20.0)
        uncertainty_score = (comm_penalty * 0.4) + (fresh_penalty * 0.3) + (missing_penalty * 0.3)

        # Composite Hazard-Urgency Score
        composite_score = (
            h_score * self.weights["contamination_weight"] +
            pop_score * self.weights["population_weight"] +
            infra_score * self.weights["infrastructure_weight"] +
            rain_score * self.weights["environmental_change_weight"] +
            uncertainty_score * self.weights["data_quality_penalty_weight"]
        )

        overrides = []
        # Mandatory Deterministic Rule Overrides
        if p_contam >= 0.85 and pop >= 15000:
            level = "P1"
            overrides.append("OVERRIDE_CRITICAL_CONTAM_HIGH_POP")
        elif p_contam >= 0.75 and infra_type == "CRITICAL":
            level = "P1"
            overrides.append("OVERRIDE_CRITICAL_INFRASTRUCTURE_THREAT")
        elif composite_score >= self.thresholds["p1_critical_min_score"]:
            level = "P1"
        elif composite_score >= self.thresholds["p2_high_min_score"] or (p_contam >= 0.60 and pop >= 10000):
            level = "P2"
            if p_contam >= 0.60 and pop >= 10000 and composite_score < self.thresholds["p2_high_min_score"]:
                overrides.append("OVERRIDE_HIGH_POP_MODERATE_CONTAM")
        elif composite_score >= self.thresholds["p3_moderate_min_score"] or p_contam >= 0.30:
            level = "P3"
        else:
            level = "P4"

        # Check resource constraint (Note: Does NOT lower priority)
        alt_w = int(row.get("alternative_water_available", 1))
        insp_t = int(row.get("inspection_team_available", 1))
        treat_r = int(row.get("treatment_resource_available", 1))
        resource_constrained = bool((alt_w + insp_t + treat_r) <= 1 and p_contam >= 0.50)

        return {
            "predicted_priority": level,
            "composite_score": round(float(composite_score), 2),
            "triggered_overrides": overrides,
            "resource_bottleneck_flag": resource_constrained
        }

    def predict(self, df: pd.DataFrame) -> List[str]:
        """Runs rule baseline prediction on a batch/DataFrame."""
        results = []
        for _, row in df.iterrows():
            eval_dict = self.evaluate_scenario(row)
            results.append(eval_dict["predicted_priority"])
        return results

    predict_batch = predict

