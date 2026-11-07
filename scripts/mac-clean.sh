#!/usr/bin/env bash
# Deletes everything that local development downloaded or generated. Keeps only the source code.
set -euo pipefail
cd "$(dirname "$0")/.."
before=$(du -sk . | cut -f1)
rm -rf api/.venv web/node_modules web/dist .cache
find . -type d \( -name __pycache__ -o -name .pytest_cache -o -name '*.egg-info' \) -prune -exec rm -rf {} +
find . -name .DS_Store -delete
after=$(du -sk . | cut -f1)
echo "Cleaned: $(( (before - after) / 1024 )) MB freed. Project is now $(( after / 1024 )) MB of source code."
