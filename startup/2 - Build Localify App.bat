@echo off
setlocal
cd /d "%~dp0.."
set "ROOT=%CD%"
title Build Localify app
echo.
echo  Build Localify.exe
echo  ------------------
echo  Makes a real Localify.exe with the smiley icon, so Windows pins Localify
echo  (not "Electron") to your taskbar. Takes a few minutes; needs internet.
echo.
if not exist "node_modules\electron" goto notinstalled

call npm run pack
if errorlevel 1 goto fail
if not exist "dist\win-unpacked\Localify.exe" goto fail

echo.
echo  Creating shortcuts...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=New-Object -ComObject WScript.Shell; $exe='%ROOT%\dist\win-unpacked\Localify.exe'; foreach($d in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'))){ $l=$s.CreateShortcut((Join-Path $d 'Localify.lnk')); $l.TargetPath=$exe; $l.WorkingDirectory=(Split-Path $exe); $l.IconLocation=($exe + ',0'); $l.Description='Localify music player'; $l.Save() }"
echo.
echo  Done! Localify.exe is in:
echo    %ROOT%\dist\win-unpacked
echo.
echo  To pin it: unpin any old "Electron" icon first, then right-click the new
echo  Localify icon on your Desktop and choose Pin to taskbar.
echo  Keep the dist folder where it is - the app runs from there.
echo.
set /p RUN= Start Localify now? [Y/N]: 
if /i "%RUN%"=="Y" start "" "%ROOT%\dist\win-unpacked\Localify.exe"
exit /b 0

:notinstalled
echo  Localify is not installed yet. Run "startup\1 - Install Localify.bat" first.
pause
exit /b 1

:fail
echo.
echo  The build did not finish. If you see "Cannot create symbolic link" above,
echo  turn on Developer Mode (Settings, Update and Security, For developers)
echo  or run this file as Administrator, then try again.
pause
exit /b 1
