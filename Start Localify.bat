@echo off
cd /d "%~dp0"
if not exist "node_modules\electron" (
  echo Localify is not installed yet. Run "startup\1 - Install Localify.bat" first.
  pause
  exit /b 1
)
start "" /min cmd /c "npm start"
