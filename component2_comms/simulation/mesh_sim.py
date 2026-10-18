"""Deterministic LoRa mesh simulation for Component 2 research evaluation."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable
import random
import time

try:
    from ..src.node_health import health_score, estimate_failure_risk
    from ..src.routing import select_route
except ImportError:  # direct execution from component2_comms/
    from src.node_health import health_score, estimate_failure_risk
    from src.routing import select_route


DEFAULT_PATHS = [
    ["S1", "R1", "R4", "GW"],
    ["S1", "R2", "R4", "GW"],
    ["S1", "R2", "R5", "GW"],
]


def _base_network() -> dict:
    node_rows = [
        ("S1", "sensor", 78, -82, 7.5, 0.12, 0.0, 0.0),
        ("S2", "sensor", 71, -88, 6.0, 0.18, -0.5, 0.0),
        ("R1", "relay", 69, -91, 5.1, 0.28, -1.2, -0.1),
        ("R2", "relay", 88, -79, 8.4, 0.12, -0.2, 0.0),
        ("R3", "relay", 74, -90, 5.5, 0.22, -0.6, 0.0),
        ("R4", "relay", 72, -89, 5.2, 0.18, -20.0, 0.30),
        ("R5", "relay", 83, -81, 7.9, 0.16, -0.1, 0.0),
        ("GW", "gateway", 100, -70, 10.0, 0.05, 0.0, 0.0),
    ]
    nodes = {}
    for node_id, role, battery, rssi, snr, congestion, battery_trend, congestion_trend in node_rows:
        score = health_score(rssi, snr, battery, congestion)
        nodes[node_id] = {
            "id": node_id,
            "role": role,
            "battery": battery,
            "rssi": rssi,
            "snr": snr,
            "congestion": congestion,
            "battery_trend": battery_trend,
            "snr_trend": -8.0 if node_id == "R4" else 0.0,
            "congestion_trend": congestion_trend,
            "health": score,
            "failure_risk": estimate_failure_risk(score, battery_trend, -8.0 if node_id == "R4" else 0.0, congestion_trend),
        }

    edges = {}
    for a, b, rssi, snr, loss in [
        ("S1", "R1", -91, 5.1, 0.05),
        ("S1", "R2", -79, 8.4, 0.02),
        ("S2", "R2", -88, 6.0, 0.04),
        ("S2", "R3", -90, 5.5, 0.06),
        ("R1", "R4", -105, 0.2, 0.12),
        ("R2", "R4", -102, 1.1, 0.09),
        ("R2", "R5", -81, 7.9, 0.02),
        ("R3", "R5", -90, 5.5, 0.05),
        ("R4", "GW", -106, -0.5, 0.15),
        ("R5", "GW", -70, 10.0, 0.01),
    ]:
        edges[f"{a}>{b}"] = {
            "rssi_score": max(0, min(1, (rssi + 120) / 60)),
            "snr_score": max(0, min(1, (snr + 10) / 25)),
            "packet_loss": loss,
            "up": True,
        }
    return {"nodes": nodes, "edges": edges, "paths": DEFAULT_PATHS, "active_path": DEFAULT_PATHS[1]}


def apply_failure(network: dict, node_id: str = "R4") -> dict:
    state = {
        **network,
        "nodes": {k: dict(v) for k, v in network["nodes"].items()},
        "edges": {k: dict(v) for k, v in network["edges"].items()},
    }
    if node_id not in state["nodes"]:
        raise ValueError(f"Unknown node: {node_id}")
    state["nodes"][node_id].update(
        {"battery": 5, "rssi": -115, "snr": -7, "congestion": 0.95, "health": 0.08, "failure_risk": 0.99}
    )
    for edge in state["edges"].values():
        # infer endpoints from key
        if node_id in edge.get("nodes", ()):
            edge["up"] = False
    for key, edge in state["edges"].items():
        if node_id in key.split(">"):
            edge["up"] = False
    return state


def simulate_once(seed: int = 42, failure_node: str = "R4") -> dict:
    rng = random.Random(seed)
    initial = _base_network()
    healthy = select_route(DEFAULT_PATHS, initial, initial["active_path"])
    degraded = apply_failure(initial, failure_node)
    recovered = select_route(DEFAULT_PATHS, degraded, initial["active_path"], switch_threshold=0.62)

    # Synthetic performance model for reproducible evaluation.
    base_pdr = 97.2 + rng.uniform(-0.6, 0.6)
    base_latency = 780 + rng.randint(0, 120)
    recovery_ms = 350 + rng.randint(0, 350) if recovered["switched"] else 0
    rerouted_pdr = min(99.5, base_pdr + 0.6)

    return {
        "seed": seed,
        "failure_node": failure_node,
        "initial_path": healthy["selected_path"],
        "recovered_path": recovered["selected_path"],
        "route_switched": recovered["switched"],
        "pdr_percent": round(rerouted_pdr, 2),
        "latency_ms": base_latency + len(recovered["selected_path"]) * 35,
        "recovery_ms": recovery_ms,
        "energy_mwh": round(12.5 + len(recovered["selected_path"]) * 1.8, 2),
        "ranked_paths": recovered["ranked_paths"],
    }


def run_experiment(runs: int = 20, seed: int = 42) -> dict:
    if runs < 1:
        raise ValueError("runs must be >= 1")
    samples = [simulate_once(seed + i) for i in range(runs)]
    return {
        "runs": runs,
        "adaptive": {
            "pdr_percent": round(sum(s["pdr_percent"] for s in samples) / runs, 2),
            "latency_ms": round(sum(s["latency_ms"] for s in samples) / runs, 2),
            "recovery_ms": round(sum(s["recovery_ms"] for s in samples) / runs, 2),
            "energy_mwh": round(sum(s["energy_mwh"] for s in samples) / runs, 2),
            "route_switch_rate": round(sum(s["route_switched"] for s in samples) / runs, 3),
        },
        "samples": samples,
    }


if __name__ == "__main__":
    print(run_experiment(10))
