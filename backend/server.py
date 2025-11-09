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
from pydantic import BaseModel, Field, validator, EmailStr
from pydantic import field_validator
from pydantic import ValidationError

# Fallback local si EmailStr venait à ne pas valider faute de dépendance email-validator (environnements edge).
# Ne modifie pas le comportement standard quand email-validator est présent.
from typing import Annotated
from pydantic import StringConstraints
LocalEmailStr = Annotated[str, StringConstraints(pattern=r'^[^@\s]+@[^@\s]+.[^@\s]+$')]
# À l'usage, on continue d'utiliser EmailStr partout. LocalEmailStr est juste disponible si besoin ponctuel.

from typing import List, Optional, Dict, Any, Tuple, Literal, Set
import uuid
from datetime import datetime, timezone, timedelta
import asyncio
import json
import calendar
import httpx
import re
import secrets
import string
import subprocess

try:  # pragma: no cover - optional google exceptions import
    from google.api_core.exceptions import ServiceUnavailable as GoogleServiceUnavailable
except Exception:  # pragma: no cover - fallback when dependency missing
    class GoogleServiceUnavailable(Exception):  # type: ignore
        pass

try:  # pragma: no cover - optional google exceptions import
    from google.api_core.exceptions import DeadlineExceeded as GoogleDeadlineExceeded
except Exception:  # pragma: no cover - fallback when dependency missing
    class GoogleDeadlineExceeded(Exception):  # type: ignore
        pass

try:  # pragma: no cover - optional google exceptions import
    from google.api_core.exceptions import Internal as GoogleInternal
except Exception:  # pragma: no cover - fallback when dependency missing
    try:  # pragma: no cover - secondary fallback when Internal missing
        from google.api_core.exceptions import InternalServerError as GoogleInternal  # type: ignore
    except Exception:  # pragma: no cover - fallback when dependency missing
        class GoogleInternal(Exception):  # type: ignore
            pass

try:  # pragma: no cover - optional google exceptions import
    from google.api_core.exceptions import (
        NotFound,
        Forbidden,
        PermissionDenied,
        InvalidArgument,
        AlreadyExists,
        Aborted,
    )
except Exception:  # pragma: no cover - fallback when dependency missing
    class NotFound(Exception):  # type: ignore
        pass

    class Forbidden(Exception):  # type: ignore
        pass

    class PermissionDenied(Exception):  # type: ignore
        pass

    class InvalidArgument(Exception):  # type: ignore
        pass

    class AlreadyExists(Exception):  # type: ignore
        pass

    class Aborted(Exception):  # type: ignore
        pass

from .pdf_utils import document_filename, invoice_pdf_bytes, quote_pdf_bytes
from .email_utils import send_document_email

# Firebase Admin
import firebase_admin
from firebase_admin import credentials, firestore, auth

try:  # pragma: no cover - optional import when google client available
    from google.cloud.firestore_v1 import FieldPath as FirestoreFieldPath
except Exception:  # pragma: no cover - fallback when dependency missing
    FirestoreFieldPath = None

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
            from .firebase import InMemoryFirestore
            db = InMemoryFirestore()
            logger.info("Using in-memory Firestore for testing")
except Exception as e:
    logger.error(f"Firebase initialization failed: {e}")
    # Fallback to in-memory database
    from .firebase import InMemoryFirestore
    db = InMemoryFirestore()
    logger.info("Using in-memory Firestore fallback")

DOCUMENT_ID_FIELD = (
    FirestoreFieldPath.document_id() if FirestoreFieldPath else "__name__"
)

# Créer l'application FastAPI
app = FastAPI()

# Configurer CORS (après app et après dotenv)
from fastapi.middleware.cors import CORSMiddleware


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
    """Return the list of allowed origins including defaults.

    Deployments may provide a custom ``CORS_ORIGINS`` environment variable. In
    practice those overrides sometimes forget newer domains (for instance the
    Vercel preview URL). The previous implementation *replaced* the defaults
    whenever the variable was defined which meant legitimate origins could lose
    access and trigger CORS failures in production.

    To make the configuration resilient we now merge the custom entries with the
    defaults while preserving order and removing duplicates.
    """

    raw = os.getenv("CORS_ORIGINS", "")
    seen: Set[str] = set()
    origins: List[str] = []

    def _add(origin: str) -> None:
        cleaned = origin.strip()
        if cleaned and cleaned not in seen:
            origins.append(cleaned)
            seen.add(cleaned)

    if raw:
        for origin in raw.split(","):
            _add(origin)

    for origin in DEFAULT_ALLOWED_ORIGINS:
        _add(origin)

    return origins


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

logger.info("CORS activé pour : %s", ALLOWED_ORIGINS)

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


async def verify_token(request: Request):
    """Validate the Firebase token sent in the Authorization header."""  # ✅ CHECKED auth
    if request.method.upper() == "OPTIONS":
        logger.info("Skipping auth verification for preflight request on %s", request.url.path)
        return {"uid": "preflight"}

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
    if _is_origin_allowed(origin):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = ", ".join(ALLOWED_METHODS)
        response.headers["Access-Control-Allow-Headers"] = ", ".join(ALLOWED_HEADERS)
        response.headers["Access-Control-Expose-Headers"] = ", ".join(EXPOSE_HEADERS)
        response.headers["Access-Control-Max-Age"] = str(MAX_AGE)

        existing_vary = response.headers.get("Vary")
        if existing_vary:
            if "origin" not in existing_vary.lower():
                response.headers["Vary"] = f"{existing_vary}, Origin"
        else:
            response.headers["Vary"] = "Origin"
    return response


def _build_cors_error_response(
    request: Request, content: Dict[str, Any], status_code: int
) -> JSONResponse:
    """Ensure custom error responses keep CORS headers while keeping status."""
    response = JSONResponse(status_code=status_code, content=content)
    return _apply_cors_headers(request, response)


@app.options("/{full_path:path}")
async def handle_preflight(full_path: str, request: Request) -> Response:
    """Handle browser CORS preflight checks with the same policy as CORSMiddleware."""
    response = Response(status_code=204)
    response.headers["Access-Control-Allow-Methods"] = ", ".join(ALLOWED_METHODS)
    response.headers["Access-Control-Allow-Headers"] = ", ".join(ALLOWED_HEADERS)
    response.headers["Access-Control-Expose-Headers"] = ", ".join(EXPOSE_HEADERS)
    response.headers["Access-Control-Max-Age"] = str(MAX_AGE)
    return _apply_cors_headers(request, response)


@app.middleware("http")
async def error_handling_middleware(request: Request, call_next):
    try:
        response = await call_next(request)
        return _apply_cors_headers(request, response)
    except RequestValidationError as exc:
        logger.error("Validation error on %s: %s", request.url.path, exc, exc_info=True)
        return _build_cors_error_response(
            request,
            {"success": False, "error": str(exc)},
            status_code=422,
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
            request,
            {"success": False, "error": exc.detail},
            status_code=exc.status_code,
        )
    except Exception as exc:
        logger.error("Unhandled server error on %s: %s", request.url.path, exc, exc_info=True)
        # Never expose raw 500 errors to the client
        return _build_cors_error_response(
            request,
            {"success": False, "error": str(exc)},
            status_code=500,
        )


# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


@api_router.api_route("/_debug/info", methods=["GET"], include_in_schema=False)
async def debug_info() -> Dict[str, str]:
    git_sha = "unknown"
    try:
        result = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            stderr=subprocess.STDOUT,
            text=True,
        ).strip()
        if result:
            git_sha = result
    except Exception:  # pragma: no cover - best effort only
        git_sha = "unknown"

    return {
        "debug_errors": os.getenv("FLEEMY_DEBUG_ERRORS", "0"),
        "git": git_sha,
    }


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


class DailyTodoItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str
    done: bool = False
    time: Optional[str] = None  # Format "HH:MM"
    priority: Literal['high', 'medium', 'low'] = 'medium'
    status: Literal['todo', 'doing', 'done'] = 'todo'


class DailyTodo(BaseModel):
    userId: str
    date: str  # Format "YYYY-MM-DD"
    items: List[DailyTodoItem] = []
    updatedAt: int = Field(default_factory=lambda: int(datetime.now(timezone.utc).timestamp() * 1000))


class DailyTodoCreateRequest(BaseModel):
    text: str
    time: Optional[str] = None
    priority: Literal['high', 'medium', 'low'] = 'medium'
    status: Literal['todo', 'doing', 'done'] = 'todo'


class DailyTodoUpdateRequest(BaseModel):
    text: Optional[str] = None
    done: Optional[bool] = None
    time: Optional[str] = None
    priority: Optional[Literal['high', 'medium', 'low']] = None
    status: Optional[Literal['todo', 'doing', 'done']] = None


def _parse_team_planning_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if value is None:
        raise ValueError('datetime value is required')
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            raise ValueError('datetime value is required')
        if raw.endswith('Z'):
            raw = raw[:-1] + '+00:00'
        try:
            parsed = datetime.fromisoformat(raw)
        except ValueError as exc:  # pragma: no cover - defensive
            raise ValueError('Invalid datetime value') from exc
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        dt = datetime.fromtimestamp(float(value), tz=timezone.utc)
        return dt
    raise ValueError('Invalid datetime value')


class TeamPlanningEntry(BaseModel):
    id: Optional[str] = None
    title: str
    type: Literal['event', 'task']
    start: datetime
    end: datetime
    color: Optional[str] = None
    status: Optional[str] = None
    price: Optional[float] = None
    createdBy: Optional[str] = None
    createdByName: Optional[str] = None
    createdByInitials: Optional[str] = None
    teamId: Optional[str] = None
    synced: bool = False
    personalEventId: Optional[str] = None

    @field_validator('title')
    @classmethod
    def _validate_title(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError('title is required')
        return value.strip()

    @validator('start', 'end', pre=True)
    def _parse_datetime(cls, value):
        return _parse_team_planning_datetime(value)

    @validator('end')
    def _ensure_end_after_start(cls, end_value, values):
        start_value = values.get('start')
        if isinstance(start_value, datetime) and isinstance(end_value, datetime):
            if end_value <= start_value:
                raise ValueError('end must be after start')
        return end_value


PRIORITY_VALUES = {'high', 'medium', 'low'}
TODO_STATUS_VALUES = {'todo', 'doing', 'done'}


def normalize_todo_priority(value: Optional[str]) -> str:
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in PRIORITY_VALUES:
            return normalized
    return 'medium'


def normalize_todo_status(value: Optional[str], done: Optional[bool] = None) -> str:
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in TODO_STATUS_VALUES:
            return normalized

    if done:
        return 'done'

    return 'todo'


def normalize_daily_todo_doc(data: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(data, dict):
        return data

    items = data.get('items')
    if not isinstance(items, list):
        data['items'] = []
        return data

    normalized_items = []
    for item in items:
        if not isinstance(item, dict):
            normalized_items.append(item)
            continue
        normalized_priority = normalize_todo_priority(item.get('priority'))
        normalized_status = normalize_todo_status(item.get('status'), item.get('done'))
        normalized_item = {
            **item,
            'priority': normalized_priority,
            'status': normalized_status,
        }
        normalized_items.append(normalized_item)

    data['items'] = normalized_items
    return data


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
    use_global_rate: bool = True
    hourly_rate_custom: Optional[float] = None
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


def _normalize_full_hour(value: Any, *, allow_end_of_day: bool = False) -> Optional[str]:
    if value is None:
        return None

    if isinstance(value, (int, float)):
        hours = int(value)
        minutes = 0
    else:
        match = re.match(r"^\s*(\d{1,2})(?::(\d{1,2}))?\s*$", str(value))
        if not match:
            return None
        hours = int(match.group(1))
        minutes = int(match.group(2)) if match.group(2) is not None else 0

    if allow_end_of_day and hours == 24:
        if minutes == 0:
            return "24:00"
        return None

    if hours < 0 or hours > 23:
        return None
    if minutes < 0 or minutes > 59:
        return None

    normalized_minutes = 0
    return f"{hours:02d}:{normalized_minutes:02d}"


def _time_to_minutes(value: str) -> int:
    hours, minutes = value.split(":")
    return int(hours) * 60 + int(minutes)


class WeeklyTaskTimeRangeRequest(BaseModel):
    day: int
    start: str
    end: str

    @validator("day")
    def validate_day(cls, value: int) -> int:
        if value < 0 or value > 6:
            raise ValueError("day must be between 0 and 6")
        return value

    @validator("start", pre=True)
    def normalize_start(cls, value: Any) -> str:
        normalized = _normalize_full_hour(value, allow_end_of_day=False)
        if not normalized:
            raise ValueError("Invalid start time")
        return normalized

    @validator("end", pre=True)
    def normalize_end(cls, value: Any, values: Dict[str, Any]) -> str:
        normalized = _normalize_full_hour(value, allow_end_of_day=True)
        if not normalized:
            raise ValueError("Invalid end time")

        start_value = values.get("start")
        if start_value:
            if _time_to_minutes(normalized) <= _time_to_minutes(start_value):
                raise ValueError("End time must be after start time")

        return normalized


class WeeklyTaskUpsertRequest(BaseModel):
    label: Optional[str] = None
    title: Optional[str] = None
    price: Optional[float] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    time_ranges: List[WeeklyTaskTimeRangeRequest]
    team_id: Optional[str] = None
    member_uid: Optional[str] = None
    weekday: Optional[int] = None

    @validator("time_ranges")
    def validate_time_ranges(cls, value: List[WeeklyTaskTimeRangeRequest]):
        if not value:
            raise ValueError("At least one time range is required")
        return value

    @validator("weekday")
    def validate_weekday(cls, value: Optional[int]) -> Optional[int]:
        if value is None:
            return value
        if value < 0 or value > 6:
            raise ValueError("weekday must be between 0 and 6")
        return value


def _build_weekly_task_payload_from_request(
    request: WeeklyTaskUpsertRequest,
    owner_uid: str,
    team_id: Optional[str],
    *,
    existing_created_at: Optional[Any] = None,
):
    base_label = (request.label or request.title or "").strip()
    base_title = (request.title or request.label or "").strip()
    label = base_label or base_title or "Tâche sans titre"
    title = base_title or base_label or "Tâche sans titre"

    now = datetime.now(timezone.utc)

    payload: Dict[str, Any] = {
        "label": label,
        "title": title,
        "price": request.price if request.price is not None else None,
        "color": request.color or None,
        "icon": request.icon or None,
        "time_ranges": [
            {
                "day": time_range.day,
                "start": time_range.start,
                "end": time_range.end,
                "weekday": time_range.day,
            }
            for time_range in request.time_ranges
        ],
        "weekly": True,
        "owner_uid": owner_uid,
        "user_id": owner_uid,
        "team_id": team_id if team_id else None,
        "updated_at": now,
    }

    weekday_value = request.weekday if request.weekday is not None else None
    if weekday_value is None and request.time_ranges:
        weekday_value = request.time_ranges[0].day
    if weekday_value is not None:
        payload["weekday"] = weekday_value

    if request.time_ranges:
        first_range = request.time_ranges[0]
        payload["startTime"] = first_range.start
        payload["endTime"] = first_range.end
        payload["start_time"] = first_range.start
        payload["end_time"] = first_range.end

    created_at = existing_created_at or now
    payload["created_at"] = created_at

    if payload.get("icon") is None:
        payload.pop("icon", None)
    if not payload.get("color"):
        payload.pop("color", None)

    return payload


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
    use_global_rate: Optional[bool] = True
    hourly_rate_custom: Optional[float] = None


class ClientUpdateRequest(BaseModel):
    display_name: Optional[str] = None
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[Address] = None
    notes: Optional[str] = None
    is_archived: Optional[bool] = None
    use_global_rate: Optional[bool] = None
    hourly_rate_custom: Optional[float] = None


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


class DocumentPdfRequest(BaseModel):
    type: Literal["quote", "invoice"]


class DocumentEmailRequest(DocumentPdfRequest):
    to: EmailStr


class TeamCreateRequest(BaseModel):
    name: str


class TeamJoinRequest(BaseModel):
    code: str


class EnsureMembershipRequest(BaseModel):
    include_joined_at: bool = False


class LastContextUpdate(BaseModel):
    type: str  # "solo" or "team"
    team_id: Optional[str] = None


# Notification models
class NotificationItem(BaseModel):
    id: str
    userId: str
    title: str
    message: str
    type: str
    createdAt: datetime
    read: bool
    relatedResource: Optional[Dict[str, Any]] = None


class NotificationMarkReadRequest(BaseModel):
    userId: str
    notificationIds: List[str]


class NotificationCreateRequest(BaseModel):
    userId: str
    title: str
    message: str
    type: str
    relatedResource: Optional[Dict[str, Any]] = None


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


_DAY_NAME_TO_ISO = {
    "monday": 1,
    "mon": 1,
    "lundi": 1,
    "lun": 1,
    "tuesday": 2,
    "tue": 2,
    "tues": 2,
    "mardi": 2,
    "wed": 3,
    "wednesday": 3,
    "mercredi": 3,
    "thu": 4,
    "thur": 4,
    "thurs": 4,
    "thursday": 4,
    "jeudi": 4,
    "fri": 5,
    "friday": 5,
    "vendredi": 5,
    "sat": 6,
    "saturday": 6,
    "samedi": 6,
    "sun": 7,
    "sunday": 7,
    "dimanche": 7,
}


def _day_to_iso(day: Any) -> int:
    """Return ISO weekday (1=Mon..7=Sun) from various representations."""
    if isinstance(day, int):
        # Old data sometimes stores monday=0..sunday=6
        if 1 <= day <= 7:
            return day
        if 0 <= day <= 6:
            return (day % 7) + 1
    if isinstance(day, str):
        key = day.strip().lower()
        if key.isdigit():
            try:
                value = int(key)
                if 1 <= value <= 7:
                    return value
                if 0 <= value <= 6:
                    return (value % 7) + 1
            except ValueError:
                pass
        if key in _DAY_NAME_TO_ISO:
            return _DAY_NAME_TO_ISO[key]
    return 1


def _parse_time_components(value: Any) -> Tuple[int, int]:
    try:
        if isinstance(value, str):
            parts = value.split(":")
            hour = int(parts[0]) if parts and parts[0] else 0
            minute = int(parts[1]) if len(parts) > 1 and parts[1] else 0
            return max(0, min(hour, 23)), max(0, min(minute, 59))
        if isinstance(value, (int, float)):
            hour = int(value)
            return max(0, min(hour, 23)), 0
    except Exception:
        pass
    return 0, 0


def _compute_event_datetimes(
    year: Optional[int],
    week: Optional[int],
    day: Any,
    start_time: Any,
    end_time: Any,
) -> Tuple[datetime, datetime]:
    now = datetime.now(timezone.utc)
    try:
        target_year = int(year) if year else now.year
    except Exception:
        target_year = now.year
    try:
        target_week = int(week) if week else now.isocalendar()[1]
    except Exception:
        target_week = now.isocalendar()[1]

    iso_day = _day_to_iso(day)

    try:
        base = datetime.fromisocalendar(target_year, target_week, iso_day)
    except Exception:
        base = now

    start_hour, start_minute = _parse_time_components(start_time)
    end_hour, end_minute = _parse_time_components(end_time)

    start_dt = base.replace(
        hour=start_hour,
        minute=start_minute,
        second=0,
        microsecond=0,
    )
    end_dt = base.replace(
        hour=end_hour,
        minute=end_minute,
        second=0,
        microsecond=0,
    )

    if start_dt.tzinfo is None:
        start_dt = start_dt.replace(tzinfo=timezone.utc)
    if end_dt.tzinfo is None:
        end_dt = end_dt.replace(tzinfo=timezone.utc)

    if end_dt <= start_dt:
        end_dt = start_dt + timedelta(hours=1)

    return start_dt, end_dt


def _planning_event_doc(owner_id: str, team_id: Optional[str], event_id: str):
    if team_id:
        return (
            db.collection("teams")
            .document(team_id)
            .collection("members")
            .document(owner_id)
            .collection("planningEvents")
            .document(event_id)
        )
    return user_doc(owner_id).collection("planningEvents").document(event_id)


def _build_planning_event_payload(event_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    try:
        start_dt, end_dt = _compute_event_datetimes(
            event_data.get("year"),
            event_data.get("week"),
            event_data.get("day"),
            event_data.get("start_time"),
            event_data.get("end_time"),
        )
    except Exception:
        return None

    owner_id = event_data.get("owner_id") or event_data.get("uid")
    payload = {
        "title": event_data.get("description", ""),
        "description": event_data.get("description", ""),
        "client_id": event_data.get("client_id", ""),
        "client_name": event_data.get("client_name", ""),
        "client": event_data.get("client_name", ""),
        "status": event_data.get("status", "pending"),
        "hourly_rate": event_data.get("hourly_rate", 50.0),
        "day": event_data.get("day"),
        "start": start_dt,
        "end": end_dt,
        "duration": max(int((end_dt - start_dt).total_seconds() // 60), 0),
        "user_id": owner_id,
        "owner_uid": owner_id,
        "team_id": event_data.get("team_id"),
        "created_at": event_data.get("created_at"),
        "updated_at": event_data.get("updated_at"),
    }
    return payload


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


def _normalize_firestore_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    to_datetime = getattr(value, 'to_datetime', None)
    if callable(to_datetime):
        try:
            dt = to_datetime()
            if isinstance(dt, datetime):
                return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:  # pragma: no cover - defensive
            return None
    return None


def _compute_member_initials(name: Optional[str], email: Optional[str]) -> str:
    if name:
        parts = [part for part in re.split(r"\s+", name.strip()) if part]
        if parts:
            initials = ''.join(part[0] for part in parts[:2]).upper()
            if initials:
                return initials
    if email:
        prefix = email.split('@', 1)[0]
        prefix = prefix.strip()
        if prefix:
            return prefix[:2].upper()
    return '??'


def _serialize_team_planning_doc(doc_snap) -> Dict[str, Any]:
    data = doc_snap.to_dict() if getattr(doc_snap, 'exists', False) else {}
    start_dt = _normalize_firestore_datetime(data.get('start'))
    end_dt = _normalize_firestore_datetime(data.get('end'))
    timestamp_dt = _normalize_firestore_datetime(data.get('timestamp'))

    return {
        'id': doc_snap.id,
        'title': data.get('title', ''),
        'type': data.get('type', 'event'),
        'start': start_dt.isoformat() if start_dt else None,
        'end': end_dt.isoformat() if end_dt else None,
        'color': data.get('color'),
        'status': data.get('status'),
        'price': data.get('price'),
        'createdBy': data.get('createdBy'),
        'createdByName': data.get('createdByName'),
        'createdByInitials': data.get('createdByInitials'),
        'teamId': data.get('teamId'),
        'synced': bool(data.get('synced')), 
        'personalEventId': data.get('personalEventId'),
        'timestamp': timestamp_dt.isoformat() if timestamp_dt else None,
    }


def _build_team_planning_payload(entry: TeamPlanningEntry, creator: Dict[str, str]) -> Dict[str, Any]:
    def _firestore_datetime(value: datetime) -> Any:
        timestamp_cls = getattr(firestore, "Timestamp", None)
        from_datetime = getattr(timestamp_cls, "from_datetime", None)
        if callable(from_datetime):
            try:
                return from_datetime(value)
            except Exception:  # pragma: no cover - defensive fallback
                pass
        return value

    def _firestore_server_timestamp() -> Any:
        sentinel = getattr(firestore, "SERVER_TIMESTAMP", None)
        if sentinel is not None:
            return sentinel
        return datetime.now(timezone.utc)

    start_dt = entry.start if entry.start.tzinfo else entry.start.replace(tzinfo=timezone.utc)
    end_dt = entry.end if entry.end.tzinfo else entry.end.replace(tzinfo=timezone.utc)
    if end_dt <= start_dt:
        raise HTTPException(
            status_code=400, detail="La date de fin doit être après la date de début"
        )

    normalized_title = (entry.title or "").strip()
    if not normalized_title:
        raise HTTPException(status_code=400, detail="Le titre est requis")

    if entry.type not in ("event", "task"):
        raise HTTPException(
            status_code=400, detail="Type invalide pour le bloc (event|task)"
        )

    created_by = entry.createdBy or creator.get('uid')
    created_name = entry.createdByName or creator.get('name')
    created_initials = entry.createdByInitials or creator.get('initials')

    payload: Dict[str, Any] = {
        "title": normalized_title,
        "type": entry.type,
        "start": _firestore_datetime(start_dt),
        "end": _firestore_datetime(end_dt),
        "color": entry.color or None,
        "status": entry.status or None,
        "price": float(entry.price) if entry.price is not None else None,
        "createdBy": created_by,
        "createdByName": created_name,
        "createdByInitials": created_initials,
        "teamId": entry.teamId,
        "synced": bool(entry.synced),
        "personalEventId": entry.personalEventId or None,
        "timestamp": _firestore_server_timestamp(),
    }

    return payload


_TEAM_PLANNING_ID_SANITIZE_PATTERN = re.compile(r"[^0-9A-Za-z_-]+")


def _normalize_team_planning_entry_id(value: Any) -> Optional[str]:
    """Return a Firestore-compatible identifier for a team planning entry.

    Some clients (notably older web builds) stored the identifier of the
    personal event associated with the block. Those identifiers could include
    path-like strings such as ``users/<uid>/planningEvents/<eventId>`` which are
    rejected by Firestore when used as document identifiers. The production
    backend therefore raised a ``ValueError`` when trying to persist the block,
    resulting in a 500 response while the in-memory test implementation silently
    accepted the value.

    To keep backwards compatibility we now keep only the last segment of the
    provided identifier and strip unsupported characters so the resulting value
    can be safely used as a Firestore document id.
    """

    if value is None:
        return None

    if isinstance(value, str):
        candidate = value.strip()
    else:
        candidate = str(value).strip()

    if not candidate:
        return None

    # Normalise any path-style identifiers coming from legacy clients
    candidate = candidate.replace("\\", "/")
    if "/" in candidate:
        segments = [segment for segment in candidate.split("/") if segment]
        candidate = segments[-1] if segments else ""

    if not candidate:
        return None

    sanitized = _TEAM_PLANNING_ID_SANITIZE_PATTERN.sub("-", candidate)
    sanitized = re.sub(r"-{2,}", "-", sanitized).strip("-")

    if not sanitized:
        return None

    # Avoid excessively long identifiers while keeping determinism
    if len(sanitized) > 120:
        sanitized = sanitized[:120]

    return sanitized


def _normalize_member_ids(raw_members: Any) -> List[str]:
    """Return a list of member identifiers extracted from a team document."""

    if not raw_members:
        return []

    if isinstance(raw_members, list):
        normalized: List[str] = []
        for value in raw_members:
            if isinstance(value, (str, int)):
                normalized.append(str(value))
                continue

            if isinstance(value, dict):
                candidate = None
                for key in (
                    "uid",
                    "user_uid",
                    "userUid",
                    "user_id",
                    "userId",
                    "id",
                    "member_id",
                    "memberId",
                ):
                    candidate = value.get(key)
                    if isinstance(candidate, (str, int)) and candidate:
                        normalized.append(str(candidate))
                        break

                if candidate:
                    continue

                # Some legacy structures store members as {"uid": True}
                for key, flag in value.items():
                    if isinstance(flag, bool) and flag:
                        normalized.append(str(key))
                        break

        return normalized

    if isinstance(raw_members, dict):
        normalized: List[str] = []
        for key, value in raw_members.items():
            if not value:
                continue
            normalized.append(str(key))
        return normalized

    if isinstance(raw_members, (str, int)):
        return [str(raw_members)]

    return []


async def ensure_team_membership(team_id: str, user_uid: str) -> Dict[str, Any]:
    team_ref = db.collection("teams").document(team_id)
    team_snap = await asyncio.to_thread(team_ref.get)
    team = team_snap.to_dict() if team_snap.exists else None
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    owner_uid = (
        team.get("owner_uid")
        or team.get("ownerUid")
        or team.get("ownerId")
        or (team.get("owner") or {}).get("uid")
    )
    member_ids = set(_normalize_member_ids(team.get("members")))
    if owner_uid:
        member_ids.add(str(owner_uid))

    if str(user_uid) in member_ids:
        return team

    membership_ref = team_ref.collection("memberships").document(user_uid)
    member_ref = team_ref.collection("members").document(user_uid)
    membership_snap, member_snap = await asyncio.gather(
        asyncio.to_thread(membership_ref.get),
        asyncio.to_thread(member_ref.get),
    )

    if membership_snap.exists or member_snap.exists:
        return team

    raise HTTPException(status_code=403, detail="Not authorized for this team")


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
        planning_payload = _build_planning_event_payload(event_payload)

        tasks = [
            asyncio.to_thread(
                events_ref.document(event.id).set,
                event_payload,
            ),
            asyncio.to_thread(
                global_event_doc(year, week, event.id).set,
                event_payload,
            ),
        ]

        if planning_payload:
            planning_ref = _planning_event_doc(
                event_payload.get("owner_id", user["uid"]),
                target_team_id,
                event.id,
            )
            tasks.append(
                asyncio.to_thread(
                    planning_ref.set,
                    planning_payload,
                )
            )

        await asyncio.gather(*tasks)
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
    planning_payload = _build_planning_event_payload(payload)
    existing_year = existing.get("year")
    existing_week = existing.get("week")
    tasks = []
    if existing_year and existing_week:
        tasks.append(
            asyncio.to_thread(
                global_event_doc(existing_year, existing_week, event_id).delete
            )
        )
    tasks.append(
        asyncio.to_thread(
            global_event_doc(new_year, new_week, event_id).set,
            payload,
        )
    )
    if planning_payload:
        planning_ref = _planning_event_doc(owner_id, target_team_id, event_id)
        tasks.append(
            asyncio.to_thread(
                planning_ref.set,
                planning_payload,
            )
        )
    if tasks:
        await asyncio.gather(*tasks)
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
    owner_id = data.get("owner_id", data.get("uid", user["uid"]))
    tasks = [asyncio.to_thread(doc_ref.delete)]
    year = data.get("year")
    week = data.get("week")
    if year and week:
        tasks.append(
            asyncio.to_thread(
                global_event_doc(year, week, event_id).delete
            )
        )
    planning_ref = _planning_event_doc(owner_id, team_id, event_id)
    tasks.append(asyncio.to_thread(planning_ref.delete))
    await asyncio.gather(*tasks)
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

            status = event.get("status", "pending")
            if status == "paid":
                earnings["paid"] += amount
            elif status == "unpaid":
                earnings["unpaid"] += amount
            elif status == "pending":
                earnings["pending"] += amount
            elif status == "not_worked":
                earnings["not_worked"] += amount
        except:
            # Fallback calculation
            amount = event.get("hourly_rate", db_user.get("hourly_rate", 50.0))
            status = event.get("status", "pending")
            if status == "paid":
                earnings["paid"] += amount
            elif status == "unpaid":
                earnings["unpaid"] += amount
            elif status == "pending":
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


@api_router.post("/planning/v2/weekly-tasks")
async def create_weekly_task_v2(
    task_request: WeeklyTaskUpsertRequest,
    user: Dict[str, Any] = Depends(verify_token),
):
    try:
        _events_ref, tasks_ref, target_member = await resolve_planning_context(
            task_request.team_id,
            task_request.member_uid,
            user["uid"],
        )

        if target_member != user["uid"]:
            raise HTTPException(status_code=403, detail="Not authorized to modify this member's weekly tasks")

        if tasks_ref is None:
            raise HTTPException(status_code=400, detail="Invalid planning context for weekly tasks")

        payload = _build_weekly_task_payload_from_request(
            task_request,
            target_member,
            task_request.team_id or None,
        )

        doc_ref = tasks_ref.document()
        await asyncio.to_thread(doc_ref.set, payload)

        response_payload = {**payload, "id": doc_ref.id}
        return {"success": True, "task": response_payload}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("planning v2 weekly task create error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Impossible de sauvegarder la tâche hebdomadaire")


@api_router.put("/planning/v2/weekly-tasks/{task_id}")
async def update_weekly_task_v2(
    task_id: str,
    task_request: WeeklyTaskUpsertRequest,
    user: Dict[str, Any] = Depends(verify_token),
):
    try:
        _events_ref, tasks_ref, target_member = await resolve_planning_context(
            task_request.team_id,
            task_request.member_uid,
            user["uid"],
        )

        if target_member != user["uid"]:
            raise HTTPException(status_code=403, detail="Not authorized to modify this member's weekly tasks")

        if tasks_ref is None:
            raise HTTPException(status_code=400, detail="Invalid planning context for weekly tasks")

        doc_ref = tasks_ref.document(task_id)
        snapshot = await asyncio.to_thread(doc_ref.get)
        if not snapshot.exists:
            raise HTTPException(status_code=404, detail="Tâche hebdomadaire introuvable")

        existing = snapshot.to_dict() or {}
        existing_owner = existing.get("owner_uid") or existing.get("user_id") or target_member
        if existing_owner != target_member:
            raise HTTPException(status_code=403, detail="Not authorized to modify this weekly task")

        payload = _build_weekly_task_payload_from_request(
            task_request,
            target_member,
            task_request.team_id or None,
            existing_created_at=existing.get("created_at"),
        )

        update_payload = dict(payload)
        if existing.get("created_at") is not None:
            update_payload.pop("created_at", None)

        await asyncio.to_thread(doc_ref.update, update_payload)

        response_payload = {**existing, **payload, "id": task_id}
        return {"success": True, "task": response_payload}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("planning v2 weekly task update error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Impossible de sauvegarder la tâche hebdomadaire")


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


# Daily Todos endpoints
@api_router.get("/daily-todos/{target_user_id}/{date}")
async def get_daily_todos(
    target_user_id: str,
    date: str,
    team_id: Optional[str] = None,
    user: Dict[str, Any] = Depends(verify_token),
):
    """Get daily todos for a specific user and date."""
    requester_uid = user["uid"]
    
    # Check authorization
    can_read = False
    if requester_uid == target_user_id:
        can_read = True
    elif team_id:
        # Check if requester is in the same team
        try:
            await ensure_team_membership(team_id, requester_uid)
            await ensure_team_membership(team_id, target_user_id)
            can_read = True
        except HTTPException:
            can_read = False
    
    if not can_read:
        raise HTTPException(status_code=403, detail="Not authorized to view these todos")
    
    # Validate date format
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    doc_id = f"{target_user_id}_{date}"
    doc_ref = db.collection("dailyTodos").document(doc_id)
    snap = await asyncio.to_thread(doc_ref.get)
    
    if not snap.exists:
        return {
            "success": True,
            "data": {
                "userId": target_user_id,
                "date": date,
                "items": [],
                "updatedAt": int(datetime.now(timezone.utc).timestamp() * 1000),
            },
            "readOnly": requester_uid != target_user_id,
        }
    
    data = snap.to_dict()
    data = normalize_daily_todo_doc(data)
    return {
        "success": True,
        "data": data,
        "readOnly": requester_uid != target_user_id,
    }


@api_router.put("/daily-todos/{target_user_id}/{date}")
async def update_daily_todos(
    target_user_id: str,
    date: str,
    body: Dict[str, Any] = Body(...),
    user: Dict[str, Any] = Depends(verify_token),
):
    """Update or create daily todos for a specific date."""
    requester_uid = user["uid"]
    
    # Only the owner can modify their own todos
    if requester_uid != target_user_id:
        raise HTTPException(status_code=403, detail="Not authorized to modify these todos")
    
    # Validate date format
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    items = body.get("items", [])
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="Items must be a list")
    
    doc_id = f"{target_user_id}_{date}"
    doc_ref = db.collection("dailyTodos").document(doc_id)
    
    data = {
        "userId": target_user_id,
        "date": date,
        "items": items,
        "updatedAt": int(datetime.now(timezone.utc).timestamp() * 1000),
    }

    data = normalize_daily_todo_doc(data)

    await asyncio.to_thread(doc_ref.set, data)

    return {
        "success": True,
        "data": data,
    }


@api_router.post("/daily-todos/{target_user_id}/{date}/items")
async def add_daily_todo_item(
    target_user_id: str,
    date: str,
    item: DailyTodoCreateRequest,
    user: Dict[str, Any] = Depends(verify_token),
):
    """Add a new item to daily todos."""
    requester_uid = user["uid"]
    
    if requester_uid != target_user_id:
        raise HTTPException(status_code=403, detail="Not authorized to modify these todos")
    
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    doc_id = f"{target_user_id}_{date}"
    doc_ref = db.collection("dailyTodos").document(doc_id)
    snap = await asyncio.to_thread(doc_ref.get)
    
    new_item = {
        "id": str(uuid.uuid4()),
        "text": item.text,
        "done": False,
        "time": item.time,
        "priority": normalize_todo_priority(item.priority),
        "status": normalize_todo_status(item.status, False),
    }
    
    if snap.exists:
        data = snap.to_dict()
        items = data.get("items", [])
        items.append(new_item)
        data["items"] = items
        data["updatedAt"] = int(datetime.now(timezone.utc).timestamp() * 1000)
    else:
        data = {
            "userId": target_user_id,
            "date": date,
            "items": [new_item],
            "updatedAt": int(datetime.now(timezone.utc).timestamp() * 1000),
        }
    
    data = normalize_daily_todo_doc(data)

    await asyncio.to_thread(doc_ref.set, data)
    
    return {
        "success": True,
        "data": data,
        "newItem": new_item,
    }


@api_router.patch("/daily-todos/{target_user_id}/{date}/items/{item_id}")
async def update_daily_todo_item(
    target_user_id: str,
    date: str,
    item_id: str,
    updates: DailyTodoUpdateRequest,
    user: Dict[str, Any] = Depends(verify_token),
):
    """Update a specific item in daily todos."""
    requester_uid = user["uid"]
    
    if requester_uid != target_user_id:
        raise HTTPException(status_code=403, detail="Not authorized to modify these todos")
    
    doc_id = f"{target_user_id}_{date}"
    doc_ref = db.collection("dailyTodos").document(doc_id)
    snap = await asyncio.to_thread(doc_ref.get)
    
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Daily todos not found")
    
    data = snap.to_dict()
    items = data.get("items", [])
    
    item_found = False
    for item in items:
        if item.get("id") == item_id:
            item_found = True
            if updates.text is not None:
                item["text"] = updates.text
            if updates.done is not None:
                item["done"] = updates.done
            if updates.time is not None:
                item["time"] = updates.time
            if updates.priority is not None:
                item["priority"] = normalize_todo_priority(updates.priority)
            if updates.status is not None:
                item["status"] = normalize_todo_status(updates.status, item.get("done"))
            elif updates.done is not None:
                item["status"] = 'done' if updates.done else 'todo'
            break

    if not item_found:
        raise HTTPException(status_code=404, detail="Item not found")

    data["items"] = items
    data["updatedAt"] = int(datetime.now(timezone.utc).timestamp() * 1000)

    data = normalize_daily_todo_doc(data)

    await asyncio.to_thread(doc_ref.set, data)
    
    return {
        "success": True,
        "data": data,
    }


@api_router.delete("/daily-todos/{target_user_id}/{date}/items/{item_id}")
async def delete_daily_todo_item(
    target_user_id: str,
    date: str,
    item_id: str,
    user: Dict[str, Any] = Depends(verify_token),
):
    """Delete a specific item from daily todos."""
    requester_uid = user["uid"]
    
    if requester_uid != target_user_id:
        raise HTTPException(status_code=403, detail="Not authorized to modify these todos")
    
    doc_id = f"{target_user_id}_{date}"
    doc_ref = db.collection("dailyTodos").document(doc_id)
    snap = await asyncio.to_thread(doc_ref.get)
    
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Daily todos not found")
    
    data = snap.to_dict()
    items = data.get("items", [])
    
    original_length = len(items)
    items = [item for item in items if item.get("id") != item_id]
    
    if len(items) == original_length:
        raise HTTPException(status_code=404, detail="Item not found")
    
    data["items"] = items
    data["updatedAt"] = int(datetime.now(timezone.utc).timestamp() * 1000)

    data = normalize_daily_todo_doc(data)

    await asyncio.to_thread(doc_ref.set, data)
    
    return {
        "success": True,
        "data": data,
    }


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


def normalize_boolean(value: Any, default: bool = True) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "on"}:
            return True
        if normalized in {"false", "0", "no", "off"}:
            return False
        return default
    if isinstance(value, (int, float)):
        return value != 0
    return default


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

        def normalize_rate(raw):
            if raw is None or raw == "":
                return None
            try:
                value = float(raw)
            except (TypeError, ValueError):
                return None
            return value

        paginated_clients = [
            {
                **client,
                "use_global_rate": normalize_boolean(client.get("use_global_rate"), True),
                "hourly_rate_custom": normalize_rate(client.get("hourly_rate_custom")),
            }
            for client in paginated_clients
        ]

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

    use_global_rate = normalize_boolean(data.get("use_global_rate"), True)
    data["use_global_rate"] = use_global_rate

    raw_custom_rate = data.get("hourly_rate_custom")
    if raw_custom_rate in (None, ""):
        custom_rate = None
    else:
        try:
            custom_rate = float(raw_custom_rate)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="hourly_rate_custom must be a number")
        if custom_rate < 0:
            raise HTTPException(status_code=400, detail="hourly_rate_custom must be greater or equal to 0")

    data["hourly_rate_custom"] = None if use_global_rate else (custom_rate if custom_rate is not None else 0.0)

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

    if "use_global_rate" in data:
        data["use_global_rate"] = normalize_boolean(
            data["use_global_rate"], existing.get("use_global_rate", True)
        )

    if "hourly_rate_custom" in data:
        raw_custom_rate = data["hourly_rate_custom"]
        if raw_custom_rate in (None, ""):
            custom_rate = None
        else:
            try:
                custom_rate = float(raw_custom_rate)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="hourly_rate_custom must be a number")
            if custom_rate < 0:
                raise HTTPException(status_code=400, detail="hourly_rate_custom must be greater or equal to 0")
        data["hourly_rate_custom"] = custom_rate

    effective_use_global = data.get("use_global_rate", existing.get("use_global_rate", True))

    if effective_use_global:
        data["hourly_rate_custom"] = None
    else:
        if "hourly_rate_custom" not in data or data["hourly_rate_custom"] is None:
            data["hourly_rate_custom"] = existing.get("hourly_rate_custom", 0.0)

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


@api_router.post("/documents/{doc_id}/pdf")
async def export_document_pdf(
    doc_id: str,
    payload: DocumentPdfRequest,
    request: Request,
    user: Dict[str, Any] = Depends(verify_token),
):
    document_type = payload.type
    collection_name = "quotes" if document_type == "quote" else "invoices"
    doc_ref = user_col(user["uid"], collection_name).document(doc_id)
    snap = await asyncio.to_thread(doc_ref.get)

    if not getattr(snap, "exists", False):
        raise HTTPException(status_code=404, detail="Document not found")

    document_data = snap.to_dict() or {}
    owner_uid = document_data.get("uid")
    if owner_uid and owner_uid != user["uid"]:
        raise HTTPException(
            status_code=403, detail="Not authorized to access this document"
        )

    try:
        pdf_bytes = (
            await quote_pdf_bytes(document_data)
            if document_type == "quote"
            else await invoice_pdf_bytes(document_data)
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.error("PDF generation failed for %s %s: %s", document_type, doc_id, exc)
        raise HTTPException(
            status_code=500, detail="Impossible de générer le PDF demandé"
        ) from exc

    filename = document_filename(document_data, document_type)

    response = Response(content=pdf_bytes, media_type="application/pdf")
    response.headers["Content-Disposition"] = (
        f'attachment; filename="{filename}"'
    )
    return _apply_cors_headers(request, response)


@api_router.post("/documents/{doc_id}/email")
async def email_document_endpoint(
    doc_id: str,
    payload: DocumentEmailRequest,
    user: Dict[str, Any] = Depends(verify_token),
):
    document_type = payload.type
    collection_name = "quotes" if document_type == "quote" else "invoices"
    doc_ref = user_col(user["uid"], collection_name).document(doc_id)
    snap = await asyncio.to_thread(doc_ref.get)

    if not getattr(snap, "exists", False):
        return JSONResponse(
            status_code=404,
            content={
                "success": False,
                "error": "Document not found",
            },
        )

    document_data = snap.to_dict() or {}
    owner_uid = document_data.get("uid")
    if owner_uid and owner_uid != user["uid"]:
        return JSONResponse(
            status_code=403,
            content={
                "success": False,
                "error": "Not authorized to access this document",
            },
        )

    try:
        pdf_bytes = (
            await quote_pdf_bytes(document_data)
            if document_type == "quote"
            else await invoice_pdf_bytes(document_data)
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.error(
            "PDF generation failed for email %s %s: %s", document_type, doc_id, exc
        )
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "Impossible de générer le PDF pour l'envoi",
            },
        )

    try:
        await asyncio.to_thread(
            send_document_email,
            document=document_data,
            document_type=document_type,
            recipient=payload.to,
            document_id=doc_id,
            pdf_bytes=pdf_bytes,
        )
    except RuntimeError as exc:
        logger.error(
            "Failed to send %s %s by email: %s", document_type, doc_id, exc
        )
        return JSONResponse(
            status_code=502,
            content={"success": False, "error": str(exc)},
        )

    logger.info("Document %s %s sent to %s", document_type, doc_id, payload.to)
    return {"success": True, "ok": True, "sentTo": payload.to}


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

        team_data = {
            **team.dict(),
            "members": [user["uid"]],
            "owner_uid": user["uid"],
            "created_at": firestore.SERVER_TIMESTAMP,
            "updated_at": firestore.SERVER_TIMESTAMP,
        }

        await asyncio.to_thread(
            db.collection("teams").document(team.team_id).set,
            team_data,
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
        await asyncio.to_thread(
            db.collection("teams").document(team_id).update,
            {
                "members": firestore.ArrayUnion([user["uid"]]),
                "updated_at": firestore.SERVER_TIMESTAMP,
            },
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


class MembershipsUnavailableError(Exception):
    """Raised when memberships cannot be retrieved after retries."""


class TeamPlanningOperationUnavailableError(Exception):
    """Raised when team planning operations temporarily fail."""


_MEMBERSHIPS_RETRY_DELAYS = (0.2, 0.8, 2.0)
_TEAM_PLANNING_RETRY_DELAYS = (0.2, 0.8, 2.0)


async def _stream_memberships_with_retry(memberships_ref):
    """Stream team memberships with small exponential backoff retries."""

    last_exception: Optional[BaseException] = None
    total_attempts = len(_MEMBERSHIPS_RETRY_DELAYS)

    for attempt_index, delay in enumerate(_MEMBERSHIPS_RETRY_DELAYS, start=1):
        try:
            return await asyncio.to_thread(lambda: list(memberships_ref.stream()))
        except (GoogleServiceUnavailable, GoogleDeadlineExceeded, GoogleInternal) as exc:
            last_exception = exc
            logger.warning(
                "Memberships stream attempt %s/%s failed: %s",
                attempt_index,
                total_attempts,
                exc,
                exc_info=True,
            )
        except Exception as exc:  # pragma: no cover - defensive catch-all
            last_exception = exc
            logger.warning(
                "Memberships stream unexpected failure on attempt %s/%s: %s",
                attempt_index,
                total_attempts,
                exc,
                exc_info=True,
            )

        if attempt_index < total_attempts:
            await asyncio.sleep(delay)

    raise MembershipsUnavailableError("Memberships temporarily unavailable") from last_exception


async def _run_team_planning_with_retry(operation_name: str, func):
    """Execute a Firestore team planning operation with transient retries."""

    total_attempts = len(_TEAM_PLANNING_RETRY_DELAYS)
    last_exception: Optional[BaseException] = None

    for attempt_index, delay in enumerate(_TEAM_PLANNING_RETRY_DELAYS, start=1):
        try:
            return await asyncio.to_thread(func)
        except (GoogleServiceUnavailable, GoogleDeadlineExceeded, GoogleInternal) as exc:
            last_exception = exc
            logger.warning(
                "team planning %s attempt %s/%s failed: %s",
                operation_name,
                attempt_index,
                total_attempts,
                exc,
                exc_info=True,
            )
        except Exception:
            raise

        if attempt_index < total_attempts:
            await asyncio.sleep(delay)

    raise TeamPlanningOperationUnavailableError(
        f"team planning {operation_name} temporarily unavailable"
    ) from last_exception


@api_router.get("/teams/{team_id}/memberships")
async def get_team_memberships(
    team_id: str,
    user: Dict[str, Any] = Depends(verify_token),
):
    """Return the list of memberships for the given team."""
    try:
        await ensure_team_membership(team_id, user["uid"])

        memberships_ref = team_col(team_id, "memberships")
        membership_docs = await _stream_memberships_with_retry(memberships_ref)

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
    except MembershipsUnavailableError as exc:
        logger.warning(
            "get_team_memberships unavailable after retries: %s",
            exc,
            exc_info=True,
        )
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "code": "MEMBERSHIPS_UNAVAILABLE",
                "message": "Memberships temporarily unavailable",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("get_team_memberships error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Impossible de récupérer les membres")


@api_router.get("/teams/{team_id}/planning")
async def get_team_planning(
    team_id: str,
    user: Dict[str, Any] = Depends(verify_token),
):
    await ensure_team_membership(team_id, user["uid"])

    def _load_entries():
        planning_ref = (
            db.collection("teams")
            .document(team_id)
            .collection("teamPlanning")
        )
        return list(planning_ref.stream())

    try:
        snapshots = await asyncio.to_thread(_load_entries)
        entries = [_serialize_team_planning_doc(snap) for snap in snapshots]
        entries.sort(
            key=lambda entry: (
                _parse_iso_datetime(entry.get("start"))
                or datetime.max.replace(tzinfo=timezone.utc),
                entry.get("id") or "",
            )
        )
        return {"success": True, "items": entries}
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.error("team planning fetch error: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Impossible de charger le planning d'équipe",
        )


@api_router.post("/teams/{team_id}/planning")
async def upsert_team_planning_entry(
    team_id: str,
    payload: TeamPlanningEntry,
    user: Dict[str, Any] = Depends(verify_token),
):
    await ensure_team_membership(team_id, user["uid"])

    creator_name = user.get("name") or user.get("displayName") or user.get("email") or "Membre"
    creator_defaults = {
        "uid": user.get("uid"),
        "name": creator_name,
        "email": user.get("email"),
        "initials": _compute_member_initials(creator_name, user.get("email")),
    }
    if not creator_defaults["uid"]:
        raise HTTPException(status_code=400, detail="Utilisateur non authentifié")

    entry_data = payload.model_dump()

    raw_entry_id = entry_data.get("id")
    normalized_entry_id = _normalize_team_planning_entry_id(raw_entry_id)
    if raw_entry_id and normalized_entry_id != raw_entry_id:
        logger.info(
            "Normalized team planning entry id from %r to %r for team %s",
            raw_entry_id,
            normalized_entry_id,
            team_id,
        )
    entry_data["id"] = normalized_entry_id

    payload_team_id_raw = entry_data.get("teamId")
    if payload_team_id_raw is None or (isinstance(payload_team_id_raw, str) and not payload_team_id_raw.strip()):
        entry_data["teamId"] = team_id
    else:
        payload_team_id = str(payload_team_id_raw).strip()
        if payload_team_id != team_id:
            raise HTTPException(status_code=400, detail="Identifiant d'équipe invalide")
        entry_data["teamId"] = payload_team_id

    team_doc = await asyncio.to_thread(lambda: db.collection("teams").document(team_id).get())
    if not team_doc.exists:
        raise HTTPException(status_code=404, detail="Équipe introuvable")

    planning_ref = db.collection("teams").document(team_id).collection("teamPlanning")
    existing_data: Optional[Dict[str, Any]] = None

    if entry_data.get("id"):
        doc_ref = planning_ref.document(entry_data["id"])

        def _fetch_existing():
            snap = doc_ref.get()
            return snap.to_dict() if getattr(snap, "exists", False) else None

        try:
            existing_data = await _run_team_planning_with_retry(
                "fetch-existing", _fetch_existing
            )
        except TeamPlanningOperationUnavailableError as exc:
            logger.warning(
                "team planning existing document temporarily unavailable: %s",
                exc,
                exc_info=True,
            )
            raise HTTPException(
                status_code=503,
                detail="Service planning temporairement indisponible, veuillez réessayer.",
            ) from exc
        if existing_data:
            entry_data.setdefault("createdBy", existing_data.get("createdBy"))
            entry_data.setdefault("createdByName", existing_data.get("createdByName"))
            entry_data.setdefault("createdByInitials", existing_data.get("createdByInitials"))

    try:
        entry = TeamPlanningEntry(**entry_data)
    except ValidationError as validation_error:
        logger.warning(
            "team planning payload validation error: %s", validation_error
        )
        raise HTTPException(
            status_code=400,
            detail="Données invalides pour le bloc d'équipe",
        ) from validation_error
    payload_data = _build_team_planning_payload(entry, creator_defaults)

    def _persist():
        if entry.id:
            ref = planning_ref.document(entry.id)
            ref.set(payload_data, merge=True)
            return ref.id
        ref, _ = planning_ref.add(payload_data)
        return ref.id

    try:
        doc_ref = await _run_team_planning_with_retry("persist", _persist)

        def _ensure_document_reference(obj: Any, planning_collection):
            candidate = obj[0] if isinstance(obj, (list, tuple)) and obj else obj
            if callable(getattr(candidate, "get", None)):
                return candidate

            _id: Optional[str] = None
            if isinstance(candidate, str):
                stripped = candidate.strip()
                if stripped:
                    _id = stripped
            elif hasattr(candidate, "id"):
                candidate_id = getattr(candidate, "id")
                if candidate_id is not None:
                    _id = str(candidate_id)

            if _id:
                return planning_collection.document(_id)

            logger.error(
                "cannot coerce %r (type=%s) to DocumentReference", obj, type(obj)
            )
            raise HTTPException(
                status_code=500,
                detail="Echec d'écriture (référence invalide)",
            )

        doc_ref = _ensure_document_reference(doc_ref, planning_ref)
        logger.info(
            "doc_ref type: %s.%s",
            getattr(doc_ref.__class__, "__module__", "<unknown>"),
            getattr(doc_ref.__class__, "__name__", "<unknown>"),
        )
        snapshot = await _run_team_planning_with_retry("fetch", doc_ref.get)
        serialized = _serialize_team_planning_doc(snapshot)
        return {"success": True, "item": serialized}
    except HTTPException:
        raise
    except TeamPlanningOperationUnavailableError as exc:
        logger.warning(
            "team planning upsert temporarily unavailable: %s",
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=503,
            detail="Service planning temporairement indisponible, veuillez réessayer.",
        ) from exc
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.error("team planning upsert error: %s", exc, exc_info=True)
        if isinstance(exc, (PermissionDenied, Forbidden)):
            raise HTTPException(status_code=403, detail="Accès refusé pour cette équipe") from exc
        if isinstance(exc, NotFound):
            raise HTTPException(status_code=404, detail="Équipe introuvable") from exc
        if isinstance(exc, (InvalidArgument, ValueError, TypeError)):
            raise HTTPException(
                status_code=400,
                detail=f"Payload invalide: {type(exc).__name__}",
            ) from exc
        if isinstance(exc, (AlreadyExists, Aborted)):
            raise HTTPException(status_code=409, detail="Conflit d’écriture, réessayez") from exc
        if os.getenv("FLEEMY_DEBUG_ERRORS", "0") == "1":
            raise HTTPException(
                status_code=500,
                detail=(
                    "Impossible d'enregistrer le bloc d'équipe — "
                    f"{type(exc).__name__}: {str(exc)}"
                ),
            )
        raise HTTPException(status_code=500, detail="Impossible d'enregistrer le bloc d'équipe")


@api_router.delete("/teams/{team_id}/planning/{entry_id}")
async def delete_team_planning_entry(
    team_id: str,
    entry_id: str,
    user: Dict[str, Any] = Depends(verify_token),
):
    await ensure_team_membership(team_id, user["uid"])

    planning_ref = (
        db.collection("teams")
        .document(team_id)
        .collection("teamPlanning")
        .document(entry_id)
    )

    try:
        await asyncio.to_thread(planning_ref.delete)
        return {"success": True, "entry_id": entry_id}
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.error("team planning delete error: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Impossible de supprimer le bloc d'équipe",
        )


@api_router.get("/teams/my")
async def get_my_teams(user: Dict[str, Any] = Depends(verify_token)):
    """Get all teams where the user is a member."""
    logger.info("/teams/my called for %s", user.get("uid"))
    try:
        # Query teams where user is a member or the owner
        teams_ref = db.collection("teams")

        def fetch_member_teams():
            member_query = teams_ref.where("members", "array_contains", user["uid"])
            return list(member_query.stream())

        def fetch_owner_teams():
            owner_query = teams_ref.where("owner_uid", "==", user["uid"])
            return list(owner_query.stream())

        async def fetch_membership_docs() -> List[Any]:
            if not hasattr(db, "collection_group"):
                return []

            def _run_query():
                membership_query = (
                    db.collection_group("memberships")
                    .where(DOCUMENT_ID_FIELD, "==", user["uid"])
                )
                return list(membership_query.stream())

            try:
                return await asyncio.to_thread(_run_query)
            except Exception:  # pragma: no cover - defensive
                logger.exception("Failed to fetch membership collection group")
                return []

        member_docs, owner_docs, membership_docs = await asyncio.gather(
            asyncio.to_thread(fetch_member_teams),
            asyncio.to_thread(fetch_owner_teams),
            fetch_membership_docs(),
        )

        teams_map: Dict[str, Dict[str, Any]] = {}

        def _store_team(team_doc) -> None:
            team_id = getattr(team_doc, "id", None)
            if not team_id:
                return

            team_data = team_doc.to_dict() or {}
            members = team_data.get("members")
            members_count = 0
            if isinstance(members, list):
                members_count = len(members)
            elif isinstance(members, dict):
                members_count = len(members)

            if not members_count:
                stored_count = team_data.get("members_count")
                if isinstance(stored_count, int):
                    members_count = stored_count

            teams_map[team_id] = {
                "team_id": team_id,
                "name": team_data.get("name"),
                "owner_uid": team_data.get("owner_uid")
                or team_data.get("ownerUid")
                or team_data.get("ownerId"),
                "invite_code": team_data.get("invite_code"),
                "members_count": members_count,
            }

        for team_doc in [*member_docs, *owner_docs]:
            _store_team(team_doc)

        membership_team_refs: Dict[str, Any] = {}
        for membership_doc in membership_docs:
            doc_ref = getattr(membership_doc, "reference", None)
            parent = getattr(doc_ref, "parent", None)
            team_ref = getattr(parent, "parent", None)
            team_id = getattr(team_ref, "id", None)
            if not team_id or team_id in teams_map:
                continue
            membership_team_refs[team_id] = team_ref

        if membership_team_refs:
            team_snapshots = await asyncio.gather(
                *[
                    asyncio.to_thread(team_ref.get)
                    for team_ref in membership_team_refs.values()
                ]
            )

            for team_id, team_snap in zip(
                membership_team_refs.keys(), team_snapshots
            ):
                if getattr(team_snap, "exists", True):
                    _store_team(team_snap)

        teams = list(teams_map.values())

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


def _get_subcollection(doc_ref, name: str):
    """Return subcollection reference if supported by the document reference."""
    collection_attr = getattr(doc_ref, "collection", None)
    if callable(collection_attr):
        return collection_attr(name)
    return None


async def _delete_collection(collection_ref) -> None:
    """Delete all documents inside a collection reference (no-op if missing)."""
    if collection_ref is None:
        return

    try:
        documents = await asyncio.to_thread(lambda: list(collection_ref.stream()))
    except Exception:
        # If the collection cannot be listed (unsupported in tests), skip silently
        return

    for document in documents:
        doc_ref = collection_ref.document(document.id)
        await asyncio.to_thread(doc_ref.delete)


@api_router.delete("/teams/{team_id}")
async def delete_team(team_id: str, user: Dict[str, Any] = Depends(verify_token)):
    """Delete a team and all related data (owner only)."""
    try:
        team_ref = db.collection("teams").document(team_id)
        team_snap = await asyncio.to_thread(team_ref.get)

        if not getattr(team_snap, "exists", False):
            raise HTTPException(status_code=404, detail="Équipe introuvable")

        team_data = team_snap.to_dict() or {}
        owner_uid = team_data.get("owner_uid")
        requester_uid = user.get("uid")

        if owner_uid != requester_uid:
            raise HTTPException(
                status_code=403,
                detail="Seul le propriétaire peut supprimer l'équipe",
            )

        members: List[str] = list(team_data.get("members") or [])

        # Delete subcollections (memberships, events, tasks, etc.)
        members_ref = _get_subcollection(team_ref, "members")
        if members_ref is not None:
            try:
                member_docs = await asyncio.to_thread(lambda: list(members_ref.stream()))
            except Exception:
                member_docs = []

            for member_doc in member_docs:
                member_ref = members_ref.document(member_doc.id)
                for nested_name in ("planningEvents", "weeklyTasks"):
                    nested_ref = _get_subcollection(member_ref, nested_name)
                    await _delete_collection(nested_ref)
                await asyncio.to_thread(member_ref.delete)

        # Other subcollections directly on the team document
        for subcollection_name in ("memberships", "events", "tasks", "quotes", "invoices"):
            await _delete_collection(_get_subcollection(team_ref, subcollection_name))

        # Finally delete the team document itself
        await asyncio.to_thread(team_ref.delete)

        async def cleanup_user(uid: str) -> None:
            if not uid:
                return

            user_ref = user_doc(uid)
            try:
                user_snap = await asyncio.to_thread(user_ref.get)
            except Exception:
                return

            if not getattr(user_snap, "exists", False):
                return

            data = user_snap.to_dict() or {}
            updates: Dict[str, Any] = {}

            if data.get("team_id") == team_id:
                updates["team_id"] = None

            last_context = data.get("last_context")
            if isinstance(last_context, dict) and last_context.get("team_id") == team_id:
                updates["last_context"] = None

            if updates:
                updates["updated_at"] = firestore.SERVER_TIMESTAMP
                await asyncio.to_thread(user_ref.update, updates)

        # Clean up user documents for all members (including owner)
        await asyncio.gather(*(cleanup_user(member_uid) for member_uid in members))

        logger.info("Team %s deleted by owner %s", team_id, requester_uid)
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("delete_team error: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Impossible de supprimer l'équipe",
        )


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


# Notifications endpoints
@api_router.get("/notifications/list")
async def list_notifications(
    userId: str,
    onlyUnread: bool = True,
    limit: int = 20,
    user: Dict[str, Any] = Depends(verify_token),
):
    """
    Récupère les notifications pour un utilisateur.
    
    Args:
        userId: L'ID de l'utilisateur
        onlyUnread: Si True, ne retourne que les notifications non lues
        limit: Nombre maximum de notifications à retourner
        user: Utilisateur authentifié (vérifié par Firebase Auth)
    
    Returns:
        Liste des notifications triées par date (plus récentes en premier)
    """
    try:
        # Vérification d'accès : l'utilisateur ne peut lire que ses propres notifications
        if user["uid"] != userId:
            logger.warning(
                "Unauthorized access attempt: user %s tried to access notifications for user %s",
                user["uid"],
                userId
            )
            raise HTTPException(
                status_code=403,
                detail="Vous n'êtes pas autorisé à lire les notifications d'un autre utilisateur"
            )
        
        # Construction de la requête Firestore
        notifications_ref = db.collection("notifications")
        query = notifications_ref.where("userId", "==", userId)
        
        # Filtrer par statut "non lu" si demandé
        if onlyUnread:
            query = query.where("read", "==", False)
        
        # Trier par date de création (plus récentes en premier)
        query = query.order_by("createdAt", direction=firestore.Query.DESCENDING)
        
        # Limiter le nombre de résultats
        query = query.limit(limit)
        
        # Exécuter la requête
        docs = await asyncio.to_thread(lambda: list(query.stream()))
        
        # Construire la liste des notifications
        notifications: List[Dict[str, Any]] = []
        for doc in docs:
            data = doc.to_dict()
            if data:
                notification = {
                    "id": doc.id,
                    "userId": data.get("userId"),
                    "title": data.get("title"),
                    "message": data.get("message"),
                    "type": data.get("type"),
                    "createdAt": data.get("createdAt").isoformat() if isinstance(data.get("createdAt"), datetime) else data.get("createdAt"),
                    "read": data.get("read", False),
                    "relatedResource": data.get("relatedResource"),
                }
                notifications.append(notification)
        
        logger.info(
            "Retrieved %d notifications for user %s (onlyUnread=%s)",
            len(notifications),
            userId,
            onlyUnread
        )
        
        return {
            "success": True,
            "notifications": notifications
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("list_notifications error: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Impossible de récupérer les notifications"
        )


@api_router.patch("/notifications/mark-read")
async def mark_notifications_read(
    request_data: NotificationMarkReadRequest,
    user: Dict[str, Any] = Depends(verify_token),
):
    """
    Marque une ou plusieurs notifications comme lues.
    
    Args:
        request_data: Contient userId et la liste des IDs de notifications
        user: Utilisateur authentifié (vérifié par Firebase Auth)
    
    Returns:
        Nombre de notifications modifiées
    """
    try:
        # Vérification d'accès : l'utilisateur ne peut modifier que ses propres notifications
        if user["uid"] != request_data.userId:
            logger.warning(
                "Unauthorized access attempt: user %s tried to mark read notifications for user %s",
                user["uid"],
                request_data.userId
            )
            raise HTTPException(
                status_code=403,
                detail="Vous n'êtes pas autorisé à modifier les notifications d'un autre utilisateur"
            )
        
        if not request_data.notificationIds:
            return {
                "status": "ok",
                "updated": 0
            }
        
        # Marquer chaque notification comme lue
        updated_count = 0
        notifications_ref = db.collection("notifications")
        
        for notification_id in request_data.notificationIds:
            try:
                doc_ref = notifications_ref.document(notification_id)
                
                # Vérifier que la notification existe et appartient à l'utilisateur
                snap = await asyncio.to_thread(doc_ref.get)
                
                if not snap.exists:
                    logger.warning(
                        "Notification %s not found for user %s",
                        notification_id,
                        request_data.userId
                    )
                    continue
                
                notification_data = snap.to_dict()
                if notification_data.get("userId") != request_data.userId:
                    logger.warning(
                        "Notification %s does not belong to user %s",
                        notification_id,
                        request_data.userId
                    )
                    continue
                
                # Mettre à jour le champ "read"
                await asyncio.to_thread(
                    doc_ref.update,
                    {"read": True}
                )
                updated_count += 1
                
            except Exception as notif_error:
                logger.error(
                    "Error updating notification %s: %s",
                    notification_id,
                    notif_error
                )
                continue
        
        logger.info(
            "Marked %d notifications as read for user %s",
            updated_count,
            request_data.userId
        )
        
        return {
            "status": "ok",
            "updated": updated_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("mark_notifications_read error: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Impossible de marquer les notifications comme lues"
        )


@api_router.post("/notifications/create-test")
async def create_test_notification(
    notification_request: NotificationCreateRequest,
    user: Dict[str, Any] = Depends(verify_token),
):
    """
    Endpoint utilitaire pour créer une notification de test.
    Permet de tester l'UI de la cloche avant d'implémenter les règles métier automatiques.
    
    Args:
        notification_request: Données de la notification à créer
        user: Utilisateur authentifié (vérifié par Firebase Auth)
    
    Returns:
        La notification créée
    """
    try:
        # Vérification d'accès : l'utilisateur ne peut créer que ses propres notifications
        if user["uid"] != notification_request.userId:
            logger.warning(
                "Unauthorized access attempt: user %s tried to create notification for user %s",
                user["uid"],
                notification_request.userId
            )
            raise HTTPException(
                status_code=403,
                detail="Vous n'êtes pas autorisé à créer des notifications pour un autre utilisateur"
            )
        
        # Créer un nouveau document dans la collection "notifications"
        notifications_ref = db.collection("notifications")
        doc_id = str(uuid.uuid4())
        doc_ref = notifications_ref.document(doc_id)
        
        notification_data = {
            "userId": notification_request.userId,
            "title": notification_request.title,
            "message": notification_request.message,
            "type": notification_request.type,
            "createdAt": datetime.now(timezone.utc),
            "read": False,
            "relatedResource": notification_request.relatedResource,
        }
        
        # Enregistrer la notification
        await asyncio.to_thread(doc_ref.set, notification_data)
        
        # Construire la réponse
        created_notification = {
            "id": doc_id,
            "userId": notification_data["userId"],
            "title": notification_data["title"],
            "message": notification_data["message"],
            "type": notification_data["type"],
            "createdAt": notification_data["createdAt"].isoformat(),
            "read": notification_data["read"],
            "relatedResource": notification_data["relatedResource"],
        }
        
        logger.info(
            "Created test notification %s for user %s",
            doc_id,
            notification_request.userId
        )
        
        return {
            "status": "created",
            "id": doc_id,
            "notification": created_notification
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("create_test_notification error: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Impossible de créer la notification de test"
        )


# Include the router in the main app
app.include_router(api_router)

from fastapi.responses import JSONResponse
from fastapi.requests import Request
from fastapi.exception_handlers import RequestValidationError
from fastapi.exceptions import RequestValidationError as FastAPIRequestValidationError


@app.get("/healthz")
async def healthz() -> Dict[str, Any]:
    return {"ok": True, "service": "fleemy", "status": "healthy"}


@app.get("/health")
async def health() -> Dict[str, Any]:
    return {"ok": True, "service": "fleemy", "status": "healthy"}


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
