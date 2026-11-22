# Make your own theme

A theme has two parts:

- **`themes/<name>.json`**: the colours Vivaldi uses (a normal Vivaldi theme).
- **A block in `css/workspace-themes.css`** (optional): a gradient behind the
  sidebar and the active tab's colours.

## 1. The colours

Copy a theme close to what you want, e.g. `themes/lagoon.json`, and change:

| Key | Used for |
|---|---|
| `name` | The name you pick in Settings > Themes and in your config |
| `id` | Must be unique. **Keep the prefix** `a1f0e000-0000-4000-8000-00000000f` and change the last three digits (e.g. `f101`). The shared Arcify styles are matched on that prefix. |
| `colorWindowBg` | The sidebar and window background |
| `colorBg` | Page background, fields and menus |
| `colorFg` | Text |
| `colorHighlightBg` | Accent: focus ring, unread dots, selection |
| `colorAccentBg` | Secondary accent (Vivaldi uses it for some buttons) |
| `radius` | Corner radius of Vivaldi's own controls |

## 2. The gradient and active tab (optional)

Add a block to `css/workspace-themes.css` with your theme's id:

```css
/* ── My Theme ───────────── */
#browser.theme-id-a1f0e000-0000-4000-8000-00000000f101 {
  background-image: linear-gradient(160deg, #1b2a4a 0%, #0c1020 70%) !important;
  background-attachment: fixed !important;
  --vm-active-bg: rgba(255, 255, 255, 0.14);  /* set both, or neither */
  --vm-active-fg: #ffffff;
}
```

Without `--vm-active-*`, the active tab is a light tint of the text colour.

## 3. Check and install

```sh
scripts/check-contrast.py   # text 4.5:1 and accent 3:1 on every background
./setup.sh                  # installs the theme (Vivaldi quits and restarts)
```

The contrast check covers the sidebar, the page background, every colour in
your gradient and the active tab. Fix anything marked FAIL before you share
the theme.

Made a nice one? Open a pull request with the JSON, the CSS block and a
screenshot.
