---
name: feedback-powershell-argumentlist
description: PowerShell Start-Process -ArgumentList with array splits values containing spaces — quote each value or pass as a single string
metadata:
  type: feedback
---

When using `Start-Process -ArgumentList @("--flag=C:\path with spaces\thing", ...)`, PowerShell splits each array element on whitespace before passing it to the target process. The flag arrives as multiple separate arguments and the receiving program sees only the truncated prefix.

**Why:** This exact bug created a stray `C:\Users\euiky\OneDrive\Desktop\역사에` Chrome profile folder because `--user-data-dir=...\역사에 남을 그 폴더\chrome-profile` was split at the spaces and Chrome only got `...\역사에` as the user-data-dir value.

**How to apply:**
- For each element containing spaces, wrap the *value* in embedded quotes: `'--user-data-dir="C:\path with spaces\thing"'` (the whole element as a single string with quoted value inside).
- Or pass `-ArgumentList` as a single string with all flags pre-quoted, matching what a `.lnk` shortcut stores.
- Verify by checking the receiving program's actual side effects (e.g., did Chrome create the profile at the intended path?), not just by reading the PowerShell command.
- This is separate from [[feedback-powershell-encoding]] (file encoding issue) — this one is argument parsing.
