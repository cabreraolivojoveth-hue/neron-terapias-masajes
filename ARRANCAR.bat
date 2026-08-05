@echo off
chcp 65001 >nul
title Neron Terapias

rem La ruta va fija a proposito: asi este archivo funciona igual si se queda
rem en el proyecto o si se copia al Escritorio.
set PROYECTO=C:\Users\cabre\OneDrive\Documentos\GitHub\neron-terapias-masajes

echo.
echo   ===============================================
echo    NERON TERAPIAS - Centro Holistico
echo   ===============================================
echo.

if not exist "%PROYECTO%\package.json" goto sinproyecto
cd /d "%PROYECTO%"

if exist "node_modules" goto arrancar

echo   Primera vez: instalando. Esto tarda unos minutos.
echo   No cierres esta ventana.
echo.
call npm.cmd install
if errorlevel 1 goto error

:arrancar
echo.
echo   Listo. Abre esta direccion en Chrome:
echo.
echo       http://localhost:5173
echo.
echo   Para detenerlo, cierra esta ventana.
echo.
call npm.cmd run dev
goto fin

:sinproyecto
echo   No encuentro el proyecto en:
echo   %PROYECTO%
echo.
echo   Manda una captura de esta ventana.
goto fin

:error
echo.
echo   ===============================================
echo    ALGO FALLO EN LA INSTALACION
echo   ===============================================
echo.
echo   Manda una captura de esta ventana.
echo.

:fin
pause
