from fastapi import (
    FastAPI,
    APIRouter,
    HTTPException,
    Header,
    Depends,
    Response,
    Request,
    Body,
)
from dotenv import load_dotenv, find_dotenv
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Tuple
import uuid
from datetime import datetime, timezone
import asyncio
import json
import calendar
import httpx
import re
import secrets
import string

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

# For testing purposes, use in-memory database
try:
    if not firebase_admin._apps:
        cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        if cred_path and os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
            db = firestore.client()
        else:
            # Use in-memory database for testing
            from firebase import InMemoryFirestore
            db = InMemoryFirestore()
            logger.info("Using in-memory Firestore for testing")
except Exception as e:
    logger.error(f"Firebase initialization failed: {e}")
    # Fallback to in-memory database
    from firebase import InMemoryFirestore
    db = InMemoryFirestore()
    logger.info("Using in-memory Firestore fallback")

# Créer l'application FastAPI
app = FastAPI()

# Configurer CORS (après app et après dotenv)
from fastapi.middleware.cors import CORSMiddleware

# ✅ FIXED pour production: CORS origins explicit + wildcard preview support
ALLOWED_ORIGINS = {
    "http://localhost:5173",
    "https://fleemy.web.app",
    "https://fleemy-21118.web.app",
    "https://fleemy.vercel.app",
}
ALLOWED_ORIGIN_REGEX = r"https://([a-z0-9-]+\.)?fleemy\.vercel\.app$"

logger.info(
    "CORS activé pour : %s et regex %s",
    sorted(ALLOWED_ORIGINS),
    ALLOWED_ORIGIN_REGEX,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(ALLOWED_ORIGINS),
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
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

    # For testing purposes, allow a test token
    if token == "test-token-123":
        mock_user = {
            "uid": "test-user-123",
            "email": "test@example.com",
            "name": "Test User"
        }
        request.state.user = mock_user
        logger.info("Using test token for user: %s", mock_user.get("uid"))
        return mock_user

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


def _apply_cors_headers(request: Request, response: Response) -> Response:
    """Apply CORS headers consistently on any response when origin allowed."""
    origin = request.headers.get("origin")
    if origin:
        if origin in ALLOWED_ORIGINS or re.match(ALLOWED_ORIGIN_REGEX, origin):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            # For preflight responses make sure browsers receive the same
            # negotiation headers that CORSMiddleware would add. Without these
            # headers the browser treats the preflight as a failure even if the
            # origin itself is allowed, which is what happened on production
            # when FastAPI raised an error before CORSMiddleware handled the
            # request.
            if request.method == "OPTIONS":
                requested_method = request.headers.get("Access-Control-Request-Method")
                requested_headers = request.headers.get("Access-Control-Request-Headers")

                if requested_method:
                    response.headers["Access-Control-Allow-Methods"] = requested_method
                else:
                    response.headers.setdefault("Access-Control-Allow-Methods", "*")

                if requested_headers:
                    response.headers["Access-Control-Allow-Headers"] = requested_headers
                else:
                    response.headers.setdefault("Access-Control-Allow-Headers", "*")

                response.headers.setdefault("Access-Control-Max-Age", "86400")
            # Keep compatibility with caches/proxies when varying by origin
            existing_vary = response.headers.get("Vary")
            if existing_vary:
                if "origin" not in existing_vary.lower():
                    response.headers["Vary"] = f"{existing_vary}, Origin"
            else:
                response.headers["Vary"] = "Origin"
    return response


def _build_cors_error_response(request: Request, content: Dict[str, Any]) -> JSONResponse:
    """Ensure custom error responses keep CORS headers."""
    response = JSONResponse(status_code=200, content=content)
    return _apply_cors_headers(request, response)

@app.middleware("http")
async def error_handling_middleware(request: Request, call_next):
    try:
        response = await call_next(request)
        return _apply_cors_headers(request, response)
    except RequestValidationError as exc:
        logger.error("Validation error on %s: %s", request.url.path, exc, exc_info=True)
        return _build_cors_error_response(
            request, {"success": False, "error": str(exc)}
        )
    except HTTPException as exc:
        logger.error(
            "HTTPException on %s [%s]: %s",
            request.url.path,
            exc.status_code,
            exc.detail,
            exc_info=True,
        )
        return _build_cors_error_response(
            request, {"success": False, "error": exc.detail}
        )
    except Exception as exc:
        logger.error("Unhandled server error on %s: %s", request.url.path, exc, exc_info=True)
        # Never expose raw 500 errors to the client
        return _build_cors_error_response(
            request, {"success": False, "error": str(exc)}
        )


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
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_context: Optional[Dict[str, Any]] = None


class Team(BaseModel):
    team_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    members: List[str] = []
    owner_uid: str
    invite_code: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    invite_expires_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


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
    team_id: Optional[str] = None
    owner_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


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
    team_id: Optional[str] = None
    owner_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Todo(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    uid: str
    title: str
    description: Optional[str] = ""
    priority: str = "normal"  # "low", "normal", "urgent"
    completed: bool = False
    due_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


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
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


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
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


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
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Request models


class EventCreateRequest(BaseModel):
    description: str
    client_id: Optional[str] = ""  # ID from clients collection
    client_name: str  # client_label for display
    day: str
    start_time: str
    end_time: str
    status: str = "pending"
    hourly_rate: Optional[float] = 50.0
    year: Optional[int] = None
    week: Optional[int] = None
    team_id: Optional[str] = None


class TaskCreateRequest(BaseModel):
    name: str
    price: float
    color: str
    icon: str
    time_slots: List[Dict[str, str]] = []
    year: Optional[int] = None
    week: Optional[int] = None
    team_id: Optional[str] = None


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


class ClientUpdateRequest(BaseModel):
    display_name: Optional[str] = None
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[Address] = None
    notes: Optional[str] = None
    is_archived: Optional[bool] = None


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


class InvoiceStatusUpdate(BaseModel):
    status: str


class TeamCreateRequest(BaseModel):
    name: str


class TeamJoinRequest(BaseModel):
    code: str


class EnsureMembershipRequest(BaseModel):
    include_joined_at: bool = False


class LastContextUpdate(BaseModel):
    type: str  # "solo" or "team"
    team_id: Optional[str] = None


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


def _parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        if not isinstance(value, str):
            value = str(value)
        if value.endswith("Z"):
            value = value[:-1] + "+00:00"
        dt = datetime.fromisoformat(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


async def ensure_team_membership(team_id: str, user_uid: str) -> Dict[str, Any]:
    team_snap = await asyncio.to_thread(db.collection("teams").document(team_id).get)
    team = team_snap.to_dict() if team_snap.exists else None
    if not team or user_uid not in (team.get("members", []) + [team.get("owner_uid")]):
        raise HTTPException(status_code=403, detail="Not authorized for this team")
    return team


async def ensure_membership_documents(
    team_id: str,
    user_info: Dict[str, Any],
    include_joined_at: bool = False,
) -> Dict[str, bool]:
    """Ensure the Firestore membership/member docs exist for the user."""
    uid = user_info.get("uid")
    if not uid:
        raise HTTPException(status_code=400, detail="Missing user identifier")

    display_name = (
        user_info.get("name")
        or user_info.get("displayName")
        or user_info.get("email")
    )
    email = user_info.get("email")

    try:
        profile_snap = await asyncio.to_thread(user_doc(uid).get)
        if profile_snap.exists:
            profile_data = profile_snap.to_dict() or {}
            display_name = profile_data.get("name") or display_name
            email = profile_data.get("email") or email
    except Exception as profile_error:  # pragma: no cover - defensive logging
        logger.warning(
            "Failed to fetch user profile for membership: %s", profile_error
        )

    membership_ref = (
        db.collection("teams")
        .document(team_id)
        .collection("memberships")
        .document(uid)
    )
    member_ref = (
        db.collection("teams")
        .document(team_id)
        .collection("members")
        .document(uid)
    )

    membership_snap, member_snap = await asyncio.gather(
        asyncio.to_thread(membership_ref.get),
        asyncio.to_thread(member_ref.get),
    )

    membership_payload: Dict[str, Any] = {
        "displayName": display_name,
        "email": email,
        "lastSeenAt": firestore.SERVER_TIMESTAMP,
    }
    if include_joined_at and not getattr(membership_snap, "exists", False):
        membership_payload["joinedAt"] = firestore.SERVER_TIMESTAMP

    member_payload: Dict[str, Any] = {
        "uid": uid,
        "displayName": display_name,
        "email": email,
        "team_id": team_id,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }
    if not getattr(member_snap, "exists", False):
        member_payload["created_at"] = firestore.SERVER_TIMESTAMP

    await asyncio.gather(
        asyncio.to_thread(membership_ref.set, membership_payload, merge=True),
        asyncio.to_thread(member_ref.set, member_payload, merge=True),
    )

    created_membership = not getattr(membership_snap, "exists", False)
    created_member = not getattr(member_snap, "exists", False)

    logger.info(
        "Ensured membership docs for user %s in team %s (created membership=%s member=%s)",
        uid,
        team_id,
        created_membership,
        created_member,
    )

    return {
        "membership_created": created_membership,
        "member_created": created_member,
    }


async def resolve_planning_context(
    team_id: Optional[str],
    member_uid: Optional[str],
    requester_uid: str,
) -> Tuple[Any, Any, Optional[str]]:
    if team_id:
        await ensure_team_membership(team_id, requester_uid)
        target_member = member_uid or requester_uid
        member_ref = (
            db.collection("teams")
            .document(team_id)
            .collection("members")
            .document(target_member)
        )
        events_ref = member_ref.collection("planningEvents")
        tasks_ref = member_ref.collection("weeklyTasks")
        return events_ref, tasks_ref, target_member

    target_uid = member_uid or requester_uid
    if target_uid != requester_uid:
        raise HTTPException(status_code=403, detail="Not authorized for this user")

    user_ref = user_doc(target_uid)
    events_ref = user_ref.collection("planningEvents")
    tasks_ref = user_ref.collection("weeklyTasks")
    return events_ref, tasks_ref, target_uid


def generate_invite_code(length=8):
    """Generate a unique uppercase alphanumeric invite code."""
    chars = string.ascii_uppercase + string.digits
    while True:
        code = ''.join(secrets.choice(chars) for _ in range(length))
        # Check if code already exists
        teams_ref = db.collection("teams")
        existing = teams_ref.where("invite_code", "==", code).limit(1).stream()
        if not list(existing):
            return code


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
                "last_context": db_user.get("last_context"),
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


@api_router.put("/auth/context")
async def update_last_context(
    context: LastContextUpdate,
    user: Dict[str, Any] = Depends(verify_token)
):
    """Update user's last context (solo or team)."""
    try:
        user_ref = user_doc(user["uid"])
        context_data = context.dict()
        await asyncio.to_thread(user_ref.update, {
            "last_context": context_data,
            "updated_at": firestore.SERVER_TIMESTAMP
        })
        return {"success": True, "context": context_data}
    except Exception as e:
        logger.error("update_last_context error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


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
            await ensure_team_membership(team_id, user["uid"])
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
            await ensure_team_membership(team_id, user["uid"])
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
        now = datetime.now(timezone.utc)
        year = event_request.year or now.year
        week = event_request.week or now.isocalendar()[1]

        target_team_id = event_request.team_id or None
        if target_team_id:
            await ensure_team_membership(target_team_id, user["uid"])
            events_ref = team_col(target_team_id, "events")
        else:
            events_ref = user_col(user["uid"], "events")

        event = PlanningEvent(
            uid=user["uid"],
            week=week,
            year=year,
            description=event_request.description,
            client_id=event_request.client_id or "",
            client_name=event_request.client_name,
            day=event_request.day,
            start_time=event_request.start_time,
            end_time=event_request.end_time,
            status=event_request.status,
            hourly_rate=(
                event_request.hourly_rate if event_request.hourly_rate is not None else 50.0
            ),
            team_id=target_team_id,
            owner_id=user["uid"],
        )
        event_payload = event.dict()
        await asyncio.to_thread(
            events_ref.document(event.id).set,
            event_payload,
        )
        await asyncio.to_thread(
            global_event_doc(year, week, event.id).set,
            event_payload,
        )
        return {"success": True, "event": event_payload}
    except Exception as e:
        logger.error("create_event error: %s", e, exc_info=True)
        return {"success": False, "error": str(e)}


@api_router.put("/planning/events/{event_id}")
async def update_event(
    event_id: str,
    event_request: EventCreateRequest,
    user: Dict[str, Any] = Depends(verify_token),
):
    target_team_id = event_request.team_id or None
    if target_team_id:
        await ensure_team_membership(target_team_id, user["uid"])
        doc_ref = team_col(target_team_id, "events").document(event_id)
    else:
        doc_ref = user_col(user["uid"], "events").document(event_id)

    snap = await asyncio.to_thread(doc_ref.get)
    if not snap.exists:
        return {"success": False, "error": "Event not found"}

    existing = snap.to_dict()
    owner_id = existing.get("owner_id", existing.get("uid", user["uid"]))
    new_year = event_request.year or existing.get("year")
    new_week = event_request.week or existing.get("week")
    update_fields = {
        "description": event_request.description,
        "client_id": event_request.client_id or "",
        "client_name": event_request.client_name,
        "day": event_request.day,
        "start_time": event_request.start_time,
        "end_time": event_request.end_time,
        "status": event_request.status,
        "hourly_rate": (
            event_request.hourly_rate
            if event_request.hourly_rate is not None
            else existing.get("hourly_rate", 50.0)
        ),
        "year": new_year,
        "week": new_week,
        "team_id": target_team_id,
        "owner_id": owner_id,
        "uid": owner_id,
        "updated_at": datetime.now(timezone.utc),
    }
    await asyncio.to_thread(doc_ref.update, update_fields)

    payload = {**existing, **update_fields}
    existing_year = existing.get("year")
    existing_week = existing.get("week")
    if existing_year and existing_week:
        await asyncio.to_thread(
            global_event_doc(existing_year, existing_week, event_id).delete
        )
    await asyncio.to_thread(
        global_event_doc(new_year, new_week, event_id).set,
        payload,
    )
    return {"success": True, "event": payload}


@api_router.delete("/planning/events/{event_id}")
async def delete_event(
    event_id: str,
    team_id: Optional[str] = None,
    user: Dict[str, Any] = Depends(verify_token),
):
    team_id = team_id or None
    if team_id:
        await ensure_team_membership(team_id, user["uid"])
        doc_ref = team_col(team_id, "events").document(event_id)
    else:
        doc_ref = user_col(user["uid"], "events").document(event_id)

    snap = await asyncio.to_thread(doc_ref.get)
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Event not found")

    data = snap.to_dict()
    await asyncio.to_thread(doc_ref.delete)
    year = data.get("year")
    week = data.get("week")
    if year and week:
        await asyncio.to_thread(
            global_event_doc(year, week, event_id).delete
        )
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
        await ensure_team_membership(team_id, user["uid"])
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
    now = datetime.now(timezone.utc)
    year = task_request.year or now.year
    week = task_request.week or now.isocalendar()[1]
    target_team_id = task_request.team_id or None
    if target_team_id:
        await ensure_team_membership(target_team_id, user["uid"])
        tasks_ref = team_col(target_team_id, "tasks")
    else:
        tasks_ref = user_col(user["uid"], "tasks")
    task_data = task_request.dict(exclude={"year", "week", "team_id"})
    task = WeeklyTask(
        uid=user["uid"],
        week=week,
        year=year,
        team_id=target_team_id,
        owner_id=user["uid"],
        **task_data,
    )
    task_payload = task.dict()
    await asyncio.to_thread(
        tasks_ref.document(task.id).set,
        task_payload,
    )
    await asyncio.to_thread(
        global_task_doc(year, week, user["uid"], task.id).set,
        task_payload,
    )
    return {"success": True, "task": task_payload}


@api_router.put("/planning/tasks/{task_id}")
async def update_task(
    task_id: str,
    task_request: TaskCreateRequest,
    user: Dict[str, Any] = Depends(verify_token),
):
    doc_ref = user_col(user["uid"], "tasks").document(task_id)
    snap = await asyncio.to_thread(doc_ref.get)
    existing_team_id: Optional[str] = None

    if not snap.exists:
        target_team_id = task_request.team_id
        if not target_team_id:
            return {"success": False, "error": "Task not found"}
        await ensure_team_membership(target_team_id, user["uid"])
        doc_ref = team_col(target_team_id, "tasks").document(task_id)
        snap = await asyncio.to_thread(doc_ref.get)
        if not snap.exists:
            return {"success": False, "error": "Task not found"}
        existing_team_id = target_team_id
    else:
        existing_team_id = snap.to_dict().get("team_id")

    existing = snap.to_dict()
    owner_id = existing.get("owner_id", existing.get("uid", user["uid"]))
    incoming = task_request.dict(exclude_unset=True)
    new_year = incoming.pop("year", existing.get("year"))
    new_week = incoming.pop("week", existing.get("week"))
    requested_team_id = incoming.pop("team_id", None)
    if isinstance(requested_team_id, str) and not requested_team_id.strip():
        requested_team_id = None
    target_team_id = (
        requested_team_id
        if requested_team_id is not None
        else existing_team_id
    )
    if target_team_id:
        await ensure_team_membership(target_team_id, user["uid"])

    update_fields = {
        **incoming,
        "year": new_year,
        "week": new_week,
        "team_id": target_team_id,
        "owner_id": owner_id,
        "uid": owner_id,
        "updated_at": datetime.now(timezone.utc),
    }

    payload = {**existing, **update_fields}

    destination_ref = (
        team_col(target_team_id, "tasks").document(task_id)
        if target_team_id
        else user_col(user["uid"], "tasks").document(task_id)
    )

    if destination_ref.path == doc_ref.path:
        await asyncio.to_thread(doc_ref.update, update_fields)
    else:
        await asyncio.to_thread(destination_ref.set, payload)
        await asyncio.to_thread(doc_ref.delete)

    existing_year = existing.get("year")
    existing_week = existing.get("week")
    if existing_year and existing_week and (
        existing_year != new_year or existing_week != new_week
    ):
        await asyncio.to_thread(
            global_task_doc(existing_year, existing_week, owner_id, task_id).delete
        )
    if new_year and new_week:
        await asyncio.to_thread(
            global_task_doc(new_year, new_week, owner_id, task_id).set,
            payload,
        )

    return {"success": True, "task": payload}


@api_router.delete("/planning/tasks/{task_id}")
async def delete_task(
    task_id: str,
    team_id: Optional[str] = None,
    user: Dict[str, Any] = Depends(verify_token),
):
    team_id = team_id or None
    if team_id:
        await ensure_team_membership(team_id, user["uid"])
        doc_ref = team_col(team_id, "tasks").document(task_id)
    else:
        doc_ref = user_col(user["uid"], "tasks").document(task_id)

    snap = await asyncio.to_thread(doc_ref.get)
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Task not found")

    data = snap.to_dict()
    await asyncio.to_thread(doc_ref.delete)
    year = data.get("year")
    week = data.get("week")
    owner_id = data.get("owner_id", data.get("uid", user["uid"]))
    if year and week:
        await asyncio.to_thread(
            global_task_doc(year, week, owner_id, task_id).delete
        )
    return {"success": True, "message": "deleted"}


def _serialize_planning_payload(data: Dict[str, Any], team_id: Optional[str], owner_uid: Optional[str]) -> Dict[str, Any]:
    payload = {**data}
    if "start" in payload:
        payload["start"] = _serialize_timestamp(payload.get("start"))
    if "end" in payload:
        payload["end"] = _serialize_timestamp(payload.get("end"))
    if "created_at" in payload:
        payload["created_at"] = _serialize_timestamp(payload.get("created_at"))
    if "updated_at" in payload:
        payload["updated_at"] = _serialize_timestamp(payload.get("updated_at"))
    if owner_uid and not payload.get("owner_uid"):
        payload["owner_uid"] = owner_uid
    if owner_uid and not payload.get("user_id"):
        payload["user_id"] = owner_uid
    if team_id and not payload.get("team_id"):
        payload["team_id"] = team_id
    return payload


@api_router.get("/planning/v2/events")
async def list_planning_events_v2(
    from_iso: Optional[str] = None,
    to_iso: Optional[str] = None,
    team_id: Optional[str] = None,
    member_uid: Optional[str] = None,
    user: Dict[str, Any] = Depends(verify_token),
):
    try:
        events_ref, _tasks_ref, target_member = await resolve_planning_context(
            team_id,
            member_uid,
            user["uid"],
        )

        query_ref = events_ref.order_by("start")
        start_dt = _parse_iso_datetime(from_iso)
        end_dt = _parse_iso_datetime(to_iso)

        if start_dt:
            query_ref = query_ref.where("start", ">=", start_dt)
        if end_dt:
            query_ref = query_ref.where("start", "<=", end_dt)

        docs = await asyncio.to_thread(lambda: list(query_ref.stream()))
        events: List[Dict[str, Any]] = []
        for doc in docs:
            data = doc.to_dict() or {}
            payload = _serialize_planning_payload(data, team_id, target_member)
            payload["id"] = doc.id
            events.append(payload)

        return {"success": True, "events": events}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("planning v2 events error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Impossible de récupérer les événements")


@api_router.get("/planning/v2/weekly-tasks")
async def list_weekly_tasks_v2(
    team_id: Optional[str] = None,
    member_uid: Optional[str] = None,
    user: Dict[str, Any] = Depends(verify_token),
):
    try:
        _events_ref, tasks_ref, target_member = await resolve_planning_context(
            team_id,
            member_uid,
            user["uid"],
        )

        docs = await asyncio.to_thread(lambda: list(tasks_ref.stream()))
        tasks: List[Dict[str, Any]] = []
        for doc in docs:
            data = doc.to_dict() or {}
            payload = _serialize_planning_payload(data, team_id, target_member)
            payload["id"] = doc.id
            tasks.append(payload)

        return {"success": True, "tasks": tasks}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("planning v2 weekly tasks error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Impossible de récupérer les tâches hebdomadaires")


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

    update_data = {**todo_data, "updated_at": datetime.now(timezone.utc)}
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
            "updated_at": datetime.now(timezone.utc),
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


# Validation helpers
def validate_email(email: str) -> bool:
    """Validate email format"""
    if not email:
        return True  # Optional field
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))


def validate_french_phone(phone: str) -> bool:
    """Validate French phone format"""
    if not phone:
        return True  # Optional field
    # Remove spaces, dots, dashes
    cleaned = re.sub(r'[\s\.\-]', '', phone)
    # French formats: 0612345678 or +33612345678
    pattern = r'^(?:(?:\+|00)33|0)[1-9](?:\d{8})$'
    return bool(re.match(pattern, cleaned))


# Clients endpoints
@api_router.get("/clients")
async def get_clients(
    user: Dict[str, Any] = Depends(verify_token),
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    include_archived: bool = False
):
    """Get clients with pagination and search"""
    try:
        # Collection reference using new collection name
        clients_ref = db.collection("clients")
        query = clients_ref.where("user_id", "==", user["uid"])
        
        # Filter archived clients
        if not include_archived:
            query = query.where("is_archived", "==", False)
        
        # Get all matching clients
        all_clients = await stream_docs(query)
        
        # Apply search filter if provided
        if search:
            search_lower = search.lower()
            all_clients = [
                c for c in all_clients 
                if search_lower in c.get("display_name", "").lower()
            ]
        
        # Sort by display_name
        all_clients.sort(key=lambda x: x.get("display_name", "").lower())
        
        # Apply pagination
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        paginated_clients = all_clients[start_idx:end_idx]
        
        return {
            "clients": paginated_clients,
            "total": len(all_clients),
            "page": page,
            "limit": limit,
            "has_more": end_idx < len(all_clients)
        }
    except Exception as e:
        logger.error("get_clients error: %s", e, exc_info=True)
        return {"clients": [], "total": 0, "page": 1, "limit": limit, "has_more": False}


@api_router.post("/clients")
async def create_client(
    client_request: ClientCreateRequest, user: Dict[str, Any] = Depends(verify_token)
):
    """Create a new client with strict validation"""
    data = client_request.dict()
    
    # Validate display_name is required
    if not data.get("display_name") or not data["display_name"].strip():
        raise HTTPException(status_code=400, detail="display_name is required")
    
    # Validate email format
    if data.get("email") and not validate_email(data["email"]):
        raise HTTPException(status_code=400, detail="Invalid email format")
    
    # Validate phone format
    if data.get("phone") and not validate_french_phone(data["phone"]):
        raise HTTPException(status_code=400, detail="Invalid phone format (French format required)")
    
    # Create client with new structure
    client = Client(user_id=user["uid"], **data)
    
    # Store in new global collection
    await asyncio.to_thread(
        db.collection("clients").document(client.id).set, client.dict()
    )
    return client


@api_router.patch("/clients/{client_id}")
async def update_client(
    client_id: str,
    client_request: ClientUpdateRequest,
    user: Dict[str, Any] = Depends(verify_token),
):
    """Update a client (PATCH method as specified)"""
    # Verify ownership
    doc_ref = db.collection("clients").document(client_id)
    snap = await asyncio.to_thread(doc_ref.get)
    
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Client not found")
    
    existing = snap.to_dict()
    if existing.get("user_id") != user["uid"]:
        raise HTTPException(status_code=403, detail="Not authorized to modify this client")
    
    data = client_request.dict(exclude_unset=True)
    
    # Only validate fields that are being updated
    if "display_name" in data and (not data["display_name"] or not data["display_name"].strip()):
        raise HTTPException(status_code=400, detail="display_name cannot be empty")
    
    # Validate email format if provided
    if "email" in data and data["email"] and not validate_email(data["email"]):
        raise HTTPException(status_code=400, detail="Invalid email format")
    
    # Validate phone format if provided
    if "phone" in data and data["phone"] and not validate_french_phone(data["phone"]):
        raise HTTPException(status_code=400, detail="Invalid phone format (French format required)")
    
    update_data = {**data, "updated_at": datetime.now(timezone.utc)}
    await asyncio.to_thread(doc_ref.update, update_data)
    
    updated = await asyncio.to_thread(doc_ref.get)
    return updated.to_dict()


@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, user: Dict[str, Any] = Depends(verify_token)):
    """Delete a client permanently"""
    doc_ref = db.collection("clients").document(client_id)
    snap = await asyncio.to_thread(doc_ref.get)

    if not snap.exists:
        raise HTTPException(status_code=404, detail="Client not found")
    
    existing = snap.to_dict()
    if existing.get("user_id") != user["uid"]:
        raise HTTPException(status_code=403, detail="Not authorized to delete this client")
    
    await asyncio.to_thread(doc_ref.delete)
    return {"message": "Client deleted", "success": True}


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
    quote_number = f"DEV-{datetime.now(timezone.utc).year}-{quote_count + 1:04d}"

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
            "updated_at": datetime.now(timezone.utc),
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


@api_router.put("/quotes/{quote_id}/status")
async def update_quote_status(
    quote_id: str, status: str, user: Dict[str, Any] = Depends(verify_token)
):
    update_data = {"status": status, "updated_at": datetime.now(timezone.utc)}
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
    invoice_number = f"FACT-{datetime.now(timezone.utc).year}-{invoice_count + 1:04d}"

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
            "updated_at": datetime.now(timezone.utc),
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
    invoice_id: str,
    status_update: Optional[InvoiceStatusUpdate] = Body(None),
    status: Optional[str] = None,
    user: Dict[str, Any] = Depends(verify_token),
):
    update_data = {"status": status, "updated_at": datetime.now(timezone.utc)}
    if status == "paid":
        update_data["paid_date"] = datetime.now(timezone.utc)

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
    """Create a new team with unique invite code."""
    try:
        # Validate team name
        name = team_request.name.strip()
        if len(name) < 2 or len(name) > 48:
            raise HTTPException(
                status_code=400,
                detail="Le nom de l'équipe doit contenir entre 2 et 48 caractères"
            )
        
        # Generate unique invite code
        invite_code = generate_invite_code(8)
        
        team = Team(
            name=name,
            members=[user["uid"]],
            owner_uid=user["uid"],
            invite_code=invite_code,
        )

        await asyncio.to_thread(
            db.collection("teams").document(team.team_id).set, team.dict()
        )

        await ensure_membership_documents(
            team.team_id,
            user,
            include_joined_at=True,
        )

        logger.info("Team created: %s by user %s", team.team_id, user["uid"])

        return {
            "success": True,
            "team_id": team.team_id,
            "name": team.name,
            "invite_code": team.invite_code,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("create_team error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/teams/join")
async def join_team(
    join_request: TeamJoinRequest,
    user: Dict[str, Any] = Depends(verify_token)
):
    """Join a team using an invite code."""
    try:
        # Normalize code to uppercase
        code = join_request.code.strip().upper()
        
        if not code:
            raise HTTPException(status_code=400, detail="Le code d'invitation est requis")
        
        # Find team by invite code
        teams_ref = db.collection("teams")
        query = teams_ref.where("invite_code", "==", code).limit(1)
        teams = list(await asyncio.to_thread(query.stream))
        
        if not teams:
            raise HTTPException(
                status_code=404,
                detail="Code d'invitation invalide ou expiré"
            )
        
        team_doc = teams[0]
        team_data = team_doc.to_dict()
        team_id = team_doc.id
        
        # Check expiration if set
        if team_data.get("invite_expires_at"):
            expiry = team_data["invite_expires_at"]
            if datetime.now(timezone.utc) > expiry:
                raise HTTPException(
                    status_code=400,
                    detail="Ce code d'invitation a expiré"
                )
        
        # Check if user is already a member
        current_members = team_data.get("members", [])
        if user["uid"] in current_members:
            # Already a member - return success (idempotent)
            return {
                "success": True,
                "team_id": team_id,
                "name": team_data.get("name"),
                "already_member": True,
            }
        
        # Add user to members
        current_members.append(user["uid"])
        await asyncio.to_thread(
            db.collection("teams").document(team_id).update,
            {
                "members": current_members,
                "updated_at": firestore.SERVER_TIMESTAMP,
            }
        )

        logger.info("User %s joined team %s", user["uid"], team_id)

        await ensure_membership_documents(
            team_id,
            user,
            include_joined_at=True,
        )

        return {
            "success": True,
            "team_id": team_id,
            "name": team_data.get("name"),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("join_team error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/teams/{team_id}/memberships/ensure")
async def ensure_membership_endpoint(
    team_id: str,
    ensure_request: EnsureMembershipRequest = Body(default=EnsureMembershipRequest()),
    user: Dict[str, Any] = Depends(verify_token),
):
    """Ensure membership/member documents exist for the authenticated user."""
    try:
        await ensure_team_membership(team_id, user["uid"])
        result = await ensure_membership_documents(
            team_id,
            user,
            include_joined_at=ensure_request.include_joined_at,
        )
        return {"success": True, "team_id": team_id, **result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("ensure_membership error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


def _serialize_timestamp(value: Any) -> Optional[str]:
    """Convert Firestore timestamp/datetime values to ISO strings for JSON responses."""
    if value is None:
        return None
    try:
        if isinstance(value, datetime):
            if value.tzinfo is None:
                return value.replace(tzinfo=timezone.utc).isoformat()
            return value.astimezone(timezone.utc).isoformat()
        # Firestore Timestamp objects also expose isoformat()
        if hasattr(value, "isoformat"):
            return value.isoformat()
    except Exception:  # pragma: no cover - defensive conversion
        pass
    return None


@api_router.get("/teams/{team_id}/memberships")
async def get_team_memberships(
    team_id: str,
    user: Dict[str, Any] = Depends(verify_token),
):
    """Return the list of memberships for the given team."""
    try:
        await ensure_team_membership(team_id, user["uid"])

        memberships_ref = team_col(team_id, "memberships")
        membership_docs = await asyncio.to_thread(lambda: list(memberships_ref.stream()))

        members: List[Dict[str, Any]] = []
        for membership_doc in membership_docs:
            data = membership_doc.to_dict() or {}
            members.append(
                {
                    "uid": membership_doc.id,
                    "displayName": data.get("displayName") or data.get("name"),
                    "email": data.get("email"),
                    "joinedAt": _serialize_timestamp(data.get("joinedAt")),
                    "lastSeenAt": _serialize_timestamp(data.get("lastSeenAt")),
                }
            )

        return {"success": True, "members": members}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("get_team_memberships error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Impossible de récupérer les membres")


@api_router.get("/teams/my")
async def get_my_teams(user: Dict[str, Any] = Depends(verify_token)):
    """Get all teams where the user is a member."""
    logger.info("/teams/my called for %s", user.get("uid"))
    try:
        # Query all teams where user is in members array
        teams_ref = db.collection("teams")
        query = teams_ref.where("members", "array_contains", user["uid"])
        teams_docs = await asyncio.to_thread(lambda: list(query.stream()))
        
        teams = []
        for team_doc in teams_docs:
            team_data = team_doc.to_dict()
            teams.append({
                "team_id": team_doc.id,
                "name": team_data.get("name"),
                "owner_uid": team_data.get("owner_uid"),
                "invite_code": team_data.get("invite_code"),
                "members_count": len(team_data.get("members", [])),
            })
        
        logger.info("Found %d teams for user %s", len(teams), user["uid"])
        
        return {"success": True, "teams": teams}
    except Exception as e:
        logger.error("get_my_teams error: %s", e, exc_info=True)
        return {"success": False, "teams": [], "error": str(e)}


@api_router.post("/teams/{team_id}/rotate-code")
async def rotate_invite_code(
    team_id: str,
    user: Dict[str, Any] = Depends(verify_token)
):
    """Regenerate the invite code for a team (owner only)."""
    try:
        team_ref = db.collection("teams").document(team_id)
        team_snap = await asyncio.to_thread(team_ref.get)
        
        if not team_snap.exists:
            raise HTTPException(status_code=404, detail="Équipe introuvable")
        
        team_data = team_snap.to_dict()
        
        # Verify user is the owner
        if team_data.get("owner_uid") != user["uid"]:
            raise HTTPException(
                status_code=403,
                detail="Seul le propriétaire peut régénérer le code"
            )
        
        # Generate new code
        new_code = generate_invite_code(8)
        
        # Update team
        await asyncio.to_thread(
            team_ref.update,
            {
                "invite_code": new_code,
                "updated_at": firestore.SERVER_TIMESTAMP,
            }
        )
        
        logger.info("Invite code rotated for team %s", team_id)
        
        return {"success": True, "invite_code": new_code}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("rotate_invite_code error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


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
