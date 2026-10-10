#!/usr/bin/env python3
"""Print the API's OpenAPI document, for clients that generate types from it.

The mobile app commits a snapshot of this document (mobile/src/api/openapi.json)
and generates its TypeScript types from it, so a backend change that alters
the API surface shows up as a diff in review instead of a runtime surprise on
the phone. CI regenerates the document and fails when the snapshot is stale.

The optional agents routes are switched off so the snapshot does not depend
on how the machine running this is configured. Nothing connects to the
database or Redis: building the schema only walks the route table.

    cd backend && uv run python scripts/export_openapi.py > ../mobile/src/api/openapi.json
"""

import json
import os
import sys
import warnings
from pathlib import Path

os.environ["AGENTS_ENABLED"] = "false"
# Settings fall back to a placeholder key; set one so no warning reaches stderr.
os.environ.setdefault("SECRET_KEY", "openapi-export-placeholder-key")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
warnings.simplefilter("ignore")

from app.main import app  # noqa: E402

json.dump(app.openapi(), sys.stdout, indent=2, sort_keys=True, ensure_ascii=False)
sys.stdout.write("\n")
