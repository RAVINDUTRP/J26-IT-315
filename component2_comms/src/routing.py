def deliver(observation: dict, network_state: dict) -> dict:
    """Pick the healthiest path and wrap the observation. TODO(C2): predictive, pre-emptive switching."""
    paths = network_state.get("paths", [["S1", "R2", "R5", "GW"]])
    best = max(paths, key=lambda p: network_state.get("path_health", {}).get(">".join(p), 0.5))
    return {"node_id": best[0], "path": best, "path_health": network_state.get("path_health", {}).get(">".join(best), 0.5),
            "auth_tag": "TODO", "payload": observation}
