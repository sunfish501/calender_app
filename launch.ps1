$ErrorActionPreference = 'Continue'

$root       = $PSScriptRoot
$port       = 8765
$EdgeExe    = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$ChromeExe  = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$BrowserExe = if (Test-Path $EdgeExe) { $EdgeExe } else { $ChromeExe }
$ProfileDir = Join-Path $root 'browser-profile'

# 작업표시줄/바로가기 아이콘을 오늘 날짜로 즉시 갱신 (자정에 자동 실행되지 않아도)
$iconScript = Join-Path $root 'update-icon.ps1'
if (Test-Path $iconScript) {
    try {
        Start-Process -FilePath 'powershell.exe' -Wait -WindowStyle Hidden -ArgumentList @(
            '-NoProfile', '-ExecutionPolicy', 'Bypass',
            '-File', "`"$iconScript`""
        )
    } catch {}
}

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

# 단축키 재클릭 시 기존 Edge --app 인스턴스가 살아있으면 그 창이 활성화되어
# 옛 URL 그대로 표시될 수 있다 → 새 빌드를 보장하기 위해 기존 인스턴스 강제 종료.
try {
    $oldApps = Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match [regex]::Escape($ProfileDir) }
    foreach ($p in $oldApps) {
        try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch {}
    }
    if ($oldApps) { Start-Sleep -Milliseconds 800 }
} catch {}

# URL 의 PATH 자체를 매번 다르게: `/calendar-{timestamp}.html`.
# server.ps1 이 `calendar-*.html` 을 모두 `calendar.html` 로 매핑하므로
# 결과 파일은 같지만 브라우저 disk cache 키는 path 단위로 달라 stale match 불가.
# 쿼리스트링만 다르게 하는 것보다 강력함 (Edge --app= 의 cache key 가 path 우선).
$cb  = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$url = "http://localhost:$port/calendar-$cb.html?cb=$cb"
$argString = '--user-data-dir="' + $ProfileDir + '" --no-first-run --no-default-browser-check ' +
             '--disable-features=BackForwardCache --disk-cache-size=1 ' +
             '--window-size=1100,800 --app="' + $url + '"'

Start-Process -FilePath $BrowserExe -ArgumentList $argString
