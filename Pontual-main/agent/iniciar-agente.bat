@echo off
title Agente de Sincronizacao Pontualidade (MySQL)
echo ====================================================
echo Iniciando Agente de Sincronizacao Pontual...
echo ====================================================

REM Verifica se os pacotes (node_modules) estao instalados. Se nao, instala-os.
IF NOT EXIST "node_modules\" (
    echo [INFO] Primeira execucao detetada. A instalar dependencias (MySQL)...
    npm install
)

echo [INFO] A iniciar o agente...
node pontual-agent.js
pause
