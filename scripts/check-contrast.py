#!/usr/bin/env python3
"""Check text contrast for every theme in themes/workspaces/ (WCAG ratios).

    scripts/check-contrast.py

For each theme it checks the theme's text colour against everything it's
drawn on in the sidebar: the window background, every colour of the theme's
gradient (workspace-themes.css), the page background, and the active tab
(--vm-active-bg / --vm-active-fg, or the default tint). Also checks that the
highlight colour (accent bar, unread dots) stands out from the background.

Text needs 4.5:1, the highlight 3:1. Exits with 1 if anything fails.
"""
import json, pathlib, re, sys

REPO = pathlib.Path(__file__).resolve().parent.parent
CSS = (REPO / "css/workspace-themes.css").read_text()
TEXT, GRAPHIC = 4.5, 3.0


def rgba(s):
    s = s.strip()
    if s.startswith("#"):
        h = s[1:]
        if len(h) in (3, 4):
            h = "".join(c * 2 for c in h)
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)
    m = re.match(r"rgba?\(([^)]*)\)", s)
    parts = [float(x) for x in re.split(r"[,\s/]+", m.group(1).strip()) if x]
    return tuple(parts[:3]) + ((parts[3] if len(parts) > 3 else 1.0),)


def over(fg, bg):
    """fg (maybe transparent) composited over opaque bg."""
    a = fg[3]
    return tuple(fg[i] * a + bg[i] * (1 - a) for i in range(3)) + (1.0,)


def lum(c):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(x) for x in c[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def blocks(theme_id):
    """CSS declarations from #browser.theme-id-<id> { … } rules."""
    out = ""
    for m in re.finditer(r"#browser\.theme-id-" + re.escape(theme_id) + r"\s*\{([^}]*)\}", CSS):
        out += m.group(1)
    return out


def main():
    failed = 0
    for path in sorted((REPO / "themes").glob("*.json")):
        t = json.loads(path.read_text())
        fg, bg, win = rgba(t["colorFg"]), rgba(t["colorBg"]), rgba(t["colorWindowBg"])
        hi = rgba(t["colorHighlightBg"])
        decl = blocks(t["id"])
        grad = re.search(r"background-image:([^;]*);", decl)
        stops = [rgba(c) for c in re.findall(r"#[0-9a-fA-F]{3,8}\b", grad.group(1))] if grad else []

        checks = [("text on sidebar", fg, win, TEXT), ("text on page bg", fg, bg, TEXT)]
        checks += [(f"text on gradient {i + 1}", fg, s, TEXT) for i, s in enumerate(stops)]

        abg = re.search(r"--vm-active-bg:\s*([^;]+);", decl)
        afg = re.search(r"--vm-active-fg:\s*([^;]+);", decl)
        if bool(abg) != bool(afg):
            print(f"  {t['name']}: set --vm-active-bg and --vm-active-fg together")
            failed += 1
        for base_name, base in [("sidebar", win)] + [(f"gradient {i + 1}", s) for i, s in enumerate(stops)]:
            active_bg = over(rgba(abg.group(1)), base) if abg else over(fg[:3] + (0.16,), base)
            checks.append((f"active tab on {base_name}", rgba(afg.group(1)) if afg else fg, active_bg, TEXT))
        checks.append(("highlight on sidebar", hi, win, GRAPHIC))

        print(t["name"])
        for name, a, b, need in checks:
            r = ratio(over(a, b), b)
            bad = r < need
            failed += bad
            print(f"  {'FAIL' if bad else ' ok '}  {r:5.1f}:1  {name}" + (f"  (needs {need}:1)" if bad else ""))
    print("\nAll good." if not failed else f"\n{failed} problem(s).")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
