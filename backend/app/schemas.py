from pydantic import BaseModel


class Explanation(BaseModel):
    feature: str
    contribution: float


class Anomaly(BaseModel):
    flag: bool
    kind: str
    score: float


class RiskAssessment(BaseModel):
    site_id: str
    timestamp: str
    location: dict
    horizon_h: int
    risk_score: float
    risk_category: str
    confidence: float
    explanation: list[Explanation]
    anomaly: Anomaly
