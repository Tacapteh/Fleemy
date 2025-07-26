from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends, Response, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
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
# from pdf_utils import quote_pdf_bytes, invoice_pdf_bytes
from firebase_admin import auth as firebase_auth
from firebase import db, InMemoryFirestore
from google.cloud import firestore

async def verify_token(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    token = auth_header.split("Bearer ")[1]
    try:
        decoded = firebase_auth.verify_id_token(token)
        request.state.user = decoded
        return decoded
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")



ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Create the main app without a prefix
app = FastAPI()

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
    time_slots: List[Dict[str, str]] = []  # {"day": "monday", "start": "09:00", "end": "10:00"}
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

class Client(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    uid: str
    name: str
    email: Optional[str] = ""
    phone: Optional[str] = ""
    address: Optional[str] = ""
    company: Optional[str] = ""
    notes: Optional[str] = ""
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

class TaskCreateRequest(BaseModel):
    name: str
    price: float
    color: str
    icon: str
    time_slots: List[Dict[str, str]] = []

class TodoCreateRequest(BaseModel):
    title: str
    description: Optional[str] = ""
    priority: str = "normal"
    due_date: Optional[str] = None

class ClientCreateRequest(BaseModel):
    name: str
    email: Optional[str] = ""
    phone: Optional[str] = ""
    address: Optional[str] = ""
    company: Optional[str] = ""
    notes: Optional[str] = ""

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


async def stream_docs(query):
    docs = await asyncio.to_thread(lambda: list(query.stream()))
    return [d.to_dict() for d in docs]

# Authentication endpoints

@api_router.get("/auth/me")
async def get_me(user: Dict[str, Any] = Depends(verify_token)):
    """Return the authenticated user's info and create the DB entry if missing."""
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
        "uid": db_user["uid"],
        "name": db_user.get("name"),
        "email": db_user.get("email"),
        "picture": db_user.get("picture"),
        "hourly_rate": db_user.get("hourly_rate"),
        "team_id": db_user.get("team_id")
    }

@api_router.put("/auth/me")
async def update_me(hourly_rate: float, user: Dict[str, Any] = Depends(verify_token)):
    user_ref = user_doc(user["uid"])
    await asyncio.to_thread(user_ref.update, {"hourly_rate": hourly_rate})
    updated_user = await asyncio.to_thread(user_ref.get)
    return User(**updated_user.to_dict())

# Dashboard endpoint
@api_router.get("/dashboard")
async def get_dashboard(user: Dict[str, Any] = Depends(verify_token)):
    """Return dashboard data for the authenticated user."""
    user_ref = user_doc(user["uid"])
    snapshot = await asyncio.to_thread(user_ref.get)
    current_user = snapshot.to_dict() if snapshot.exists else None
    if not current_user:
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.utcnow()
    current_week = now.isocalendar()[1]
    current_year = now.year

    events_ref = user_col(current_user["uid"], "events")\
        .where("year", "==", current_year)\
        .where("week", "in", [current_week, current_week + 1])\
        .limit(5)
    upcoming_events = await stream_docs(events_ref)

    pending_todos = await stream_docs(
        user_col(current_user["uid"], "todos").where("completed", "==", False).limit(5)
    )

    recent_clients = await stream_docs(
        user_col(current_user["uid"], "clients").order_by("created_at", direction=firestore.Query.DESCENDING).limit(5)
    )

    pending_quotes = await stream_docs(
        user_col(current_user["uid"], "quotes").where("status", "in", ["draft", "sent", "accepted"]).limit(5)
    )

    unpaid_invoices = await stream_docs(
        user_col(current_user["uid"], "invoices").where("status", "in", ["sent", "overdue"]).limit(5)
    )

    invoices = await stream_docs(user_col(current_user["uid"], "invoices"))
    quotes = await stream_docs(user_col(current_user["uid"], "quotes"))

    revenue = {"paid": 0.0, "unpaid": 0.0, "pending": 0.0}
    for inv in invoices:
        if inv.get("status") == "paid":
            revenue["paid"] += inv.get("total", 0)
        elif inv.get("status") in ["sent", "overdue"]:
            revenue["unpaid"] += inv.get("total", 0)

    for q in quotes:
        if q.get("status") in ["draft", "sent", "accepted"]:
            revenue["pending"] += q.get("total", 0)

    return {
        "user": {
            "uid": current_user["uid"],
            "name": current_user.get("name"),
            "email": current_user.get("email"),
            "picture": current_user.get("picture"),
            "hourly_rate": current_user.get("hourly_rate"),
        },
        "upcoming_events": upcoming_events,
        "pending_todos": pending_todos,
        "recent_clients": recent_clients,
        "pending_quotes": pending_quotes,
        "unpaid_invoices": unpaid_invoices,
        "revenue": revenue,
        "stats": {
            "total_clients": len(await stream_docs(user_col(current_user["uid"], "clients"))),
            "pending_todos_count": len(await stream_docs(user_col(current_user["uid"], "todos").where("completed", "==", False))),
            "unpaid_invoices_count": len(unpaid_invoices),
        },
    }

# Planning endpoints
@api_router.get("/planning/week/{year}/{week}")
async def get_week_planning(year: int, week: int, team_id: Optional[str] = None, user: Dict[str, Any] = Depends(verify_token)):
    if team_id:
        team_snap = await asyncio.to_thread(db.collection("teams").document(team_id).get)
        team = team_snap.to_dict() if team_snap.exists else None
        if not team or user["uid"] not in (team.get("members", []) + [team.get("created_by")]):
            raise HTTPException(status_code=403, detail="Not authorized for this team")
        events_ref = team_col(team_id, "events")
        tasks_ref = team_col(team_id, "tasks")
    else:
        events_ref = user_col(user["uid"], "events")
        tasks_ref = user_col(user["uid"], "tasks")

    events = await stream_docs(events_ref.where("year", "==", year).where("week", "==", week))
    tasks = await stream_docs(tasks_ref.where("year", "==", year).where("week", "==", week))

    return {"events": events, "tasks": tasks}

@api_router.get("/planning/month/{year}/{month}")
async def get_month_planning(year: int, month: int, team_id: Optional[str] = None, user: Dict[str, Any] = Depends(verify_token)):
    last_day = calendar.monthrange(year, month)[1]
    pairs = {
        (datetime(year, month, day).isocalendar().year,
         datetime(year, month, day).isocalendar().week)
        for day in range(1, last_day + 1)
    }
    or_filters = [{"year": y, "week": w} for y, w in pairs]

    if team_id:
        team_snap = await asyncio.to_thread(db.collection("teams").document(team_id).get)
        team = team_snap.to_dict() if team_snap.exists else None
        if not team or user["uid"] not in (team.get("members", []) + [team.get("created_by")]):
            raise HTTPException(status_code=403, detail="Not authorized for this team")
        events_ref = team_col(team_id, "events")
        tasks_ref = team_col(team_id, "tasks")
    else:
        events_ref = user_col(user["uid"], "events")
        tasks_ref = user_col(user["uid"], "tasks")

    events: List[Dict[str, Any]] = []
    tasks: List[Dict[str, Any]] = []
    for y, w in pairs:
        events += await stream_docs(events_ref.where("year", "==", y).where("week", "==", w))
        tasks += await stream_docs(tasks_ref.where("year", "==", y).where("week", "==", w))

    return {"events": events, "tasks": tasks}

@api_router.get("/planning/events")
async def list_events(year: Optional[int] = None, week: Optional[int] = None, user: Dict[str, Any] = Depends(verify_token)):
    events_ref = user_col(user["uid"], "events")
    if year is not None:
        events_ref = events_ref.where("year", "==", year)
    if week is not None:
        events_ref = events_ref.where("week", "==", week)
    events = await stream_docs(events_ref)
    return events

@api_router.post("/planning/events")
async def create_event(event_request: EventCreateRequest, user: Dict[str, Any] = Depends(verify_token)):
    now = datetime.now()
    year = now.year
    week = now.isocalendar()[1]
    
    event = PlanningEvent(
        uid=user["uid"],
        week=week,
        year=year,
        **event_request.dict()
    )
    await asyncio.to_thread(user_col(user["uid"], "events").document(event.id).set, event.dict())
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    team_id = user_snap.to_dict().get("team_id") if user_snap.exists else None
    if team_id:
        await asyncio.to_thread(team_col(team_id, "events").document(event.id).set, event.dict())
    return event

@api_router.put("/planning/events/{event_id}")
async def update_event(event_id: str, event_request: EventCreateRequest, user: Dict[str, Any] = Depends(verify_token)):
    update_data = {**event_request.dict(), "updated_at": datetime.utcnow()}
    await asyncio.to_thread(user_col(user["uid"], "events").document(event_id).update, update_data)
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    team_id = user_snap.to_dict().get("team_id") if user_snap.exists else None
    if team_id:
        await asyncio.to_thread(team_col(team_id, "events").document(event_id).update, update_data)
    updated = await asyncio.to_thread(user_col(user["uid"], "events").document(event_id).get)
    return updated.to_dict()

@api_router.delete("/planning/events/{event_id}")
async def delete_event(event_id: str, user: Dict[str, Any] = Depends(verify_token)):
    doc_ref = user_col(user["uid"], "events").document(event_id)
    snap = await asyncio.to_thread(doc_ref.get)
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Event not found")
    await asyncio.to_thread(doc_ref.delete)
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    team_id = user_snap.to_dict().get("team_id") if user_snap.exists else None
    if team_id:
        await asyncio.to_thread(team_col(team_id, "events").document(event_id).delete)
    return {"message": "Event deleted"}

@api_router.get("/planning/earnings/{year}/{week}")
async def get_earnings(year: int, week: int, team_id: Optional[str] = None, user: Dict[str, Any] = Depends(verify_token)):
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    db_user = user_snap.to_dict() if user_snap.exists else None
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    if team_id:
        team_snap = await asyncio.to_thread(db.collection("teams").document(team_id).get)
        team = team_snap.to_dict() if team_snap.exists else None
        if not team or user["uid"] not in (team.get("members", []) + [team.get("created_by")]):
            raise HTTPException(status_code=403, detail="Not authorized for this team")
        events_ref = team_col(team_id, "events")
        tasks_ref = team_col(team_id, "tasks")
    else:
        events_ref = user_col(user["uid"], "events")
        tasks_ref = user_col(user["uid"], "tasks")

    events = await stream_docs(events_ref.where("year", "==", year).where("week", "==", week))
    tasks = await stream_docs(tasks_ref.where("year", "==", year).where("week", "==", week))
    
    earnings = {
        "paid": 0,
        "unpaid": 0,
        "pending": 0,
        "not_worked": 0,
        "total": 0
    }
    
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
    
    return earnings

# Tasks endpoints
@api_router.get("/planning/tasks")
async def list_tasks(year: Optional[int] = None, week: Optional[int] = None, user: Dict[str, Any] = Depends(verify_token)):
    tasks_ref = user_col(user["uid"], "tasks")
    if year is not None:
        tasks_ref = tasks_ref.where("year", "==", year)
    if week is not None:
        tasks_ref = tasks_ref.where("week", "==", week)
    tasks = await stream_docs(tasks_ref)
    return tasks

# Tasks endpoints
@api_router.post("/planning/tasks")
async def create_task(task_request: TaskCreateRequest, user: Dict[str, Any] = Depends(verify_token)):
    now = datetime.now()
    year = now.year
    week = now.isocalendar()[1]
    
    task = WeeklyTask(
        uid=user["uid"],
        week=week,
        year=year,
        **task_request.dict()
    )
    await asyncio.to_thread(user_col(user["uid"], "tasks").document(task.id).set, task.dict())
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    team_id = user_snap.to_dict().get("team_id") if user_snap.exists else None
    if team_id:
        await asyncio.to_thread(team_col(team_id, "tasks").document(task.id).set, task.dict())
    return task

@api_router.put("/planning/tasks/{task_id}")
async def update_task(task_id: str, task_request: TaskCreateRequest, user: Dict[str, Any] = Depends(verify_token)):
    update_data = {**task_request.dict(), "updated_at": datetime.utcnow()}
    await asyncio.to_thread(user_col(user["uid"], "tasks").document(task_id).update, update_data)
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    team_id = user_snap.to_dict().get("team_id") if user_snap.exists else None
    if team_id:
        await asyncio.to_thread(team_col(team_id, "tasks").document(task_id).update, update_data)
    updated = await asyncio.to_thread(user_col(user["uid"], "tasks").document(task_id).get)
    return updated.to_dict()

@api_router.delete("/planning/tasks/{task_id}")
async def delete_task(task_id: str, user: Dict[str, Any] = Depends(verify_token)):
    doc_ref = user_col(user["uid"], "tasks").document(task_id)
    snap = await asyncio.to_thread(doc_ref.get)
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Task not found")
    await asyncio.to_thread(doc_ref.delete)
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    team_id = user_snap.to_dict().get("team_id") if user_snap.exists else None
    if team_id:
        await asyncio.to_thread(team_col(team_id, "tasks").document(task_id).delete)
    return {"message": "Task deleted"}

@api_router.get("/todos")
async def get_todos(user: Dict[str, Any] = Depends(verify_token)):
    todos = await stream_docs(
        user_col(user["uid"], "todos").order_by("created_at", direction=firestore.Query.DESCENDING)
    )
    return todos

@api_router.post("/todos")
async def create_todo(todo_request: TodoCreateRequest, user: Dict[str, Any] = Depends(verify_token)):
    todo_data = todo_request.dict()
    if todo_data.get("due_date"):
        todo_data["due_date"] = datetime.fromisoformat(todo_data["due_date"].replace("Z", "+00:00"))
    
    todo = Todo(
        uid=user["uid"],
        **todo_data
    )
    
    await asyncio.to_thread(user_col(user["uid"], "todos").document(todo.id).set, todo.dict())
    return todo

@api_router.put("/todos/{todo_id}")
async def update_todo(todo_id: str, todo_request: TodoCreateRequest, user: Dict[str, Any] = Depends(verify_token)):
    todo_data = todo_request.dict()
    if todo_data.get("due_date"):
        todo_data["due_date"] = datetime.fromisoformat(todo_data["due_date"].replace("Z", "+00:00"))
    
    update_data = {**todo_data, "updated_at": datetime.utcnow()}
    await asyncio.to_thread(user_col(user["uid"], "todos").document(todo_id).update, update_data)
    snap = await asyncio.to_thread(user_col(user["uid"], "todos").document(todo_id).get)
    return snap.to_dict()

@api_router.put("/todos/{todo_id}/toggle")
async def toggle_todo(todo_id: str, user: Dict[str, Any] = Depends(verify_token)):
    doc_ref = user_col(user["uid"], "todos").document(todo_id)
    snap = await asyncio.to_thread(doc_ref.get)
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Todo not found")
    data = snap.to_dict()
    await asyncio.to_thread(doc_ref.update, {"completed": not data.get("completed", False), "updated_at": datetime.utcnow()})
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
    clients = await stream_docs(
        user_col(user["uid"], "clients").order_by("name")
    )
    return clients

@api_router.post("/clients")
async def create_client(client_request: ClientCreateRequest, user: Dict[str, Any] = Depends(verify_token)):
    client = Client(
        uid=user["uid"],
        **client_request.dict()
    )
    
    await asyncio.to_thread(user_col(user["uid"], "clients").document(client.id).set, client.dict())
    return client

@api_router.put("/clients/{client_id}")
async def update_client(client_id: str, client_request: ClientCreateRequest, user: Dict[str, Any] = Depends(verify_token)):
    update_data = {**client_request.dict(), "updated_at": datetime.utcnow()}
    doc_ref = user_col(user["uid"], "clients").document(client_id)
    await asyncio.to_thread(doc_ref.update, update_data)
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
        user_col(user["uid"], "quotes").order_by("created_at", direction=firestore.Query.DESCENDING)
    )
    return quotes

@api_router.post("/quotes")
async def create_quote(quote_request: QuoteCreateRequest, user: Dict[str, Any] = Depends(verify_token)):
    # Generate quote number
    quote_count = len(await stream_docs(user_col(user["uid"], "quotes")))
    quote_number = f"DEV-{datetime.now().year}-{quote_count + 1:04d}"
    
    quote_data = quote_request.dict()
    quote_data["quote_number"] = quote_number
    quote_data["valid_until"] = datetime.fromisoformat(quote_data["valid_until"].replace("Z", "+00:00"))
    
    # Calculate totals
    subtotal = sum(item["quantity"] * item["unit_price"] for item in quote_data["items"])
    tax_amount = subtotal * (quote_data["tax_rate"] / 100)
    total = subtotal + tax_amount
    
    quote_data.update({
        "subtotal": subtotal,
        "tax_amount": tax_amount,
        "total": total
    })
    
    quote = Quote(
        uid=user["uid"],
        **quote_data
    )
    
    await asyncio.to_thread(user_col(user["uid"], "quotes").document(quote.id).set, quote.dict())
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    team_id = user_snap.to_dict().get("team_id") if user_snap.exists else None
    if team_id:
        await asyncio.to_thread(team_col(team_id, "quotes").document(quote.id).set, quote.dict())
    return quote

@api_router.put("/quotes/{quote_id}")
async def update_quote(quote_id: str, quote_request: QuoteCreateRequest, user: Dict[str, Any] = Depends(verify_token)):
    quote_data = quote_request.dict()
    quote_data["valid_until"] = datetime.fromisoformat(quote_data["valid_until"].replace("Z", "+00:00"))
    
    # Calculate totals
    subtotal = sum(item["quantity"] * item["unit_price"] for item in quote_data["items"])
    tax_amount = subtotal * (quote_data["tax_rate"] / 100)
    total = subtotal + tax_amount
    
    quote_data.update({
        "subtotal": subtotal,
        "tax_amount": tax_amount,
        "total": total,
        "updated_at": datetime.utcnow()
    })
    
    await asyncio.to_thread(user_col(user["uid"], "quotes").document(quote_id).update, quote_data)
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    team_id = user_snap.to_dict().get("team_id") if user_snap.exists else None
    if team_id:
        await asyncio.to_thread(team_col(team_id, "quotes").document(quote_id).update, quote_data)
    updated = await asyncio.to_thread(user_col(user["uid"], "quotes").document(quote_id).get)
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

#@api_router.get("/quotes/{quote_id}/pdf")
#async def get_quote_pdf(quote_id: str, current_user: User = Depends(get_current_user)):
    #quote = await db.quotes.find_one({"id": quote_id, "uid": current_user.uid}, {"_id": 0})
    #if not quote:
        #raise HTTPException(status_code=404, detail="Quote not found")
    #pdf_bytes = await quote_pdf_bytes(quote)
    #return Response(content=pdf_bytes, media_type="application/pdf")

@api_router.put("/quotes/{quote_id}/status")
async def update_quote_status(quote_id: str, status: str, user: Dict[str, Any] = Depends(verify_token)):
    update_data = {"status": status, "updated_at": datetime.utcnow()}
    await asyncio.to_thread(user_col(user["uid"], "quotes").document(quote_id).update, update_data)
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    team_id = user_snap.to_dict().get("team_id") if user_snap.exists else None
    if team_id:
        await asyncio.to_thread(team_col(team_id, "quotes").document(quote_id).update, update_data)
    updated = await asyncio.to_thread(user_col(user["uid"], "quotes").document(quote_id).get)
    return updated.to_dict()

# Invoices endpoints
@api_router.get("/invoices")
async def get_invoices(user: Dict[str, Any] = Depends(verify_token)):
    invoices = await stream_docs(
        user_col(user["uid"], "invoices").order_by("created_at", direction=firestore.Query.DESCENDING)
    )
    return invoices

@api_router.post("/invoices")
async def create_invoice(invoice_request: InvoiceCreateRequest, user: Dict[str, Any] = Depends(verify_token)):
    # Generate invoice number
    invoice_count = len(await stream_docs(user_col(user["uid"], "invoices")))
    invoice_number = f"FACT-{datetime.now().year}-{invoice_count + 1:04d}"
    
    invoice_data = invoice_request.dict()
    invoice_data["invoice_number"] = invoice_number
    invoice_data["due_date"] = datetime.fromisoformat(invoice_data["due_date"].replace("Z", "+00:00"))
    
    # Calculate totals
    subtotal = sum(item["quantity"] * item["unit_price"] for item in invoice_data["items"])
    tax_amount = subtotal * (invoice_data["tax_rate"] / 100)
    total = subtotal + tax_amount
    
    invoice_data.update({
        "subtotal": subtotal,
        "tax_amount": tax_amount,
        "total": total
    })
    
    invoice = Invoice(
        uid=user["uid"],
        **invoice_data
    )
    
    await asyncio.to_thread(user_col(user["uid"], "invoices").document(invoice.id).set, invoice.dict())
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    team_id = user_snap.to_dict().get("team_id") if user_snap.exists else None
    if team_id:
        await asyncio.to_thread(team_col(team_id, "invoices").document(invoice.id).set, invoice.dict())
    return invoice

@api_router.put("/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, invoice_request: InvoiceCreateRequest, user: Dict[str, Any] = Depends(verify_token)):
    invoice_data = invoice_request.dict()
    invoice_data["due_date"] = datetime.fromisoformat(invoice_data["due_date"].replace("Z", "+00:00"))

    subtotal = sum(item["quantity"] * item["unit_price"] for item in invoice_data["items"])
    tax_amount = subtotal * (invoice_data["tax_rate"] / 100)
    total = subtotal + tax_amount

    invoice_data.update({
        "subtotal": subtotal,
        "tax_amount": tax_amount,
        "total": total,
        "updated_at": datetime.utcnow(),
    })

    await asyncio.to_thread(user_col(user["uid"], "invoices").document(invoice_id).update, invoice_data)
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    team_id = user_snap.to_dict().get("team_id") if user_snap.exists else None
    if team_id:
        await asyncio.to_thread(team_col(team_id, "invoices").document(invoice_id).update, invoice_data)
    updated = await asyncio.to_thread(user_col(user["uid"], "invoices").document(invoice_id).get)
    return updated.to_dict()

#@api_router.get("/invoices/{invoice_id}/pdf")
#async def get_invoice_pdf(invoice_id: str, current_user: User = Depends(get_current_user)):
#    invoice = await db.invoices.find_one({"id": invoice_id, "uid": current_user.uid}, {"_id": 0})
 #   if not invoice:
  #      raise HTTPException(status_code=404, detail="Invoice not found")
   # pdf_bytes = await invoice_pdf_bytes(invoice)
    #return Response(content=pdf_bytes, media_type="application/pdf")

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
        await asyncio.to_thread(team_col(team_id, "invoices").document(invoice_id).delete)
    return {"message": "Invoice deleted"}

@api_router.put("/invoices/{invoice_id}/status")
async def update_invoice_status(invoice_id: str, status: str, user: Dict[str, Any] = Depends(verify_token)):
    update_data = {"status": status, "updated_at": datetime.utcnow()}
    if status == "paid":
        update_data["paid_date"] = datetime.utcnow()
    
    await asyncio.to_thread(user_col(user["uid"], "invoices").document(invoice_id).update, update_data)
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    team_id = user_snap.to_dict().get("team_id") if user_snap.exists else None
    if team_id:
        await asyncio.to_thread(team_col(team_id, "invoices").document(invoice_id).update, update_data)
    updated = await asyncio.to_thread(user_col(user["uid"], "invoices").document(invoice_id).get)
    return updated.to_dict()

# Teams endpoints
@api_router.post("/teams")
async def create_team(team_request: TeamCreateRequest, user: Dict[str, Any] = Depends(verify_token)):
    team = Team(
        name=team_request.name,
        members=[user["uid"]],
        created_by=user["uid"]
    )

    await asyncio.to_thread(db.collection("teams").document(team.team_id).set, team.dict())
    await asyncio.to_thread(user_doc(user["uid"]).update, {"team_id": team.team_id})
    
    return team

@api_router.get("/teams/my")
async def get_my_team(user: Dict[str, Any] = Depends(verify_token)):
    user_snap = await asyncio.to_thread(user_doc(user["uid"]).get)
    db_user = user_snap.to_dict() if user_snap.exists else None
    if not db_user or not db_user.get("team_id"):
        return None

    team_snap = await asyncio.to_thread(db.collection("teams").document(db_user["team_id"]).get)
    team = team_snap.to_dict() if team_snap.exists else None
    if not team:
        return None
    
    # Get team members info
    members = []
    for member_uid in team["members"]:
        snap = await asyncio.to_thread(db.collection("users").document(member_uid).get)
        member = snap.to_dict() if snap.exists else None
        if member:
            members.append({"uid": member["uid"], "name": member["name"], "email": member["email"]})
    
    return {
        "team_id": team["team_id"],
        "name": team["name"],
        "invite_code": team["invite_code"],
        "members": members,
        "created_by": team["created_by"]
    }

# Health check route
@api_router.get("/ping")
async def ping():
    if isinstance(db, InMemoryFirestore):
        return {"status": "error", "message": "running in mock mode"}
    try:
        test_ref = db.collection("_ping").document("ping")
        await asyncio.to_thread(test_ref.set, {"ok": True})
        return {"status": "ok"}
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

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

