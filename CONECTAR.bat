@echo off
chcp 65001 >nul
title Conectar Neron Terapias con Supabase

set PROYECTO=C:\Users\cabre\OneDrive\Documentos\GitHub\neron-terapias-masajes

echo.
echo   ===============================================
echo    CONECTAR CON SUPABASE
echo   ===============================================
echo.

if not exist "%PROYECTO%\package.json" (
  echo   No encuentro el proyecto en:
  echo   %PROYECTO%
  echo.
  pause
  exit /b
)

echo   Necesitas dos datos de tu proyecto de Supabase.
echo   Estan en:   Settings  -^>  API
echo.
echo   Ten esa pagina abierta antes de seguir.
echo.
pause

echo.
echo   -----------------------------------------------
echo    1 de 2:  Project URL
echo    Se ve asi:   https://abcdefgh.supabase.co
echo.
echo    Si solo pegas   abcdefgh.supabase.co   tambien sirve.
echo   -----------------------------------------------
echo.
echo   Pegala y dale Enter:
rem El aviso va en su propia linea y el set /p se deja PELADO. Con el texto
rem pegado al set /p, la consola de Windows se come la primera letra de lo
rem que se pega — y quedo guardado "ttps://" en vez de "https://".
set "URL="
set /p URL=

echo.
echo   -----------------------------------------------
echo    2 de 2:  la llave PUBLICA
echo.
echo    En Supabase se llama  Publishable key
echo    y empieza con   sb_publishable_...
echo.
echo    NO la de  sb_secret_  -- esa es secreta.
echo   -----------------------------------------------
echo.
echo   Pegala y dale Enter:
set "LLAVE="
set /p LLAVE=

echo.
if not defined URL   goto falta
if not defined LLAVE goto falta

rem El archivo se escribe AQUI, en tu maquina. .gitignore ya lo deja fuera del
rem repositorio, asi que no se sube ni por accidente.
(
  echo VITE_SUPABASE_URL=%URL%
  echo VITE_SUPABASE_ANON_KEY=%LLAVE%
) > "%PROYECTO%\.env"

if not exist "%PROYECTO%\.env" goto nosepudo

echo   ===============================================
echo    LISTO - se guardo el archivo .env
echo   ===============================================
echo.
echo   Esto quedo guardado:
echo.
type "%PROYECTO%\.env"
echo.
echo   -----------------------------------------------
echo   AHORA:
echo     1. Cierra la ventana negra de ARRANCAR.bat
echo     2. Doble clic otra vez en ARRANCAR.bat
echo   -----------------------------------------------
echo.
pause
exit /b

:falta
echo   ===============================================
echo    FALTO UN DATO - no se guardo nada
echo   ===============================================
echo.
echo   Vuelve a correr este archivo y pega los dos.
echo.
pause
exit /b

:nosepudo
echo   ===============================================
echo    NO SE PUDO ESCRIBIR EL ARCHIVO
echo   ===============================================
echo.
echo   Puede ser OneDrive bloqueando la carpeta.
echo   Manda una captura de esta ventana.
echo.
pause
