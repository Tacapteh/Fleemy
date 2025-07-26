from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta
import asyncio
import httpx
import json
import calendar
# from pdf_utils import quote_pdf_bytes, invoice_pdf_bytes
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth
from fastapi import Depends, HTTPException, Request

cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)

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

# External authentication service
AUTH_URL = os.environ.get('AUTH_URL', 'http://localhost:8000')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

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

class Session(BaseModel):
    session_token: str
    uid: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)

# Request models
class AuthRequest(BaseModel):
    session_id: str

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

# Dependency to get current user
async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Session token required")
    
    session_token = authorization.replace("Bearer ", "")
    session = await db.sessions.find_one({"session_token": session_token})
    
    if not session or datetime.now() > session["expires_at"]:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    
    user = await db.users.find_one({"uid": session["uid"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return User(**user)

# Authentication endpoints
@api_router.post("/auth/login")
async def login(auth_request: AuthRequest):
    try:
        headers = {"X-Session-ID": auth_request.session_id}
        async with httpx.AsyncClient() as client_http:
            response = await client_http.get(
                f"{AUTH_URL}/auth/v1/env/oauth/session-data",
                headers=headers,
            )

        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session")

        auth_data = response.json()
        
        # Check if user exists
        existing_user = await db.users.find_one({"email": auth_data["email"]})
        
        if not existing_user:
            # Create new user
            user = User(
                name=auth_data["name"],
                email=auth_data["email"],
                picture=auth_data.get("picture")
            )
            await db.users.insert_one(user.dict())
            user_uid = user.uid
        else:
            user_uid = existing_user["uid"]
        
        # Create session
        session_token = str(uuid.uuid4())
        session = Session(
            session_token=session_token,
            uid=user_uid,
            expires_at=datetime.now() + timedelta(days=7)
        )
        await db.sessions.insert_one(session.dict())
        
        return {
            "session_token": session_token,
            "user": {
                "uid": user_uid,
                "name": auth_data["name"],
                "email": auth_data["email"],
                "picture": auth_data.get("picture")
            }
        }
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Auth service unreachable: {exc}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/auth/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "uid": current_user.uid,
        "name": current_user.name,
        "email": current_user.email,
        "picture": current_user.picture,
        "hourly_rate": current_user.hourly_rate,
        "team_id": current_user.team_id
    }

@api_router.put("/auth/me")
async def update_me(hourly_rate: float, current_user: User = Depends(get_current_user)):
    await db.users.update_one(
        {"uid": current_user.uid},
        {"$set": {"hourly_rate": hourly_rate}}
    )
    
    updated_user = await db.users.find_one({"uid": current_user.uid})
    return User(**updated_user)

# Dashboard endpoint
@api_router.get("/dashboard")
async def get_dashboard(current_user: User = Depends(get_current_user)):
    now = datetime.now()
    current_week = now.isocalendar()[1]
    current_year = now.year
    
    # Get upcoming events (next 7 days)
    upcoming_events = await db.planning_events.find({
        "uid": current_user.uid,
        "year": current_year,
        "week": {"$in": [current_week, current_week + 1]}
    }, {"_id": 0}).limit(5).to_list(5)
    
    # Get pending todos
    pending_todos = await db.todos.find({
        "uid": current_user.uid,
        "completed": False
    }, {"_id": 0}).limit(5).to_list(5)
    
    # Get recent clients
    recent_clients = await db.clients.find({
        "uid": current_user.uid
    }, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)
    
    # Get pending quotes
    pending_quotes = await db.quotes.find({
        "uid": current_user.uid,
        "status": {"$in": ["draft", "sent"]}
    }, {"_id": 0}).limit(5).to_list(5)
    
    # Get unpaid invoices
    unpaid_invoices = await db.invoices.find({
        "uid": current_user.uid,
        "status": {"$in": ["sent", "overdue"]}
    }, {"_id": 0}).limit(5).to_list(5)
    
    # Calculate revenue stats
    paid_events = await db.planning_events.find({
        "uid": current_user.uid,
        "status": "paid",
        "year": current_year
    }, {"_id": 0}).to_list(1000)
    
    monthly_revenue = 0
    for event in paid_events:
        try:
            start_hour = int(event["start_time"].split(":")[0])
            end_hour = int(event["end_time"].split(":")[0])
            hours = end_hour - start_hour
            monthly_revenue += hours * event.get("hourly_rate", 50)
        except:
            monthly_revenue += 50
    
    return {
        "upcoming_events": upcoming_events,
        "pending_todos": pending_todos,
        "recent_clients": recent_clients,
        "pending_quotes": pending_quotes,
        "unpaid_invoices": unpaid_invoices,
        "stats": {
            "monthly_revenue": monthly_revenue,
            "total_clients": await db.clients.count_documents({"uid": current_user.uid}),
            "pending_todos_count": await db.todos.count_documents({"uid": current_user.uid, "completed": False}),
            "unpaid_invoices_count": len(unpaid_invoices)
        }
    }

# Planning endpoints
@api_router.get("/planning/week/{year}/{week}")
async def get_week_planning(year: int, week: int, team_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    uids = [current_user.uid]
    if team_id:
        team = await db.teams.find_one({"team_id": team_id})
        if not team or current_user.uid not in (team.get("members", []) + [team.get("created_by")]):
            raise HTTPException(status_code=403, detail="Not authorized for this team")
        uids = team.get("members", []) + [team.get("created_by")]

    events = await db.planning_events.find(
        {"uid": {"$in": uids}, "year": year, "week": week},
        {"_id": 0}
    ).to_list(1000)
    tasks = await db.weekly_tasks.find(
        {"uid": {"$in": uids}, "year": year, "week": week},
        {"_id": 0}
    ).to_list(1000)

    return {"events": events, "tasks": tasks}

@api_router.get("/planning/month/{year}/{month}")
async def get_month_planning(year: int, month: int, team_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    last_day = calendar.monthrange(year, month)[1]
    pairs = {
        (datetime(year, month, day).isocalendar().year,
         datetime(year, month, day).isocalendar().week)
        for day in range(1, last_day + 1)
    }
    or_filters = [{"year": y, "week": w} for y, w in pairs]

    uids = [current_user.uid]
    if team_id:
        team = await db.teams.find_one({"team_id": team_id})
        if not team or current_user.uid not in (team.get("members", []) + [team.get("created_by")]):
            raise HTTPException(status_code=403, detail="Not authorized for this team")
        uids = team.get("members", []) + [team.get("created_by")]

    events_cursor = db.planning_events.find(
        {"uid": {"$in": uids}, "$or": or_filters},
        {"_id": 0}
    )
    tasks_cursor = db.weekly_tasks.find(
        {"uid": {"$in": uids}, "$or": or_filters},
        {"_id": 0}
    )
    events, tasks = await asyncio.gather(events_cursor.to_list(1000), tasks_cursor.to_list(1000))

    return {"events": events, "tasks": tasks}

@api_router.post("/planning/events")
async def create_event(event_request: EventCreateRequest, current_user: User = Depends(get_current_user)):
    now = datetime.now()
    year = now.year
    week = now.isocalendar()[1]
    
    event = PlanningEvent(
        uid=current_user.uid,
        week=week,
        year=year,
        **event_request.dict()
    )
    
    await db.planning_events.insert_one(event.dict())
    return event

@api_router.put("/planning/events/{event_id}")
async def update_event(event_id: str, event_request: EventCreateRequest, current_user: User = Depends(get_current_user)):
    await db.planning_events.update_one(
        {"id": event_id, "uid": current_user.uid},
        {"$set": {**event_request.dict(), "updated_at": datetime.utcnow()}}
    )
    
    updated_event = await db.planning_events.find_one({"id": event_id}, {"_id": 0})
    return updated_event

@api_router.delete("/planning/events/{event_id}")
async def delete_event(event_id: str, current_user: User = Depends(get_current_user)):
    result = await db.planning_events.delete_one({"id": event_id, "uid": current_user.uid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"message": "Event deleted"}

@api_router.get("/planning/earnings/{year}/{week}")
async def get_earnings(year: int, week: int, team_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    uids = [current_user.uid]
    if team_id:
        team = await db.teams.find_one({"team_id": team_id})
        if not team or current_user.uid not in (team.get("members", []) + [team.get("created_by")]):
            raise HTTPException(status_code=403, detail="Not authorized for this team")
        uids = team.get("members", []) + [team.get("created_by")]

    events = await db.planning_events.find(
        {"uid": {"$in": uids}, "year": year, "week": week},
        {"_id": 0}
    ).to_list(1000)
    tasks = await db.weekly_tasks.find(
        {"uid": {"$in": uids}, "year": year, "week": week},
        {"_id": 0}
    ).to_list(1000)
    
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
            amount = hours * event.get("hourly_rate", current_user.hourly_rate)
            
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
            amount = event.get("hourly_rate", current_user.hourly_rate)
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
# Tasks endpoints
@api_router.post("/planning/tasks")
async def create_task(task_request: TaskCreateRequest, current_user: User = Depends(get_current_user)):
    now = datetime.now()
    year = now.year
    week = now.isocalendar()[1]
    
    task = WeeklyTask(
        uid=current_user.uid,
        week=week,
        year=year,
        **task_request.dict()
    )
    
    await db.weekly_tasks.insert_one(task.dict())
    return task

@api_router.put("/planning/tasks/{task_id}")
async def update_task(task_id: str, task_request: TaskCreateRequest, current_user: User = Depends(get_current_user)):
    await db.weekly_tasks.update_one(
        {"id": task_id, "uid": current_user.uid},
        {"$set": {**task_request.dict(), "updated_at": datetime.utcnow()}}
    )
    
    updated_task = await db.weekly_tasks.find_one({"id": task_id}, {"_id": 0})
    return updated_task

@api_router.delete("/planning/tasks/{task_id}")
async def delete_task(task_id: str, current_user: User = Depends(get_current_user)):
    result = await db.weekly_tasks.delete_one({"id": task_id, "uid": current_user.uid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Task deleted"}

@api_router.get("/todos")
async def get_todos(current_user: User = Depends(get_current_user)):
    todos = await db.todos.find({"uid": current_user.uid}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return todos

@api_router.post("/todos")
async def create_todo(todo_request: TodoCreateRequest, current_user: User = Depends(get_current_user)):
    todo_data = todo_request.dict()
    if todo_data.get("due_date"):
        todo_data["due_date"] = datetime.fromisoformat(todo_data["due_date"].replace("Z", "+00:00"))
    
    todo = Todo(
        uid=current_user.uid,
        **todo_data
    )
    
    await db.todos.insert_one(todo.dict())
    return todo

@api_router.put("/todos/{todo_id}")
async def update_todo(todo_id: str, todo_request: TodoCreateRequest, current_user: User = Depends(get_current_user)):
    todo_data = todo_request.dict()
    if todo_data.get("due_date"):
        todo_data["due_date"] = datetime.fromisoformat(todo_data["due_date"].replace("Z", "+00:00"))
    
    await db.todos.update_one(
        {"id": todo_id, "uid": current_user.uid},
        {"$set": {**todo_data, "updated_at": datetime.utcnow()}}
    )
    
    updated_todo = await db.todos.find_one({"id": todo_id}, {"_id": 0})
    return updated_todo

@api_router.put("/todos/{todo_id}/toggle")
async def toggle_todo(todo_id: str, current_user: User = Depends(get_current_user)):
    todo = await db.todos.find_one({"id": todo_id, "uid": current_user.uid})
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    
    await db.todos.update_one(
        {"id": todo_id},
        {"$set": {"completed": not todo["completed"], "updated_at": datetime.utcnow()}}
    )
    
    updated_todo = await db.todos.find_one({"id": todo_id}, {"_id": 0})
    return updated_todo

@api_router.delete("/todos/{todo_id}")
async def delete_todo(todo_id: str, current_user: User = Depends(get_current_user)):
    result = await db.todos.delete_one({"id": todo_id, "uid": current_user.uid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Todo not found")
    return {"message": "Todo deleted"}

# Clients endpoints
@api_router.get("/clients")
async def get_clients(current_user: User = Depends(get_current_user)):
    clients = await db.clients.find({"uid": current_user.uid}, {"_id": 0}).sort("name", 1).to_list(1000)
    return clients

@api_router.post("/clients")
async def create_client(client_request: ClientCreateRequest, current_user: User = Depends(get_current_user)):
    client = Client(
        uid=current_user.uid,
        **client_request.dict()
    )
    
    await db.clients.insert_one(client.dict())
    return client

@api_router.put("/clients/{client_id}")
async def update_client(client_id: str, client_request: ClientCreateRequest, current_user: User = Depends(get_current_user)):
    await db.clients.update_one(
        {"id": client_id, "uid": current_user.uid},
        {"$set": {**client_request.dict(), "updated_at": datetime.utcnow()}}
    )
    
    updated_client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    return updated_client

@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, current_user: User = Depends(get_current_user)):
    result = await db.clients.delete_one({"id": client_id, "uid": current_user.uid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"message": "Client deleted"}

# Quotes endpoints
@api_router.get("/quotes")
async def get_quotes(current_user: User = Depends(get_current_user)):
    quotes = await db.quotes.find({"uid": current_user.uid}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return quotes

@api_router.post("/quotes")
async def create_quote(quote_request: QuoteCreateRequest, current_user: User = Depends(get_current_user)):
    # Generate quote number
    quote_count = await db.quotes.count_documents({"uid": current_user.uid})
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
        uid=current_user.uid,
        **quote_data
    )
    
    await db.quotes.insert_one(quote.dict())
    return quote

@api_router.put("/quotes/{quote_id}")
async def update_quote(quote_id: str, quote_request: QuoteCreateRequest, current_user: User = Depends(get_current_user)):
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
    
    await db.quotes.update_one(
        {"id": quote_id, "uid": current_user.uid},
        {"$set": quote_data}
    )
    
    updated_quote = await db.quotes.find_one({"id": quote_id})
    return updated_quote

@api_router.delete("/quotes/{quote_id}")
async def delete_quote(quote_id: str, current_user: User = Depends(get_current_user)):
    result = await db.quotes.delete_one({"id": quote_id, "uid": current_user.uid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Quote not found")
    return {"message": "Quote deleted"}

#@api_router.get("/quotes/{quote_id}/pdf")
#async def get_quote_pdf(quote_id: str, current_user: User = Depends(get_current_user)):
    #quote = await db.quotes.find_one({"id": quote_id, "uid": current_user.uid}, {"_id": 0})
    #if not quote:
        #raise HTTPException(status_code=404, detail="Quote not found")
    #pdf_bytes = await quote_pdf_bytes(quote)
    #return Response(content=pdf_bytes, media_type="application/pdf")

@api_router.put("/quotes/{quote_id}/status")
async def update_quote_status(quote_id: str, status: str, current_user: User = Depends(get_current_user)):
    await db.quotes.update_one(
        {"id": quote_id, "uid": current_user.uid},
        {"$set": {"status": status, "updated_at": datetime.utcnow()}}
    )
    
    updated_quote = await db.quotes.find_one({"id": quote_id})
    return updated_quote

# Invoices endpoints
@api_router.get("/invoices")
async def get_invoices(current_user: User = Depends(get_current_user)):
    invoices = await db.invoices.find({"uid": current_user.uid}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return invoices

@api_router.post("/invoices")
async def create_invoice(invoice_request: InvoiceCreateRequest, current_user: User = Depends(get_current_user)):
    # Generate invoice number
    invoice_count = await db.invoices.count_documents({"uid": current_user.uid})
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
        uid=current_user.uid,
        **invoice_data
    )
    
    await db.invoices.insert_one(invoice.dict())
    return invoice

@api_router.put("/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, invoice_request: InvoiceCreateRequest, current_user: User = Depends(get_current_user)):
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

    await db.invoices.update_one(
        {"id": invoice_id, "uid": current_user.uid},
        {"$set": invoice_data},
    )

    updated_invoice = await db.invoices.find_one({"id": invoice_id})
    return updated_invoice

#@api_router.get("/invoices/{invoice_id}/pdf")
#async def get_invoice_pdf(invoice_id: str, current_user: User = Depends(get_current_user)):
#    invoice = await db.invoices.find_one({"id": invoice_id, "uid": current_user.uid}, {"_id": 0})
 #   if not invoice:
  #      raise HTTPException(status_code=404, detail="Invoice not found")
   # pdf_bytes = await invoice_pdf_bytes(invoice)
    #return Response(content=pdf_bytes, media_type="application/pdf")

@api_router.delete("/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str, current_user: User = Depends(get_current_user)):
    result = await db.invoices.delete_one({"id": invoice_id, "uid": current_user.uid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return {"message": "Invoice deleted"}

@api_router.put("/invoices/{invoice_id}/status")
async def update_invoice_status(invoice_id: str, status: str, current_user: User = Depends(get_current_user)):
    update_data = {"status": status, "updated_at": datetime.utcnow()}
    if status == "paid":
        update_data["paid_date"] = datetime.utcnow()
    
    await db.invoices.update_one(
        {"id": invoice_id, "uid": current_user.uid},
        {"$set": update_data}
    )
    
    updated_invoice = await db.invoices.find_one({"id": invoice_id})
    return updated_invoice

# Teams endpoints
@api_router.post("/teams")
async def create_team(team_request: TeamCreateRequest, current_user: User = Depends(get_current_user)):
    team = Team(
        name=team_request.name,
        members=[current_user.uid],
        created_by=current_user.uid
    )
    
    await db.teams.insert_one(team.dict())
    
    # Update user's team_id
    await db.users.update_one(
        {"uid": current_user.uid},
        {"$set": {"team_id": team.team_id}}
    )
    
    return team

@api_router.get("/teams/my")
async def get_my_team(current_user: User = Depends(get_current_user)):
    if not current_user.team_id:
        return None
    
    team = await db.teams.find_one({"team_id": current_user.team_id})
    if not team:
        return None
    
    # Get team members info
    members = []
    for member_uid in team["members"]:
        member = await db.users.find_one({"uid": member_uid})
        if member:
            members.append({
                "uid": member["uid"],
                "name": member["name"],
                "email": member["email"]
            })
    
    return {
        "team_id": team["team_id"],
        "name": team["name"],
        "invite_code": team["invite_code"],
        "members": members,
        "created_by": team["created_by"]
    }

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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
