@echo off
cd /d "%~dp0"
cd frontend
npm run build
cd ..
firebase deploy
pause
