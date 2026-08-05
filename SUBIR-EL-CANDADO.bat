@echo off
chcp 65001 >nul
title Subir el candado corregido

set PROD=C:\Users\cabre\OneDrive\Documentos\GitHub\neron-terapias-masajes

echo.
echo   ===============================================
echo    SUBIENDO EL CANDADO CORREGIDO
echo   ===============================================
echo.
echo   El package-lock.json que estaba en GitHub apuntaba a la
echo   base v1.0.1. npm le hace caso AL CANDADO, no al package.json:
echo   habria compilado la version vieja sin fallar ni avisar.
echo.
echo   Este candado nuevo apunta a v1.0.3, que es la correcta.
echo   Y va una guardia que compara los dos de aqui en adelante.
echo.

git -C "%PROD%" config gc.auto 0

git -C "%PROD%" add -A
git -C "%PROD%" commit -m "Candado apuntando a la base v1.0.3, y guardia que lo compara con el package.json"
git -C "%PROD%" push origin main

echo.
echo   ===============================================
echo    ASI QUEDO
echo   ===============================================
echo.
echo   Ultimo commit LOCAL:
git -C "%PROD%" log -1 --oneline
echo.
echo   Ultimo commit EN GITHUB:
git -C "%PROD%" ls-remote origin main
echo.
echo   -----------------------------------------------
echo   Tienen que ser el mismo codigo.
echo.
echo   Este push dispara un despliegue NUEVO en Vercel.
echo   Ese es el bueno. Espera a que termine y entra al sitio.
echo   -----------------------------------------------
echo.
pause
