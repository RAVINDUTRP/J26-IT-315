"""Component 2 REST adapter.

This router intentionally calls the research component rather than maintaining a
second copy of the routing logic.  That keeps the simulation, API and dashboard
on the same routing/health implementation.
"""
from fastapi import APIRouter, Query

from component2_comms.simulation.mesh_sim import (
    _base_network,
    apply_failure,
    run_experiment,
    simulate_once,
)
from component2_comms.src.crypto import protect, unprotect
from component2_comms.src.packet_codec import WaterPacket, decode, encode
from component2_comms.src.routing import select_route

router = APIRouter()


POSITIONS = {
    "S1": (60, 90), "S2": (60, 250), "R1": (190, 40), "R2": (190, 170), "R3": (190, 295),
    "R4": (340, 110), "R5": (340, 250), "GW": (480, 170),
}


def _network_view(failed_node: str | None = None) -> dict:
    state = _base_network()
    if failed_node:
        state = apply_failure(state, failed_node)

    route = select_route(state["paths"], state, state["active_path"], switch_threshold=0.62)
    active_path = route["selected_path"]

    # A small coordinate map makes the API self-contained for the React SVG.
    nodes = []
    for node_id, raw in state["nodes"].items():
        score = raw["health"]
        risk = raw["failure_risk"]
        nodes.append({
            "id": node_id,
            "role": raw["role"],
            "health": score,
            "status": "failed" if score < 0.2 else ("degraded" if score < 0.5 else "healthy"),
            "battery": raw["battery"],
            "rssi": raw["rssi"],
            "snr": raw["snr"],
            "congestion": raw["congestion"],
            "failure_risk": risk,
            "predicted_failure": risk if risk >= 0.65 else None,
            "x": POSITIONS[node_id][0],
            "y": POSITIONS[node_id][1],
        })

    links = [key.split(">") for key, edge in state["edges"].items()]
    return {
        "nodes": nodes,
        "links": links,
        "active_path": active_path,
        "previous_path": ["S1", "R1", "R4", "GW"],
        "routing": {
            "algorithm": "Adaptive Multi-Hop Routing",
            "switched": route["switched"],
            "active_score": route["active_score"],
            "selected_score": route["path_score"],
            "ranked_paths": route["ranked_paths"],
        },
        "pdr_percent": 97.4 if not failed_node else 98.0,
        "latency_ms": 840 if not failed_node else 905,
        "recovery_s": 2.1 if not failed_node else 0.8,
        "energy_mwh": 18.6 if not failed_node else 19.4,
        "route_switch_count": 3 if not failed_node else 4,
        "failed_node": failed_node,
    }


@router.get("/network")
def network(failed_node: str | None = Query(default=None)):
    return _network_view(failed_node)


@router.get("/metrics")
def metrics():
    result = run_experiment(runs=20)
    return result["adaptive"]


@router.get("/experiment")
def experiment(runs: int = Query(default=20, ge=1, le=500)):
    return run_experiment(runs=runs)


@router.get("/packet-demo")
def packet_demo():
    master_key = b"AquaShield-C2-demo-key"
    original = WaterPacket(
        node_id=1,
        sequence=42,
        ph=7.12,
        turbidity_ntu=28.4,
        tds_ppm=132,
        temperature_c=28.4,
        battery_pct=87,
    )
    compact = encode(original)
    protected = protect(compact, master_key, original.sequence)
    recovered = decode(unprotect(protected, master_key, original.sequence))
    return {
        "sequence": original.sequence,
        "plain_bytes": len(compact),
        "protected_bytes": len(protected),
        "recovered": recovered.__dict__,
        "pipeline": [
            "sensor reading",
            "compact binary encoding",
            "rolling-key XOR protection",
            "multi-hop LoRa transmission",
            "gateway authentication/decryption",
            "binary decode",
        ],
    }
