@echo off
title Agente de Sincronizacao Pontualidade - BioStar 2
cd /d "%~dp0"
echo Iniciar Agente Pontualidade...
node pontual-agent.js
pause
