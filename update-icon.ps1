$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Drawing

$root     = $PSScriptRoot
$iconPath = Join-Path $root 'calendar.ico'
$now      = Get-Date
$day      = $now.Day
$month    = $now.Month
$dayStr   = "$day"

function New-DayBitmap {
    param([int]$Size, [int]$Day, [int]$Month)

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # 배경
    $bgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 250, 250, 252))
    $g.FillRectangle($bgBrush, 0, 0, $Size, $Size)

    # 빨간 헤더 (크기에 비례)
    $headerH = [int]($Size * 0.28)
    $headerBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 220, 60, 60))
    $g.FillRectangle($headerBrush, 0, 0, $Size, $headerH)

    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment     = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $sf.FormatFlags   = [System.Drawing.StringFormatFlags]::NoWrap

    # 월 텍스트 (작게는 생략)
    if ($Size -ge 32) {
        $monthFontSize = [single]($Size * 0.12)
        $monthFont = New-Object System.Drawing.Font('Segoe UI', $monthFontSize, [System.Drawing.FontStyle]::Bold)
        $whiteBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
        $monthArgs = @([single]0, [single]0, [single]$Size, [single]$headerH)
        $monthRect = New-Object System.Drawing.RectangleF -ArgumentList $monthArgs
        $g.DrawString("$Month" + [char]0xC6D4, $monthFont, $whiteBrush, $monthRect, $sf)
        $monthFont.Dispose()
    }

    # 가운데 날짜 숫자 — 자릿수에 따라 폰트 크기 동적
    $dayText = "$Day"
    $widthRatio = if ($dayText.Length -ge 2) { 0.55 } else { 0.75 }
    $dayFontSize = [single]($Size * $widthRatio)
    $dayFont = New-Object System.Drawing.Font('Segoe UI', $dayFontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $dayBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 40, 40, 50))
    $dayY = [single]$headerH
    $dayH = [single]($Size - $headerH)
    $dayArgs = @([single]0, $dayY, [single]$Size, $dayH)
    $dayRect = New-Object System.Drawing.RectangleF -ArgumentList $dayArgs
    $g.DrawString($dayText, $dayFont, $dayBrush, $dayRect, $sf)
    $dayFont.Dispose()

    # 테두리
    if ($Size -ge 32) {
        $penWidth = [single]([Math]::Max(1, $Size / 64))
        $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 200, 200, 210)), $penWidth
        $borderInset = [int]($penWidth / 2 + 1)
        $borderSize = $Size - 2 * $borderInset
        $g.DrawRectangle($pen, $borderInset, $borderInset, $borderSize, $borderSize)
        $pen.Dispose()
    }

    $g.Dispose()
    return $bmp
}

# 멀티 해상도 ICO 직접 작성 (16, 32, 48, 64, 128, 256)
$sizes = @(16, 32, 48, 64, 128, 256)
$pngStreams = @()

foreach ($s in $sizes) {
    $bmp = New-DayBitmap -Size $s -Day $day -Month $month
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngStreams += [PSCustomObject]@{ Size = $s; Bytes = $ms.ToArray() }
    $ms.Close()
    $bmp.Dispose()
}

# ICO 헤더 + 디렉토리 엔트리 + PNG 데이터
$fs = [System.IO.File]::Create($iconPath)
$bw = New-Object System.IO.BinaryWriter($fs)

$bw.Write([UInt16]0)                      # Reserved
$bw.Write([UInt16]1)                      # Type: ICO
$bw.Write([UInt16]$pngStreams.Count)      # 이미지 개수

# 디렉토리 엔트리 크기 = 16바이트
$headerSize = 6 + 16 * $pngStreams.Count
$offset = $headerSize

foreach ($p in $pngStreams) {
    $sb = if ($p.Size -ge 256) { 0 } else { $p.Size }
    $bw.Write([byte]$sb)                  # Width (0 = 256)
    $bw.Write([byte]$sb)                  # Height
    $bw.Write([byte]0)                    # Palette
    $bw.Write([byte]0)                    # Reserved
    $bw.Write([UInt16]1)                  # Color planes
    $bw.Write([UInt16]32)                 # Bits per pixel
    $bw.Write([UInt32]$p.Bytes.Length)    # Image size
    $bw.Write([UInt32]$offset)            # Offset
    $offset += $p.Bytes.Length
}

foreach ($p in $pngStreams) {
    $bw.Write($p.Bytes)
}

$bw.Close()
$fs.Close()

# 모든 바로가기 IconLocation 재지정 → mtime 갱신
$shortcuts = @(
    'C:\Users\euiky\OneDrive\Desktop\달력.lnk',
    'C:\Users\euiky\Desktop\달력.lnk',
    (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\달력.lnk')
)
$WshShell = New-Object -ComObject WScript.Shell
foreach ($lnk in $shortcuts) {
    if (Test-Path $lnk) {
        try {
            $sc = $WshShell.CreateShortcut($lnk)
            $sc.IconLocation = $iconPath
            $sc.Save()
        } catch {}
    }
}

# 캐시 새로고침
try { Start-Process 'ie4uinit.exe' -ArgumentList '-show' -WindowStyle Hidden -ErrorAction SilentlyContinue } catch {}

try {
    $sig = @'
[System.Runtime.InteropServices.DllImport("shell32.dll")]
public static extern void SHChangeNotify(uint wEventId, uint uFlags, System.IntPtr dwItem1, System.IntPtr dwItem2);
'@
    $shell32 = Add-Type -MemberDefinition $sig -Name 'CalIcoShell32' -Namespace 'CalIcoNs' -PassThru -ErrorAction Stop
    $shell32::SHChangeNotify(0x08000000, 0x0000, [System.IntPtr]::Zero, [System.IntPtr]::Zero)
} catch {}
