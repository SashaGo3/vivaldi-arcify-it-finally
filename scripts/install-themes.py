#!/usr/bin/env python3
"""Add or update the Arcify themes (themes/*.json) in Vivaldi's Preferences.

Vivaldi must be quit (it rewrites Preferences on exit). Matches by theme id,
so re-running updates the themes in place. A backup is written next to
Preferences as Preferences.bak-arcify-themes.
"""
import json, pathlib, shutil, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from arcify_paths import PREFS, require_quit

REPO = pathlib.Path(__file__).resolve().parent.parent

require_quit()
shutil.copy2(PREFS, PREFS.with_name("Preferences.bak-arcify-themes"))
prefs = json.loads(PREFS.read_text())
user = prefs.setdefault("vivaldi", {}).setdefault("themes", {}).setdefault("user", [])

names = []
for f in sorted((REPO / "themes").glob("*.json")):
    theme = json.loads(f.read_text())
    i = next((i for i, t in enumerate(user) if t.get("id") == theme["id"]), None)
    if i is None:
        user.append(theme)
    else:
        user[i] = theme
    names.append(theme["name"])

PREFS.write_text(json.dumps(prefs, separators=(",", ":")))
print(f"{len(names)} themes: {', '.join(names)}")
