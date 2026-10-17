"""Evaluation helpers with honest unavailable states."""


def evaluate(bundle: dict) -> dict:
    metrics = dict(bundle.get("metrics", {}))
    metrics["early_warning_lead_time"] = "Not available: event timestamps are required."
    metrics["false_alarm_rate"] = "Not available: validated event labels are required."
    return metrics
