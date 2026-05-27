$ErrorActionPreference = 'Continue'

$root       = $PSScriptRoot
$port       = 8765
$EdgeExe    = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$ChromeExe  = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$BrowserExe = if (Test-Path $EdgeExe) { $EdgeExe } else { $ChromeExe }
$ProfileDir = Join-Path $root 'browser-profile'

function Test-PortOpen {
    param([int]$Port)
    try {
        $tc = New-Object System.Net.Sockets.TcpClient
        $iar = $tc.BeginConnect('127.0.0.1', $Port, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne(400, $false)
        if ($ok -and $tc.Connected) {
            $tc.EndConnect($iar)
            $tc.Close()
            return $true
        }
        $tc.Close()
    } catch {}
    return $false
}

if (-not (Test-PortOpen -Port $port)) {
    $serverScript = Join-Path $root 'server.ps1'
    Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', "`"$serverScript`""
    )
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 200
        if (Test-PortOpen -Port $port) { break }
    }
}

$url = "http://localhost:$port/calendar.html"
$argString = '--user-data-dir="' + $ProfileDir + '" --no-first-run --no-default-browser-check --window-size=1100,800 --app="' + $url + '"'

Start-Process -FilePath $BrowserExe -ArgumentList $argString
