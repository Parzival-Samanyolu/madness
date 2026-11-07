#!/usr/bin/env bash
# Local development on a Mac/PC without a GPU. Everything stays inside this folder:
#   api/.venv, web/node_modules, .cache/   ->  remove all of it with scripts/mac-clean.sh
# Opens: http://localhost:5173  (login: admin@local.test / admin12345)
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
export PIP_CACHE_DIR=$ROOT/.cache/pip npm_config_cache=$ROOT/.cache/npm PYTHONDONTWRITEBYTECODE=1

[[ -x api/.venv/bin/python ]] || python3 -m venv api/.venv
api/.venv/bin/pip install -q --disable-pip-version-check -r api/requirements-dev.txt
[[ -d web/node_modules ]] || (cd web && npm install --no-audit --no-fund --loglevel=error)

pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

api/.venv/bin/python mock-llm/mock_llm.py & pids+=($!)
(cd api && DATABASE_URL="sqlite:///$ROOT/.cache/dev.db" LLM_URL=http://127.0.0.1:9000 \
  ADMIN_EMAIL=admin@local.test ADMIN_PASSWORD=admin12345 SECRET_KEY=dev \
  .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload --reload-dir app) & pids+=($!)
(cd web && npx vite --host 127.0.0.1) & pids+=($!)
wait
