from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
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
import requests
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

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

class Team(BaseModel):
    team_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    members: List[str] = []

class PlanningEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    uid: str
    week: int
    year: int
    description: str
    client: str
    day: str  # "monday", "tuesday", etc
    start_time: str  # "09:00"
    end_time: str  # "17:00"
    status: str  # "paid", "unpaid", "pending", "not_worked"
    created_at: datetime = Field(default_factory=datetime.utcnow)

class WeeklyTask(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    uid: str
    week: int
    year: int
    name: str
    price: float
    color: str
    icon: str
    time_slots: List[Dict[str, str]] = []  # [{"day": "monday", "start": "09:00", "end": "10:00"}]
    created_at: datetime = Field(default_factory=datetime.utcnow)

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
    client: str
    day: str
    start_time: str
    end_time: str
    status: str = "pending"

class TaskCreateRequest(BaseModel):
    name: str
    price: float
    color: str
    icon: str
    time_slots: List[Dict[str, str]] = []

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
        # Call Emergent auth API
        headers = {"X-Session-ID": auth_request.session_id}
        response = requests.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers=headers
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/auth/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

# Planning endpoints
@api_router.get("/planning/week/{year}/{week}")
async def get_week_planning(year: int, week: int, current_user: User = Depends(get_current_user)):
    events = await db.planning_events.find({"uid": current_user.uid, "year": year, "week": week}).to_list(1000)
    tasks = await db.weekly_tasks.find({"uid": current_user.uid, "year": year, "week": week}).to_list(1000)
    
    return {
        "events": [PlanningEvent(**event) for event in events],
        "tasks": [WeeklyTask(**task) for task in tasks]
    }

@api_router.post("/planning/events")
async def create_event(event_request: EventCreateRequest, current_user: User = Depends(get_current_user)):
    # Get current week and year
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
    event = await db.planning_events.find_one({"id": event_id, "uid": current_user.uid})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    await db.planning_events.update_one(
        {"id": event_id},
        {"$set": event_request.dict()}
    )
    
    updated_event = await db.planning_events.find_one({"id": event_id})
    return PlanningEvent(**updated_event)

@api_router.delete("/planning/events/{event_id}")
async def delete_event(event_id: str, current_user: User = Depends(get_current_user)):
    result = await db.planning_events.delete_one({"id": event_id, "uid": current_user.uid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"message": "Event deleted"}

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

@api_router.get("/planning/earnings/{year}/{week}")
async def get_earnings(year: int, week: int, current_user: User = Depends(get_current_user)):
    events = await db.planning_events.find({"uid": current_user.uid, "year": year, "week": week}).to_list(1000)
    tasks = await db.weekly_tasks.find({"uid": current_user.uid, "year": year, "week": week}).to_list(1000)
    
    earnings = {
        "paid": 0,
        "unpaid": 0,
        "pending": 0,
        "tasks_total": sum(task["price"] for task in tasks)
    }
    
    # Calculate earnings from events (assuming hourly rate calculation would be added)
    for event in events:
        if event["status"] == "paid":
            earnings["paid"] += 50  # Placeholder hourly rate
        elif event["status"] == "unpaid":
            earnings["unpaid"] += 50
        elif event["status"] == "pending":
            earnings["pending"] += 50
    
    return earnings

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