@echo off
chcp 65001 >nul
title Abrir la puerta del segundo paso

set BASE=C:\Users\cabre\OneDrive\Documentos\GitHub\base-neronprogramas
set PROD=C:\Users\cabre\OneDrive\Documentos\GitHub\neron-terapias-masajes

echo.
echo   ===============================================
echo    ABRIENDO LA PUERTA
echo   ===============================================
echo.
echo   La base sube a v1.0.3 y Terapias apunta a esa version.
echo   El orden importa: primero la etiqueta, luego Terapias.
echo   Si Terapias subiera antes, Vercel buscaria una version
echo   que todavia no existe en GitHub y fallaria.
echo.

echo   --- 1. LA BASE, v1.0.3 ---
echo.
git -C "%BASE%" add -A
git -C "%BASE%" commit -m "v1.0.3: se puede apagar el segundo factor cuando el producto aun no tiene pantalla para darlo de alta"
git -C "%BASE%" tag v1.0.3
git -C "%BASE%" push origin main --tags

echo.
echo   --- 2. TERAPIAS ---
echo.
git -C "%PROD%" add -A
git -C "%PROD%" commit -m "El dueno ya puede entrar: segundo factor apagado hasta que llegue Configuracion"
git -C "%PROD%" push origin main

echo.
echo   ===============================================
echo    ASI QUEDO
echo   ===============================================
echo.
echo   BASE, etiquetas que YA ESTAN en GitHub:
git -C "%BASE%" ls-remote --tags origin
echo.
echo   TERAPIAS, ultimo commit LOCAL:
git -C "%PROD%" log -1 --oneline
echo.
echo   TERAPIAS, ultimo commit EN GITHUB:
git -C "%PROD%" ls-remote origin main
echo.
echo   -----------------------------------------------
echo   Arriba tiene que aparecer v1.0.3.
echo   Y los dos ultimos commits tienen que coincidir.
echo.
echo   Cuando coincidan, Vercel arranca solo un despliegue
echo   nuevo. NO le des Redeploy a uno viejo: Redeploy vuelve
echo   a compilar el MISMO commit de siempre.
echo   -----------------------------------------------
echo.
pause
