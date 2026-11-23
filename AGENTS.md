# For AI agents

Vivaldi Arcify makes Vivaldi (macOS) look like Arc. Use the `arcify`
command for everything. If it isn't on PATH, use
`~/Library/Application Support/VivaldiArcify/app/arcify` or `./arcify` in
this repo.

## Rules

- **Don't use `arcify ui` or `arcify setup`.** They wait for a person.
  Use `arcify set`, `arcify workspace` and `arcify apply`.
- **`arcify apply` quits and restarts Vivaldi.** Tabs come back, but ask the
  person first if they may be using it. Check with
  `arcify status --json` (`vivaldiRunning`).
- **Nothing is deleted.** `apply` only adds or updates. `workspace --remove`
  changes the config only; the workspace stays in Vivaldi.
- Exit code 0 is success. Errors go to stderr. `set` and `workspace` check
  values (theme names, types) and exit with 2 if one is wrong.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/SashaGo3/vivaldi-arcify-it-finally/main/install.sh | zsh -s -- --yes
```

`--yes` uses the defaults and asks nothing. Vivaldi must be installed and
opened once first. macOS may ask the person for App Management permission
for the terminal.

## Recipes

```sh
arcify status --json                       # what's installed; Vivaldi's workspaces
arcify themes --json                       # theme names to use below
arcify get                                 # the whole config (JSON)

arcify set defaultTheme=Slate              # theme for new workspaces
arcify set autoReinstall=true              # put mods back after Vivaldi updates
arcify set oldTabHours=8 unloadTabHours=0  # tab list options
arcify workspace Work --theme Slate --emoji 💼 --route github.com --route linear.app
arcify workspace Personal --theme "Forest Night"

arcify apply                               # apply all of it (restarts Vivaldi)
arcify reload                              # only tab options changed: no quit
                                           # (Vivaldi needs a restart to load them)
```

## Config keys

| Key | Value | Needs |
|---|---|---|
| `defaultTheme` | theme name | `apply` |
| `workspaces` | list of `{name, emoji, theme, linkRoutes}` (use `arcify workspace`) | `apply` |
| `arcLayout` | bool: recommended layout | `apply` |
| `addressFieldInSidebar` | bool | `apply` |
| `autoReinstall` | bool: helper app reinstalls after Vivaldi updates | `apply` |
| `syncPinnedTabs` | bool: needs config in iCloud Drive, or `syncFolder` | `apply` |
| `syncFolder` | folder path for pinned tab sync | `apply` |
| `oldTabHours` | number | `reload` |
| `oldTabHoursBySite` | `{"site or address part": hours}` | `reload` |
| `unloadTabHours` | number, 0 = never | `reload` |
| `saveClearedTabs` | bool | `reload` |
| `groupBySite`, `groupBySiteMin` | bool, number | `reload` |

A theme set in the config is only a starting theme. If the person already
picked a theme in that workspace, their pick wins.

## Work on this repo

- `css/` loads on every Vivaldi start. No install step.
- `js/` needs `arcify reload`, then a Vivaldi restart.
- `themes/*.json` need `arcify apply`. Run `scripts/check-contrast.py`
  after you change colors.
- `css/vivalarc.css` is downloaded (no license upstream). Don't commit it.
  Put changes in `css/vivalarc-tweaks.css`.
- More: [docs/guide.md](docs/guide.md).
