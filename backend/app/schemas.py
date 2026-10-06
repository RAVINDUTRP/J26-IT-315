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


class C2RankedPath(BaseModel):
    path: list[str]
    score: float
    hops: int
    available: bool


class C2Routing(BaseModel):
    algorithm: str
    switched: bool
    active_score: float
    selected_score: float
    ranked_paths: list[C2RankedPath]


class C2Node(BaseModel):
    id: str
    role: str
    health: float
    status: str
    battery: float
    rssi: float
    snr: float
    congestion: float
    failure_risk: float
    predicted_failure: float | None = None
    x: float
    y: float


class C2Network(BaseModel):
    nodes: list[C2Node]
    links: list[list[str]]
    active_path: list[str]
    previous_path: list[str]
    routing: C2Routing
    pdr_percent: float
    latency_ms: float
    recovery_s: float
    energy_mwh: float
    route_switch_count: int
    failed_node: str | None = None
