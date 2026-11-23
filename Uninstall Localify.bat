@echo off
setlocal
cd /d "%~dp0"
title Uninstall Localify
echo.
echo  Uninstall Localify
echo  ------------------
echo  This removes the Localify desktop and Start menu icons and the downloaded
echo  components (node_modules) and the built Localify.exe (dist). Your music files are never touched.
echo.

tasklist /fi "imagename eq electron.exe" 2>nul | find /i "electron.exe" >nul
if not errorlevel 1 goto running
tasklist /fi "imagename eq Localify.exe" 2>nul | find /i "Localify.exe" >nul
if not errorlevel 1 goto running

set /p GO= Continue? [Y/N]: 
if /i not "%GO%"=="Y" exit /b 0

echo.
echo  Removing shortcuts...
powershell -NoProfile -ExecutionPolicy Bypass -Command "foreach($d in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'))){ Remove-Item -LiteralPath (Join-Path $d 'Localify.lnk') -ErrorAction SilentlyContinue }"

echo  Removing downloaded components...
if exist node_modules rmdir /s /q node_modules
if exist dist rmdir /s /q dist

echo.
echo  Your library, playlists and playlist cover images are saved in:
echo    %APPDATA%\Localify
set /p DATA= Delete them too? This cannot be undone. [Y/N]: 
if /i "%DATA%"=="Y" goto deldata
echo  Kept your library and playlists. Installing again later will bring them back.
goto finish

:deldata
if exist "%APPDATA%\Localify" rmdir /s /q "%APPDATA%\Localify"
echo  Deleted your Localify library, playlists and covers.

:finish
echo.
echo  Localify is uninstalled. To remove the rest, delete this folder:
echo    %~dp0
pause
exit /b 0

:running
echo  Localify seems to be running. Please close it and run this file again.
pause
exit /b 1
