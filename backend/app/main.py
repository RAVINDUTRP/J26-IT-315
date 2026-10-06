import sys
from pathlib import Path

# make component packages importable (component1_sensing, ... live at repo root)
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import c1_sensing, c2_comms, c3_prediction, c4_decision

app = FastAPI(title="AquaShield API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])

app.include_router(c1_sensing.router, prefix="/api/c1", tags=["C1 sensing"])
app.include_router(c2_comms.router, prefix="/api/c2", tags=["C2 communication"])
app.include_router(c3_prediction.router, prefix="/api/c3", tags=["C3 prediction"])
app.include_router(c4_decision.router, prefix="/api/c4", tags=["C4 decision support"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
