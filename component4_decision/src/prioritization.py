SEVERITY = {"low": 0.1, "moderate": 0.4, "high": 0.7, "critical": 1.0}


def priority_score(assessment: dict, population: int, comm_status: str) -> float:
    """TODO(C4): replace with your AI/MCDM model."""
    comm_penalty = {"good": 0.0, "degraded": 0.1, "lost": 0.2}[comm_status]
    return round(0.6 * SEVERITY[assessment["risk_category"]] + 0.3 * min(population / 500_000, 1) + comm_penalty, 3)
