#!/usr/bin/env python3
"""Save your current Vivaldi workspaces, link routes and UI layout (toolbars,
buttons, tab bar, panels, shortcuts) to your Arcify config, so setup.sh can
re-create them later, for example on another Mac.

Safe while Vivaldi is running (read-only). Keeps "theme" and other settings
already in the config; workspaces are matched by name.

    scripts/export-config.py [CONFIG.json]
"""
import json, pathlib, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import ui_prefs
from arcify_paths import PREFS, config_path

path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else config_path()
old = json.loads(path.read_text()) if path.exists() else {"addressFieldInSidebar": True, "workspaces": []}
old_by_name = {w["name"]: w for w in old.get("workspaces", [])}

prefs = json.loads(PREFS.read_text())
ws_prefs = prefs.get("vivaldi", {}).get("workspaces", {})
routes = ws_prefs.get("link_routes", [])

workspaces = []
for w in ws_prefs.get("list", []):
    entry = dict(old_by_name.get(w["name"], {}))
    entry["name"] = w["name"]
    for key in ("emoji", "icon"):
        if w.get(key):
            entry[key] = w[key]
    entry["linkRoutes"] = [{"expression": r["expression"], "type": r.get("type", "CONTAINS")}
                           for r in routes if r.get("workspaceId") == w["id"]]
    entry.setdefault("theme", "")
    workspaces.append(entry)

old["workspaces"] = workspaces
# UI layout: toolbars, buttons, tab bar, panels, shortcuts… (see ui_prefs.py)
old["vivaldiUI"] = ui_prefs.export(prefs)
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(old, indent=2, ensure_ascii=False) + "\n")
print(f"Saved {len(workspaces)} workspaces and {len(old['vivaldiUI'])} UI layout settings to {path}")
