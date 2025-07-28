@echo off
REM --- Nettoyer les ports 3000 et 8000 s'ils sont utilisés ---
for /f "tokens=5" %%a in ('netstat -ano ^| find ":3000" ^| find "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| find ":8000" ^| find "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

REM --- Lancer le backend en mode package ---
start cmd /k "cd /d %~dp0 && uvicorn backend.server:app --reload --reload-dir=backend"

REM --- Lancer le frontend ---
start cmd /k "cd /d %~dp0/frontend && npm start"
