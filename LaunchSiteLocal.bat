@echo off
REM === Lancer Fleemy Backend + Frontend ===

REM Aller dans le dossier du projet
cd /d "%~dp0"

REM Activer l'environnement Python si nécessaire (décommente si tu as un venv)
REM call venv\Scripts\activate

REM Lancer le backend dans une nouvelle fenêtre
start cmd /k "uvicorn backend.server:app --reload --host 127.0.0.1 --port 8000"

REM Attendre 3 secondes pour que le backend démarre
timeout /t 3 >nul

REM Aller dans le frontend et lancer React
cd frontend
start cmd /k "set REACT_APP_API_URL=http://localhost:8000 && npm start"

REM Revenir au répertoire racine
cd ..
echo Fleemy (Backend + Frontend) est en cours d'exécution.
pause
