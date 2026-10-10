#!/bin/sh
# Refresh the API snapshot from the backend source, then regenerate the types.
#
# Uses the backend's own virtualenv (`cd backend && uv sync`), so no server or
# database has to be running. CI runs the same export and fails when the
# committed snapshot is stale.
set -eu
cd "$(dirname "$0")/.."
(cd ../backend && uv run --no-sync python scripts/export_openapi.py) > src/api/openapi.json
npx openapi-typescript src/api/openapi.json -o src/api/schema.d.ts --default-non-nullable=false
