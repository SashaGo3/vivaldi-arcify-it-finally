#!/usr/bin/env python3
"""The parts of `arcify` that read or change the config. Never asks
questions, so scripts and AI agents can use it. Add --json for JSON output.

    arcify status [--json]
    arcify themes [--json]
    arcify get [KEY]                       always JSON
    arcify set KEY=VALUE…                  VALUE is JSON, or a plain string
    arcify workspace NAME [--theme T] [--emoji E] [--route TEXT]…
    arcify workspace NAME --remove         from the config only, never from Vivaldi

Changes go to the config file only. Run `arcify apply` to apply them.
"""
import argparse, json, os, pathlib, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from arcify_paths import ARCIFY_HOME, PREFS, config_path, vivaldi_running

REPO = pathlib.Path(__file__).resolve().parent.parent
VIVALDI_APP = pathlib.Path(os.environ.get("VIVALDI_APP", "/Applications/Vivaldi.app"))
WINDOW_HTML = (VIVALDI_APP / "Contents/Frameworks/Vivaldi Framework.framework/Versions/Current"
               / "Resources/vivaldi/window.html")
AGENTS = pathlib.Path.home() / "Library/LaunchAgents"

NUM = (int, float)
KEYS = {  # key: (type, help)
    "defaultTheme": (str, "theme name"),
    "arcLayout": (bool, "true/false"),
    "addressFieldInSidebar": (bool, "true/false"),
    "autoReinstall": (bool, "true/false"),
    "syncPinnedTabs": (bool, "true/false"),
    "syncFolder": (str, "folder path"),
    "oldTabHours": (NUM, "number"),
    "oldTabHoursBySite": (dict, '{"site": hours}'),
    "unloadTabHours": (NUM, "number, 0 = never"),
    "saveClearedTabs": (bool, "true/false"),
    "groupBySite": (bool, "true/false"),
    "groupBySiteMin": (int, "number"),
    "workspaces": (list, "list of {name, emoji, theme, linkRoutes}"),
}


def fail(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(2)


def themes():
    out = []
    for f in sorted((REPO / "themes").glob("*.json")):
        t = json.loads(f.read_text())
        n = int(t["colorBg"][1:], 16)
        dark = 0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255) < 128
        out.append({"name": t["name"], "dark": dark, "background": t["colorBg"], "highlight": t["colorHighlightBg"]})
    return out


def theme_name(name):
    names = {t["name"].lower(): t["name"] for t in themes()}
    if name.lower() not in names:
        fail(f"no theme {name!r}. Themes: {', '.join(names.values())}")
    return names[name.lower()]


def load():
    try:
        return json.loads(config_path().read_text())
    except FileNotFoundError:
        return None
    except ValueError as e:
        fail(f"{config_path()} isn't valid JSON: {e}")


def save(cfg):
    path = config_path()
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        ARCIFY_HOME.mkdir(parents=True, exist_ok=True)
        (ARCIFY_HOME / "config-path").write_text(f"{path}\n")
    path.write_text(json.dumps(cfg, indent=2, ensure_ascii=False) + "\n")


def base():
    return load() or json.loads((REPO / "config.example.json").read_text())


def status():
    try:
        js = "<!-- vivaldi-arcify -->" in WINDOW_HTML.read_text()
    except OSError:
        js = False
    try:
        ws = [w.get("name") for w in json.loads(PREFS.read_text())["vivaldi"]["workspaces"]["list"]]
    except (OSError, ValueError, KeyError):
        ws = []
    return {
        "vivaldiInstalled": VIVALDI_APP.is_dir(),
        "vivaldiProfile": str(PREFS.parent),
        "vivaldiRunning": vivaldi_running(),
        "modsInstalled": js,
        "autoReinstallJob": (AGENTS / "vivaldi-arcify.reinstall.plist").is_file(),
        "pinnedSyncJob": (AGENTS / "vivaldi-arcify.pinned-sync.plist").is_file(),
        "configPath": str(config_path()),
        "configExists": config_path().is_file(),
        "vivaldiWorkspaces": ws,
        "modsFolder": str(REPO),
    }


def parse_value(key, raw):
    try:
        v = json.loads(raw)
    except ValueError:
        v = raw  # plain string
    typ, hint = KEYS[key]
    if typ is bool and isinstance(v, str) and v.lower() in ("yes", "no", "on", "off"):
        v = v.lower() in ("yes", "on")
    if isinstance(v, bool) and typ is not bool or not isinstance(v, typ):
        fail(f"{key} must be {hint}")
    if key == "defaultTheme":
        v = theme_name(v)
    if key == "workspaces":
        for w in v:
            if not isinstance(w, dict) or not w.get("name"):
                fail("each workspace needs a name")
            if w.get("theme"):
                w["theme"] = theme_name(w["theme"])
    return v


def main():
    argv = sys.argv[1:]
    as_json = "--json" in argv
    argv = [a for a in argv if a != "--json"]
    if not argv:
        fail("no command")
    cmd, args = argv[0], argv[1:]

    if cmd == "status":
        s = status()
        if as_json:
            return print(json.dumps(s, indent=2))
        on = lambda b: "on" if b else "off"
        print(f"Mods:            {on(s['modsInstalled'])}")
        print(f"Auto-reinstall:  {on(s['autoReinstallJob'])}")
        print(f"Pinned sync:     {on(s['pinnedSyncJob'])}")
        print(f"Vivaldi:         {'running' if s['vivaldiRunning'] else 'not running'}")
        print(f"Config:          {s['configPath']}{'' if s['configExists'] else ' (not set up)'}")
        print(f"Mods folder:     {s['modsFolder']}")

    elif cmd == "themes":
        ts = themes()
        if as_json:
            return print(json.dumps(ts, indent=2))
        for t in ts:
            print(f"{t['name']:<14} {'dark' if t['dark'] else 'light'}")

    elif cmd == "get":
        cfg = load()
        if cfg is None:
            fail("no config yet. Create one with `arcify set` or `arcify apply`.")
        print(json.dumps(cfg.get(args[0]) if args else cfg, indent=2, ensure_ascii=False))

    elif cmd == "set":
        if not args:
            fail("usage: arcify set KEY=VALUE…  Keys: " + ", ".join(KEYS))
        cfg = base()
        for a in args:
            key, sep, raw = a.partition("=")
            if not sep or key not in KEYS:
                fail(f"bad setting {a!r}. Keys: {', '.join(KEYS)}")
            cfg[key] = parse_value(key, raw)
            print(f"{key} = {json.dumps(cfg[key], ensure_ascii=False)}")
        save(cfg)
        print("Saved. Run `arcify apply` to apply.")

    elif cmd == "workspace":
        ap = argparse.ArgumentParser(prog="arcify workspace")
        ap.add_argument("name")
        ap.add_argument("--theme")
        ap.add_argument("--emoji")
        ap.add_argument("--route", action="append", default=[], help="open links containing TEXT here")
        ap.add_argument("--remove", action="store_true")
        o = ap.parse_args(args)
        cfg = base()
        ws = cfg.setdefault("workspaces", [])
        cur = next((w for w in ws if w.get("name") == o.name), None)
        if o.remove:
            if cur:
                ws.remove(cur)
            print(f"{o.name} removed from the config (the workspace stays in Vivaldi).")
        else:
            if cur is None:
                cur = {"name": o.name}
                ws.append(cur)
            if o.theme:
                cur["theme"] = theme_name(o.theme)
            if o.emoji:
                cur["emoji"] = o.emoji
            routes = cur.setdefault("linkRoutes", [])
            for r in o.route:
                if not any(x.get("expression") == r for x in routes):
                    routes.append({"expression": r, "type": "CONTAINS"})
            if not routes:
                del cur["linkRoutes"]
            print(json.dumps(cur, ensure_ascii=False))
        save(cfg)
        print("Saved. Run `arcify apply` to apply.")

    else:
        fail(f"unknown command {cmd}")


if __name__ == "__main__":
    main()
