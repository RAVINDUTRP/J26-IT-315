"""Node and link health scoring for the resilient LoRa mesh.

The score is intentionally deterministic and explainable so that it can be
used on constrained nodes and also reproduced in the research simulation.
Inputs are normalised from radio/network telemetry rather than being treated
as an ML prediction model.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Mapping


@dataclass(frozen=True)
class HealthResult:
    score: float
    risk: float
    status: str


def _clip(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def normalise_rssi(rssi_dbm: float) -> float:
    # -120 dBm ~= unusable, -60 dBm ~= strong for the simulated range.
    return _clip((rssi_dbm + 120.0) / 60.0, 0.0, 1.0)


def normalise_snr(snr_db: float) -> float:
    return _clip((snr_db + 10.0) / 25.0, 0.0, 1.0)


def health_score(
    rssi_dbm: float,
    snr_db: float,
    battery_pct: float,
    congestion: float,
) -> float:
    """Return an explainable composite health score in [0, 1]."""
    rssi = normalise_rssi(rssi_dbm)
    snr = normalise_snr(snr_db)
    battery = _clip(battery_pct / 100.0, 0.0, 1.0)
    free_capacity = 1.0 - _clip(congestion, 0.0, 1.0)
    return round(0.35 * rssi + 0.25 * snr + 0.25 * battery + 0.15 * free_capacity, 3)


def classify_health(score: float) -> str:
    if score >= 0.75:
        return "healthy"
    if score >= 0.50:
        return "degraded"
    return "critical"


def estimate_failure_risk(
    score: float,
    battery_trend_pct_per_hour: float = 0.0,
    snr_trend_db_per_hour: float = 0.0,
    congestion_trend_per_hour: float = 0.0,
) -> float:
    """Estimate near-term degradation risk from current score and trends.

    This is a transparent heuristic, not an ML failure-prediction model.
    """
    risk = 1.0 - _clip(score, 0.0, 1.0)
    risk += max(0.0, -battery_trend_pct_per_hour) * 0.015
    risk += max(0.0, -snr_trend_db_per_hour) * 0.04
    risk += max(0.0, congestion_trend_per_hour) * 0.30
    return round(_clip(risk, 0.0, 1.0), 3)


def evaluate_node(metrics: Mapping[str, float]) -> HealthResult:
    score = health_score(
        float(metrics["rssi"]),
        float(metrics["snr"]),
        float(metrics["battery"]),
        float(metrics.get("congestion", 0.0)),
    )
    risk = estimate_failure_risk(
        score,
        float(metrics.get("battery_trend", 0.0)),
        float(metrics.get("snr_trend", 0.0)),
        float(metrics.get("congestion_trend", 0.0)),
    )
    return HealthResult(score, risk, classify_health(score))


def aggregate_health(history: Iterable[Mapping[str, float]]) -> HealthResult:
    rows = list(history)
    if not rows:
        raise ValueError("history must contain at least one observation")
    result = [evaluate_node(row) for row in rows]
    return HealthResult(
        round(sum(r.score for r in result) / len(result), 3),
        round(max(r.risk for r in result), 3),
        classify_health(sum(r.score for r in result) / len(result)),
    )
