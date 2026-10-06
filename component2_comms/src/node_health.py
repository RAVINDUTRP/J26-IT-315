def health_score(rssi_dbm: float, snr_db: float, battery_pct: float, congestion: float) -> float:
    """Composite 0..1 health. TODO(C2): replace with your predictive model."""
    rssi = min(max((rssi_dbm + 120) / 60, 0), 1)
    snr = min(max((snr_db + 10) / 25, 0), 1)
    return round(0.35 * rssi + 0.25 * snr + 0.25 * battery_pct / 100 + 0.15 * (1 - congestion), 3)
