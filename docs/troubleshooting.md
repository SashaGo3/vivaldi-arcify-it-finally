# Troubleshooting

**Nothing changed after setup.**
Check that the CSS folder is set: Settings > Appearance > Custom UI
Modifications should point to the `css/` folder. On older Vivaldi versions
without that option, open `vivaldi://experiments`, turn on *Allow CSS
modifications*, and restart Vivaldi.

**The look is there, but themes don't follow workspaces, and pinned tiles
have no labels.**
The JS mods aren't loaded. This usually happens after a Vivaldi update. Run
`./update.sh` and restart Vivaldi. To have this done for you, run
`./setup.sh --reconfigure` and say yes to reinstalling after updates.

**The theme doesn't change at all.**
Settings > Themes > Schedule must be off. A schedule (for example, following
macOS light/dark) overrides the theme the mod picks. Setup turns it off; if
you turned it back on, turn it off again.

**A workspace has the wrong theme.**
Go to that workspace and pick the right theme. The mod saves what you pick
in each workspace.

**`install-js.sh`: "Operation not permitted".**
macOS protects files inside apps. Allow your terminal app in System
Settings > Privacy & Security > **App Management**, then run the command
again.

**The helper app says a permission is off.**
Open **Vivaldi Arcify** (Applications): it checks both permissions and has a
button that opens the right Settings page. If the app isn't listed there,
click + and choose it from Applications.

**Tabs are gone after a restart.**
The window was probably closed instead of quit. Go to Trash (the trash can
at the end of the tab bar) > Closed Windows and restore it before you quit
Vivaldi again. With pinned tab sync on, your pinned tabs are also in the
bookmark folder *Pinned tabs (synced)*.

**Something looks broken after a Vivaldi update.**
Vivaldi sometimes renames the classes these styles target. Open an issue
with a screenshot and your Vivaldi version (Vivaldi > About Vivaldi).

**Start over.**
Run `./uninstall.sh --all`, then the install command again.
