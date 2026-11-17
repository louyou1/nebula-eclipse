@echo off
setlocal

cd /d "%~dp0"

echo ========================================
echo       ECLIPSE - GENERATION NEBULA
echo ========================================
echo.

echo Generation de la distribution Nebula...
echo.
call npm.cmd run start -- generate distro

if errorlevel 1 (
    echo.
    echo [ERREUR] La generation Nebula a echoue.
    pause
    exit /b 1
)

echo.
echo [OK] La distribution est prete pour GitHub.
echo Publiez distribution.json, repo, servers et schemas dans nebula-eclipse.
echo.
pause
