$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Web

$root       = $PSScriptRoot
$port       = 8765
$eventsPath = Join-Path $root 'events.json'

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
try {
    $listener.Start()
} catch {
    exit 1
}

$mimeMap = @{
    '.html'  = 'text/html; charset=utf-8'
    '.htm'   = 'text/html; charset=utf-8'
    '.css'   = 'text/css; charset=utf-8'
    '.js'    = 'application/javascript; charset=utf-8'
    '.json'  = 'application/json; charset=utf-8'
    '.png'   = 'image/png'
    '.jpg'   = 'image/jpeg'
    '.jpeg'  = 'image/jpeg'
    '.gif'   = 'image/gif'
    '.svg'   = 'image/svg+xml'
    '.ico'   = 'image/x-icon'
    '.woff'  = 'font/woff'
    '.woff2' = 'font/woff2'
    '.ttf'   = 'font/ttf'
    '.txt'   = 'text/plain; charset=utf-8'
}

$rootFull = [System.IO.Path]::GetFullPath($root)

function Send-Http {
    param(
        [System.IO.Stream]$Stream,
        [int]$Code,
        [string]$ContentType,
        [byte[]]$Body
    )
    $reason = switch ($Code) {
        200 { 'OK' }
        400 { 'Bad Request' }
        404 { 'Not Found' }
        405 { 'Method Not Allowed' }
        default { 'OK' }
    }
    $hdr = "HTTP/1.1 $Code $reason`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
    $hb = [System.Text.Encoding]::ASCII.GetBytes($hdr)
    $Stream.Write($hb, 0, $hb.Length)
    if ($Body.Length -gt 0) {
        $Stream.Write($Body, 0, $Body.Length)
    }
}

while ($true) {
    $client = $null
    try {
        $client = $listener.AcceptTcpClient()
        $stream = $client.GetStream()
        $stream.ReadTimeout = 5000

        $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8, $false, 1024, $true)
        $requestLine = $reader.ReadLine()
        if ([string]::IsNullOrEmpty($requestLine)) { $client.Close(); continue }

        $parts = $requestLine -split ' '
        if ($parts.Length -lt 3) { $client.Close(); continue }
        $method = $parts[0].ToUpper()
        $rawPath = $parts[1]
        if ($rawPath.Contains('?')) { $rawPath = $rawPath.Split('?')[0] }
        $path = [System.Web.HttpUtility]::UrlDecode($rawPath.TrimStart('/'))

        $headers = @{}
        while ($true) {
            $line = $reader.ReadLine()
            if ([string]::IsNullOrEmpty($line)) { break }
            $kv = $line -split ':', 2
            if ($kv.Length -eq 2) { $headers[$kv[0].Trim().ToLower()] = $kv[1].Trim() }
        }

        if ($method -eq 'POST' -and $path -eq 'events') {
            $cl = 0
            if ($headers.ContainsKey('content-length')) { $cl = [int]$headers['content-length'] }
            if ($cl -le 0) {
                Send-Http -Stream $stream -Code 400 -ContentType 'text/plain; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes('No body'))
            } else {
                $buf = New-Object char[] $cl
                $total = 0
                while ($total -lt $cl) {
                    $r = $reader.Read($buf, $total, $cl - $total)
                    if ($r -le 0) { break }
                    $total += $r
                }
                $body = -join $buf[0..($total - 1)]
                $valid = $false
                try { $null = ConvertFrom-Json $body; $valid = $true } catch {}
                if ($valid) {
                    $utf8 = New-Object System.Text.UTF8Encoding($false)
                    [System.IO.File]::WriteAllText($eventsPath, $body, $utf8)
                    Send-Http -Stream $stream -Code 200 -ContentType 'application/json' -Body ([System.Text.Encoding]::UTF8.GetBytes('{"ok":true}'))
                } else {
                    Send-Http -Stream $stream -Code 400 -ContentType 'text/plain; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes('Bad JSON'))
                }
            }
        }
        elseif ($method -eq 'GET' -and $path -eq 'events') {
            if (Test-Path $eventsPath) {
                $bytes = [System.IO.File]::ReadAllBytes($eventsPath)
                Send-Http -Stream $stream -Code 200 -ContentType 'application/json; charset=utf-8' -Body $bytes
            } else {
                Send-Http -Stream $stream -Code 200 -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes('{}'))
            }
        }
        elseif ($method -eq 'GET') {
            if ([string]::IsNullOrEmpty($path)) { $path = 'calendar.html' }
            $file = Join-Path $root $path
            $resolved = $null
            try { $resolved = [System.IO.Path]::GetFullPath($file) } catch {}

            if ($resolved -and $resolved.StartsWith($rootFull) -and (Test-Path $resolved -PathType Leaf)) {
                $bytes = [IO.File]::ReadAllBytes($resolved)
                $ext = [IO.Path]::GetExtension($resolved).ToLower()
                $mime = if ($mimeMap.ContainsKey($ext)) { $mimeMap[$ext] } else { 'application/octet-stream' }
                Send-Http -Stream $stream -Code 200 -ContentType $mime -Body $bytes
            } else {
                Send-Http -Stream $stream -Code 404 -ContentType 'text/plain; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes('404 Not Found'))
            }
        }
        else {
            Send-Http -Stream $stream -Code 405 -ContentType 'text/plain; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes('Method Not Allowed'))
        }

        $stream.Flush()
        $client.Close()
    } catch {
        if ($client) { try { $client.Close() } catch {} }
    }
}
