# Fleemy

Fleemy is a planning and invoicing application built with React and FastAPI.

## Installation

### Backend

1. Copy the example environment file and update values:

```bash
cp backend/.env.example backend/.env
```

The variables are:

- `FIREBASE_CREDENTIALS` – path to your Firebase service account JSON file (or set `GOOGLE_APPLICATION_CREDENTIALS`).
- `FIREBASE_PROJECT_ID` – project ID used when no credentials file is available to allow token verification (data will be stored in memory).
- `CORS_ALLOW_ORIGINS` – comma separated list of origins allowed to access the API (defaults to `https://fleemy.web.app,http://localhost:5173`)

2. Install dependencies:

```bash
pip install -r backend/requirements.txt
```

3. Start the server:

```bash
uvicorn backend.server:app --host 0.0.0.0 --port ${PORT:-8000}
```
Render will automatically provide the `PORT` environment variable when deploying the backend.

### Frontend

1. Install dependencies:

```bash
cd frontend
npm install
```

2. Start the development server:

```bash
npm start
```

Open the application in your browser, sign in with Google and all API calls will
use your Firebase token automatically.

The PDF export feature is temporarily disabled in `frontend/src/utils/pdf.js`.
All other pages (Planning, Devis, Factures) work normally. To re-enable PDF
generation later, implement the real functions in `pdf.js`.

Create a `.env` file based on `.env.example` at the project root to configure both frontend and backend URLs.

## Project structure

- `frontend/src/pages` contains modular pages (`Dashboard.jsx`, `Planning.jsx`, `Quotes.jsx`, `Invoices.jsx`, `NotFound.jsx`).
- Reusable UI pieces (modals, cards, headers) live in `frontend/src/components`.
- Backend code is located in the `backend` directory.

## Deployment

The frontend can be deployed to **Firebase Hosting** and the backend to **Google Cloud Run**.
Build the frontend and deploy with Firebase:

```bash
npm run firebase:deploy
```

Build a container for the backend and deploy to Cloud Run:

```bash
docker build -t fleemy-backend ./backend
# push the image to your registry then deploy on Cloud Run
```
