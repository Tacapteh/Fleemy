@echo off
REM === Fermer les ports 3000 et 8000 ===
echo Fermeture des processus sur les ports 3000 et 8000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%a /F
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000"') do taskkill /PID %%a /F

REM === Définir la variable FIREBASE_CREDENTIALS ===
echo Configuration de la clé Firebase...
setx FIREBASE_CREDENTIALS "%~dp0backend\serviceAccountKey.json"

REM === Démarrer le backend ===
echo Démarrage du backend...
start cmd /k "cd /d %~dp0backend && uvicorn server:app --reload --host 127.0.0.1 --port 8000"


REM === Démarrer le frontend ===
echo Démarrage du frontend...
start cmd /k "cd /d %~dp0frontend && npm start"
