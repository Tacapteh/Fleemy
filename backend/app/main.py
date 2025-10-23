import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "https://fleemy.web.app",
    "https://fleemy-21118.web.app",
    "https://fleemy.firebaseapp.com",
    "https://fleemy-21118.firebaseapp.com",
    "https://fleemy.vercel.app",
]
ALLOWED_ORIGIN_REGEX = (
    r"https://(?:[a-z0-9-]+\.)?fleemy\.vercel\.app$"
    r"|https://fleemy(?:-[a-z0-9]+)?\.web\.app$"
    r"|https://fleemy(?:-[a-z0-9]+)?\.firebaseapp\.com$"
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TranslateRequest(BaseModel):
    html: str
    target: str

GOOGLE_API_KEY = os.getenv("GOOGLE_TRANSLATE_API_KEY")

@app.post("/translate")
async def translate(req: TranslateRequest):
    if not GOOGLE_API_KEY:
        raise HTTPException(status_code=500, detail="Missing API key")
    url = "https://translate-pa.googleapis.com/v1/translateHtml"
    params = {"key": GOOGLE_API_KEY}
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, params=params, json={"html": req.html, "target": req.target})
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    data = resp.json()
    translated = data.get("data", {}).get("translations", [{}])[0].get("translatedHtml", "")
    return {"html": translated}
