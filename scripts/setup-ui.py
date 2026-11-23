#!/usr/bin/env python3
"""A small settings page for Vivaldi Arcify, served on this Mac only and
opened in Vivaldi. Started by `arcify ui`.

The page edits your config and runs setup.sh, which quits Vivaldi, applies
everything and starts it again. This server keeps running in the terminal
while that happens, so the page (restored with your tabs) shows the result.

Only 127.0.0.1, and every request needs the random token in the page's
address, so other websites can't use it.

    scripts/setup-ui.py [--no-open] [--port N]
"""
import argparse, http.server, json, os, pathlib, secrets, subprocess, sys, threading, time
import urllib.parse

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from arcify_paths import ARCIFY_HOME, ICLOUD, PREFS, config_path, vivaldi_running

REPO = pathlib.Path(__file__).resolve().parent.parent
PAGE = REPO / "ui" / "index.html"
LOG = ARCIFY_HOME / "setup-ui.log"
AGENTS = pathlib.Path.home() / "Library/LaunchAgents"
VIVALDI_APP = pathlib.Path(os.environ.get("VIVALDI_APP", "/Applications/Vivaldi.app"))
WINDOW_HTML = (VIVALDI_APP / "Contents/Frameworks/Vivaldi Framework.framework/Versions/Current"
               / "Resources/vivaldi/window.html")
IDLE_EXIT = 30 * 60  # stop after 30 minutes without requests

# Keys the page may write. Everything else in the config is left alone.
KEYS = {"defaultTheme": str, "arcLayout": bool, "addressFieldInSidebar": bool,
        "autoReinstall": bool, "syncPinnedTabs": bool, "workspaces": list,
        "oldTabHours": (int, float), "unloadTabHours": (int, float),
        "saveClearedTabs": bool, "groupBySite": bool}

TOKEN = secrets.token_urlsafe(18)
job = {"proc": None, "started": None, "exit": None}
last_seen = time.time()


def themes():
    out = []
    for f in sorted((REPO / "themes").glob("*.json")):
        t = json.loads(f.read_text())
        out.append({k: t.get(k) for k in ("name", "colorBg", "colorFg", "colorWindowBg",
                                          "colorHighlightBg", "colorAccentBg")})
    return out


def vivaldi_workspaces():
    try:
        p = json.loads(PREFS.read_text())
        return [{"name": w.get("name", ""), "emoji": w.get("emoji") or ""}
                for w in p.get("vivaldi", {}).get("workspaces", {}).get("list", [])]
    except (OSError, ValueError):
        return []


def state():
    cfg_file = config_path()
    try:
        cfg = json.loads(cfg_file.read_text())
    except (OSError, ValueError):
        cfg = None
    try:
        js_on = "<!-- vivaldi-arcify -->" in WINDOW_HTML.read_text()
    except OSError:
        js_on = False
    return {
        "config": cfg,
        "configPath": str(cfg_file),
        "configInICloud": str(cfg_file).startswith(str(ICLOUD)),
        "iCloudAvailable": ICLOUD.parent.is_dir(),
        "themes": themes(),
        "vivaldiWorkspaces": vivaldi_workspaces(),
        "status": {
            "vivaldiInstalled": VIVALDI_APP.is_dir(),
            "profileExists": PREFS.is_file(),
            "vivaldiRunning": vivaldi_running(),
            "jsInstalled": js_on,
            "autoReinstallJob": (AGENTS / "vivaldi-arcify.reinstall.plist").is_file(),
            "pinnedSyncJob": (AGENTS / "vivaldi-arcify.pinned-sync.plist").is_file(),
        },
        "job": job_state(),
    }


def job_state():
    p = job["proc"]
    if p is not None and job["exit"] is None and p.poll() is not None:
        job["exit"] = p.returncode
    try:
        log = LOG.read_text(errors="replace") if job["started"] else ""
    except OSError:
        log = ""
    return {"running": p is not None and job["exit"] is None, "started": job["started"],
            "exit": job["exit"], "log": log}


def save_config(body):
    cfg_file = config_path()
    if not cfg_file.is_file():
        # First run: choose where the config lives, like setup.sh does.
        if body.get("useICloud") and ICLOUD.parent.is_dir():
            cfg_file = ICLOUD / "config.json"
        cfg_file.parent.mkdir(parents=True, exist_ok=True)
        if not cfg_file.is_file():
            cfg_file.write_text((REPO / "config.example.json").read_text())
        ARCIFY_HOME.mkdir(parents=True, exist_ok=True)
        (ARCIFY_HOME / "config-path").write_text(str(cfg_file) + "\n")
    cfg = json.loads(cfg_file.read_text())
    for k, v in (body.get("config") or {}).items():
        if k in KEYS and isinstance(v, KEYS[k]):
            cfg[k] = v
    cfg["workspaces"] = [
        {k: w[k] for k in ("name", "emoji", "theme", "linkRoutes") if w.get(k)}
        for w in cfg.get("workspaces", []) if isinstance(w, dict) and str(w.get("name", "")).strip()
    ]
    cfg_file.write_text(json.dumps(cfg, indent=2, ensure_ascii=False) + "\n")
    return cfg_file


def run(script, *args):
    if job["proc"] is not None and job["proc"].poll() is None:
        raise RuntimeError("Setup is already running.")
    ARCIFY_HOME.mkdir(parents=True, exist_ok=True)
    log = open(LOG, "w")
    env = dict(os.environ, ARCIFY_CONFIG=str(config_path()), TERM="dumb")
    job.update(started=time.time(), exit=None,
               proc=subprocess.Popen([str(REPO / script), *args], cwd=REPO, env=env,
                                     stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                                     start_new_session=True))


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def allowed(self):
        host = self.headers.get("Host", "")
        if host.split(":")[0] not in ("127.0.0.1", "localhost"):
            return False
        q = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        return secrets.compare_digest((q.get("t") or [""])[0], TOKEN)

    def send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        global last_seen
        if not self.allowed():
            return self.send(403, b"Open the address printed by `arcify ui`.", "text/plain")
        last_seen = time.time()
        path = urllib.parse.urlsplit(self.path).path
        if path == "/":
            return self.send(200, PAGE.read_bytes(), "text/html; charset=utf-8")
        if path == "/api/state":
            return self.send(200, state())
        if path == "/api/job":
            return self.send(200, job_state())
        self.send(404, {"error": "not found"})

    def do_POST(self):
        global last_seen
        if not self.allowed() or self.headers.get("Content-Type") != "application/json":
            return self.send(403, {"error": "forbidden"})
        last_seen = time.time()
        path = urllib.parse.urlsplit(self.path).path
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            if path == "/api/apply":
                f = save_config(body)
                run("setup.sh", "--yes")
                return self.send(200, {"ok": True, "configPath": str(f)})
            if path == "/api/update":
                save_config(body)
                run("update.sh")
                return self.send(200, {"ok": True})
            if path == "/api/quit":
                self.send(200, {"ok": True})
                threading.Thread(target=lambda: (time.sleep(0.3), os._exit(0))).start()
                return
        except (ValueError, RuntimeError, OSError) as e:
            return self.send(400, {"error": str(e)})
        self.send(404, {"error": "not found"})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-open", action="store_true")
    ap.add_argument("--port", type=int, default=0)
    args = ap.parse_args()

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    url = f"http://127.0.0.1:{srv.server_address[1]}/?t={TOKEN}"
    print(f"Vivaldi Arcify settings: {url}", flush=True)
    print("Keep this window open while you use the page. Ctrl+C to stop.", flush=True)

    def idle():
        while True:
            time.sleep(30)
            busy = job["proc"] is not None and job["proc"].poll() is None
            if not busy and time.time() - last_seen > IDLE_EXIT:
                print("No activity for 30 minutes; stopping.")
                os._exit(0)
    threading.Thread(target=idle, daemon=True).start()

    if not args.no_open:
        target = ["-a", str(VIVALDI_APP)] if VIVALDI_APP.is_dir() else []
        subprocess.run(["open", *target, url])
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print()


if __name__ == "__main__":
    main()
