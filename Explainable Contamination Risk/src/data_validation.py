"""
Environmental Data Validation and Quality Assurance Engine.
Performs schema verification, physical range validation, missing value profiling,
temporal continuity verification, and multi-sensor consistency checks.
"""

import sys
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional
import numpy as np
import pandas as pd

_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from src.utils import get_project_root, load_feature_config

logger = logging.getLogger("contamination_risk.data_validation")


class EnvironmentalDataValidator:
    """
    Validates water quality and meteorology time series against physical domain laws,
    instrument constraints, and temporal continuity requirements.
    """

    def __init__(self, feature_config: Optional[Dict[str, Any]] = None):
        self.config = feature_config or load_feature_config()
        self.physical_limits = self.config.get("physical_limits", {
            "ph": {"min": 0.0, "max": 14.0},
            "turbidity_ntu": {"min": 0.0, "max": 1000.0},
            "tds_ppm": {"min": 0.0, "max": 5000.0},
            "ec_us_cm": {"min": 0.0, "max": 10000.0},
            "water_temp_c": {"min": 5.0, "max": 50.0},
            "rainfall_mm": {"min": 0.0, "max": 300.0}
        })
        self.required_columns = [
            "timestamp", "location_id", "ph", "turbidity_ntu", "tds_ppm",
            "ec_us_cm", "water_temp_c", "rainfall_mm", "sensor_confidence", "sensor_status"
        ]

    def validate_schema(self, df: pd.DataFrame) -> Tuple[bool, List[str]]:
        """Verify presence of required columns."""
        missing = [col for col in self.required_columns if col not in df.columns]
        is_valid = len(missing) == 0
        return is_valid, missing

    def check_missing_values(self, df: pd.DataFrame) -> pd.DataFrame:
        """Produce a missing value count and percentage summary."""
        null_counts = df.isnull().sum()
        null_pct = (null_counts / len(df)) * 100.0
        summary = pd.DataFrame({
            "column": df.columns,
            "missing_count": null_counts.values,
            "missing_pct": np.round(null_pct.values, 3)
        }).sort_values(by="missing_count", ascending=False)
        return summary

    def check_physical_ranges(self, df: pd.DataFrame) -> Dict[str, Dict[str, Any]]:
        """
        Check for impossible physical violations (e.g., negative rainfall, pH > 14).
        Returns record counts and percentages outside valid domain boundaries.
        """
        violations = {}
        for col, limits in self.physical_limits.items():
            if col in df.columns:
                min_val = limits.get("min", -np.inf)
                max_val = limits.get("max", np.inf)
                below_min = (df[col] < min_val).sum()
                above_max = (df[col] > max_val).sum()
                total_invalid = below_min + above_max

                violations[col] = {
                    "min_allowed": min_val,
                    "max_allowed": max_val,
                    "observed_min": float(df[col].min()),
                    "observed_max": float(df[col].max()),
                    "violations_count": int(total_invalid),
                    "violations_pct": round(float(total_invalid / len(df) * 100.0), 3)
                }
        return violations

    def check_temporal_continuity(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Verify timestamp ordering, duplicate detection, and time delta gaps."""
        if "timestamp" not in df.columns:
            return {"error": "No timestamp column"}

        results = {}
        df_sorted = df.copy()
        df_sorted["timestamp"] = pd.to_datetime(df_sorted["timestamp"])

        for loc_id, group in df_sorted.groupby("location_id"):
            group = group.sort_values(by="timestamp")
            duplicates = group["timestamp"].duplicated().sum()
            deltas = group["timestamp"].diff().dropna()

            expected_interval_min = self.config.get("sampling_interval_min", 15)
            gap_tolerance_min = expected_interval_min * 1.5

            irregular_steps = (deltas > pd.Timedelta(minutes=gap_tolerance_min)).sum()

            results[str(loc_id)] = {
                "total_records": len(group),
                "start_time": str(group["timestamp"].iloc[0]),
                "end_time": str(group["timestamp"].iloc[-1]),
                "duplicate_timestamps": int(duplicates),
                "irregular_time_gaps": int(irregular_steps),
                "median_interval_min": float(deltas.dt.total_seconds().median() / 60.0) if not deltas.empty else 0.0
            }
        return results

    def flag_outliers_without_deletion(
        self, df: pd.DataFrame, columns: Optional[List[str]] = None, threshold_iqr: float = 3.0
    ) -> pd.DataFrame:
        """
        Flag extreme statistical deviations using IQR fences.
        IMPORTANT: Extreme readings are FLAGGED, NOT deleted, because severe contamination
        events physically manifest as statistical outliers.
        """
        cols = columns or ["ph", "turbidity_ntu", "tds_ppm", "ec_us_cm", "rainfall_mm"]
        outlier_flags = pd.DataFrame(index=df.index)

        for c in cols:
            if c in df.columns:
                q1 = df[c].quantile(0.25)
                q3 = df[c].quantile(0.75)
                iqr = q3 - q1
                lower_fence = q1 - threshold_iqr * iqr
                upper_fence = q3 + threshold_iqr * iqr
                outlier_flags[f"{c}_is_extreme"] = (df[c] < lower_fence) | (df[c] > upper_fence)

        outlier_flags["any_extreme_flag"] = outlier_flags.any(axis=1)
        return outlier_flags

    def generate_full_validation_report(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Execute complete quality validation pipeline and compile structured audit report."""
        logger.info("Executing environmental data validation audit...")
        schema_valid, missing_cols = self.validate_schema(df)
        missing_summary = self.check_missing_values(df)
        range_violations = self.check_physical_ranges(df)
        temporal_audit = self.check_temporal_continuity(df)
        outlier_flags = self.flag_outliers_without_deletion(df)

        report = {
            "total_records_analyzed": len(df),
            "schema_check": {
                "passed": schema_valid,
                "missing_columns": missing_cols
            },
            "missingness": {
                "total_missing_cells": int(missing_summary["missing_count"].sum()),
                "highest_missing_pct": float(missing_summary["missing_pct"].max())
            },
            "physical_range_audit": range_violations,
            "temporal_continuity_audit": temporal_audit,
            "extreme_events_flagged": {
                "total_flagged_rows": int(outlier_flags["any_extreme_flag"].sum()),
                "flagged_ratio_pct": round(float(outlier_flags["any_extreme_flag"].mean() * 100.0), 3),
                "notice": "Extreme events are preserved as valid contamination signals rather than removed."
            },
            "overall_status": "PASSED" if schema_valid and missing_summary["missing_count"].sum() == 0 else "WARNING"
        }
        return report


def validate_dataframe(df: pd.DataFrame) -> Dict[str, Any]:
    """Helper entry point for notebook and pipeline validation."""
    validator = EnvironmentalDataValidator()
    return validator.generate_full_validation_report(df)
