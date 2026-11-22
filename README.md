# Vivaldi Arcify (it, finally)

**Make Vivaldi look and work like Arc**, on macOS. You get a floating, rounded
page, a sidebar with the address field and a grid of pinned tiles, a theme
for each workspace that switches with you, and a tab list that tidies itself.
There are 14 themes to choose from.

![Vivaldi with Arcify: Forest Night theme, Personal workspace](docs/screenshots/hero.jpg)

```sh
curl -fsSL https://raw.githubusercontent.com/SashaGo3/vivaldi-arcify-it-finally/main/install.sh | zsh
```

That's the whole install. [What it does](#install), [how to undo it](#uninstall).

---

## What you get

| | |
|---|---|
| ![Work: Slate](docs/screenshots/work-slate.png) | ![Design: Sakura](docs/screenshots/design-sakura.jpg) |
| ![Research: Arctic](docs/screenshots/research-arctic.png) | ![Side project: Nebula](docs/screenshots/side-project-nebula.png) |

*The same window in five workspaces. Each workspace has its own theme, and
the theme changes as you move between them.*

- **Arc layout.** The page floats in the window with rounded corners and an
  even 10px gap. The top bar is gone. The address field is a pill in the
  sidebar, under the workspace name, with a copy button on hover
  (Shift+click copies a Markdown link).
- **Pinned tabs as a grid** that fills the sidebar width. Each tile shows a
  one-word site label (or the tab's custom name) and animates smoothly when
  you pin, unpin or reorder.
- **A theme per workspace.** Pick a theme while you're in a workspace, and
  the mod remembers it. It switches however you get there: shortcut, click,
  a link route or another app opening a link. Vivaldi alone only does this
  from a Command Chain shortcut.
- **14 themes**, 7 dark and 7 light. Each one is checked for text contrast
  (WCAG AA).
- **A tidier tab list.**
  - Titles lose the trailing site name ("… - Jira").
  - The close button sits on the tab's icon, and the active tab is clearer.
  - Old tabs and duplicates are dimmed, never closed on their own.
  - A **Clear** button closes them, with Undo.
  - Idle tabs are unloaded to save memory.
  - Alt+click a tab to keep it.
- **Site stacks.** Three or more tabs from the same site get stacked
  together, and the stack is named after the site.
- **Panel dock.** The side panel's icon strip moves into a row at the bottom
  of the sidebar, shown when you hover there. The page gets the width back.
- **Back closes link tabs.** Press Cmd+[ on a tab opened from a link with
  nothing to go back to: the tab closes and you're back where you came from.
- **Optional:**
  - Reinstall the mods automatically after Vivaldi updates.
  - Keep your settings in iCloud Drive.
  - Sync pinned tabs between your Macs.

## Themes

![All 14 themes](docs/screenshots/themes.png)

**Dark:** Graphite (the default), Slate, Forest Night, Lagoon, Nebula, Ember,
Sunset. **Light:** Paper, Arctic, Sakura, Dune, Matcha, Lime Glow, Polska.

**To give a workspace a theme:** go to the workspace, then pick the theme in
Settings > Themes, or type its name in Quick Commands (Cmd+E). The mod remembers
it for that workspace. To set themes ahead of time, list them in your
[config](#config).

You can also make your own theme: see [docs/themes.md](docs/themes.md).

## Install

You need macOS, [Vivaldi](https://vivaldi.com) opened at least once, and an
internet connection. Run the one-liner above, or clone the repo anywhere and
run `./setup.sh`.

The first time, setup asks a few questions:

1. **Keep your settings in iCloud Drive?** Say yes if you want all your Macs
   to share the same workspaces and themes. Default: no (the settings stay
   on this Mac).
2. **Apply the recommended Arc layout?** This puts tabs on the left, the
   address field in the sidebar and the panel in the dock, and hides the top
   bar and status bar. Default: yes.
3. **Create three starter workspaces?** Personal, Work and Ideas, each with
   its own theme. Default: no.
4. **Reinstall the mods after Vivaldi updates?** Each Vivaldi update removes
   the JS part of the mods. A small helper app (*Vivaldi Arcify*, in
   Applications) can put it back and restart Vivaldi when you're not using
   it. It needs one permission: System Settings > Privacy & Security >
   **App Management**. Default: yes.
5. **Sync pinned tabs between your Macs?** Only asked if you use iCloud.
   This runs through the same helper app and needs **Full Disk Access**.

Then setup quits Vivaldi (it asks first; your tabs come back) and does the
following:

- Downloads [VivalArc](https://github.com/tovifun/VivalArc).
- Installs the themes.
- Points Vivaldi's *Custom UI Modifications* folder at `css/`.
- Applies the layout and creates your workspaces.
- Adds the JS mods to Vivaldi.
- Starts Vivaldi again.

You can run it again any time: it only adds and updates.
`./setup.sh --reconfigure` asks the questions again.

> **Note:** the JS mods work by editing a file inside `Vivaldi.app` (see
> [how it works](docs/guide.md#how-it-works)). Your terminal may need
> **App Management** permission the first time. macOS will tell you if it does.

### Update

```sh
curl -fsSL https://raw.githubusercontent.com/SashaGo3/vivaldi-arcify-it-finally/main/install.sh | zsh
```

The same command updates an existing install. If you cloned the repo
yourself, `git pull` and then run `./setup.sh` (or `./update.sh`, which
doesn't quit Vivaldi). After a Vivaldi update, the helper app restores the
mods for you. Without it, run `./update.sh` and restart Vivaldi.

### Uninstall

```sh
~/Library/Application\ Support/VivaldiArcify/app/uninstall.sh       # or ./uninstall.sh in your clone
```

This removes the JS mods, the background jobs and the helper app, and turns
off the CSS folder (with Vivaldi quit). Your tabs, workspaces and themes
stay. Add `--all` to delete your config too.

## Config

Your settings are in `~/Library/Application Support/VivaldiArcify/config.json`,
or in `iCloud Drive/VivaldiArcify/config.json` if you chose iCloud. Edit the
file, then run `./setup.sh` (or `./update.sh` for options that only the JS
mods use).

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
| `vivaldiUI` | Your whole UI layout, saved by `./update.sh --save-config`, so another Mac looks the same | none |

**Save your current workspaces and layout to the config:** run
`./update.sh --save-config`. Run `./setup.sh` on another Mac to get the same
setup there.

## Pinned tab sync (optional)

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

## More

- [docs/guide.md](docs/guide.md): how it works, a file-by-file map, and how
  to set it up by hand.
- [docs/themes.md](docs/themes.md): make your own theme.
- [docs/troubleshooting.md](docs/troubleshooting.md): when something looks
  wrong.

## Credits

The frame builds on **[VivalArc](https://github.com/tovifun/VivalArc)** by
tovifun. Setup downloads VivalArc 1.1.0 from its repo. It isn't copied here
because it has no license file. [`css/vivalarc-tweaks.css`](css/vivalarc-tweaks.css)
holds our changes on top.

Not affiliated with Vivaldi Technologies or The Browser Company. Arc is
their browser; this just borrows the idea.

## License

[MIT](LICENSE) for everything in this repo. VivalArc stays under its
author's terms.
