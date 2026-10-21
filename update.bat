@echo off
rem ---------------------------------------------------------------------------
rem  Mise a jour de l'executable a partir des fichiers de CE dossier
rem  (rien n'est telecharge depuis GitHub).
rem
rem  Le nom de l'application est lu dans package.json (productName) :
rem  l'executable s'appelle "<productName> <version>.exe".
rem
rem    1. regarde quels fichiers ont change depuis le dernier .exe
rem    2. installe les dependances seulement si package.json a change
rem    3. recompile le .exe (npm run dist), qui remplace l'ancien a la racine
rem    4. supprime les executables des anciens noms (Tactics Forge...)
rem
rem    update.bat force   recompile meme si rien n'a change
rem ---------------------------------------------------------------------------
setlocal
chcp 65001 >nul
cd /d "%~dp0"

if not exist "package.json" (
  echo Ce script doit être placé dans le dossier TacticalEmblem, à côté de package.json.
  goto :fail
)

rem --- nom de l'application (package.json > productName)
set "APPNAME="
for /f "usebackq delims=" %%N in (`powershell -NoProfile -Command "(Get-Content -Raw -Encoding UTF8 'package.json' | ConvertFrom-Json).productName"`) do set "APPNAME=%%N"
if not defined APPNAME (
  echo Impossible de lire le nom de l'application dans package.json.
  goto :fail
)
title Mise à jour de %APPNAME%
echo Application : %APPNAME%

rem --- l'application ne doit pas tourner (sinon l'.exe ne peut pas être remplacé), sous son nom actuel ou un ancien nom
powershell -NoProfile -Command "$n = $env:APPNAME; $p = Get-Process | Where-Object { $_.ProcessName -like ($n + '*') -or $_.ProcessName -like 'Tactics Forge*' -or $_.ProcessName -like 'Tactical Emblem*' -or $_.ProcessName -like 'Tactics Emblem*' }; if ($p) { exit 1 } else { exit 0 }"
if errorlevel 1 (
  echo %APPNAME% est ouvert. Ferme-le puis relance la mise à jour.
  goto :fail
)

rem --- Node.js est nécessaire pour compiler
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js est introuvable. Installe la version LTS depuis https://nodejs.org puis relance ce script.
  goto :fail
)

rem ===========================================================================
rem  1. Qu'est-ce qui a changé depuis le dernier .exe ?
rem     code de sortie : 0 = rien de nouveau, 2 = fichiers modifiés, 3 = pas encore d'.exe sous ce nom
rem ===========================================================================
echo.
echo === 1/4  Recherche des fichiers modifiés depuis le dernier .exe
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root = (Get-Location).Path; $name = $env:APPNAME;" ^
  "$exe = Get-ChildItem -LiteralPath $root -Filter '*.exe' -File | Where-Object { $_.Name -like ($name + ' *.exe') } | Sort-Object LastWriteTime -Descending | Select-Object -First 1;" ^
  "if (-not $exe) { Write-Host ('Pas encore d''executable ' + $name + ' a la racine : il va etre cree.'); exit 3 };" ^
  "Write-Host ('Executable actuel : ' + $exe.Name + ' (' + $exe.LastWriteTime.ToString('dd/MM/yyyy HH:mm') + ')');" ^
  "$items = @('main.js','preload.js','package.json','package-lock.json','src','assets','plugins') | Where-Object { Test-Path (Join-Path $root $_) } | ForEach-Object { Join-Path $root $_ };" ^
  "$changed = @(Get-ChildItem -LiteralPath $items -Recurse -File | Where-Object { $_.LastWriteTime -gt $exe.LastWriteTime } | Sort-Object LastWriteTime -Descending);" ^
  "if ($changed.Count -eq 0) { Write-Host 'Aucun fichier modifie depuis.'; exit 0 };" ^
  "Write-Host ($changed.Count.ToString() + ' fichier(s) modifie(s) :');" ^
  "$changed | Select-Object -First 15 | ForEach-Object { Write-Host ('   ' + $_.FullName.Substring($root.Length + 1)) };" ^
  "if ($changed.Count -gt 15) { Write-Host ('   ... et ' + ($changed.Count - 15) + ' autre(s)') };" ^
  "exit 2"
set "STATE=%errorlevel%"

if /I "%~1"=="force" goto :deps
if not "%STATE%"=="0" goto :deps
echo.
echo L'exécutable est déjà à jour avec les fichiers du dossier.
choice /C ON /M "Recompiler quand même (O = oui, N = non)"
if errorlevel 2 goto :cleanup

rem ===========================================================================
rem  2. Dépendances : seulement si elles manquent ou si package.json a changé
rem ===========================================================================
:deps
echo.
echo === 2/4  Dépendances
set "NEED_INSTALL=0"
if not exist "node_modules\.package-lock.json" set "NEED_INSTALL=1"
if not exist "node_modules\electron" set "NEED_INSTALL=1"
if "%NEED_INSTALL%"=="0" (
  powershell -NoProfile -Command "if ((Get-Item 'package.json').LastWriteTime -gt (Get-Item 'node_modules\.package-lock.json').LastWriteTime) { exit 1 } else { exit 0 }"
  if errorlevel 1 set "NEED_INSTALL=1"
)
if "%NEED_INSTALL%"=="0" (
  echo Déjà installées, rien à faire.
  goto :build
)
echo Installation (npm install^)...
call npm install
if errorlevel 1 (
  echo npm install a échoué. Vérifie la connexion internet puis relance.
  goto :fail
)

rem ===========================================================================
rem  3. Compilation de l'.exe (npm run dist, puis copie à la racine par postdist)
rem ===========================================================================
:build
echo.
echo === 3/4  Compilation de l'exécutable (npm run dist^)
call npm run dist
if errorlevel 1 (
  echo.
  echo La compilation a échoué. Si le message parle d'un fichier utilisé, ferme %APPNAME%
  echo puis relance ce script.
  goto :fail
)
echo.
echo Nouvel exécutable :
for %%F in ("%APPNAME% *.exe") do echo   %%~nxF

rem ===========================================================================
rem  4. Anciens noms de l'application : leurs exécutables sont retirés
rem     (seulement si l'exécutable du nom actuel existe bien)
rem ===========================================================================
:cleanup
echo.
echo === 4/4  Anciens exécutables
powershell -NoProfile -Command ^
  "$root = (Get-Location).Path; $name = $env:APPNAME;" ^
  "$current = Get-ChildItem -LiteralPath $root -Filter '*.exe' -File | Where-Object { $_.Name -like ($name + ' *.exe') };" ^
  "if (-not $current) { Write-Host 'Pas d''executable au nom actuel : rien n''est supprime.'; exit 0 };" ^
  "$old = Get-ChildItem -LiteralPath $root -Filter '*.exe' -File | Where-Object { ($_.Name -like 'Tactics Forge *.exe' -or $_.Name -like 'Tactical Emblem *.exe' -or $_.Name -like 'Tactics Emblem *.exe') -and -not ($_.Name -like ($name + ' *.exe')) };" ^
  "if (-not $old) { Write-Host 'Aucun.'; exit 0 };" ^
  "foreach ($f in $old) { Remove-Item -LiteralPath $f.FullName -Force; Write-Host ('   supprime : ' + $f.Name) }"

echo.
echo Terminé.

:done
echo.
pause
exit /b 0

:fail
echo.
pause
exit /b 1
