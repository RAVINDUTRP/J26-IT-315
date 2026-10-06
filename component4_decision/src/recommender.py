from .knowledge_base import ACTIONS
from .prioritization import priority_score


def recommend(assessments: list, populations: dict, comm_status: dict) -> list:
    """Entry point used by the backend. Returns recommendations ranked by priority."""
    rows = []
    for a in assessments:
        sid = a["site_id"]
        score = priority_score(a, populations.get(sid, 0), comm_status.get(sid, "good"))
        rows.append({"site_id": sid, "priority_score": score, "population_exposed": populations.get(sid, 0),
                     "communication_status": comm_status.get(sid, "good"),
                     "actions": [{"action": x, "urgency": "now", "rationale": "TODO"} for x in ACTIONS[a["risk_category"]]],
                     "factors": []})
    rows.sort(key=lambda r: -r["priority_score"])
    for i, r in enumerate(rows, 1):
        r["rank"] = i
    return rows
