Set WshShell = CreateObject("WScript.Shell")
Dim ScriptDir
ScriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
WshShell.Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & ScriptDir & "launch.ps1""", 0, False
