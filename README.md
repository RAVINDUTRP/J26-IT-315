# AquaShield - Adaptive Environmental Intelligence for Early Water Contamination Detection and Disaster Response

Project ID: J26-IT-315 (SLIIT, IT4010). Four components, one per member, joined by a shared data contract.

| # | Component | Folder | Member |
|---|-----------|--------|--------|
| 1 | Context-Aware Adaptive Environmental Sensing | `component1_sensing/` | IT23384392 |
| 2 | Resilient Disaster Communication (self-healing LoRa mesh) | `component2_comms/` | IT23384224 |
| 3 | Explainable Contamination Risk Prediction | `component3_prediction/` | IT23383098 |
| 4 | AI-Based Disaster Decision Support | `component4_decision/` | IT23327726 |

Data flow: `C1 observation -> C2 transmission -> C3 risk assessment -> C4 recommendation -> dashboard`

## Quick start

Windows (PowerShell): `./scripts/setup.ps1` then `./scripts/dev.ps1`
Mac/Linux: `./scripts/setup.sh` then `./scripts/dev.sh`

Or manually:

```bash
# Demo UI (works on its own with mock data)
cd frontend && npm install && npm run dev        # http://localhost:5173

# Backend (optional, serves the same mock data over REST)
cd backend && python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000   # http://localhost:8000/docs
```

To make the UI call the backend instead of its built-in mock data, copy `frontend/.env.example` to `frontend/.env`.

## Working rules (so 4 people don't collide)
- Each member only edits their own `componentN_*/` folder. Shared things (`shared/contracts`, `backend/app/schemas.py`, `frontend/`) change only through a pull request that all four see.
- Contracts first: if you need a new field, change `shared/contracts/*.json` and `docs/data-contract.md`, then tell the others.
- Branches: `main` (stable), `compN/feature-name` (your work). Open a PR into `main`.
- Each component exposes one function that the backend router calls, so integration stays simple (see each component README).
