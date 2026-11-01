# Starts Maestro from this checkout, like an installed app: no terminal, no pnpm by hand.
# On each launch: install dependencies if the lockfile changed, rebuild if the code changed (scripts/build-if-changed.mjs),
# then open the app. So whatever is committed or edited here is what opens next time.
# Profile: %APPDATA%\ytmdesktop2-dev (the one `pnpm dev` uses), so settings and sign-in carry over. Never the upstream
# app's %APPDATA%\ytmdesktop2.
# Desktop shortcut: run once with -InstallShortcut.
param([switch]$InstallShortcut)

$ErrorActionPreference = "Stop"
$App = Split-Path -Parent $PSScriptRoot
$Root = (Resolve-Path (Join-Path $App "..\..")).Path
$Log = Join-Path $App "out\launch.log"
$UserData = Join-Path $env:APPDATA "ytmdesktop2-dev"
$Name = "Maestro"
$Icon = Join-Path $App "build\icon.ico"

if ($InstallShortcut) {
	$lnk = Join-Path ([Environment]::GetFolderPath("Desktop")) "$Name.lnk"
	$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
	$s.TargetPath = (Get-Command powershell.exe).Source
	$s.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`""
	$s.WorkingDirectory = $App
	$s.IconLocation = $Icon
	$s.Description = "$Name (rebuilds from this folder when the code changed)"
	$s.Save()
	Write-Output "Shortcut created: $lnk"
	exit 0
}

New-Item -ItemType Directory -Force (Split-Path $Log) | Out-Null
"[$(Get-Date -Format s)] launch" | Set-Content $Log

# A tray balloon while an update installs or builds (about 20 s), so a slow start is not a mystery.
$script:tray = $null
function Show-Busy([string]$text) {
	if (-not $script:tray) {
		Add-Type -AssemblyName System.Windows.Forms, System.Drawing
		$script:tray = New-Object System.Windows.Forms.NotifyIcon
		$script:tray.Icon = New-Object System.Drawing.Icon $Icon
		$script:tray.Text = $Name
		$script:tray.Visible = $true
	}
	$script:tray.ShowBalloonTip(5000, $Name, $text, [System.Windows.Forms.ToolTipIcon]::Info)
}
function Fail([string]$text) {
	if ($script:tray) { $script:tray.Dispose() }
	Add-Type -AssemblyName System.Windows.Forms
	[System.Windows.Forms.MessageBox]::Show("$text`n`nDetails: $Log", $Name, "OK", "Error") | Out-Null
	exit 1
}
function Run([string]$exe, [string[]]$argv, [string]$cwd) {
	$p = Start-Process -FilePath $exe -ArgumentList $argv -WorkingDirectory $cwd -NoNewWindow -Wait -PassThru `
		-RedirectStandardOutput "$Log.out" -RedirectStandardError "$Log.err"
	Get-Content "$Log.out", "$Log.err" -ErrorAction SilentlyContinue | Add-Content $Log
	Remove-Item "$Log.out", "$Log.err" -ErrorAction SilentlyContinue
	return $p.ExitCode
}

try {
	$node = (Get-Command node.exe).Source
	$corepack = Join-Path (Split-Path $node) "corepack.cmd"
	# Electron's binary, wherever pnpm put it (it is hoisted to the workspace root's node_modules).
	$findElectron = { Push-Location $App; try { (& $node -e "process.stdout.write(require('electron'))" 2>$null) } finally { Pop-Location } }
	$Electron = & $findElectron

	# Dependencies: reinstall only when pnpm-lock.yaml changed since the last install from this launcher.
	$lockHash = (Get-FileHash (Join-Path $Root "pnpm-lock.yaml")).Hash
	$lockMark = Join-Path $App "out\.lock-hash"
	$installed = if (Test-Path $lockMark) { (Get-Content $lockMark -Raw).Trim() } else { "" }
	if (-not $Electron -or -not (Test-Path $Electron) -or $installed -ne $lockHash) {
		Show-Busy "Installing updated dependencies..."
		if ((Run $corepack @("pnpm", "install", "--frozen-lockfile") $Root) -ne 0) { Fail "Installing dependencies failed." }
		Set-Content $lockMark $lockHash
		$Electron = & $findElectron
		if (-not $Electron -or -not (Test-Path $Electron)) { Fail "Electron is missing after installing dependencies." }
	}

	# Build only when the code changed: `--check` exits 0 when the last build is current, 10 when one is needed.
	$check = Run $node @("scripts/build-if-changed.mjs", "--check") $App
	if ($check -eq 10) {
		Show-Busy "Applying your latest changes (about 20 s)..."
		if ((Run $node @("scripts/build-if-changed.mjs") $App) -ne 0) { Fail "Building the app failed." }
	} elseif ($check -ne 0) {
		Fail "Checking for changes failed."
	}
} catch {
	$_ | Out-String | Add-Content $Log
	Fail "Could not start $Name."
}

if ($script:tray) { $script:tray.Dispose() }
try {
	"starting $Electron" | Add-Content $Log
	Start-Process -FilePath $Electron -ArgumentList @(".", "--user-data-dir=`"$UserData`"") -WorkingDirectory $App
} catch {
	$_ | Out-String | Add-Content $Log
	Fail "Could not start $Name."
}
