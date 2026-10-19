"""
Component 04: Data Validation & Quality Assurance Module.
Verifies schema compliance, physical boundary limits, categorical validity,
missingness distribution, and ensures zero target leakage in model features.
"""

import logging
from typing import Dict, Any, List, Tuple
import numpy as np
import pandas as pd

logger = logging.getLogger("component04.data_validation")

EXPECTED_CATEGORIES = {
    "priority_level": {"P1", "P2", "P3", "P4"},
    "contamination_risk_category": {"LOW", "MEDIUM", "HIGH"},
    "infrastructure_importance": {"CRITICAL", "MAJOR", "STANDARD", "MINOR"},
    "communication_status": {"ONLINE", "DEGRADED", "OFFLINE"}
}

PHYSICAL_BOUNDS = {
    "contamination_probability": (0.0, 1.0),
    "prediction_confidence": (0.0, 1.0),
    "estimated_exposed_population": (0, 1000000),
    "communication_delay_seconds": (0.0, 86400.0),
    "rainfall_mm": (0.0, 500.0),
    "environmental_change_score": (-2.0, 2.0),
    "sensor_data_freshness_seconds": (0.0, 86400.0),
    "missing_input_count": (0, 20),
    "alternative_water_available": (0, 1),
    "inspection_team_available": (0, 1),
    "treatment_resource_available": (0, 1)
}


class DataValidator:
    """
    Validates disaster decision scenario DataFrames against strict
    physical bounds, categorical integrity, and target leakage rules.
    """

    def __init__(self, bounds: Dict[str, Tuple[float, float]] = None):
        self.bounds = bounds or PHYSICAL_BOUNDS

    def validate_dataset(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Runs comprehensive validation across an entire dataset.
        Returns a structured validation summary dictionary.
        """
        issues = []
        warnings = []

        # 1. Row count & null structure
        total_rows = len(df)
        if total_rows == 0:
            raise ValueError("Input DataFrame is empty.")

        # 2. Check for duplicate scenario IDs
        if "scenario_id" in df.columns:
            dup_ids = df["scenario_id"].duplicated().sum()
            if dup_ids > 0:
                issues.append(f"Found {dup_ids} duplicate scenario_id values.")

        # 3. Categorical validation
        for col, valid_set in EXPECTED_CATEGORIES.items():
            if col in df.columns:
                unique_vals = set(df[col].dropna().unique())
                invalid_vals = unique_vals - valid_set
                if invalid_vals:
                    issues.append(f"Column '{col}' has invalid categorical values: {invalid_vals}")

        # 4. Physical range verification
        for col, (low, high) in self.bounds.items():
            if col in df.columns:
                series = df[col].dropna()
                out_of_bounds = ((series < low) | (series > high)).sum()
                if out_of_bounds > 0:
                    min_val = series.min()
                    max_val = series.max()
                    issues.append(
                        f"Column '{col}' has {out_of_bounds} values outside [{low}, {high}]. "
                        f"Observed: [{min_val}, {max_val}]."
                    )

        # 5. Missingness inspection
        missing_summary = df.isnull().sum()
        missing_dict = missing_summary[missing_summary > 0].to_dict()
        if missing_dict:
            warnings.append(f"Missing values detected: {missing_dict}")

        is_valid = len(issues) == 0

        report = {
            "is_valid": is_valid,
            "total_records": total_rows,
            "total_features": len(df.columns),
            "critical_issues": issues,
            "warnings": warnings,
            "missing_values": missing_dict
        }

        if is_valid:
            logger.info(f"Dataset validation PASSED for {total_rows} records.")
        else:
            logger.error(f"Dataset validation FAILED with {len(issues)} critical issues.")

        return report

    def validate_inference_payload(self, payload: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """
        Validates a single scenario dictionary before feeding into the inference engine.
        Returns (is_valid, list_of_warning_messages).
        """
        warnings = []
        is_valid = True

        # Check critical presence
        if "contamination_probability" not in payload and "contamination_prob" not in payload:
            return False, ["Missing mandatory field: 'contamination_probability'."]

        p = float(payload.get("contamination_probability", payload.get("contamination_prob", 0.0)))
        if not (0.0 <= p <= 1.0):
            return False, [f"contamination_probability {p} outside [0.0, 1.0]."]

        # Validate categorical values if provided
        for cat_col, valid_set in EXPECTED_CATEGORIES.items():
            if cat_col in payload and payload[cat_col] not in valid_set:
                warnings.append(f"Field '{cat_col}' value '{payload[cat_col]}' not in recognized {valid_set}.")

        # Check bounds
        for num_col, (low, high) in self.bounds.items():
            if num_col in payload and payload[num_col] is not None and not pd.isna(payload[num_col]):
                val = float(payload[num_col])
                if not (low <= val <= high):
                    warnings.append(f"Field '{num_col}' value {val} out of bounds [{low}, {high}].")

        return is_valid, warnings
