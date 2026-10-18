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


## Component 2 development

Component 2 now exposes a research-testable communication pipeline:

`water telemetry -> compact binary packet -> rolling-key XOR protection -> adaptive multi-hop routing -> gateway decode -> dashboard`

### C2 Python tests

```powershell
cd component2_comms
python -m pytest
```

### C2 simulation

From repository root:

```powershell
python -m component2_comms.simulation.mesh_sim
```

### Backend + frontend

Terminal 1:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Terminal 2:

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

For backend-backed Component 2 data, `.env` should contain:

```env
VITE_USE_API=true
VITE_API_URL=http://localhost:8000
```

Open `http://localhost:5173/network`. The Network page includes adaptive route ranking, node health, PDR, latency, energy, recovery time and a controlled failure simulation.

### C2 API

- `GET /api/c2/network`
- `GET /api/c2/network?failed_node=R4`
- `GET /api/c2/metrics`
- `GET /api/c2/experiment?runs=20`
- `GET /api/c2/packet-demo`

The dashboard is intentionally a research/demo interface; hardware field deployment still requires the actual Ra-02 wiring, legal frequency, node IDs and radio parameters to be confirmed.
