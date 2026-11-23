@echo off
setlocal
cd /d "%~dp0"
title Install Localify
echo.
echo  Installing Localify
echo  -------------------

where node >nul 2>nul
if errorlevel 1 goto nonode
for /f %%v in ('node -v') do set NODEV=%%v
for /f "tokens=1 delims=." %%a in ("%NODEV:v=%") do set MAJOR=%%a
if %MAJOR% LSS 20 goto oldnode
echo  Found Node.js %NODEV%
echo.
echo  Downloading components. This needs internet and takes a minute or two...
echo.
call npm install
if errorlevel 1 goto npmfail

echo.
echo  Creating shortcuts...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=New-Object -ComObject WScript.Shell; foreach($d in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'))){ $l=$s.CreateShortcut((Join-Path $d 'Localify.lnk')); $l.TargetPath='%~dp0Start Localify.bat'; $l.WorkingDirectory='%~dp0'; $l.IconLocation='%~dp0assets\icon.ico'; $l.WindowStyle=7; $l.Description='Localify music player'; $l.Save() }"
if errorlevel 1 (
  echo  Could not create shortcuts. You can still use "Start Localify.bat".
) else (
  echo  Added a Localify icon to your Desktop and Start menu.
)
echo.
echo  Done! Localify is installed.
echo.
set /p RUN= Start Localify now? [Y/N]: 
if /i "%RUN%"=="Y" start "" /min cmd /c "npm start"
exit /b 0

:nonode
echo.
echo  Node.js is not installed. It is free and needed to run Localify.
echo  Opening the download page. Install the "LTS" version with the default
echo  options, then run this file again.
start "" https://nodejs.org
pause
exit /b 1

:oldnode
echo.
echo  Your Node.js is %NODEV%, but Localify needs version 20 or newer.
echo  Opening the download page. Install the "LTS" version, then run this file again.
start "" https://nodejs.org
pause
exit /b 1

:npmfail
echo.
echo  The install did not finish. Check your internet connection and try again.
echo  See "If something goes wrong" in GETTING_STARTED.md for help.
pause
exit /b 1
