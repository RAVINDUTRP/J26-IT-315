"""Demo data. Replace each function body with a call into the real component when it is ready."""
from datetime import datetime, timedelta, timezone
import math

SITES = {
    "ambatale": {"name": "Ambatale intake", "lat": 6.9547, "lon": 79.9617, "population": 420000},
    "biyagama": {"name": "Biyagama", "lat": 6.9500, "lon": 79.9990, "population": 180000},
    "hanwella": {"name": "Hanwella", "lat": 6.9019, "lon": 80.0820, "population": 60000},
}
_BASE = {"ambatale": 1.0, "biyagama": 0.6, "hanwella": 0.3}


def now():
    return datetime.now(timezone.utc)


def observations(site_id: str, n: int = 24):
    k = _BASE[site_id]
    out = []
    for i in range(n):
        t = now() - timedelta(minutes=(n - i) * 15)
        rain = max(0, 2 + k * 18 * math.exp(-((i - 16) ** 2) / 30))
        out.append({
            "site_id": site_id, "timestamp": t.isoformat(), "location": SITES[site_id],
            "readings": {"ph": round(7.1 - 0.015 * rain, 2), "turbidity_ntu": round(18 + 9 * rain * k, 1),
                         "ec_us_cm": round(210 + 6 * rain * k), "tds_ppm": round(130 + 4 * rain * k), "temp_c": 28.4},
            "rainfall_mm_h": round(rain, 1), "battery_pct": 82 - i * 0.2, "sensor_confidence": 0.93,
            "sampling": {"priority_parameters": ["turbidity_ntu", "ec_us_cm"], "interval_s": 120 if rain > 8 else 900,
                         "transmission_priority": "high" if rain > 8 else "normal",
                         "reasons": [f"rainfall {round(rain,1)} mm/h", "turbidity rising" if rain > 8 else "stable conditions"]},
        })
    return out


def network():
    nodes = [
        {"id": "S1", "role": "sensor", "health": 0.91, "battery": 78, "rssi": -82, "snr": 7.5},
        {"id": "S2", "role": "sensor", "health": 0.88, "battery": 71, "rssi": -88, "snr": 6.0},
        {"id": "R1", "role": "relay", "health": 0.84, "battery": 69, "rssi": -91, "snr": 5.1},
        {"id": "R2", "role": "relay", "health": 0.93, "battery": 88, "rssi": -79, "snr": 8.4},
        {"id": "R3", "role": "relay", "health": 0.86, "battery": 74, "rssi": -90, "snr": 5.5},
        {"id": "R4", "role": "relay", "health": 0.38, "battery": 19, "rssi": -108, "snr": -2.0, "predicted_failure": 0.82},
        {"id": "R5", "role": "relay", "health": 0.9, "battery": 83, "rssi": -81, "snr": 7.9},
        {"id": "GW", "role": "gateway", "health": 0.97, "battery": 100, "rssi": -70, "snr": 10.0},
    ]
    links = [["S1", "R1"], ["S1", "R2"], ["S2", "R2"], ["S2", "R3"], ["R1", "R4"], ["R2", "R4"],
             ["R2", "R5"], ["R3", "R5"], ["R4", "GW"], ["R5", "GW"]]
    return {"nodes": nodes, "links": links, "active_path": ["S1", "R2", "R5", "GW"], "previous_path": ["S1", "R1", "R4", "GW"],
            "pdr_percent": 97.4, "latency_ms": 840, "recovery_s": 2.1}


def risk():
    spec = {"ambatale": (0.84, "critical", 0.81, True), "biyagama": (0.55, "moderate", 0.74, False), "hanwella": (0.18, "low", 0.88, False)}
    out = []
    for sid, (score, cat, conf, anom) in spec.items():
        out.append({
            "site_id": sid, "timestamp": now().isoformat(), "location": SITES[sid], "horizon_h": 6,
            "risk_score": score, "risk_category": cat, "confidence": conf,
            "explanation": [
                {"feature": "Accumulated rainfall (6h)", "contribution": round(0.31 * score, 3)},
                {"feature": "Rainfall increase rate", "contribution": round(0.22 * score, 3)},
                {"feature": "Turbidity change rate", "contribution": round(0.17 * score, 3)},
                {"feature": "Historical contamination trend", "contribution": round(0.09 * score, 3)},
                {"feature": "pH (recent change)", "contribution": round(-0.04, 3)},
            ],
            "anomaly": {"flag": anom, "kind": "pollution_pattern" if anom else "none", "score": 0.77 if anom else 0.08},
        })
    return out
