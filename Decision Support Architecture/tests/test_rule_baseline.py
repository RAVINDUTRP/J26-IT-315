"""
Unit tests for Component 04 Rule-Based Prioritization Baseline.
"""

import sys
from pathlib import Path
import pytest

_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from src.component04_ml.rule_baseline import RuleBasedPrioritizer


@pytest.fixture
def prioritizer():
    return RuleBasedPrioritizer()


def test_critical_override_scenario(prioritizer):
    # Contamination probability >= 0.85 and population >= 15000 triggers P1 override
    res = prioritizer.evaluate_scenario({
        "contamination_probability": 0.90,
        "estimated_exposed_population": 25000,
        "infrastructure_importance": "CRITICAL"
    })
    assert res["predicted_priority"] == "P1"
    assert "OVERRIDE_CRITICAL_CONTAM_HIGH_POP" in res["triggered_overrides"]


def test_low_risk_scenario(prioritizer):
    res = prioritizer.evaluate_scenario({
        "contamination_probability": 0.05,
        "estimated_exposed_population": 200,
        "infrastructure_importance": "MINOR",
        "communication_status": "ONLINE",
        "rainfall_mm": 0.0
    })
    assert res["predicted_priority"] == "P4"
    assert res["composite_score"] < 25.0


def test_resource_constraint_does_not_lower_priority(prioritizer):
    # Severe contamination with 0 resources available
    res = prioritizer.evaluate_scenario({
        "contamination_probability": 0.88,
        "estimated_exposed_population": 30000,
        "infrastructure_importance": "CRITICAL",
        "alternative_water_available": 0,
        "inspection_team_available": 0,
        "treatment_resource_available": 0
    })
    assert res["predicted_priority"] == "P1"
    assert res["resource_bottleneck_flag"] is True
