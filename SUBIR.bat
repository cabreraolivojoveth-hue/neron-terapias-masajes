@echo off
chcp 65001 >nul
title Subir a GitHub

set BASE=C:\Users\cabre\OneDrive\Documentos\GitHub\base-neronprogramas
set PROD=C:\Users\cabre\OneDrive\Documentos\GitHub\neron-terapias-masajes

echo.
echo   ===============================================
echo    SUBIENDO A GITHUB
echo   ===============================================

echo.
echo   --- 1. LA BASE ---
echo.
git -C "%BASE%" add -A
git -C "%BASE%" commit -m "v1.0.2: arreglo del bloqueo mutuo de sesion"
git -C "%BASE%" tag v1.0.2
git -C "%BASE%" push origin main --tags

echo.
echo   --- 2. TERAPIAS ---
echo.
rem El candado guardaba ssh:// y la version vieja. Se quita para que npm lo
rem vuelva a generar desde el package.json corregido.
git -C "%PROD%" rm --cached package-lock.json
git -C "%PROD%" add -A
git -C "%PROD%" commit -m "Listo para Vercel: dependencia por https y sin candado viejo"
git -C "%PROD%" push origin main

echo.
echo   ===============================================
echo    ASI QUEDO
echo   ===============================================
echo.
echo   BASE, ultimo commit:
git -C "%BASE%" log -1 --oneline
echo.
echo   BASE, etiquetas en GitHub:
git -C "%BASE%" ls-remote --tags origin
echo.
echo   TERAPIAS, ultimo commit LOCAL:
git -C "%PROD%" log -1 --oneline
echo.
echo   TERAPIAS, ultimo commit EN GITHUB:
git -C "%PROD%" ls-remote origin main
echo.
echo   -----------------------------------------------
echo   Los dos ultimos tienen que coincidir.
echo   Si coinciden, ve a Vercel y dale Redeploy.
echo   -----------------------------------------------
echo.
pause
