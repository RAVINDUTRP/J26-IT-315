"""Explicit, non-destructive preprocessing helpers."""

import pandas as pd
from .data_loader import validate_dataframe
from .features import standardize_columns


def clean_dataframe(df: pd.DataFrame, drop_duplicates: bool = True) -> tuple[pd.DataFrame, object]:
    result = standardize_columns(df)
    if "timestamp" not in result:
        raise ValueError("A timestamp column is required.")
    result["timestamp"] = pd.to_datetime(result["timestamp"], errors="coerce", utc=True)
    result = result.dropna(subset=["timestamp"]).copy()
    if drop_duplicates:
        result = result.drop_duplicates()
    for column in result.columns:
        if column not in ("timestamp", "location_id", "contamination_label"):
            converted = pd.to_numeric(result[column], errors="coerce")
            if converted.notna().any():
                result[column] = converted
    result = result.sort_values(["location_id", "timestamp"]).reset_index(drop=True)
    return result, validate_dataframe(result)
