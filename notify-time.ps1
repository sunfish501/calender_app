$ErrorActionPreference = 'Continue'

$root         = $PSScriptRoot
$eventsPath   = Join-Path $root 'events.json'
$notifiedPath = Join-Path $root 'notified-time.json'
$logPath      = Join-Path $root 'notify-time.log'

function Write-Log {
    param([string]$Msg)
    try { Add-Content -Path $logPath -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Msg" -Encoding UTF8 } catch {}
}

if (-not (Test-Path $eventsPath)) { exit 0 }

$content = [System.IO.File]::ReadAllText($eventsPath, [System.Text.Encoding]::UTF8)
if ([string]::IsNullOrWhiteSpace($content) -or $content.Trim() -eq '{}') { exit 0 }

try { $obj = ConvertFrom-Json $content } catch { Write-Log "JSON 파싱 실패: $_"; exit 1 }

if ($obj.__notify_enabled__ -eq $false) {
    Write-Log "알림 꺼짐. 종료."
    exit 0
}

# 이미 발송한 알림 (오늘분만 유지)
$notified = @{}
$today = (Get-Date).ToString('yyyy-MM-dd')
if (Test-Path $notifiedPath) {
    try {
        $n = ConvertFrom-Json ([System.IO.File]::ReadAllText($notifiedPath, [System.Text.Encoding]::UTF8))
        foreach ($p in $n.PSObject.Properties) {
            if ($p.Name.StartsWith($today)) { $notified[$p.Name] = $true }
        }
    } catch {}
}

$now         = Get-Date
$windowStart = $now.AddMinutes(55)   # 1시간 전 ± 5분 윈도우
$windowEnd   = $now.AddMinutes(65)

$queue = New-Object System.Collections.ArrayList

function Test-Time {
    param([string]$DateKey, [string]$Text)
    if ($Text -notmatch '\((\d{1,2}):(\d{2})\)') { return }
    $h = [int]$Matches[1]; $m = [int]$Matches[2]
    if ($h -gt 23 -or $m -gt 59) { return }
    $dt = $null
    try {
        $hh = $h.ToString('00'); $mm = $m.ToString('00')
        $dt = [DateTime]::ParseExact("$DateKey $hh`:$mm", 'yyyy-MM-dd HH:mm', $null)
    } catch { return }
    if ($dt -lt $script:windowStart -or $dt -gt $script:windowEnd) { return }
    $key = "$DateKey $($h.ToString('00')):$($m.ToString('00'))::$Text"
    if ($script:notified.ContainsKey($key)) { return }
    [void]$script:queue.Add([PSCustomObject]@{ Text = $Text; Time = $dt; Key = $key })
}

# events 순회 (문자열 또는 {t:"텍스트", th:"테마"} 객체)
# 시간표 항목(tt:true)은 알림 대상에서 제외
foreach ($prop in $obj.PSObject.Properties) {
    if ($prop.Name -like '__*') { continue }
    $dKey = $prop.Name
    $list = @($prop.Value)
    foreach ($item in $list) {
        $txt = $null
        if ($item -is [string]) {
            $txt = $item
        } elseif ($item -is [PSCustomObject] -and $item.t) {
            if ($item.PSObject.Properties.Name -contains 'tt' -and $item.tt) { continue }
            $txt = "$($item.t)"
        }
        if ($txt) { Test-Time -DateKey $dKey -Text $txt }
    }
}

if ($queue.Count -eq 0) { exit 0 }

Write-Log "발송 후보 $($queue.Count)건"

try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
} catch { Write-Log "WinRT 로드 실패"; exit 1 }

$appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'

function Escape-Xml {
    param([string]$s)
    if ($null -eq $s) { return '' }
    return $s.Replace('&','&amp;').Replace('<','&lt;').Replace('>','&gt;').Replace('"','&quot;').Replace("'",'&apos;')
}

foreach ($m in $queue) {
    $title = Escape-Xml '⏰ 1시간 뒤 일정'
    $body  = Escape-Xml ("$($m.Time.ToString('HH:mm'))  $($m.Text)")
    $xmlText = @"
<toast>
    <visual>
        <binding template="ToastGeneric">
            <text>$title</text>
            <text>$body</text>
        </binding>
    </visual>
    <audio src="ms-winsoundevent:Notification.Reminder" />
</toast>
"@
    try {
        $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
        $xml.LoadXml($xmlText)
        $toast = New-Object Windows.UI.Notifications.ToastNotification $xml
        [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
        $notified[$m.Key] = $true
        Write-Log "발송: $($m.Time.ToString('HH:mm')) $($m.Text)"
    } catch { Write-Log "발송 실패 [$($m.Text)]: $_" }
}

# 발송 기록 저장
$saveObj = @{}
foreach ($k in $notified.Keys) { $saveObj[$k] = $true }
try {
    [System.IO.File]::WriteAllText($notifiedPath, ($saveObj | ConvertTo-Json -Compress), (New-Object System.Text.UTF8Encoding($false)))
} catch { Write-Log "notified 저장 실패: $_" }
