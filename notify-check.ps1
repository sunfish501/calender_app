$ErrorActionPreference = 'Continue'

$root       = $PSScriptRoot
$eventsPath = Join-Path $root 'events.json'
$logPath    = Join-Path $root 'notify-check.log'

function Write-Log {
    param([string]$Msg)
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Msg"
    try { Add-Content -Path $logPath -Value $line -Encoding UTF8 } catch {}
}

Write-Log "=== notify-check 시작 ==="

if (-not (Test-Path $eventsPath)) {
    Write-Log "events.json 없음. 종료."
    exit 0
}

$content = [System.IO.File]::ReadAllText($eventsPath, [System.Text.Encoding]::UTF8)
if ([string]::IsNullOrWhiteSpace($content)) {
    Write-Log "events.json 비어있음. 종료."
    exit 0
}

try {
    $obj = ConvertFrom-Json $content
} catch {
    Write-Log "JSON 파싱 실패: $_"
    exit 1
}

# PSCustomObject → Hashtable
$events = @{}
foreach ($prop in $obj.PSObject.Properties) {
    $events[$prop.Name] = @($prop.Value)
}

function Get-EventText {
    param($Item)
    if ($Item -is [string]) { return $Item }
    if ($Item -is [PSCustomObject] -and $Item.t) { return "$($Item.t)" }
    return "$Item"
}

$today    = (Get-Date).ToString('yyyy-MM-dd')
$tomorrow = (Get-Date).AddDays(1).ToString('yyyy-MM-dd')

$messages = New-Object System.Collections.ArrayList
if ($events.ContainsKey($today)) {
    foreach ($e in $events[$today]) {
        $txt = Get-EventText $e
        [void]$messages.Add([PSCustomObject]@{ Type = '오늘'; Text = $txt })
    }
}
if ($events.ContainsKey($tomorrow)) {
    foreach ($e in $events[$tomorrow]) {
        $txt = Get-EventText $e
        [void]$messages.Add([PSCustomObject]@{ Type = '내일'; Text = $txt })
    }
}

if ($messages.Count -eq 0) {
    Write-Log "오늘/내일 일정 없음. 종료."
    exit 0
}

Write-Log "발송할 알림 $($messages.Count)건"

# WinRT 타입 로드
try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
} catch {
    Write-Log "WinRT 타입 로드 실패: $_"
    exit 1
}

# PowerShell의 기본 AppID (시스템에 사전 등록되어 있어 별도 설치 불필요)
$appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'

function Escape-Xml {
    param([string]$s)
    if ($null -eq $s) { return '' }
    return $s.Replace('&','&amp;').Replace('<','&lt;').Replace('>','&gt;').Replace('"','&quot;').Replace("'",'&apos;')
}

foreach ($m in $messages) {
    $title = Escape-Xml ($m.Type + '의 일정')
    $body  = Escape-Xml $m.Text

    $xmlText = @"
<toast activationType="protocol" launch="">
    <visual>
        <binding template="ToastGeneric">
            <text>$title</text>
            <text>$body</text>
        </binding>
    </visual>
    <audio src="ms-winsoundevent:Notification.Default" />
</toast>
"@

    try {
        $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
        $xml.LoadXml($xmlText)
        $toast = New-Object Windows.UI.Notifications.ToastNotification $xml
        [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
        Write-Log "토스트 발송: [$($m.Type)] $($m.Text)"
    } catch {
        Write-Log "토스트 발송 실패 [$($m.Type)/$($m.Text)]: $_"
    }
}

Write-Log "=== notify-check 종료 ==="
