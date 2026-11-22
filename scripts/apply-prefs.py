#!/usr/bin/env python3
"""Apply your config to Vivaldi's Preferences: the CSS mods folder, the
recommended Arc layout (optional), your saved UI layout, workspaces, link
routes and the address field in the sidebar.

Vivaldi must be quit (it rewrites Preferences on exit). Only adds or updates
things; never deletes workspaces, routes or tabs. A backup is written next to
Preferences as Preferences.bak-arcify.

    scripts/apply-prefs.py --config CONFIG.json --css-dir CSS_DIR [--preset FILE]
"""
import argparse, json, pathlib, shutil, sys, time, uuid

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import ui_prefs
from arcify_paths import PREFS, require_quit


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--css-dir", required=True)
    ap.add_argument("--preset", help="layout preset (presets/arc-layout.json)")
    args = ap.parse_args()

    require_quit()
    config = json.loads(pathlib.Path(args.config).read_text())
    shutil.copy2(PREFS, PREFS.with_name("Preferences.bak-arcify"))
    prefs = json.loads(PREFS.read_text())
    v = prefs.setdefault("vivaldi", {})

    # Recommended layout first, then your own saved layout, then the steps
    # below: later ones win.
    if args.preset:
        preset = {k: val for k, val in json.loads(pathlib.Path(args.preset).read_text()).items()
                  if not k.startswith("_")}
        for path, value in preset.items():
            ui_prefs.put_synced(prefs, path, value)
        print(f"arc layout   →  {len(preset)} settings")
    if config.get("vivaldiUI"):
        n = ui_prefs.apply(prefs, config["vivaldiUI"])
        print(f"your layout  →  {n} settings")

    # Per-workspace themes need a fixed theme: a new Vivaldi profile follows
    # the macOS light/dark setting ("system"), which ignores the theme the
    # mod picks.
    ui_prefs.put_synced(prefs, "vivaldi.theme.schedule.enabled", "off")
    print("theme schedule → off (themes follow your workspace)")

    # CSS mods folder
    v.setdefault("appearance", {})["css_ui_mods_directory"] = str(pathlib.Path(args.css_dir).resolve())
    print("css folder   → ", v["appearance"]["css_ui_mods_directory"])

    # Workspaces (matched by name) and link routes
    ws_prefs = v.setdefault("workspaces", {})
    ws_list = ws_prefs.setdefault("list", [])
    routes = ws_prefs.setdefault("link_routes", [])
    next_id = float(int(time.time() * 1000))
    for ws in config.get("workspaces", []):
        name = ws["name"]
        cur = next((w for w in ws_list if w.get("name") == name), None)
        if cur is None:
            cur = {"id": next_id, "name": name}
            next_id += 1
            ws_list.append(cur)
            print("workspace  + ", name)
        else:
            print("workspace  = ", name)
        for key in ("emoji", "icon"):
            if ws.get(key):
                cur[key] = ws[key]
        for r in ws.get("linkRoutes", []):
            expr, typ = r["expression"], r.get("type", "CONTAINS")
            if not any(x.get("expression") == expr and x.get("type") == typ
                       and x.get("workspaceId") == cur["id"] for x in routes):
                routes.append({"expression": expr, "type": typ,
                               "workspaceId": cur["id"], "id": str(uuid.uuid4())})
                print("   route + ", typ, expr)

    # Command chains like "Switch to Theme X" + "Switch to Workspace N": the
    # mod sets the theme now, and the extra theme step confuses it.
    for c in v.get("chained_commands", {}).get("command_list", []):
        chain = c.get("chain", [])
        if any(str(x.get("name", "")).startswith("COMMAND_WORKSPACE_SWITCH") for x in chain):
            kept = [x for x in chain if x.get("name") != "COMMAND_TOGGLE_INTERFACE_COLOR_BY_NAME"]
            if len(kept) != len(chain):
                c["chain"] = kept
                print("chain      -  theme step from", c.get("label"))

    # Address field in the sidebar (between workspace name and pinned tabs)
    if config.get("addressFieldInSidebar", True):
        tb = v.setdefault("toolbars", {})
        before = [x for x in tb.get("tabbar_before", ["WorkspaceButton"]) if x != "AddressField"]
        if "WorkspaceButton" not in before:
            before.insert(0, "WorkspaceButton")
        i = before.index("WorkspaceButton") + 1
        tb["tabbar_before"] = before[:i] + ["AddressField"] + before[i:]
        tb["navigation"] = [x for x in tb.get("navigation", []) if x != "AddressField"]
        print("address field → sidebar")

    PREFS.write_text(json.dumps(prefs, separators=(",", ":")))


if __name__ == "__main__":
    main()
