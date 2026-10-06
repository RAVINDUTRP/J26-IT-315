"""Adaptive multi-hop routing for the simulated LoRa mesh.

The implementation is deliberately explicit rather than tied to a named
internet routing protocol.  It ranks complete candidate paths using radio
quality, node health, battery, congestion and hop count, then switches to the
best healthy alternative when the active route degrades.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Sequence

from .node_health import health_score


@dataclass(frozen=True)
class RouteCandidate:
    path: list[str]
    score: float
    hops: int
    available: bool


def _edge_score(edge: Mapping[str, float]) -> float:
    radio = (
        0.55 * edge.get("rssi_score", 0.0)
        + 0.30 * edge.get("snr_score", 0.0)
        + 0.15 * (1.0 - min(max(edge.get("packet_loss", 0.0), 0.0), 1.0))
    )
    return max(0.0, min(1.0, radio))


def path_score(
    path: Sequence[str],
    network_state: Mapping,
) -> float:
    """Score a path in [0, 1]; higher is better."""
    nodes = network_state.get("nodes", {})
    edges = network_state.get("edges", {})
    if len(path) < 2:
        return 0.0

    node_scores = []
    edge_scores = []
    for node_id in path:
        node = nodes.get(node_id, {})
        node_scores.append(
            health_score(
                float(node.get("rssi", -120)),
                float(node.get("snr", -10)),
                float(node.get("battery", 0)),
                float(node.get("congestion", 1)),
            )
        )

    for a, b in zip(path, path[1:]):
        edge = edges.get(f"{a}>{b}") or edges.get(f"{b}>{a}")
        if not edge or edge.get("up", True) is False:
            return 0.0
        edge_scores.append(_edge_score(edge))

    node_part = sum(node_scores) / len(node_scores)
    edge_part = sum(edge_scores) / len(edge_scores)
    hop_penalty = 1.0 / (1.0 + 0.08 * max(0, len(path) - 2))
    return round(0.58 * node_part + 0.34 * edge_part + 0.08 * hop_penalty, 4)


def rank_paths(paths: Sequence[Sequence[str]], network_state: Mapping) -> list[RouteCandidate]:
    ranked = []
    for path in paths:
        score = path_score(path, network_state)
        ranked.append(RouteCandidate(list(path), score, max(0, len(path) - 1), score > 0))
    return sorted(ranked, key=lambda item: (item.available, item.score, -item.hops), reverse=True)


def select_route(
    paths: Sequence[Sequence[str]],
    network_state: Mapping,
    active_path: Sequence[str] | None = None,
    switch_threshold: float = 0.62,
) -> dict:
    ranked = rank_paths(paths, network_state)
    if not ranked:
        raise ValueError("No candidate paths supplied")

    best = ranked[0]
    active_score = path_score(active_path, network_state) if active_path else 0.0
    should_switch = active_path is None or active_score < switch_threshold or best.score > active_score + 0.05

    selected = best if should_switch else RouteCandidate(list(active_path), active_score, len(active_path) - 1, active_score > 0)
    return {
        "selected_path": selected.path,
        "path_score": selected.score,
        "switched": should_switch,
        "active_score": active_score,
        "ranked_paths": [
            {"path": c.path, "score": c.score, "hops": c.hops, "available": c.available}
            for c in ranked
        ],
    }


def deliver(observation: dict, network_state: dict) -> dict:
    """Select an adaptive route and return a transmission envelope."""
    paths = network_state.get("paths") or [["S1", "R2", "R5", "GW"]]
    result = select_route(paths, network_state, network_state.get("active_path"))
    return {
        "node_id": result["selected_path"][0],
        "path": result["selected_path"],
        "path_health": result["path_score"],
        "routing": result,
        "payload": observation,
    }
