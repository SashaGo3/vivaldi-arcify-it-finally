# Guide: how Vivaldi Arcify works

`setup.sh` does all of this for you. This page explains what it does, so you
can change things, set it up by hand, or take only the parts you want.

## How it works

Vivaldi's interface is a web page (`window.html` inside the app), so it can
be changed in two ways:

1. **CSS (the look).** Vivaldi has a built-in setting, *Settings > Appearance
   > Custom UI Modifications*, that loads every `.css` file at the top level
   of a folder you choose. Setup points it at this repo's `css/` folder.
   Vivaldi reads the folder each time it starts.
2. **JS (the behaviour).** Per-workspace themes, the pinned grid layout,
   tidying the tab list and so on need Vivaldi's own UI APIs
   (`vivaldi.prefs`, `vivaldi.tabsPrivate`). Normal extensions can't use
   those. So `scripts/install-js.sh` does two things:
   - copies `js/*.js` (and your config, as `00-config.js`) into
     `Vivaldi.app/…/Resources/vivaldi/arcify_mods/`;
   - adds `<script>` tags, marked `<!-- vivaldi-arcify -->`, to
     `window.html`.

   The original is kept as `window.html.orig`. Vivaldi updates replace
   `window.html`, which removes the mods. The optional helper app puts them
   back.

Themes, workspaces and layout settings live in Vivaldi's `Preferences` file
(JSON). The Python scripts change that file while Vivaldi is quit, after
writing a backup: `Preferences.bak-arcify` and `Preferences.bak-arcify-themes`.

## Config file

Your settings are in `~/Library/Application Support/VivaldiArcify/config.json`,
or in `iCloud Drive/VivaldiArcify/config.json` if you chose iCloud. Edit the
file, then run `arcify setup` (or `arcify reload` for tab options).

```json
{
  "defaultTheme": "Graphite",
  "workspaces": [
    { "name": "Work", "emoji": "💼", "theme": "Slate",
      "linkRoutes": [{ "expression": "github.com", "type": "CONTAINS" }] },
    { "name": "Personal", "emoji": "🌿", "theme": "Forest Night" }
  ],
  "oldTabHours": 5,
  "oldTabHoursBySite": { "google.com/search": 1 }
}
```

| Key | What it does | Default |
|---|---|---|
| `workspaces` | Created if missing (matched by name). `emoji` sets the icon, `theme` the starting theme, `linkRoutes` are Vivaldi's "open links matching … here" rules. Nothing is ever deleted. | `[]` |
| `defaultTheme` | Theme for workspaces with none yet, and for tabs outside any workspace | `Graphite` |
| `arcLayout` | Apply the recommended layout ([`presets/arc-layout.json`](presets/arc-layout.json)) | `true` |
| `addressFieldInSidebar` | Put the address field in the sidebar | `true` |
| `oldTabHours` | Tabs you haven't opened for this long count as old (dimmed, closed by Clear) | `5` |
| `oldTabHoursBySite` | Different limits per site: a host (with subdomains) or part of an address | `{}` |
| `unloadTabHours` | Unload tabs idle this long to free memory (`0` = never) | `1` |
| `saveClearedTabs` | Clear saves the closed tabs to a "Cleared tabs" bookmark folder | `true` |
| `groupBySite` / `groupBySiteMin` | Stack tabs from the same site / from how many tabs. Needs Settings > Tabs > Tab Stacking (Accordion) | `true` / `3` |
| `autoReinstall` | Reinstall the mods after Vivaldi updates (helper app) | asked |
| `syncPinnedTabs` | Back up pinned tabs to bookmarks and sync them between Macs | asked |
| `syncFolder` | Folder for pinned tab sync, if not iCloud (e.g. `~/Dropbox/VivaldiArcify`) | config's folder |
| `vivaldiUI` | Your whole UI layout, saved by `arcify reload --save-config`, so another Mac looks the same | none |

**Save your current workspaces and layout to the config:** run
`arcify reload --save-config`. Run `arcify setup` on another Mac to get the same
setup there.

## Pinned tab sync

With sync on, your pinned tabs are kept in two places:

- **Backup:** the bookmark folder *Other Bookmarks > Pinned tabs (synced)*,
  with one subfolder per workspace.
- **Shared:** `pinned-tabs.json` in iCloud Drive (or your `syncFolder`).

How it behaves:

- Pin a tab on one Mac, and it's pinned in the workspace with the same name
  on your other Macs. If that page is already open there, that tab is
  pinned; otherwise a new tab opens. No duplicates.
- Unpin it, and it's unpinned on the other Macs. Tabs are never closed.
- If a Mac suddenly has far fewer pinned tabs (say, a window didn't come
  back), the change is held until you confirm it with
  `scripts/pinned-sync.sh --accept`.

`scripts/pinned-sync.sh --status` shows what's shared, and `--log` shows
what the job did. Open **Vivaldi Arcify** in Applications to check the
helper app's permissions.

## Set it up by hand

1. **Get VivalArc.** Download
   [vivalarc.css 1.1.0](https://raw.githubusercontent.com/tovifun/VivalArc/a88f5c75dbbbb889244aa2d893337df666933489/vivalarc.css)
   into `css/` (or run `scripts/get-vivalarc.sh`).
2. **Turn on CSS mods.** Go to Settings > Appearance > Custom UI
   Modifications and pick the `css/` folder. (On older Vivaldi versions,
   first turn on *Allow CSS modifications* in `vivaldi://experiments`.)
3. **Layout.**
   - Settings > Tabs > Tab Bar Position: **Left**.
   - Settings > Address Bar: turn off the address bar.
   - Settings > Panel > Panel Position: **Left**, and turn on *Show Close
     Button*.
   - Settings > Tabs > Tab Stacking: **Accordion**.
   - Settings > Themes > Schedule: **off**. A schedule overrides the
     per-workspace theme.
   - Right-click the tab bar > Customize Toolbar: drag the **Address Field**
     next to the workspace button.

   [`presets/arc-layout.json`](../presets/arc-layout.json) lists the exact
   settings.
4. **Themes.** With Vivaldi quit, run `scripts/install-themes.py`. To add
   themes by hand instead, use Settings > Themes > Import for each JSON file
   in `themes/`, zipped as `settings.json`.
5. **JS mods.** Run `scripts/install-js.sh` and restart Vivaldi.

Skip step 5 if you want only the look: the CSS works without the JS. The
features that need JS are per-workspace themes, pinned grid labels and
animations, short titles, Clear and site stacks. Each file in `js/` is
independent, so you can delete the ones you don't want and run
`./update.sh`.

## What's where

| File | What it does |
|---|---|
| `css/arc-layout.css` | Rounded, inset page; sidebar address field; full-height tab list with edge fades; unread dots; copy button |
| `css/vivalarc-tweaks.css` | Our changes to VivalArc (no window border or header strip; window buttons appear on hover) |
| `css/pinned-grid.css` | Pinned tabs as a grid with labels |
| `css/tab-list.css` | Short titles, close button on the icon, active tab, dimmed old tabs, Clear button, tab stacks |
| `css/panel-dock.css` | Side panel icons as a hover row at the bottom of the sidebar |
| `css/workspace-themes.css` | Per-theme gradients and active-tab colours |
| `themes/*.json` | The 14 themes (colours, radius) |
| `presets/arc-layout.json` | The Vivaldi settings behind the layout |
| `js/workspace-themes.js` | Applies each workspace's theme when the active tab changes workspace |
| `js/pinned-grid.js` | Grid columns, labels and FLIP animations for pinned tiles |
| `js/tab-list.js` | Short titles, old and duplicate tabs, unloading, Alt+click to keep, Clear, reopening stuck tabs |
| `js/site-stacks.js` | Stacks tabs from the same site, named after the site |
| `js/stack-ui.js` | Tab stack look: header on top, × closes the whole stack |
| `js/copy-url.js` | Copy-address button in the address field |
| `js/back-closes-tab.js` | Cmd+[ on a link tab with no history closes it |
| `js/tab-scroll-fade.js` | Marks the tab list's scrollable edges for the fade |
| `js/pinned-sync.js` | Pinned tab backup folder and applying other Macs' changes (only with `syncPinnedTabs`) |
| `arcify` | The command: `arcify help` lists what it does |
| `scripts/arcify_cli.py` | `arcify status/themes/get/set/workspace`: no questions, `--json` |
| `AGENTS.md`, `CLAUDE.md` | How AI agents should use and change this repo |
| `setup.sh` / `update.sh` / `uninstall.sh` / `install.sh` | Run by `arcify`; see the README |
| `scripts/setup-ui.py`, `ui/index.html` | The settings page (`arcify ui`): a local server on 127.0.0.1 with a random token, opened in Vivaldi |
| `scripts/lib.zsh`, `scripts/arcify_paths.py` | Where things are (overridable, see below) |
| `scripts/apply-prefs.py` | CSS folder, layout, workspaces, link routes (Vivaldi quit) |
| `scripts/install-themes.py` | Adds or updates the themes (Vivaldi quit) |
| `scripts/install-js.sh` | Installs the JS mods (`--remove` to undo) |
| `scripts/export-config.py` | Saves your workspaces and UI layout to the config |
| `scripts/auto-reinstall.sh` | The reinstall-after-update job (`--remove`) |
| `scripts/pinned-sync.sh` / `.py` | The pinned tab sync job and the sync itself |
| `scripts/helpers/` | Builds the *Vivaldi Arcify* helper app the jobs run through |
| `scripts/check-contrast.py` | Checks text contrast for every theme |
| `scripts/disk-writes.sh` | Shows which profile files Vivaldi writes, and how much |

### Paths and overrides

| Variable | Default |
|---|---|
| `VIVALDI_APP` | `/Applications/Vivaldi.app` |
| `VIVALDI_PROFILE` | `~/Library/Application Support/Vivaldi/Default` (or `./setup.sh --profile "Profile 1"`) |
| `ARCIFY_HOME` | `~/Library/Application Support/VivaldiArcify` (state, logs, the JS copy for the helper) |
| `ARCIFY_CONFIG` | the remembered config: local, or `iCloud Drive/VivaldiArcify/config.json` |

## Develop

- Edit the CSS in `css/`, then restart Vivaldi or open a new window to see
  the change.
- Edit the JS in `js/`, then run `./update.sh` and restart Vivaldi.

To inspect the UI live, start Vivaldi with
`open -a Vivaldi --args --remote-debugging-port=9222`, open
`http://localhost:9222` and pick `window.html`. You can also open
`vivaldi://inspect/#apps`.

Things to know inside `window.html`:

- `localStorage` is null: use `chrome.storage.local`.
- `vivaldi.prefs.get(path)` returns `{ value, defaultValue, store }`.
- `vivaldi.prefs.onChanged` passes only the pref path.
- A tab's workspace and custom name are in `JSON.parse(tab.vivExtData)`
  (`workspaceId`, `fixedTitle`).
- Pinned tiles: `span.pinned-group > span > .tab-position.is-pinned`.
  Vivaldi animates `--PositionX/Y` through bogus values while pinning, so
  don't lay out from them.
- Vivaldi itself gives `#webpage-stack` a 6px right and bottom margin;
  `arc-layout.css` removes it so the frame has one even outline.
