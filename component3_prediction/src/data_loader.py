"""CSV loading and data-quality validation."""

from dataclasses import dataclass
import pandas as pd

REQUIRED = {"timestamp", "location_id"}
NUMERIC_RANGES = {"pH": (0, 14), "turbidity": (0, None), "electrical_conductivity": (0, None),
                  "TDS": (0, None), "water_temperature": (-5, 60), "rainfall_mm": (0, None)}


@dataclass
class QualityReport:
    rows: int
    duplicate_rows: int
    invalid_timestamps: int
    missing_required: list[str]
    range_violations: dict[str, int]
    missing_values: dict[str, int]

    @property
    def valid(self) -> bool:
        return not self.missing_required and self.invalid_timestamps == 0 and not self.range_violations


def validate_dataframe(df: pd.DataFrame) -> QualityReport:
    missing_required = sorted(REQUIRED - set(df.columns))
    timestamps = pd.to_datetime(df["timestamp"], errors="coerce", utc=True) if "timestamp" in df else pd.Series(dtype="object")
    violations = {}
    for column, (low, high) in NUMERIC_RANGES.items():
        if column in df:
            values = pd.to_numeric(df[column], errors="coerce")
            count = ((values < low) | ((values > high) if high is not None else False)).sum()
            if count:
                violations[column] = int(count)
    return QualityReport(len(df), int(df.duplicated().sum()), int(timestamps.isna().sum()),
                         missing_required, violations, df.isna().sum().astype(int).to_dict())


def load_csv(source) -> tuple[pd.DataFrame, QualityReport]:
    try:
        df = pd.read_csv(source)
    except (OSError, ValueError, pd.errors.ParserError) as exc:
        raise ValueError(f"Could not read CSV: {exc}") from exc
    return df, validate_dataframe(df)
