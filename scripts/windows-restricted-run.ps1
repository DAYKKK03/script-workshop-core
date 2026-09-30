param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('test', 'smoke')]
  [string]$Mode
)

$ErrorActionPreference = 'Stop'
$prefix = Join-Path $env:RUNNER_TEMP "desktop-$Mode-$PID"
$wrapper = "$prefix.cmd"
$log = "$prefix.log"
$exitFile = "$prefix.exit"
$node = (Get-Command node.exe).Source
$npm = (Get-Command npm.cmd).Source
$command = if ($Mode -eq 'test') { "call `"$npm`" run test:desktop" } else { "`"$node`" scripts\smoke-packaged-desktop.mjs" }

@(
  '@echo off',
  "cd /d `"$PWD`"",
  'set SCRIPT_WORKSHOP_DEBUG_POSTGRES=1',
  "$command > `"$log`" 2>&1",
  "echo %ERRORLEVEL% > `"$exitFile`""
) | Set-Content -Path $wrapper -Encoding ascii

try {
  $launch = "cmd.exe /c `"$wrapper`""
  runas.exe /trustlevel:0x20000 $launch
  for ($i = 0; $i -lt 180 -and -not (Test-Path $exitFile); $i++) { Start-Sleep -Seconds 1 }
  if (-not (Test-Path $exitFile)) { throw "Restricted $Mode timed out" }
  if (Test-Path $log) { Get-Content $log }
  if ((Get-Content $exitFile -Raw).Trim() -ne '0') { throw "Restricted $Mode failed" }
} finally {
  Remove-Item $wrapper, $log, $exitFile -ErrorAction SilentlyContinue
}
