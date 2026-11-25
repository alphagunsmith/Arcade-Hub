@echo off
cd /d "%~dp0"
if not exist "iw7-mod.exe" (
  echo Coloque este arquivo na pasta do Call of Duty Infinite Warfare,
  echo a mesma onde fica o iw7-mod.exe.
  pause
  exit /b
)
rem -allow_root_io deixa o script gravar o arquivo dualsense\eventos.txt que o app le
start "" iw7-mod.exe -allow_root_io %*
