# Fleemy

Fleemy is a planning and invoicing application built with React and FastAPI.

## Installation

### Backend

1. Copy the example environment file and update values:

```bash
cp backend/.env.example backend/.env
```

The variables are:

- `MONGO_URL` – connection string to your MongoDB instance
- `DB_NAME` – database name (default `fleemy`)
- `AUTH_URL` – external authentication endpoint

2. Install dependencies:

```bash
pip install -r backend/requirements.txt
```

3. Start the server:

```bash
uvicorn backend.server:app --reload
```

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

The frontend expects `REACT_APP_BACKEND_URL` to be defined in a `.env` file at the project root.

## Project structure

- `frontend/src/pages` contains modular pages (`Dashboard.jsx`, `Planning.jsx`, `Quotes.jsx`, `Invoices.jsx`, `NotFound.jsx`).
- Reusable UI pieces (modals, cards, headers) live in `frontend/src/components`.
- Backend code is located in the `backend` directory.

## Deployment

The application can be deployed to any platform supporting Node and Python. A typical setup is Vercel for the frontend and Render for the backend.
