#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
(cd frontend && npm install)
(cd backend && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt)
echo "Setup done. Run ./scripts/dev.sh"
