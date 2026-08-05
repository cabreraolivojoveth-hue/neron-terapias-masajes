@echo off
chcp 65001 >nul
title Terminar de subir Terapias

set BASE=C:\Users\cabre\OneDrive\Documentos\GitHub\base-neronprogramas
set PROD=C:\Users\cabre\OneDrive\Documentos\GitHub\neron-terapias-masajes

echo.
echo   ===============================================
echo    TERMINANDO DE SUBIR
echo   ===============================================
echo.
echo   La base ya quedo en GitHub con la etiqueta v1.0.3.
echo   Falta Terapias: se colgo antes de mandar el commit.
echo.

rem ------------------------------------------------------------------
rem POR QUE SE COLGO, PARA QUE NO VUELVA A PASAR.
rem
rem Git hace una limpieza automatica de archivos temporales despues de
rem trabajar. Estas carpetas viven dentro de OneDrive, y OneDrive tiene
rem los archivos agarrados mientras los sincroniza: git no puede borrar
rem lo que otro programa esta usando, y se queda preguntando "lo intento
rem otra vez? (y/n)" hasta que alguien conteste.
rem
rem Apagar esa limpieza no le quita nada al repositorio. Solo deja que
rem se acumulen archivos sueltos que no estorban.
rem ------------------------------------------------------------------
git -C "%BASE%" config gc.auto 0
git -C "%PROD%" config gc.auto 0

echo   --- Subiendo Terapias ---
echo.
git -C "%PROD%" add -A
git -C "%PROD%" commit -m "El dueno ya puede entrar: segundo factor apagado hasta que llegue Configuracion"
git -C "%PROD%" push origin main

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
echo   Los dos de arriba tienen que ser el MISMO codigo.
echo.
echo   Si coinciden, Vercel arranca solo un despliegue nuevo.
echo   NO le des Redeploy a uno viejo: Redeploy vuelve a
echo   compilar el MISMO commit de siempre.
echo   -----------------------------------------------
echo.
pause
