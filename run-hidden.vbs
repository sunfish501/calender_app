' 사용법: wscript.exe run-hidden.vbs <스크립트이름.ps1>
' 작업 스케줄러에서 powershell.exe 직접 호출 시 창 깜빡임이 발생하는 문제 해결용 래퍼
If WScript.Arguments.Count < 1 Then
    WScript.Quit 1
End If

Dim scriptName, scriptDir, fullPath
scriptName = WScript.Arguments(0)
scriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
fullPath = scriptDir & scriptName

Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & fullPath & """", 0, False
