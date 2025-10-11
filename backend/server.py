from fastapi import (
    FastAPI,
    APIRouter,
    HTTPException,
    Header,
    Depends,
    Response,
    Request,
)
from dotenv import load_dotenv, find_dotenv
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
import asyncio
import json
import calendar
import httpx
import re

# Firebase Admin
import firebase_admin
from firebase_admin import credentials, firestore, auth

# Charger les variables d'environnement AVANT toute config
ENV_PATH = find_dotenv()
load_dotenv(ENV_PATH)

# Configurer le logger le plus tôt possible
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)
logger.info("Loaded environment from %s", ENV_PATH)

if not firebase_admin._apps:
    cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if not cred_path:
        raise RuntimeError("Missing GOOGLE_APPLICATION_CREDENTIALS env var")
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()

# Créer l'application FastAPI
app = FastAPI()

# Configurer CORS (après app et après dotenv)
from fastapi.middleware.cors import CORSMiddleware

# ✅ FIXED pour production: CORS origins explicit
origin_list = [
    "http://localhost:5173",
    "https://fleemy.web.app",
    "https://fleemy-21118.web.app",
    "https://fleemy.vercel.app",
    "https://preview-<hash>-fleemy.vercel.app",
]

logger.info("CORS activé pour : %s", origin_list)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://fleemy.web.app",
        "https://fleemy-21118.web.app",
        "https://fleemy.vercel.app",
        "https://preview-<hash>-fleemy.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def verify_token(request: Request):
    """Validate the Firebase token sent in the Authorization header."""  # ✅ CHECKED auth
    auth_header = request.headers.get("Authorization")
    logger.info("Header Authorization reçu: %s", auth_header)

    token = None
    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        logger.info("Token reçu par le backend: %s", token[:50])
    else:
        logger.info("[DEBUG] Aucun ou mauvais token reçu")
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    try:
        decoded = auth.verify_id_token(token)
        print(decoded)  # ✅ FIXED token/projectId/trace
        logger.info("Decoded token: %s", decoded)
        request.state.user = decoded
        logger.info("Token validé pour UID: %s", decoded.get("uid"))
        return decoded
    except Exception as e:
        msg = str(e).lower()
        if "expired" in msg:
            reason = "expired"
        elif "signature" in msg:
            reason = "signature"
        elif "project" in msg or "audience" in msg:
            reason = "project"
        else:
            reason = "unknown"
        logger.error(
            "Erreur de validation du token (%s): %s", reason, e, exc_info=True
        )  # ✅ FIXED token/projectId/trace
        raise HTTPException(status_code=401, detail=f"Invalid token ({reason})")


# Global exception handler to always return JSON and keep CORS headers
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

@app.middleware("http")
async def error_handling_middleware(request: Request, call_next):
    try:
        response = await call_next(request)
        return response
    except RequestValidationError as exc:
        logger.error("Validation error on %s: %s", request.url.path, exc, exc_info=True)
        return JSONResponse(status_code=200, content={"success": False, "error": str(exc)})
    except HTTPException as exc:
        logger.error(
            "HTTPException on %s [%s]: %s",
            request.url.path,
            exc.status_code,
            exc.detail,
            exc_info=True,
        )
        return JSONResponse(status_code=200, content={"success": False, "error": exc.detail})
    except Exception as exc:
        logger.error("Unhandled server error on %s: %s", request.url.path, exc, exc_info=True)
        # Never expose raw 500 errors to the client
        return JSONResponse(status_code=200, content={"success": False, "error": str(exc)})


# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Models
class User(BaseModel):
    uid: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: str
    picture: Optional[str] = None
    team_id: Optional[str] = None
    hourly_rate: float = 50.0
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Team(BaseModel):
    team_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    members: List[str] = []
    created_by: str
    invite_code: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PlanningEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    uid: str
    week: int
    year: int
    description: str
    client_id: str
    client_name: str
    day: str  # "monday", "tuesday", etc
    start_time: str  # "09:00"
    end_time: str  # "17:00"
    status: str  # "paid", "unpaid", "pending", "not_worked"
    hourly_rate: float = 50.0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class WeeklyTask(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    uid: str
    week: int
    year: int
    name: str
    price: float
    color: str
    icon: str
    time_slots: List[Dict[str, str]] = (
        []
    )  # {"day": "monday", "start": "09:00", "end": "10:00"}
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Todo(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    uid: str
    title: str
    description: Optional[str] = ""
    priority: str = "normal"  # "low", "normal", "urgent"
    completed: bool = False
    due_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Address(BaseModel):
    line1: str = ""
    line2: Optional[str] = ""
    postal_code: str = ""
    city: str = ""
    country: str = "France"


class Client(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str  # Renamed from uid for consistency
    display_name: str
    contact_name: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    address: Optional[Address] = None
    notes: Optional[str] = ""
    is_archived: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class QuoteItem(BaseModel):
    description: str
    quantity: float = 1.0
    unit_price: float = 0.0
    total: float = 0.0


class Quote(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    uid: str
    client_id: str
    client_name: str
    quote_number: str
    title: str
    items: List[QuoteItem] = []
    subtotal: float = 0.0
    tax_rate: float = 20.0
    tax_amount: float = 0.0
    total: float = 0.0
    status: str = "draft"  # "draft", "sent", "accepted", "rejected"
    valid_until: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Invoice(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    uid: str
    quote_id: Optional[str] = None
    client_id: str
    client_name: str
    invoice_number: str
    title: str
    items: List[QuoteItem] = []
    subtotal: float = 0.0
    tax_rate: float = 20.0
    tax_amount: float = 0.0
    total: float = 0.0
    status: str = "sent"  # "sent", "paid", "overdue", "cancelled"
    due_date: datetime
    paid_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# Request models


class EventCreateRequest(BaseModel):
    description: str
    client_id: str
    client_name: str
    day: str
    start_time: str
    end_time: str
    status: str = "pending"
    hourly_rate: Optional[float] = 50.0
    year: Optional[int] = None
    week: Optional[int] = None


class TaskCreateRequest(BaseModel):
    name: str
    price: float
    color: str
    icon: str
    time_slots: List[Dict[str, str]] = []
    year: Optional[int] = None
    week: Optional[int] = None


class TodoCreateRequest(BaseModel):
    title: str
    description: Optional[str] = ""
    priority: str = "normal"
    due_date: Optional[str] = None


class ClientCreateRequest(BaseModel):
    display_name: str
    contact_name: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    address: Optional[Address] = None
    notes: Optional[str] = ""
    is_archived: Optional[bool] = False


class QuoteCreateRequest(BaseModel):
    client_id: str
    client_name: str
    title: str
    items: List[QuoteItem]
    tax_rate: float = 20.0
    valid_until: str


class InvoiceCreateRequest(BaseModel):
    quote_id: Optional[str] = None
    client_id: str
    client_name: str
    title: str
    items: List[QuoteItem]
    tax_rate: float = 20.0
    due_date: str


class TeamCreateRequest(BaseModel):
    name: str


class TeamJoinRequest(BaseModel):
    invite_code: str


# Firestore helper utilities
def user_doc(uid: str):
    return db.collection("users").document(uid)


def user_col(uid: str, name: str):
    return user_doc(uid).collection(name)


def team_col(team_id: str, name: str):
    return db.collection("teams").document(team_id).collection(name)


def global_event_doc(year: int, week: int, event_id: str):
    """Return document reference for event stored by year and week."""
    return (
        db.collection("events")
        .document(str(year))
        .collection(str(week))
        .document(event_id)
    )


def global_task_doc(year: int, week: int, owner_id: str, task_id: str):
    """Return document reference for task stored by year, week and owner."""
    return (
        db.collection("tasks")
        .document(str(year))
        .collection(str(week))
        .document(owner_id)
        .collection("items")
        .document(task_id)
    )


async def stream_docs(query):
    docs = await asyncio.to_thread(lambda: list(query.stream()))
    return [d.to_dict() for d in docs]


# Authentication endpoints


@api_router.get("/auth/me")
async def get_me(request: Request):
    """Return the authenticated user's info and create the DB entry if missing."""
    try:
        user = await verify_token(request)
        logger.info("/auth/me called for %s", user.get("uid"))
        user_ref = user_doc(user["uid"])
        snapshot = await asyncio.to_thread(user_ref.get)
        db_user = snapshot.to_dict() if snapshot.exists else None
        if not db_user:
            new_user = User(
                uid=user["uid"],
                name=user.get("name", ""),
                email=user.get("email", ""),
                picture=user.get("picture"),
            )
            await asyncio.to_thread(user_ref.set, new_user.dict())
            db_user = new_user.dict()
        return {
            "user": {
                "uid": db_user["uid"],
                "name": db_user.get("name"),
                "email": db_user.get("email"),
                "picture": db_user.get("picture"),
                "hourly_rate": db_user.get("hourly_rate"),
                "team_id": db_user.get("team_id"),
            }
        }
    except Exception as e:
        logger.error("get_me error: %s", e, exc_info=True)
        return {"user": None}


@api_router.put("/auth/me")
async def update_me(hourly_rate: float, user: Dict[str, Any] = Depends(verify_token)):
    user_ref = user_doc(user["uid"])
    await asyncio.to_thread(user_ref.update, {"hourly_rate": hourly_rate})
    updated_user = await asyncio.to_thread(user_ref.get)
    return User(**updated_user.to_dict())


# Dashboard endpoint used for testing basic connectivity
@api_router.get("/dashboard")
async def get_dashboard() -> Dict[str, str]:
    """Simple dashboard route returning a static response."""
    return {"status": "ok"}


# Planning endpoints
@api_router.get("/planning/week/{year}/{week}")
async def get_week_planning(
    year: int,
    week: int,
    team_id: Optional[str] = None,
    user: Dict[str, Any] = Depends(verify_token),  # ✅ CHECKED auth
):
    logger.info("/planning/week/%s/%s called", year, week)
    try:
        if team_id:
            team_snap = await asyncio.to_thread(
                db.collection("teams").document(team_id).get
            )
            team = team_snap.to_dict() if team_snap.exists else None
            if not team or user["uid"] not in (
                team.get("members", []) + [team.get("created_by")]
            ):
                raise HTTPException(
                    status_code=403, detail="Not authorized for this team"
                )
            events_ref = team_col(team_id, "events")
            tasks_ref = team_col(team_id, "tasks")
        else:
            events_ref = user_col(user["uid"], "events")
            tasks_ref = user_col(user["uid"], "tasks")

        try:
            events = await stream_docs(
                events_ref.where("year", "==", year).where("week", "==", week)
            )
            tasks = await stream_docs(
                tasks_ref.where("year", "==", year).where("week", "==", week)
            )
        except Exception as e:
            logger.error("Erreur Firestore (planning): %s", e, exc_info=True)
            events, tasks = [], []

        if not isinstance(events, list):
            events = []
        if not isinstance(tasks, list):
            tasks = []

        logger.info("Found %d events and %d tasks", len(events), len(tasks))
        return {"success": True, "events": events, "tasks": tasks}

    except Exception as e:
        logger.error("get_week_planning error: %s", e, exc_info=True)
        return {"success": False, "error": str(e), "events": [], "tasks": []}


# Simple test endpoint to validate CORS on planning routes
@api_router.get("/planning/week/{year}/{week}/test")
async def test_week_planning(year: int, week: int):
    return {"year": year, "week": week, "ok": True}


@api_router.get("/planning/month/{year}/{month}")
async def get_month_planning(
    year: int,
    month: int,
    team_id: Optional[str] = None,
    user: Dict[str, Any] = Depends(verify_token),
):
    try:
        last_day = calendar.monthrange(year, month)[1]
        pairs = {
            (
                datetime(year, month, day).isocalendar().year,
                datetime(year, month, day).isocalendar().week,
            )
            for day in range(1, last_day + 1)
        }

        if team_id:
            team_snap = await asyncio.to_thread(
                db.collection("teams").document(team_id).get
            )
            team = team_snap.to_dict() if team_snap.exists else None
            if not team or user["uid"] not in (
                team.get("members", []) + [team.get("created_by")]
            ):
                raise HTTPException(status_code=403, detail="Not authorized for this team")
            events_ref = team_col(team_id, "events")
            tasks_ref = team_col(team_id, "tasks")
        else:
            events_ref = user_col(user["uid"], "events")
            tasks_ref = user_col(user["uid"], "tasks")

        events: List[Dict[str, Any]] = []
        tasks: List[Dict[str, Any]] = []
        for y, w in pairs:
            events += await stream_docs(
                events_ref.where("year", "==", y).where("week", "==", w)
            )
            tasks += await stream_docs(
                tasks_ref.where("year", "==", y).where("week", "==", w)
            )

        return {"success": True, "events": events, "tasks": tasks}
    except Exception as e:
        logger.error("get_month_planning error: %s", e, exc_info=True)
        return {"success": False, "error": str(e), "events": [], "tasks": []}


@api_router.get("/planning/events")
async def list_events(
    year: Optional[int] = None,
    week: Optional[int] = None,
    user: Dict[str, Any] = Depends(verify_token),
):
    try:
        if year is not None and week is not None:
            events_ref = db.collection("events").document(str(year)).collection(str(week))
            events_raw = await stream_docs(events_ref)
            events_raw = events_raw if isinstance(events_raw, list) else []
            formatted = [
                {
                    **ev,
                    "id": ev.get("id"),
                    "title": ev.get("description", ""),
                    "color": ev.get("color", ""),
                    "startTime": ev.get("start_time"),
                    "endTime": ev.get("end_time"),
                    "status": ev.get("status"),
                }
                for ev in events_raw
            ]
            logger.info("Returning %d events for %s/%s", len(formatted), week, year)
            return JSONResponse(
                {"success": True, "events": formatted},
                media_type="application/json",
            )
        events_ref = user_col(user["uid"], "events")
        if year is not None:
            events_ref = events_ref.where("year", "==", year)
        if week is not None:
            events_ref = events_ref.where("week", "==", week)
        events_raw = await stream_docs(events_ref)
        events_raw = events_raw if isinstance(events_raw, list) else []
        formatted = [
            {
                **ev,
                "id": ev.get("id"),
                "title": ev.get("description", ""),
                "color": ev.get("color", ""),
                "startTime": ev.get("start_time"),
                "endTime": ev.get("end_time"),
                "status": ev.get("status"),
            }
            for ev in events_raw
        ]
        logger.info("Returning %d events for user %s", len(formatted), user["uid"])
        logger.debug("Events payload: %s", formatted)
        return JSONResponse(
            {"success": True, "events": formatted},
            media_type="application/json",
        )
    except Exception as e:
        logger.error("list_events error: %s", e, exc_info=True)
        return JSONResponse(
            {"success": False, "events": [], "error": str(e)},
            media_type="application/json",
        )


@api_router.get("/planning/events/{owner_id}/{year}/{week}")
async def list_events_by_owner(owner_id: str, year: int, week: int):
    """Return events for a specific owner stored under events/{year}/{week}."""
    logger.info(
        "Fetching events for owner %s week %s/%s", owner_id, week, year
    )
    try:
        events_ref = (
            db.collection("events")
            .document(str(year))
            .collection(str(week))
        )
        # Fetch all events for the week then filter locally. This keeps
        # compatibility with older events that only have the ``uid`` field.
        events_raw = await stream_docs(events_ref)
        events_raw = events_raw if isinstance(events_raw, list) else []
        filtered = []
        for ev in events_raw:
            owner = ev.get("owner_id")
            if owner == owner_id or (not owner and ev.get("uid") == owner_id):
                filtered.append(ev)
        formatted = [
            {
                **ev,
                "id": ev.get("id"),
                "title": ev.get("description", ""),
                "color": ev.get("color", ""),
                "startTime": ev.get("start_time"),
                "endTime": ev.get("end_time"),
                "status": ev.get("status"),
            }
            for ev in filtered
        ]
        logger.info(
            "Returning %d events for owner %s week %s/%s",
            len(formatted),
            owner_id,
            week,
            year,
        )
        logger.debug("Events payload: %s", formatted)
        return {"success": True, "events": formatted}
    except Exception as e:
        logger.error("list_events_by_owner error: %s", e, exc_info=True)
        return {"success": False, "events": [], "error": str(e)}


@api_router.post("/planning/events")
async def create_event(
    event_request: EventCreateRequest, user: Dict[str, Any] = Depends(verify_token)
):
    try:
        now = datetime.now()
        year = event_request.year or now.year
        week = event_request.week or now.isocalendar()[1]

        event = PlanningEvent(
            uid=user["uid"],
            week=week,
            year=year,
            description=event_request.description,
            client_id=event_request.client_id,
            client_name=event_request.client_name,
            day=event_request.day,
            start_time=event_request.start_time,
            end_time=event_request.end_time,
            status=event_request.status,
            hourly_rate=event_request.hourly_rate if event_request.hourly_rate is not None else 50.0,
        )
        await asyncio.to_thread(
            user_col(user["uid"], "events").document(event.id).set, event.dict()
        )
        owner_id = user["uid"]
        user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
        team_id = user_snap.to_dict().get("team_id") if user_snap.exists else None
        await asyncio.to_thread(
            global_event_doc(year, week, event.id).set,
            {**event.dict(), "owner_id": owner_id},
        )
        if team_id:
            await asyncio.to_thread(
                team_col(team_id, "events").document(event.id).set, event.dict()
            )
        return {"success": True, "event": event.dict()}
    except Exception as e:
        logger.error("create_event error: %s", e, exc_info=True)
        return {"success": False, "error": str(e)}


@api_router.put("/planning/events/{event_id}")
async def update_event(
    event_id: str,
    event_request: EventCreateRequest,
    user: Dict[str, Any] = Depends(verify_token),
):
    snap = await asyncio.to_thread(
        user_col(user["uid"], "events").document(event_id).get
    )
    if not snap.exists:
        return {"success": False, "error": "Event not found"}

    existing = snap.to_dict()
    update_data = {**event_request.dict(), "updated_at": datetime.utcnow()}
    await asyncio.to_thread(
        user_col(user["uid"], "events").document(event_id).update, update_data
    )
    owner_id = existing.get("owner_id", user["uid"])
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    team_id = user_snap.to_dict().get("team_id") if user_snap.exists else None
    await asyncio.to_thread(
        global_event_doc(existing["year"], existing["week"], event_id).set,
        {**existing, **update_data, "owner_id": owner_id},
    )
    if team_id:
        await asyncio.to_thread(
            team_col(team_id, "events").document(event_id).update, update_data
        )
    updated = await asyncio.to_thread(
        user_col(user["uid"], "events").document(event_id).get
    )
    return {"success": True, "event": updated.to_dict()}


@api_router.delete("/planning/events/{event_id}")
async def delete_event(event_id: str, user: Dict[str, Any] = Depends(verify_token)):
    doc_ref = user_col(user["uid"], "events").document(event_id)
    snap = await asyncio.to_thread(doc_ref.get)
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Event not found")
    data = snap.to_dict()
    await asyncio.to_thread(doc_ref.delete)
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    team_id = user_snap.to_dict().get("team_id") if user_snap.exists else None
    owner_id = team_id if team_id else user["uid"]
    await asyncio.to_thread(
        global_event_doc(data["year"], data["week"], event_id).delete
    )
    if team_id:
        await asyncio.to_thread(team_col(team_id, "events").document(event_id).delete)
    return {"success": True, "message": "deleted"}


@api_router.get("/planning/earnings/{year}/{week}")
async def get_earnings(
    year: int,
    week: int,
    team_id: Optional[str] = None,
    user: Dict[str, Any] = Depends(verify_token),
):
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    db_user = user_snap.to_dict() if user_snap.exists else None
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    if team_id:
        team_snap = await asyncio.to_thread(
            db.collection("teams").document(team_id).get
        )
        team = team_snap.to_dict() if team_snap.exists else None
        if not team or user["uid"] not in (
            team.get("members", []) + [team.get("created_by")]
        ):
            raise HTTPException(status_code=403, detail="Not authorized for this team")
        events_ref = team_col(team_id, "events")
        tasks_ref = team_col(team_id, "tasks")
    else:
        events_ref = user_col(user["uid"], "events")
        tasks_ref = user_col(user["uid"], "tasks")

    events = await stream_docs(
        events_ref.where("year", "==", year).where("week", "==", week)
    )
    tasks = await stream_docs(
        tasks_ref.where("year", "==", year).where("week", "==", week)
    )

    earnings = {"paid": 0, "unpaid": 0, "pending": 0, "not_worked": 0, "total": 0}

    # Calculate earnings from events based on hours and rate
    for event in events:
        try:
            start_hour = int(event["start_time"].split(":")[0])
            end_hour = int(event["end_time"].split(":")[0])
            hours = end_hour - start_hour
            amount = hours * event.get("hourly_rate", db_user.get("hourly_rate", 50.0))

            if event["status"] == "paid":
                earnings["paid"] += amount
            elif event["status"] == "unpaid":
                earnings["unpaid"] += amount
            elif event["status"] == "pending":
                earnings["pending"] += amount
            elif event["status"] == "not_worked":
                earnings["not_worked"] += amount
        except:
            # Fallback calculation
            amount = event.get("hourly_rate", db_user.get("hourly_rate", 50.0))
            if event["status"] == "paid":
                earnings["paid"] += amount
            elif event["status"] == "unpaid":
                earnings["unpaid"] += amount
            elif event["status"] == "pending":
                earnings["pending"] += amount

    # Add earnings from tasks - tasks are always considered as "paid"
    for task in tasks:
        for time_slot in task.get("time_slots", []):
            try:
                start_hour = int(time_slot["start"].split(":")[0])
                end_hour = int(time_slot["end"].split(":")[0])
                hours = end_hour - start_hour
                amount = hours * task.get("price", 0)  # task price is per hour
                earnings["paid"] += amount
            except:
                # Fallback: add base task price
                earnings["paid"] += task.get("price", 0)

    earnings["total"] = earnings["paid"] + earnings["unpaid"] + earnings["pending"]

    return {"success": True, "earnings": earnings}


# Tasks endpoints
@api_router.get("/planning/tasks")
async def list_tasks(
    year: Optional[int] = None,
    week: Optional[int] = None,
    user: Dict[str, Any] = Depends(verify_token),
):
    tasks_ref = user_col(user["uid"], "tasks")
    if year is not None:
        tasks_ref = tasks_ref.where("year", "==", year)
    if week is not None:
        tasks_ref = tasks_ref.where("week", "==", week)
    tasks = await stream_docs(tasks_ref)
    return {"success": True, "tasks": tasks}


# Tasks endpoints
@api_router.post("/planning/tasks")
async def create_task(
    task_request: TaskCreateRequest, user: Dict[str, Any] = Depends(verify_token)
):
    now = datetime.now()
    year = task_request.year or now.year
    week = task_request.week or now.isocalendar()[1]
    task_data = task_request.dict(exclude={"year", "week"})
    task = WeeklyTask(uid=user["uid"], week=week, year=year, **task_data)
    await asyncio.to_thread(
        user_col(user["uid"], "tasks").document(task.id).set, task.dict()
    )
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    team_id = user_snap.to_dict().get("team_id") if user_snap.exists else None
    owner_id = team_id if team_id else user["uid"]
    await asyncio.to_thread(
        global_task_doc(year, week, owner_id, task.id).set,
        {**task.dict(), "owner_id": owner_id},
    )
    if team_id:
        await asyncio.to_thread(
            team_col(team_id, "tasks").document(task.id).set, task.dict()
        )
    return {"success": True, "task": task.dict()}


@api_router.put("/planning/tasks/{task_id}")
async def update_task(
    task_id: str,
    task_request: TaskCreateRequest,
    user: Dict[str, Any] = Depends(verify_token),
):
    snap = await asyncio.to_thread(
        user_col(user["uid"], "tasks").document(task_id).get
    )
    if not snap.exists:
        return {"success": False, "error": "Task not found"}

    existing = snap.to_dict()
    incoming = task_request.dict(exclude_unset=True)
    new_year = incoming.pop("year", existing["year"])
    new_week = incoming.pop("week", existing["week"])
    update_data = {
        **incoming,
        "year": new_year,
        "week": new_week,
        "updated_at": datetime.utcnow(),
    }
    await asyncio.to_thread(
        user_col(user["uid"], "tasks").document(task_id).update, update_data
    )
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    team_id = user_snap.to_dict().get("team_id") if user_snap.exists else None
    owner_id = team_id if team_id else user["uid"]
    if existing["year"] != new_year or existing["week"] != new_week:
        await asyncio.to_thread(
            global_task_doc(existing["year"], existing["week"], owner_id, task_id).delete
        )
    await asyncio.to_thread(
        global_task_doc(new_year, new_week, owner_id, task_id).set,
        {**existing, **update_data, "owner_id": owner_id},
    )
    if team_id:
        await asyncio.to_thread(
            team_col(team_id, "tasks").document(task_id).update, update_data
        )
    updated = await asyncio.to_thread(
        user_col(user["uid"], "tasks").document(task_id).get
    )
    return {"success": True, "task": updated.to_dict()}


@api_router.delete("/planning/tasks/{task_id}")
async def delete_task(task_id: str, user: Dict[str, Any] = Depends(verify_token)):
    doc_ref = user_col(user["uid"], "tasks").document(task_id)
    snap = await asyncio.to_thread(doc_ref.get)
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Task not found")
    await asyncio.to_thread(doc_ref.delete)
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    team_id = user_snap.to_dict().get("team_id") if user_snap.exists else None
    owner_id = team_id if team_id else user["uid"]
    data = snap.to_dict()
    await asyncio.to_thread(
        global_task_doc(data["year"], data["week"], owner_id, task_id).delete
    )
    if team_id:
        await asyncio.to_thread(team_col(team_id, "tasks").document(task_id).delete)
    return {"success": True, "message": "deleted"}


@api_router.get("/todos")
async def get_todos(user: Dict[str, Any] = Depends(verify_token)):
    todos = await stream_docs(
        user_col(user["uid"], "todos").order_by(
            "created_at", direction=firestore.Query.DESCENDING
        )
    )
    return todos


@api_router.post("/todos")
async def create_todo(
    todo_request: TodoCreateRequest, user: Dict[str, Any] = Depends(verify_token)
):
    todo_data = todo_request.dict()
    if todo_data.get("due_date"):
        todo_data["due_date"] = datetime.fromisoformat(
            todo_data["due_date"].replace("Z", "+00:00")
        )

    todo = Todo(uid=user["uid"], **todo_data)

    await asyncio.to_thread(
        user_col(user["uid"], "todos").document(todo.id).set, todo.dict()
    )
    return todo


@api_router.put("/todos/{todo_id}")
async def update_todo(
    todo_id: str,
    todo_request: TodoCreateRequest,
    user: Dict[str, Any] = Depends(verify_token),
):
    todo_data = todo_request.dict()
    if todo_data.get("due_date"):
        todo_data["due_date"] = datetime.fromisoformat(
            todo_data["due_date"].replace("Z", "+00:00")
        )

    update_data = {**todo_data, "updated_at": datetime.utcnow()}
    await asyncio.to_thread(
        user_col(user["uid"], "todos").document(todo_id).update, update_data
    )
    snap = await asyncio.to_thread(user_col(user["uid"], "todos").document(todo_id).get)
    return snap.to_dict()


@api_router.put("/todos/{todo_id}/toggle")
async def toggle_todo(todo_id: str, user: Dict[str, Any] = Depends(verify_token)):
    doc_ref = user_col(user["uid"], "todos").document(todo_id)
    snap = await asyncio.to_thread(doc_ref.get)
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Todo not found")
    data = snap.to_dict()
    await asyncio.to_thread(
        doc_ref.update,
        {
            "completed": not data.get("completed", False),
            "updated_at": datetime.utcnow(),
        },
    )
    updated = await asyncio.to_thread(doc_ref.get)
    return updated.to_dict()


@api_router.delete("/todos/{todo_id}")
async def delete_todo(todo_id: str, user: Dict[str, Any] = Depends(verify_token)):
    doc_ref = user_col(user["uid"], "todos").document(todo_id)
    snap = await asyncio.to_thread(doc_ref.get)
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Todo not found")
    await asyncio.to_thread(doc_ref.delete)
    return {"message": "Todo deleted"}


# Clients endpoints
@api_router.get("/clients")
async def get_clients(user: Dict[str, Any] = Depends(verify_token)):
    clients = await stream_docs(user_col(user["uid"], "clients").order_by("name"))
    return clients


@api_router.post("/clients")
async def create_client(
    client_request: ClientCreateRequest, user: Dict[str, Any] = Depends(verify_token)
):
    data = client_request.dict()
    full_name = f"{data.get('first_name', '')} {data.get('last_name', '')}".strip()
    data["name"] = full_name
    client = Client(uid=user["uid"], **data)

    await asyncio.to_thread(
        user_col(user["uid"], "clients").document(client.id).set, client.dict()
    )
    return client


@api_router.put("/clients/{client_id}")
async def update_client(
    client_id: str,
    client_request: ClientCreateRequest,
    apply_rate: Optional[bool] = False,
    user: Dict[str, Any] = Depends(verify_token),
):
    data = client_request.dict()
    data["name"] = f"{data.get('first_name', '')} {data.get('last_name', '')}".strip()
    update_data = {**data, "updated_at": datetime.utcnow()}
    doc_ref = user_col(user["uid"], "clients").document(client_id)
    await asyncio.to_thread(doc_ref.update, update_data)
    if apply_rate and data.get("hourly_rate") is not None:
        events_query = user_col(user["uid"], "events").where("client_id", "==", client_id)
        events = await asyncio.to_thread(lambda: list(events_query.stream()))
        for ev in events:
            await asyncio.to_thread(ev.reference.update, {"hourly_rate": data["hourly_rate"]})
    updated = await asyncio.to_thread(doc_ref.get)
    return updated.to_dict()


@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, user: Dict[str, Any] = Depends(verify_token)):
    doc_ref = user_col(user["uid"], "clients").document(client_id)
    snap = await asyncio.to_thread(doc_ref.get)
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Client not found")
    await asyncio.to_thread(doc_ref.delete)
    return {"message": "Client deleted"}


# Quotes endpoints
@api_router.get("/quotes")
async def get_quotes(user: Dict[str, Any] = Depends(verify_token)):
    quotes = await stream_docs(
        user_col(user["uid"], "quotes").order_by(
            "created_at", direction=firestore.Query.DESCENDING
        )
    )
    return quotes


@api_router.post("/quotes")
async def create_quote(
    quote_request: QuoteCreateRequest, user: Dict[str, Any] = Depends(verify_token)
):
    # Generate quote number
    quote_count = len(await stream_docs(user_col(user["uid"], "quotes")))
    quote_number = f"DEV-{datetime.now().year}-{quote_count + 1:04d}"

    quote_data = quote_request.dict()
    quote_data["quote_number"] = quote_number
    quote_data["valid_until"] = datetime.fromisoformat(
        quote_data["valid_until"].replace("Z", "+00:00")
    )

    # Calculate totals
    subtotal = sum(
        item["quantity"] * item["unit_price"] for item in quote_data["items"]
    )
    tax_amount = subtotal * (quote_data["tax_rate"] / 100)
    total = subtotal + tax_amount

    quote_data.update({"subtotal": subtotal, "tax_amount": tax_amount, "total": total})

    quote = Quote(uid=user["uid"], **quote_data)

    await asyncio.to_thread(
        user_col(user["uid"], "quotes").document(quote.id).set, quote.dict()
    )
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    team_id = user_snap.to_dict().get("team_id") if user_snap.exists else None
    if team_id:
        await asyncio.to_thread(
            team_col(team_id, "quotes").document(quote.id).set, quote.dict()
        )
    return quote


@api_router.put("/quotes/{quote_id}")
async def update_quote(
    quote_id: str,
    quote_request: QuoteCreateRequest,
    user: Dict[str, Any] = Depends(verify_token),
):
    quote_data = quote_request.dict()
    quote_data["valid_until"] = datetime.fromisoformat(
        quote_data["valid_until"].replace("Z", "+00:00")
    )

    # Calculate totals
    subtotal = sum(
        item["quantity"] * item["unit_price"] for item in quote_data["items"]
    )
    tax_amount = subtotal * (quote_data["tax_rate"] / 100)
    total = subtotal + tax_amount

    quote_data.update(
        {
            "subtotal": subtotal,
            "tax_amount": tax_amount,
            "total": total,
            "updated_at": datetime.utcnow(),
        }
    )

    await asyncio.to_thread(
        user_col(user["uid"], "quotes").document(quote_id).update, quote_data
    )
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    team_id = user_snap.to_dict().get("team_id") if user_snap.exists else None
    if team_id:
        await asyncio.to_thread(
            team_col(team_id, "quotes").document(quote_id).update, quote_data
        )
    updated = await asyncio.to_thread(
        user_col(user["uid"], "quotes").document(quote_id).get
    )
    return updated.to_dict()


@api_router.delete("/quotes/{quote_id}")
async def delete_quote(quote_id: str, user: Dict[str, Any] = Depends(verify_token)):
    doc_ref = user_col(user["uid"], "quotes").document(quote_id)
    snap = await asyncio.to_thread(doc_ref.get)
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Quote not found")
    await asyncio.to_thread(doc_ref.delete)
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    team_id = user_snap.to_dict().get("team_id") if user_snap.exists else None
    if team_id:
        await asyncio.to_thread(team_col(team_id, "quotes").document(quote_id).delete)
    return {"message": "Quote deleted"}


# @api_router.get("/quotes/{quote_id}/pdf")
# async def get_quote_pdf(quote_id: str, current_user: User = Depends(get_current_user)):
# quote = await db.quotes.find_one({"id": quote_id, "uid": current_user.uid}, {"_id": 0})
# if not quote:
# raise HTTPException(status_code=404, detail="Quote not found")
# pdf_bytes = await quote_pdf_bytes(quote)
# return Response(content=pdf_bytes, media_type="application/pdf")


@api_router.put("/quotes/{quote_id}/status")
async def update_quote_status(
    quote_id: str, status: str, user: Dict[str, Any] = Depends(verify_token)
):
    update_data = {"status": status, "updated_at": datetime.utcnow()}
    await asyncio.to_thread(
        user_col(user["uid"], "quotes").document(quote_id).update, update_data
    )
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    team_id = user_snap.to_dict().get("team_id") if user_snap.exists else None
    if team_id:
        await asyncio.to_thread(
            team_col(team_id, "quotes").document(quote_id).update, update_data
        )
    updated = await asyncio.to_thread(
        user_col(user["uid"], "quotes").document(quote_id).get
    )
    return updated.to_dict()


# Invoices endpoints
@api_router.get("/invoices")
async def get_invoices(user: Dict[str, Any] = Depends(verify_token)):
    invoices = await stream_docs(
        user_col(user["uid"], "invoices").order_by(
            "created_at", direction=firestore.Query.DESCENDING
        )
    )
    return invoices


@api_router.post("/invoices")
async def create_invoice(
    invoice_request: InvoiceCreateRequest, user: Dict[str, Any] = Depends(verify_token)
):
    # Generate invoice number
    invoice_count = len(await stream_docs(user_col(user["uid"], "invoices")))
    invoice_number = f"FACT-{datetime.now().year}-{invoice_count + 1:04d}"

    invoice_data = invoice_request.dict()
    invoice_data["invoice_number"] = invoice_number
    invoice_data["due_date"] = datetime.fromisoformat(
        invoice_data["due_date"].replace("Z", "+00:00")
    )

    # Calculate totals
    subtotal = sum(
        item["quantity"] * item["unit_price"] for item in invoice_data["items"]
    )
    tax_amount = subtotal * (invoice_data["tax_rate"] / 100)
    total = subtotal + tax_amount

    invoice_data.update(
        {"subtotal": subtotal, "tax_amount": tax_amount, "total": total}
    )

    invoice = Invoice(uid=user["uid"], **invoice_data)

    await asyncio.to_thread(
        user_col(user["uid"], "invoices").document(invoice.id).set, invoice.dict()
    )
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    team_id = user_snap.to_dict().get("team_id") if user_snap.exists else None
    if team_id:
        await asyncio.to_thread(
            team_col(team_id, "invoices").document(invoice.id).set, invoice.dict()
        )
    return invoice


@api_router.put("/invoices/{invoice_id}")
async def update_invoice(
    invoice_id: str,
    invoice_request: InvoiceCreateRequest,
    user: Dict[str, Any] = Depends(verify_token),
):
    invoice_data = invoice_request.dict()
    invoice_data["due_date"] = datetime.fromisoformat(
        invoice_data["due_date"].replace("Z", "+00:00")
    )

    subtotal = sum(
        item["quantity"] * item["unit_price"] for item in invoice_data["items"]
    )
    tax_amount = subtotal * (invoice_data["tax_rate"] / 100)
    total = subtotal + tax_amount

    invoice_data.update(
        {
            "subtotal": subtotal,
            "tax_amount": tax_amount,
            "total": total,
            "updated_at": datetime.utcnow(),
        }
    )

    await asyncio.to_thread(
        user_col(user["uid"], "invoices").document(invoice_id).update, invoice_data
    )
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    team_id = user_snap.to_dict().get("team_id") if user_snap.exists else None
    if team_id:
        await asyncio.to_thread(
            team_col(team_id, "invoices").document(invoice_id).update, invoice_data
        )
    updated = await asyncio.to_thread(
        user_col(user["uid"], "invoices").document(invoice_id).get
    )
    return updated.to_dict()


# @api_router.get("/invoices/{invoice_id}/pdf")
# async def get_invoice_pdf(invoice_id: str, current_user: User = Depends(get_current_user)):
#    invoice = await db.invoices.find_one({"id": invoice_id, "uid": current_user.uid}, {"_id": 0})
#   if not invoice:
#      raise HTTPException(status_code=404, detail="Invoice not found")
# pdf_bytes = await invoice_pdf_bytes(invoice)
# return Response(content=pdf_bytes, media_type="application/pdf")


@api_router.delete("/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str, user: Dict[str, Any] = Depends(verify_token)):
    doc_ref = user_col(user["uid"], "invoices").document(invoice_id)
    snap = await asyncio.to_thread(doc_ref.get)
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Invoice not found")
    await asyncio.to_thread(doc_ref.delete)
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    team_id = user_snap.to_dict().get("team_id") if user_snap.exists else None
    if team_id:
        await asyncio.to_thread(
            team_col(team_id, "invoices").document(invoice_id).delete
        )
    return {"message": "Invoice deleted"}


@api_router.put("/invoices/{invoice_id}/status")
async def update_invoice_status(
    invoice_id: str, status: str, user: Dict[str, Any] = Depends(verify_token)
):
    update_data = {"status": status, "updated_at": datetime.utcnow()}
    if status == "paid":
        update_data["paid_date"] = datetime.utcnow()

    await asyncio.to_thread(
        user_col(user["uid"], "invoices").document(invoice_id).update, update_data
    )
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    team_id = user_snap.to_dict().get("team_id") if user_snap.exists else None
    if team_id:
        await asyncio.to_thread(
            team_col(team_id, "invoices").document(invoice_id).update, update_data
        )
    updated = await asyncio.to_thread(
        user_col(user["uid"], "invoices").document(invoice_id).get
    )
    return updated.to_dict()


# Teams endpoints
@api_router.post("/teams")
async def create_team(
    team_request: TeamCreateRequest, user: Dict[str, Any] = Depends(verify_token)
):
    team = Team(name=team_request.name, members=[user["uid"]], created_by=user["uid"])

    await asyncio.to_thread(
        db.collection("teams").document(team.team_id).set, team.dict()
    )
    await asyncio.to_thread(user_doc(user["uid"]).update, {"team_id": team.team_id})

    return team


@api_router.get("/teams/my")
async def get_my_team(user: Dict[str, Any] = Depends(verify_token)):
    logger.info("/teams/my called for %s", user.get("uid"))
    try:
        user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
        db_user = user_snap.to_dict() if user_snap.exists else None
        if not db_user or not db_user.get("team_id"):
            return {"team": None}

        team_snap = await asyncio.to_thread(
            db.collection("teams").document(db_user["team_id"]).get
        )
        team = team_snap.to_dict() if team_snap.exists else None
        if not team:
            return {"team": None}

        members = []
        for member_uid in team.get("members", []):
            snap = await asyncio.to_thread(
                db.collection("users").document(member_uid).get
            )
            member = snap.to_dict() if snap.exists else None
            if member:
                members.append(
                    {
                        "uid": member["uid"],
                        "name": member["name"],
                        "email": member["email"],
                    }
                )

        return {
            "team": {
                "team_id": team["team_id"],
                "name": team["name"],
                "invite_code": team.get("invite_code"),
                "members": members,
                "created_by": team.get("created_by"),
            }
        }
    except Exception as e:
        logger.error("get_my_team error: %s", e, exc_info=True)
        return {"team": None}


# Translate endpoint (server-side proxy)
@api_router.post("/translate")
async def translate_html(payload: Dict[str, Any]):
    logger.info("/translate called")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://translate-pa.googleapis.com/v1/translateHtml",
                json=payload,
            )
            return Response(content=resp.content, media_type="application/json")
    except Exception as e:
        logger.error("translate_html error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Translation failed")


# Health check route
@api_router.get("/ping")
async def ping(user: Dict[str, Any] = Depends(verify_token)):
    try:
        test_ref = db.collection("_ping").document("ping")
        await asyncio.to_thread(test_ref.set, {"ok": True})
        return {"status": "ok", "uid": user.get("uid")}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# Firestore test route
@api_router.get("/test-firestore")
async def test_firestore():
    test_ref = db.collection("test").document("ping")
    await asyncio.to_thread(test_ref.set, {"hello": "world"})
    snap = await asyncio.to_thread(test_ref.get)
    return snap.to_dict()


# Basic test route
@api_router.get("/")
async def root():
    return {"message": "Fleemy API is running!"}


# Include the router in the main app
app.include_router(api_router)

from fastapi.responses import JSONResponse
from fastapi.requests import Request
from fastapi.exception_handlers import RequestValidationError
from fastapi.exceptions import RequestValidationError as FastAPIRequestValidationError


@app.exception_handler(FastAPIRequestValidationError)
async def validation_exception_handler(
    request: Request, exc: FastAPIRequestValidationError
):
    logger.error("Erreur de validation : %s", exc.errors())
    return JSONResponse(
        status_code=422,
        content={"errors": exc.errors()},
        headers={"Access-Control-Allow-Origin": "*"},
    )
