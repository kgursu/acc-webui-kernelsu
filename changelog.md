**v1.1-test17 (versionCode 42)**
- WebUI: separate Configuration Settings from the buttons above with more space and a divider
- WebUI: tighten the gap above the first config field
- WebUI: swipe now works across the whole page, not just the card area

**v1.1-test16 (versionCode 39)**
- WebUI: raise config and daemon-status timeouts so slow devices stop failing to load
- WebUI: add more space under section headings for consistent spacing
- WebUI: swipe left or right to move between main tabs

**v1.1-test15 (versionCode 36)**
- WebUI: Reset Switches modal explains Safe Clear and Set to Defaults under each button

**v1.1-test14 (versionCode 35)**
- WebUI: Reset Switches now asks Safe Clear (keep write.log marks) or Set to Defaults (strip all # marks)

**v1.1-test13 (versionCode 34)**
- WebUI: Enable/Disable Switches now reads write.log, so switches ACC skips (#name) show as disabled
- WebUI: disabling a switch adds #name to write.log; re-enabling its last variant removes the #
- WebUI: Disabled Switches count includes write.log entries
- WebUI: raise command timeout to 15s so slow devices (e.g. Xperia Z2) stop hitting status timeouts

**v1.1-test12 (versionCode 30)**
- WebUI: button labels wrap instead of clipping on narrow screens (Enable/Disable Switches)
- WebUI: move Log Monitor to the Config page next to Enable/Disable Switches
- WebUI: fix UI page not rendering its contents

**v1.1-test11 (versionCode 27)**
- WebUI: move Test Switches from Status to the Config page, before Reset Switches
- WebUI: move Configuration Settings (Basic, Limits, Advanced, Cooldown) and its action buttons to the Config page
- WebUI: the UI page now holds Enable Debug Console and Update Channel under a UI heading

**v1.1-test10 (versionCode 24)**
- WebUI: add Disabled Switches count to the Config page
- WebUI: add Enable/Disable Switches page to exclude problematic switches from Test Switches
- WebUI: add Reset Switches to clear the exclusion list
- Installer: service.sh removes excluded switches from the test pool on boot

**v1.1-test9 (versionCode 20)**
- WebUI: rename Maintenance tab to Service and Settings tab to UI
- WebUI: move charging and daemon control buttons to the top of the Service page

**v1.1-test8 (versionCode 18)**
- Daemon: fix Stop then Start failing on ROMs where init.svc.bootanim is empty after boot

**v1.1-test7 (versionCode 17)**
- WebUI: prioritize reliable absolute ACC paths to fix "inaccessible or not found" on some ROMs
- WebUI: add Copy All button to the Prompt Log viewer

**v1.1-test6 (versionCode 15)**
- WebUI: daemon status now reflects real state (acc -D) so Stop updates Current Status
- WebUI: prompts are saved to a timestamped log, viewable via a new Prompt Log button in Logs

**v1.1-test5 (versionCode 13)**
- WebUI: status values wrap only when too long, short ones stay inline on the right

**v1.1-test4 (versionCode 12)**
- WebUI: tab scroll indicators now show on both sides and appear without tapping first
- WebUI: fix Stop/Restart daemon using acc -D commands instead of pkill (error 1)
- WebUI: prompt background is now opaque

**v1.1-test3 (versionCode 9)**
- WebUI: rename app title to "ACC WebUI" on every page
- WebUI: show ACC installation result on two lines when the path is long
- WebUI: keep ACC WebUI version on a single line (no needless wrap on phones)
- WebUI: command result prompt now centers on screen and dismisses on tap
- WebUI: switch test streams output live and Stop re-enables charging safely

**v1.1-test2 (versionCode 4)**
- WebUI: rename "ACC Version" row to "ACC WebUI Version"
- WebUI: strip daemon init noise from the version readout
- Remove versionCode from zip filename (parentheses broke FolkPatch downloads)

**v1.1-test1 (versionCode 1)**
- Switch to a simple incremental versionCode independent of the version name
- Add Base ACC Version field in the WebUI System Verification panel
- Shorten release tags and version naming (v1.1 scheme)
- Simplify CI: no auto versionCode, no repo commits from Actions (avoids merge conflicts)

**v2025.5.18-dev-apatch-1.1-test11**
- Installer: update channel preference now re-applied on every boot via service.sh (survives module updates)
- Fix stable module.json carrying an outdated versionCode

**v2025.5.18-dev-apatch-1.1-test10**
- WebUI: add cache-busting to assets so the interface refreshes after updates without a reboot
- CI: version stamp appended to script/style references at build time

**v2025.5.18-dev-apatch-1.1-test9**
- WebUI: fix update check reporting failure when ACC returns "no update" (exit 6)
- WebUI: add execRaw helper so exit codes that signal state are not treated as errors
- WebUI: export logs now reliably confirms success via the created archive

**v2025.5.18-dev-apatch-1.1-test8 (2026062005)**
- WebUI: fix update channel controls overflowing to the right on wide screens
- WebUI: ACC version stays inline on wide screens, wraps only on narrow ones

**v2025.5.18-dev-apatch-1.1-test7 (2026062004)**
- WebUI: fix update check showing raw progress bar characters
- WebUI: Open Manual now finds README in multiple locations, opens online if missing
- WebUI: fix Export Logs reporting failure when the archive was actually created
- Installer: keep a README copy in the module directory for the manual viewer

**v2025.5.18-dev-apatch-1.1-test6 (2026062003)**
- WebUI: scrollable settings tabs now show a right-edge arrow/fade indicator
- WebUI: fix bottom nav label clipping on narrow screens (Maintenance)
- WebUI: ACC version row wraps to a second line when too long
- WebUI: normalize Celsius symbol (℃ to °C) for consistent rendering

**v2025.5.18-dev-apatch-1.1-test5 (2026062002)**
- WebUI: fix active tab indicator (underline instead of strike-through)

**v2025.5.18-dev-apatch-1.1-test4 (2026062001)**
- Fix wrapper not passing arguments ($@ escaping); acc commands work from terminal again

**v2025.5.18-dev-apatch-1.1-test3 (2026060303)**
- WebUI: add update channel selector (stable / beta)
- WebUI: fix incorrect "failed to save" caused by wrong errno check
- CI: prerelease detection; test builds no longer pushed as stable updates

**v2025.5.18-dev-apatch-1.1-test2 (2026060302)**
- WebUI: fix config save (removed faulty errno comparison)
- WebUI: add /data/adb/ap/bin/acc to path detection (APatch/FolkPatch)
- WebUI: use nohup+setsid to restart accd (prevents process kill on APatch/FolkPatch)
- Installer: wrapper uses sh instead of source for correct exit codes

**v2025.5.18-dev-apatch-1.0 (20260527)**
- APatch and FolkPatch compatibility
- Skip system/bin OverlayFS mount to prevent boot deadlock
- Symlink acc executables to /data/adb/ap/bin for PATH access
- Fix service.sh --init blocking installer UI
- Fix missing .config-ver / .config-help file errors
- Updated WebUI to latest version

**v2025.5.18-dev (202505180)**
- acc -f fixes & enhancements
- acca -t q ... (quiet test; reports Ok, Idle or Fail)
- Add `/sys/devices/platform/charger/bypass_charger 0 1` switch (@Rem01Gaming)
- Avoid needlessly forcing default current, temp_level and voltage
- Config print includes acc version code
- Fix new defaults not applying
- Out of the box Encore Tweaks support
- Set default `_STI=35`
- Support acc -t[_STI] syntax
- Update doc

**v2025.5.1-dev (202505010)**
- -c|--config h string   Print config help text associated with "string" (config variable, e.g., acc -c h rt (or resume_temp))
- -s|--set file: Get config from file (in "acc -s" format)
- [acc -c d string] Quotes are no longer mandatory
- [acc -f] Don't use scripts from the default config; fix rt issue
- [acc -p] Filter more irrelevant sysfs nodes
- [acc -t] Add status column hint; show currently set charging switche(s)
- acc -f [cap] -a tries to restart accd automatically shortly after the charger is unplugged; not supported by all devices
- Add debug info to acc-t_output-${device}.log
- Additional switches & device-specific settings
- Also consider dc/online and pc_port/online for plug state detection
- Always sort switches before printing/testing
- Auto re-init accd on exit code 7
- Auto-set batt_status_workaround=false for msm8937
- battStatusOverride: Support ${chargingSwitch[2]} as a file
- Don't include trailing " --" in working switches list
- Drop capacity_sync, discharge_polarity and idle_threshold config variables
- Drop legacy AccA logic
- Exclude battery/store_mode switch
- Exclude current_cmd from mcc working list
- Exclude switches whose num_system_temp_in_levels is null
- Fix "acc -f [#] -s ..."
- Fix "acc -u -f dev^1" syntax & related errors
- Fix "chargingSwitch[2]: parameter not set"
- Fix & optimize current and voltage handling logic
- Fix 'acc -c a "..."'
- Fixes for msm8953 (e.g., Moto Z Play)
- Forbid control files modifications by 3rd-party
- Forbid mt - rt > 10 (fallback to rt = mt - 1)
- Get battery level info from Android's battery service if it differs from the kernel's (replaces capacity_sync)
- Implement battery stats reset workaround
- Implement idle_apps
- Improve bootloop handling logic and debugging tools
- In acc -c a ': sleep profile; at 22:00 "acc -s pc=60 mcc=500; acc -n \"sleep profile\""', the quotes are optional and all ";" can be replaced with ","
- Include dmesg and logcat in log archive
- Drop cooldownCustom
- Drop thermal_suspend (users can still have something like ":; pkill -STOP -f mi_thermald" in config to suspend thermal management processes)
- Lower switch test timeout
- Make it possible to post multiple notifications with acc -n
- Make the scheduler safer and aware of the "/dev/" prefix
- Minimize the use of subshells
- Notifications include timestamps
- Overwrite control files values 6 times within a second to wake up lazy switches
- Overwrite control files values upon issuing a disable/enable charging command, regardless of charging status
- Parse current and voltage control files only once per boot session to avoid "false defaults"
- Patches for KSU/Apatch, install notes and "no reboot needed" workaround
- Recommend trying temp_level if no regular current control file is found
- Reduce idle mode false positives when `bsw=true`
- Reinforce uninstall confirmation
- Reset "auto switch" and move it to the end of the list only if unsolicitedResumes = 3, rather than 1
- Reset switch (in auto-mode) if pbim changes via --set
- Reset working-switches.log on a full switch test
- Rewrite battery info logic (acc -i, -w)
- Rewrite discharge_polarity's logic - now dynamic and fully automatic
- Set idleAbovePcap threshold to (pause_capacity + 1)
- Set millivolts idleAbovePcap threshold to (pause_capacity + 50)
- Show applied config patches after upgrades (Android notification)
- Speed up acca --set for voltage and current limits
- Start accd as soon as the lockscreen shows up (no unlocking required)
- Support "," in place of "|" for egrep patterns (e.g., acc -i curr,volt; acc -w curr,volt; acc -sp cap,temp)
- Support cooldown_current with temp_level as back-end (e.g., acc -s cdc=60% to limit current by 60%)
- Support curl binary without --dns-server option (for upgrades)
- Support more devices with unconventional battery interfaces
- Support Nexus 10 (manta)
- Suppress "Terminated" messages
- Suppress missing current control file errors
- Try honoring allowIdleAbovePcap=false only 2x at most, per accd session
- Try wget if curl fails
- Update docs & strings
- Update installer; add magic overlayfs module support
- Update simplified Chinese translations (by @H-xiaoH)

**v2023.10.16 (202310160)**
- "edit g" shall work with non-root apps (acc -h g, acc -l g, acc -la g)
- -f supports additional options (e.g., acc -f -sc 500)
- -h|--help [[editor] [editor_opts] | g for GUI] prints the help text, plus the config
- -sd shall not print user scripts
- accd auto-updates mcc and mcv arrays (missing ctrl files or array[1] "-" marker)
- Added dev tag to update checker
- Additional charging switches
- Additional current control files
- allowIdleAbovePcap=true, if set to false, accd will avoid idle mode (if possible) when capacity > pause_capacity
- Auto-move failing switches to the end of the list
- Default acc -w refresh rate set to 1 second
- Default capacity_sync set to false
- Dropped obsolete code & information
- Ensure charging switch is set before a pause condition is hit
- Fixed html hyperlinks and duplicate temp in acc -i (OnePlus 7)
- Implement "rt ct mt" restricted charging hysteresis
- Improved current control files parsing & automatic switch logic
- KaiOS support
- Log export function invokes Android's share dialog
- Optimized loop delays (loopDelay=(3 9): 3 seconds while charging/idle, 9 seconds while discharging)
- prioritizeBattIdleMode=no has the opposite effect (prioritize non-idle mode)
- Refactored battery health calculator and cooldown logic
- resume_temp and cooldown_temp optionally override resume_capacity (if resume_temp has a trailing "r", as in resume_temp=35r)
- Selection lists count from 0 instead of 1
- Show /dev/ prefix tip only if acc is not in $PATH
- Suspend regular daemon functions until discharge_polarity is set, either automatically or manually
- Updated documentation
- Validate current control files only while charging
- Wizard is more user-friendly
