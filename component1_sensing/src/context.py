def identify_context(reading: dict, history: list, rainfall_mm_h: float, battery_pct: float) -> str:
    """Return 'stable' | 'watch' | 'event'. TODO(C1): replace the placeholder rule with your model."""
    if rainfall_mm_h > 20 or reading.get("turbidity_ntu", 0) > 150:
        return "event"
    if rainfall_mm_h > 5:
        return "watch"
    return "stable"
