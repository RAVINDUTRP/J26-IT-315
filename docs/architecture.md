# Architecture

Sensors -> C1 adaptive sensing -> C2 LoRa mesh -> database -> C3 risk prediction (+SHAP/LIME, anomaly) -> C4 decision support -> dashboard.
The dashboard in `frontend/` has one page per component plus an overview. It reads from `backend/` (FastAPI) or from built-in mock data.
