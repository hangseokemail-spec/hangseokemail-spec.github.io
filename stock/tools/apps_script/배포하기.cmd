@echo off
rem Seoks Stock account store deploy - double-click this file
echo [%date% %time%] cmd start > "%~dp0cmd_log.txt"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=$null; $e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile('%~dp0deploy.ps1',[ref]$t,[ref]$e); if ($e) { $e | ForEach-Object { 'PARSE ERROR: ' + $_.ToString() } } else { 'parse ok' }; 'PS ' + $PSVersionTable.PSVersion; 'LanguageMode ' + $ExecutionContext.SessionState.LanguageMode; 'node ' + [bool](Get-Command node -ErrorAction SilentlyContinue)" >> "%~dp0cmd_log.txt" 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1"
echo [%date% %time%] powershell exit %errorlevel% >> "%~dp0cmd_log.txt"
echo.
pause
