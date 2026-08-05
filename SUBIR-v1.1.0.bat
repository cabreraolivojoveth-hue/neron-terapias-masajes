@echo off
chcp 65001 >nul
title Base v1.1.0 y Terapias — la dueña ve su menú

set BASE=C:\Users\cabre\OneDrive\Documentos\GitHub\base-neronprogramas
set PROD=C:\Users\cabre\OneDrive\Documentos\GitHub\neron-terapias-masajes

rem  ---------------------------------------------------------------
rem  EL ORDEN NO ES CAPRICHO Y NO SE PUEDE SALTAR NINGUN PASO.
rem
rem  Terapias pide la base por ETIQUETA (#v1.1.0). Esa etiqueta tiene que
rem  existir en GitHub ANTES de que npm intente bajarla, o la instalacion
rem  falla diciendo que no encuentra la version. Por eso primero se sube la
rem  base con su etiqueta y hasta despues se toca el producto.
rem
rem  Y las baterias van ANTES de cada push: verde o no se publica.
rem  ---------------------------------------------------------------

echo.
echo   ===============================================
echo    1 de 4  ·  BATERIA DE LA BASE
echo   ===============================================
echo.
pushd "%BASE%"
rem  npm install primero: la carpeta node_modules de la base estaba incompleta
rem  —le faltaban los tipos de React— y tsc tiraba 343 errores de JSX que no
rem  tienen nada que ver con el codigo. Instalar antes de probar cuesta un
rem  minuto y quita esa clase entera de falso rojo.
call npm.cmd install
if errorlevel 1 goto :rojo
call npm.cmd run consistencia
if errorlevel 1 goto :rojo
popd

echo.
echo   ===============================================
echo    2 de 4  ·  SUBIR LA BASE CON SU ETIQUETA
echo   ===============================================
echo.
git -C "%BASE%" add -A
git -C "%BASE%" commit -m "v1.1.0: el dueno tambien puede las capacidades del producto"
git -C "%BASE%" tag v1.1.0
git -C "%BASE%" push origin main --tags
if errorlevel 1 goto :rojo

echo.
echo   ===============================================
echo    3 de 4  ·  TERAPIAS BAJA LA BASE NUEVA Y SE PRUEBA
echo   ===============================================
echo.
rem  npm install, no npm ci: install es el que regenera el candado con la
rem  etiqueta nueva. Con ci se instalaria la vieja y la guardia del candado
rem  reventaria, que es justo para lo que esta.
pushd "%PROD%"
call npm.cmd install
if errorlevel 1 goto :rojo
call npm.cmd run consistencia
if errorlevel 1 goto :rojo
popd

echo.
echo   ===============================================
echo    4 de 4  ·  SUBIR TERAPIAS
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
echo.
echo   El push de Terapias dispara solo un despliegue nuevo en Vercel.
echo   NO le des Redeploy a uno viejo: Redeploy vuelve a compilar el MISMO
echo   commit que estas viendo. Busca en la lista el despliegue del commit
echo   de arriba y espera a que diga Ready.
echo   -----------------------------------------------
echo.
pause
exit /b 0

:rojo
popd
echo.
echo   ===============================================
echo    SE PARO AQUI. NO SE SUBIO NADA MAS.
echo   ===============================================
echo.
echo   Algo salio en rojo. Copiame lo que dice arriba —completo, sin
echo   recortar— y lo vemos. No corras los pasos que faltan a mano:
echo   la mitad de un cambio publicado es peor que ninguno.
echo.
pause
exit /b 1
