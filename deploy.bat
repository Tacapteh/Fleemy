@echo off
cd /d "%~dp0"

echo =============== Étape 1 : build ===============
cd frontend
call npm run build
cd ..

echo =============== Étape 2 : deploy ==============
firebase deploy

echo.
echo ✅ Terminé. Appuie sur une touche pour quitter...
pause >nul
