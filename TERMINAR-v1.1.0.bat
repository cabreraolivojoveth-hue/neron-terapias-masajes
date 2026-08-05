@echo off
chcp 65001 >nul
title Terapias sobre la base v1.1.0

set PROD=C:\Users\cabre\OneDrive\Documentos\GitHub\neron-terapias-masajes

rem  ---------------------------------------------------------------
rem  La base v1.1.0 YA ESTA EN GITHUB con su etiqueta. Falta solo que
rem  Terapias la baje de verdad y se pruebe.
rem
rem  POR QUE SE BORRA EL CANDADO: el intento anterior instalo la base VIEJA
rem  aunque el package.json ya pedia #v1.1.0. El package-lock.json guardaba
rem  el commit de v1.0.3 y npm lo dio por bueno sin volver a preguntarle a
rem  GitHub. Borrar el candado y la copia instalada lo obliga a resolver la
rem  etiqueta nueva. Es el mismo tropiezo del candado con ssh:// de antes.
rem  ---------------------------------------------------------------

echo.
echo   ===============================================
echo    1 de 3  ·  BAJAR LA BASE NUEVA, DE VERDAD
echo   ===============================================
echo.
pushd "%PROD%"
if exist package-lock.json del /q package-lock.json
if exist node_modules\@neron rmdir /s /q node_modules\@neron
call npm.cmd install
if errorlevel 1 goto :rojo

echo.
echo   Version de la base que quedo instalada:
call npm.cmd ls @neron/base
echo.

echo   ===============================================
echo    2 de 3  ·  LA BATERIA DE TERAPIAS
echo   ===============================================
echo.
call npm.cmd run consistencia
if errorlevel 1 goto :rojo
popd

echo.
echo   ===============================================
echo    3 de 3  ·  SUBIR TERAPIAS
echo   ===============================================
echo.
git -C "%PROD%" add -A
git -C "%PROD%" commit -m "La duena ve su menu completo: se le declaran al portero las capacidades de Terapias"
git -C "%PROD%" push origin main
if errorlevel 1 goto :rojo

echo.
echo   ===============================================
echo    ASI QUEDO
echo   ===============================================
echo.
echo   TERAPIAS, ultimo commit LOCAL:
git -C "%PROD%" log -1 --oneline
echo.
echo   TERAPIAS, ultimo commit EN GITHUB:
git -C "%PROD%" ls-remote origin main
echo.
echo   -----------------------------------------------
echo   Los dos tienen que coincidir.
echo   El push dispara solo un despliegue nuevo en Vercel.
echo   NO le des Redeploy a uno viejo.
echo   -----------------------------------------------
echo.
pause
exit /b 0

:rojo
popd
echo.
echo   ===============================================
echo    SE PARO AQUI. NO SE SUBIO NADA.
echo   ===============================================
echo.
echo   Copiame lo que dice arriba, completo, y lo vemos.
echo.
pause
exit /b 1
