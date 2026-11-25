@echo off
rem DualSense Auto: abre o GZDoom com o mod que conta ao app a arma, os tiros e o dano.
rem Fica na pasta do GZDoom. Tudo que você colocar depois (ex.: -iwad doom2.wad -file meumod.pk3) vai junto.
cd /d "%~dp0"
set "EXE="
for %%e in (gzdoom.exe vkdoom.exe uzdoom.exe lzdoom.exe) do if not defined EXE if exist "%%e" set "EXE=%%e"
if not defined EXE (
  echo Coloque este arquivo na pasta do GZDoom, a mesma onde fica o gzdoom.exe.
  pause
  exit /b
)
start "" "%EXE%" -file dualsense_auto -logfile dualsense_eventos.txt %*
