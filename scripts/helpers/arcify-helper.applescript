-- Vivaldi Arcify: the one helper app for the background jobs.
-- Built by scripts/helpers/helper-app.sh.
--
-- Started by a background job (VM_TASK set): does that job quietly.
--   VM_TASK=reinstall    put the JS mods back after a Vivaldi update
--                        (needs App Management)
--   VM_TASK=pinned-sync  sync pinned tabs through iCloud Drive
--                        (needs Full Disk Access)
-- Opened by hand: checks both permissions and both jobs, and says how they are.
set py to "@PYTHON@"
set syncScript to "@SYNC_SCRIPT@"
set syncLog to "@SYNC_LOG@"
set reinstallScript to "@REINSTALL_SCRIPT@"
set reinstallLog to "@REINSTALL_LOG@"
set html to "@HTML@"
set shared to "@SHARED_DIR@"
set agents to "@AGENTS@"
-- Same settings the jobs get, also when you open the app by hand.
set envs to "ARCIFY_SYNC_DIR=" & quoted form of shared & " ARCIFY_HOME=" & quoted form of "@ARCIFY_HOME@" & " VIVALDI_PROFILE=" & quoted form of "@VIVALDI_PROFILE@" & " "
set appTitle to "Vivaldi Arcify"

set task to system attribute "VM_TASK"
if task is "pinned-sync" then
	try
		do shell script envs & quoted form of py & " -I " & quoted form of syncScript & " >> " & quoted form of syncLog & " 2>&1"
	end try
	return
else if task is "reinstall" then
	try
		do shell script envs & "/bin/zsh " & quoted form of reinstallScript & " >> " & quoted form of reinstallLog & " 2>&1"
	end try
	return
end if

activate
on jobOn(agents, label)
	try
		do shell script "test -f " & quoted form of (agents & "/" & label & ".plist")
		return true
	on error
		return false
	end try
end jobOn

set missing to {}
set report to ""

-- Reinstall after Vivaldi updates: changing a file's date inside Vivaldi.app
-- needs App Management (the content stays the same).
if jobOn(agents, "vivaldi-arcify.reinstall") then
	set canWrite to true
	try
		do shell script "touch -c " & quoted form of html
	on error
		set canWrite to false
	end try
	set installed to "no"
	try
		do shell script "grep -q 'vivaldi-arcify' " & quoted form of html
		set installed to "yes"
	end try
	if canWrite then
		set report to report & "✅ Reinstall after Vivaldi updates: App Management is on." & return
	else
		set report to report & "❌ Reinstall after Vivaldi updates: App Management is off." & return
		set end of missing to "Privacy_AppBundles"
	end if
	set report to report & "     JS mods installed in Vivaldi: " & installed & return & return
else
	set report to report & "Reinstall after Vivaldi updates: not set up (run setup.sh again and say yes to it)." & return & return
end if

-- Pinned tab sync: reading iCloud Drive (or another synced folder) needs Full Disk Access.
if jobOn(agents, "vivaldi-arcify.pinned-sync") then
	set canRead to true
	try
		do shell script "ls " & quoted form of shared & " >/dev/null"
	on error
		set canRead to false
	end try
	if canRead then
		set report to report & "✅ Pinned tab sync: Full Disk Access is on." & return
		try
			set summary to do shell script envs & quoted form of py & " -I " & quoted form of syncScript & " >> " & quoted form of syncLog & " 2>&1; " & envs & quoted form of py & " -I " & quoted form of syncScript & " --summary"
			set report to report & summary & return
		on error errText
			set report to report & "     Sync failed: " & errText & return
		end try
	else
		set report to report & "❌ Pinned tab sync: Full Disk Access is off." & return
		set end of missing to "Privacy_AllFiles"
	end if
else
	set report to report & "Pinned tab sync: not set up (run setup.sh again and say yes to it)." & return
end if

if missing is {} then
	set choice to button returned of (display dialog report buttons {"Show Logs", "OK"} default button "OK" with title appTitle)
	if choice is "Show Logs" then do shell script "open -a Console " & quoted form of syncLog & " " & quoted form of reinstallLog & " 2>/dev/null || true"
else
	set report to report & return & "Turn on “Vivaldi Arcify” in System Settings > Privacy & Security (click + and pick it from Applications if it isn't listed), then open this app again to check."
	set choice to button returned of (display dialog report buttons {"Later", "Open Settings"} default button "Open Settings" with title appTitle with icon caution)
	if choice is "Open Settings" then do shell script "open 'x-apple.systempreferences:com.apple.preference.security?" & (item 1 of missing) & "'"
end if
