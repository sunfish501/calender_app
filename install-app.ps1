# 달력 앱을 바탕화면에 설치하는 스크립트
# - Chrome/Edge --app 모드 바로가기를 바탕화면 + 시작메뉴에 생성
# - 커스텀 아이콘(달력 모양) 생성 시도. 실패하면 기본 브라우저 아이콘 사용.

$ErrorActionPreference = 'Stop'

$AppName  = "달력"
$AppDir   = "c:\Users\euiky\OneDrive\Desktop\역사에 남을 그 폴더"
$HtmlPath = Join-Path $AppDir "calendar.html"
$IconPath = Join-Path $AppDir "calendar.ico"

# --- 1) 커스텀 아이콘 시도 (실패해도 계속 진행) ---
$iconCreated = $false
try {
    Add-Type -AssemblyName System.Drawing

    $size = 256
    $bmp  = [System.Drawing.Bitmap]::new($size, $size)
    $g    = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $pad = 20
    $rx  = $pad; $ry = $pad; $rw = $size - 2*$pad; $rh = $size - 2*$pad

    # 본체 (흰색 사각형)
    $whiteBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $g.FillRectangle($whiteBrush, [int]$rx, [int]$ry, [int]$rw, [int]$rh)

    # 테두리 (Pens 정적 사용)
    $g.DrawRectangle([System.Drawing.Pens]::DimGray, [int]$rx, [int]$ry, [int]$rw, [int]$rh)
    $g.DrawRectangle([System.Drawing.Pens]::DimGray, [int]($rx+1), [int]($ry+1), [int]($rw-2), [int]($rh-2))
    $g.DrawRectangle([System.Drawing.Pens]::DimGray, [int]($rx+2), [int]($ry+2), [int]($rw-4), [int]($rh-4))

    # 상단 헤더 (파란색)
    $headerH = [int]($rh * 0.22)
    $blueBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(40,116,224))
    $g.FillRectangle($blueBrush, [int]$rx, [int]$ry, [int]$rw, [int]$headerH)

    # 헤더 위 고리 두 개 (사각형으로 표현)
    $darkBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(80,80,80))
    $ringY = $ry - 5
    $ringH = 28
    $ringW = 14
    $g.FillRectangle($darkBrush, [int]($rx + $rw * 0.25), [int]$ringY, [int]$ringW, [int]$ringH)
    $g.FillRectangle($darkBrush, [int]($rx + $rw * 0.65), [int]$ringY, [int]$ringW, [int]$ringH)

    # 날짜 숫자
    $today = (Get-Date).Day.ToString()
    $font  = [System.Drawing.Font]::new("Segoe UI", [single]95, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $textBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(40,40,40))
    $sf = [System.Drawing.StringFormat]::new()
    $sf.Alignment     = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $textRect = [System.Drawing.RectangleF]::new([single]$rx, [single]($ry + $headerH), [single]$rw, [single]($rh - $headerH))
    $g.DrawString($today, $font, $textBrush, $textRect, $sf)

    $g.Dispose()

    # PNG로 메모리에 저장 후 ICO 헤더 붙여서 파일로 기록
    $ms = [System.IO.MemoryStream]::new()
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBytes = $ms.ToArray()
    $ms.Dispose()
    $bmp.Dispose()

    $fs = [System.IO.File]::Open($IconPath, [System.IO.FileMode]::Create)
    $bw = [System.IO.BinaryWriter]::new($fs)
    $bw.Write([UInt16]0)
    $bw.Write([UInt16]1)
    $bw.Write([UInt16]1)
    $bw.Write([Byte]0)
    $bw.Write([Byte]0)
    $bw.Write([Byte]0)
    $bw.Write([Byte]0)
    $bw.Write([UInt16]1)
    $bw.Write([UInt16]32)
    $bw.Write([UInt32]$pngBytes.Length)
    $bw.Write([UInt32]22)
    $bw.Write($pngBytes)
    $bw.Close()
    $fs.Close()

    $iconCreated = $true
    Write-Host "아이콘 생성 완료: $IconPath"
}
catch {
    Write-Host "아이콘 생성 실패 ($($_.Exception.Message)) — 기본 브라우저 아이콘을 사용합니다."
}

# --- 2) 브라우저 경로 찾기 ---
$BrowserPath = $null
$candidates = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)
foreach ($p in $candidates) { if (Test-Path $p) { $BrowserPath = $p; break } }
if (-not $BrowserPath) { throw "Chrome 또는 Edge를 찾을 수 없습니다." }
Write-Host "브라우저: $BrowserPath"

# --- 3) 바로가기 생성 함수 ---
$FileUri = "file:///" + ($HtmlPath -replace '\\','/')

function New-AppShortcut {
    param([string]$LinkPath)
    $WshShell = New-Object -ComObject WScript.Shell
    $sc = $WshShell.CreateShortcut($LinkPath)
    $sc.TargetPath       = $BrowserPath
    $sc.Arguments        = "--app=`"$FileUri`""
    $sc.WorkingDirectory = $AppDir
    if ($iconCreated -and (Test-Path $IconPath)) {
        $sc.IconLocation = $IconPath
    } else {
        $sc.IconLocation = $BrowserPath
    }
    $sc.Description = "내 일정 달력"
    $sc.Save()
    Write-Host "  생성됨: $LinkPath"
}

# --- 4) 바탕화면 + 시작 메뉴에 바로가기 추가 ---
$DesktopCandidates = @(
    [Environment]::GetFolderPath("Desktop"),
    (Join-Path $env:USERPROFILE "OneDrive\Desktop"),
    (Join-Path $env:USERPROFILE "Desktop")
) | Where-Object { Test-Path $_ } | Select-Object -Unique

foreach ($d in $DesktopCandidates) {
    New-AppShortcut (Join-Path $d "$AppName.lnk")
}

$StartMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
if (Test-Path $StartMenu) {
    New-AppShortcut (Join-Path $StartMenu "$AppName.lnk")
}

Write-Host ""
Write-Host "[완료] 바탕화면의 '$AppName' 아이콘을 더블클릭하면 앱 창으로 열립니다."
Write-Host "       (Chrome/Edge의 --app 모드라서 주소창 없이 깔끔하게 뜹니다.)"
