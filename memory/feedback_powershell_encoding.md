---
name: feedback-powershell-encoding
description: PowerShell 5.1 on this Windows 11 system reads UTF-8 scripts without BOM as ANSI/CP949 — Korean characters get mangled
metadata:
  type: feedback
---

When writing `.ps1` scripts containing Korean (or any non-ASCII) on this user's machine, the Write tool produces UTF-8 without BOM. PowerShell 5.1 (`powershell.exe`) then reads them as ANSI/CP949 and Korean strings end up as `?쇀?` etc., causing things like `[System.IO.File]::Open` to throw "Illegal characters in path" or WScript.Shell to fail to save shortcuts.

**Why:** Confirmed in this session — `install-app.ps1` failed twice with mangled Korean paths until re-saved with UTF-8 BOM.

**How to apply:**
- After creating any `.ps1` containing non-ASCII via Write tool, immediately re-encode to UTF-8 with BOM before invoking:
  ```powershell
  $c = [System.IO.File]::ReadAllText($path, [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::WriteAllText($path, $c, [System.Text.UTF8Encoding]::new($true))
  ```
- Or prefer using PowerShell 7+ (`pwsh`) which defaults to UTF-8.
- Also: PowerShell 5.1's `New-Object` has flaky constructor overload resolution for `System.Drawing.Pen(Color, float)` — pass a `SolidBrush` instead, or use `[Type]::new()` accelerator syntax instead of `New-Object`.
