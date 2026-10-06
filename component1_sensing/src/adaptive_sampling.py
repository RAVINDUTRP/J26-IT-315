from .context import identify_context
from .preprocessing import clean, sensor_confidence

INTERVALS = {"stable": 900, "watch": 300, "event": 60}


def decide(reading: dict, history: list, rainfall_mm_h: float, battery_pct: float) -> dict:
    """Entry point used by the backend. Returns the sampling decision (see shared/contracts/observation.schema.json)."""
    reading = clean(reading)
    ctx = identify_context(reading, history, rainfall_mm_h, battery_pct)
    return {
        "readings": reading,
        "sensor_confidence": sensor_confidence(reading),
        "sampling": {
            "priority_parameters": ["turbidity_ntu", "ec_us_cm"] if ctx != "stable" else ["ph"],
            "interval_s": INTERVALS[ctx],
            "transmission_priority": "high" if ctx == "event" else "normal",
            "reasons": [f"context={ctx}", f"rainfall={rainfall_mm_h} mm/h"],
        },
    }
