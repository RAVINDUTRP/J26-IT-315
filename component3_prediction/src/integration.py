"""Validated JSON export for Component 04."""

import json
from pathlib import Path
import jsonschema

SCHEMA = Path(__file__).parents[2] / "shared" / "contracts" / "risk_assessment.schema.json"


def validate_assessment(assessment: dict) -> None:
    required = {"site_id", "timestamp", "horizon_h", "risk_score", "risk_category",
                "confidence", "explanation", "anomaly"}
    missing = required - assessment.keys()
    if missing:
        raise ValueError(f"Assessment is missing required fields: {sorted(missing)}")
    if assessment["risk_score"] is not None and not 0 <= assessment["risk_score"] <= 1:
        raise ValueError("risk_score must be between 0 and 1.")
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    jsonschema.validate(assessment, schema)


def export_json(assessment: dict, destination=None) -> str:
    validate_assessment(assessment)
    payload = json.dumps(assessment, indent=2, default=str)
    if destination:
        Path(destination).write_text(payload + "\n", encoding="utf-8")
    return payload
