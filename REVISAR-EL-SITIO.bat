@echo off
chcp 65001 >nul
title Revisar que esta publicado de verdad

rem ------------------------------------------------------------------
rem PARA QUE SIRVE ESTO.
rem
rem "Ya lo subi" y "ya esta publicado" son dos cosas distintas, y entre
rem las dos hay tres lugares donde se puede quedar atorado: GitHub,
rem la compilacion de Vercel, y el cache del navegador.
rem
rem Esto se salta el navegador y le pregunta al sitio directamente que
rem codigo esta sirviendo, y si ese codigo trae el arreglo adentro.
rem No se fia de la version ni de la fecha: BUSCA EL ARREGLO.
rem ------------------------------------------------------------------

set SITIO=https://neron-terapias-masajes-neon.vercel.app
set GUION=%TEMP%\neron-revisar.ps1

echo.
echo   ===============================================
echo    REVISANDO %SITIO%
echo   ===============================================
echo.

> "%GUION%" echo $ErrorActionPreference = 'Stop'
>>"%GUION%" echo $sitio = '%SITIO%'
>>"%GUION%" echo try {
>>"%GUION%" echo   $html = (Invoke-WebRequest -UseBasicParsing -Headers @{'Cache-Control'='no-cache'} $sitio).Content
>>"%GUION%" echo } catch {
>>"%GUION%" echo   Write-Host '  NO SE PUDO ABRIR EL SITIO.' -ForegroundColor Red
>>"%GUION%" echo   Write-Host ('  ' + $_.Exception.Message); exit
>>"%GUION%" echo }
>>"%GUION%" echo if ($html -notmatch '(/assets/index-[A-Za-z0-9_-]+\.js)') {
>>"%GUION%" echo   Write-Host '  El sitio respondio pero no trae archivo de programa.' -ForegroundColor Red
>>"%GUION%" echo   Write-Host '  Eso pasa cuando la compilacion de Vercel fallo.'; exit
>>"%GUION%" echo }
>>"%GUION%" echo $ruta = $matches[1]
>>"%GUION%" echo Write-Host ('  Archivo que esta sirviendo:  ' + $ruta)
>>"%GUION%" echo $js = (Invoke-WebRequest -UseBasicParsing ($sitio + $ruta)).Content
>>"%GUION%" echo Write-Host ('  Tamano:                      ' + [math]::Round($js.Length/1024) + ' KB')
>>"%GUION%" echo Write-Host ''
>>"%GUION%" echo $tieneArreglo = $js -match 'segundoFactorApagado'
>>"%GUION%" echo $tieneCandado = $js -match 'setTimeout'
>>"%GUION%" echo if ($tieneArreglo) {
>>"%GUION%" echo   Write-Host '  YA ESTA PUBLICADO EL ARREGLO.' -ForegroundColor Green
>>"%GUION%" echo   Write-Host ''
>>"%GUION%" echo   Write-Host '  Abre el sitio y recarga con Ctrl + Shift + R.'
>>"%GUION%" echo   Write-Host '  Esa recarga ignora el cache. Sin ella el navegador'
>>"%GUION%" echo   Write-Host '  te puede seguir mostrando la pantalla vieja.'
>>"%GUION%" echo } else {
>>"%GUION%" echo   Write-Host '  TODAVIA NO. Vercel sigue sirviendo el codigo viejo.' -ForegroundColor Yellow
>>"%GUION%" echo   Write-Host ''
>>"%GUION%" echo   Write-Host '  Si acabas de subir, dale unos minutos y corre esto otra vez.'
>>"%GUION%" echo   Write-Host '  Si ya pasaron mas de cinco minutos, entra a Vercel y mira'
>>"%GUION%" echo   Write-Host '  la lista de despliegues: busca el del commit 3b49563.'
>>"%GUION%" echo   Write-Host '  Si dice Error, mandame lo que sale en el registro.'
>>"%GUION%" echo }

powershell -NoProfile -ExecutionPolicy Bypass -File "%GUION%"

echo.
pause
