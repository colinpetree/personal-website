@echo off
REM Dev-convenience only — never attempts to cross-compile the ARM binary on
REM Windows (PyInstaller can't cross-compile). Triggers a `git pull` + build
REM on the Pi over SSH. Only builds what's actually committed and pushed to
REM GitHub — the Pi clones/pulls the repo itself (build-on-pi.sh), it does
REM not receive a copy of your local working tree.
REM
REM First-time setup on the Pi (once, by hand):
REM   mkdir -p ~/src
REM   git clone git@github.com:<owner>/<repo>.git ~/src/personal-website
REM
REM Usage:
REM   set PI_HOST=pi@raspberrypi.local
REM   deploy-to-pi.bat            git pull + build on the Pi
REM   deploy-to-pi.bat local-test builds a throwaway Windows binary locally,
REM                                just to sanity-check the .spec file faster
REM                                than waiting on the Pi. Useless for prod.

setlocal enabledelayedexpansion

if "%PI_HOST%"=="" (
    echo Set PI_HOST to user@host before running this script, e.g.:
    echo   set PI_HOST=pi@raspberrypi.local
    exit /b 1
)

set SCRIPT_DIR=%~dp0
set REPO_ROOT=%SCRIPT_DIR%..\..
for /f "usebackq delims=" %%v in ("%REPO_ROOT%\VERSION") do set VERSION=%%v

if "%1"=="local-test" goto local_test

echo Reminder: this builds whatever is committed AND PUSHED to GitHub —
echo uncommitted local changes will not be included. Push first if needed.
echo.
echo Triggering git pull + build on %PI_HOST% ...

ssh %PI_HOST% "cd ~/src/personal-website && bash deploy/scripts/build-on-pi.sh"
if errorlevel 1 (
    echo Remote build failed.
    exit /b 1
)

echo.
echo Build finished on the Pi. Tarball is at:
echo   ~/personal-website-build/release-staging/personal-website-v%VERSION%.tar.gz
echo.
echo Next: run publish-release.sh ON THE PI to publish it as a GitHub Release
echo   ^(gh auth lives there, per the deploy plan^):
echo   ssh %PI_HOST% "cd ~/src/personal-website && bash deploy/scripts/publish-release.sh --releases-repo <owner>/<repo>"
goto :eof

:local_test
echo Running a LOCAL Windows-only PyInstaller build for a quick sanity check.
echo NOTE: gunicorn is POSIX-only (imports fcntl) and cannot run at all on
echo Windows, so the resulting server.exe cannot actually boot and serve
echo requests here — this only verifies that PyInstaller successfully
echo collects every package listed in pyinstaller.spec (catches a missing
echo --collect-all/hidden-import before waiting on the slower Pi build).
echo Real boot verification only ever happens on the Pi.
pushd "%REPO_ROOT%\backend"
if not exist .build-venv-windows-test (
    python -m venv .build-venv-windows-test
)
call .build-venv-windows-test\Scripts\activate.bat
pip install -r requirements.txt pyinstaller
pyinstaller pyinstaller.spec --distpath dist-windows-test --workpath build-windows-test --noconfirm
if errorlevel 1 (
    echo PyInstaller build failed — fix before pushing to the Pi.
) else (
    echo Build succeeded. Checking dependency imports ^(gunicorn.app.base is
    echo expected to fail here — see note above^):
    dist-windows-test\server\server.exe --check-imports
)
popd
goto :eof
