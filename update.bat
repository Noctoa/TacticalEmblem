@echo off
rem ---------------------------------------------------------------------------
rem  Mise a jour de l'executable de Tactical Emblem a partir des fichiers de CE dossier
rem  (rien n'est telecharge depuis GitHub).
rem
rem    1. regarde quels fichiers ont change depuis le dernier .exe
rem    2. installe les dependances seulement si package.json a change
rem    3. recompile le .exe (npm run dist) qui remplace l'ancien a la racine
rem
rem    update.bat force   recompile meme si rien n'a change
rem ---------------------------------------------------------------------------
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Mise à jour de Tactical Emblem

if not exist "package.json" (
  echo Ce script doit être placé dans le dossier TacticalEmblem, à côté de package.json.
  goto :fail
)

rem --- l'application ne doit pas tourner (sinon l'.exe ne peut pas être remplacé)
tasklist /FI "IMAGENAME eq Tactical Emblem*" 2>nul | find /I "Tactical Emblem" >nul
if not errorlevel 1 (
  echo Tactical Emblem est ouvert. Ferme-le puis relance la mise à jour.
  goto :fail
)
rem     (ancien nom de l'application)
tasklist /FI "IMAGENAME eq Tactics Forge*" 2>nul | find /I "Tactics Forge" >nul
if not errorlevel 1 (
  echo Tactics Forge est ouvert. Ferme-le puis relance la mise à jour.
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
rem     code de sortie : 0 = rien de nouveau, 2 = fichiers modifiés, 3 = pas encore d'.exe
rem ===========================================================================
echo.
echo === 1/3  Recherche des fichiers modifiés depuis le dernier .exe
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root = (Get-Location).Path;" ^
  "$exe = Get-ChildItem -LiteralPath $root -Filter '*.exe' -File | Where-Object { $_.Name -like 'Tactical Emblem*' -or $_.Name -like 'Tactics Forge*' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1;" ^
  "if (-not $exe) { Write-Host 'Aucun executable a la racine : il va etre cree.'; exit 3 };" ^
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
if errorlevel 2 goto :done

rem ===========================================================================
rem  2. Dépendances : seulement si elles manquent ou si package.json a changé
rem ===========================================================================
:deps
echo.
echo === 2/3  Dépendances
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
echo === 3/3  Compilation de l'exécutable (npm run dist^)
call npm run dist
if errorlevel 1 (
  echo.
  echo La compilation a échoué. Si le message parle d'un fichier utilisé, ferme Tactical Emblem
  echo puis relance ce script.
  goto :fail
)

echo.
echo Terminé : le nouvel exécutable est à la racine du dossier.
for %%F in ("Tactical Emblem*.exe") do echo   %%~nxF
rem --- l'application s'appelait Tactics Forge : l'ancien exécutable est retiré
for %%F in ("Tactics Forge*.exe") do (
  if exist "Tactical Emblem*.exe" (
    del /q "%%~F" && echo   ancien exécutable supprimé : %%~nxF
  )
)

:done
echo.
pause
exit /b 0

:fail
echo.
pause
exit /b 1
