#!/usr/bin/env bash
cd "$(dirname "$0")/.."
(cd backend && . .venv/bin/activate && uvicorn app.main:app --reload --port 8000) &
(cd frontend && npm run dev)
