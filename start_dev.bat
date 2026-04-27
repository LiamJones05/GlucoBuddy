@echo off
cd /d %~dp0
powershell -WindowStyle Minimized -ExecutionPolicy Bypass -File "%~dp0start_dev.ps1"
pause