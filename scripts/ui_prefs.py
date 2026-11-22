"""Vivaldi settings that make up the UI layout, shared by export-config.py
(saves them to the config as "vivaldiUI") and apply-prefs.py (applies them).

Each path is copied as a whole. Nothing personal (accounts, sessions,
history, passwords) is in here.
"""

UI_PATHS = [
    "vivaldi.toolbars",                 # every toolbar and its buttons
    "vivaldi.tabs",                     # tab bar position/width, tab options
    "vivaldi.address_bar",              # address bar position and options
    "vivaldi.status_bar",
    "vivaldi.bookmarks.bar",
    "vivaldi.panels.position",          # side panel: position, buttons, width
    "vivaldi.panels.elements",
    "vivaldi.panels.web",               # web panels
    "vivaldi.panels.as_overlay",
    "vivaldi.panels.show_toggle",
    "vivaldi.panels.show_close_button",
    "vivaldi.panel_editor",
    "vivaldi.auto_hide",
    "vivaldi.appearance.density",
    "vivaldi.appearance.disable_title_bar",
    "vivaldi.appearance.force_dark_mode_theme",
    "vivaldi.appearance.range_buttons",
    "vivaldi.menu",
    "vivaldi.windows",
    "vivaldi.settings.mono_icons",
    "vivaldi.themes.current_buttons",   # toolbar icon set
    "vivaldi.theme",                    # theme schedule
    "vivaldi.keyboard",                 # keyboard shortcuts
    "vivaldi.chained_commands",         # command chains (used by shortcuts)
    "vivaldi.actions",                  # mouse gestures
    "vivaldi.mouse_wheel",
    "vivaldi.quick_commands",
]

MISSING = object()


def get(d, path):
    for k in path.split("."):
        if not isinstance(d, dict) or k not in d:
            return MISSING
        d = d[k]
    return d


def put(d, path, value):
    *head, last = path.split(".")
    for k in head:
        d = d.setdefault(k, {})
    d[last] = value


def export(prefs):
    out = {}
    for path in UI_PATHS:
        v = get(prefs, path)
        if v is not MISSING:
            out[path] = v
    return out


def put_synced(prefs, path, value):
    """Set a path. With Vivaldi Sync on, some settings also live under
    account_values; update those too so they don't win."""
    put(prefs, path, value)
    if get(prefs.get("account_values", {}), path) is not MISSING:
        put(prefs["account_values"], path, value)


def apply(prefs, ui):
    """Set each saved path."""
    n = 0
    for path, value in ui.items():
        if path in UI_PATHS:
            put_synced(prefs, path, value)
            n += 1
    return n
