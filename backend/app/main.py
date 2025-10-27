import os
import re
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx


DEFAULT_ALLOWED_ORIGINS = [
    "https://fleemy.vercel.app",
    "https://fleemy.web.app",
    "http://localhost:5173",
    "http://localhost:3000",
    "https://fleemy.fr",
    "https://www.fleemy.fr",
    "https://app.fleemy.fr",
]


def _parse_allowed_origins() -> List[str]:
    raw = os.getenv("CORS_ORIGINS", "")
    if raw:
        parsed = [origin.strip() for origin in raw.split(",") if origin.strip()]
        if parsed:
            return parsed

    seen = set()
    defaults: List[str] = []
    for origin in DEFAULT_ALLOWED_ORIGINS:
        if origin not in seen:
            defaults.append(origin)
            seen.add(origin)
    return defaults


ALLOWED_ORIGINS = _parse_allowed_origins()
ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
ALLOWED_HEADERS = ["Authorization", "Content-Type", "X-Requested-With", "X-User-Id"]
EXPOSE_HEADERS = ["Location"]
MAX_AGE = 86400
ALLOWED_ORIGIN_REGEX_PATTERN = r"https://([a-z0-9-]+\.)?fleemy\.fr"
ALLOWED_ORIGIN_REGEX = re.compile(ALLOWED_ORIGIN_REGEX_PATTERN)
ALLOWED_ORIGIN_SET = {origin for origin in ALLOWED_ORIGINS}


def _is_origin_allowed(origin: Optional[str]) -> bool:
    if not origin:
        return False
    if origin in ALLOWED_ORIGIN_SET:
        return True
    if ALLOWED_ORIGIN_REGEX.fullmatch(origin):
        return True
    return False

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX_PATTERN,
    allow_credentials=False,
    allow_methods=ALLOWED_METHODS,
    allow_headers=ALLOWED_HEADERS,
    expose_headers=EXPOSE_HEADERS,
    max_age=MAX_AGE,
)


@app.middleware("http")
async def ensure_vary_origin(request, call_next):
    response = await call_next(request)
    origin = request.headers.get("origin")
    if _is_origin_allowed(origin):
        vary = response.headers.get("Vary")
        if vary:
            if "origin" not in vary.lower():
                response.headers["Vary"] = f"{vary}, Origin"
        else:
            response.headers["Vary"] = "Origin"
    return response


@app.options("/{rest_of_path:path}")
async def handle_options(rest_of_path: str):
    response = Response(status_code=204)
    response.headers["Access-Control-Allow-Methods"] = ", ".join(ALLOWED_METHODS)
    response.headers["Access-Control-Allow-Headers"] = ", ".join(ALLOWED_HEADERS)
    response.headers["Access-Control-Expose-Headers"] = ", ".join(EXPOSE_HEADERS)
    response.headers["Access-Control-Max-Age"] = str(MAX_AGE)
    return response

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
