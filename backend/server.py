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
    created_by: str
    invite_code: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])

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
    hourly_rate: Optional[float] = 50.0
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
    time_slots: List[Dict[str, str]] = []  # [{"day": "monday", "start": "09:00", "end": "10:00"}]
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Client(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    uid: str
    name: str
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
    hourly_rate: Optional[float] = 50.0

class TaskCreateRequest(BaseModel):
    name: str
    price: float
    color: str
    icon: str
    time_slots: List[Dict[str, str]] = []

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

@api_router.get("/planning/month/{year}/{month}")
async def get_month_planning(year: int, month: int, current_user: User = Depends(get_current_user)):
    # Get all events for the month (approximate by weeks)
    events = await db.planning_events.find({"uid": current_user.uid, "year": year}).to_list(1000)
    tasks = await db.weekly_tasks.find({"uid": current_user.uid, "year": year}).to_list(1000)
    
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
    
    update_data = event_request.dict()
    update_data["updated_at"] = datetime.utcnow()
    
    await db.planning_events.update_one(
        {"id": event_id},
        {"$set": update_data}
    )
    
    updated_event = await db.planning_events.find_one({"id": event_id})
    return PlanningEvent(**updated_event)

@api_router.delete("/planning/events/{event_id}")
async def delete_event(event_id: str, current_user: User = Depends(get_current_user)):
    result = await db.planning_events.delete_one({"id": event_id, "uid": current_user.uid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"message": "Event deleted"}

@api_router.delete("/planning/events/week/{year}/{week}")
async def delete_week_events(year: int, week: int, current_user: User = Depends(get_current_user)):
    result = await db.planning_events.delete_many({
        "uid": current_user.uid, 
        "year": year, 
        "week": week
    })
    return {"message": f"Deleted {result.deleted_count} events"}

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
    task = await db.weekly_tasks.find_one({"id": task_id, "uid": current_user.uid})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    await db.weekly_tasks.update_one(
        {"id": task_id},
        {"$set": task_request.dict()}
    )
    
    updated_task = await db.weekly_tasks.find_one({"id": task_id})
    return WeeklyTask(**updated_task)

@api_router.delete("/planning/tasks/{task_id}")
async def delete_task(task_id: str, current_user: User = Depends(get_current_user)):
    result = await db.weekly_tasks.delete_one({"id": task_id, "uid": current_user.uid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Task deleted"}

@api_router.get("/planning/earnings/{year}/{week}")
async def get_earnings(year: int, week: int, current_user: User = Depends(get_current_user)):
    events = await db.planning_events.find({"uid": current_user.uid, "year": year, "week": week}).to_list(1000)
    tasks = await db.weekly_tasks.find({"uid": current_user.uid, "year": year, "week": week}).to_list(1000)
    
    earnings = {
        "paid": 0,
        "unpaid": 0,
        "pending": 0,
        "not_worked": 0,
        "tasks_total": sum(task["price"] for task in tasks)
    }
    
    # Calculate earnings from events based on hours and rate
    for event in events:
        try:
            start_hour = int(event["start_time"].split(":")[0])
            end_hour = int(event["end_time"].split(":")[0])
            hours = end_hour - start_hour
            amount = hours * event.get("hourly_rate", 50)
            
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
            if event["status"] == "paid":
                earnings["paid"] += 50
            elif event["status"] == "unpaid":
                earnings["unpaid"] += 50
            elif event["status"] == "pending":
                earnings["pending"] += 50
    
    earnings["total"] = earnings["paid"] + earnings["unpaid"] + earnings["pending"] + earnings["tasks_total"]
    
    return earnings

# Clients endpoints
@api_router.get("/clients")
async def get_clients(current_user: User = Depends(get_current_user)):
    clients = await db.clients.find({"uid": current_user.uid}).to_list(1000)
    return [client["name"] for client in clients]

@api_router.post("/clients")
async def add_client(client_name: str, current_user: User = Depends(get_current_user)):
    # Check if client already exists
    existing = await db.clients.find_one({"uid": current_user.uid, "name": client_name})
    if not existing:
        client = Client(uid=current_user.uid, name=client_name)
        await db.clients.insert_one(client.dict())
    return {"message": "Client added"}

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

@api_router.post("/teams/join")
async def join_team(join_request: TeamJoinRequest, current_user: User = Depends(get_current_user)):
    team = await db.teams.find_one({"invite_code": join_request.invite_code})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    # Add user to team
    if current_user.uid not in team["members"]:
        await db.teams.update_one(
            {"team_id": team["team_id"]},
            {"$push": {"members": current_user.uid}}
        )
        
        # Update user's team_id
        await db.users.update_one(
            {"uid": current_user.uid},
            {"$set": {"team_id": team["team_id"]}}
        )
    
    return {"message": "Joined team successfully"}

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

@api_router.get("/teams/member/{member_uid}/planning/{year}/{week}")
async def get_member_planning(member_uid: str, year: int, week: int, current_user: User = Depends(get_current_user)):
    # Check if user is in same team as requested member
    if not current_user.team_id:
        raise HTTPException(status_code=403, detail="Not in a team")
    
    member = await db.users.find_one({"uid": member_uid})
    if not member or member.get("team_id") != current_user.team_id:
        raise HTTPException(status_code=403, detail="Member not in same team")
    
    events = await db.planning_events.find({"uid": member_uid, "year": year, "week": week}).to_list(1000)
    tasks = await db.weekly_tasks.find({"uid": member_uid, "year": year, "week": week}).to_list(1000)
    
    return {
        "events": [PlanningEvent(**event) for event in events],
        "tasks": [WeeklyTask(**task) for task in tasks],
        "member": {
            "uid": member["uid"],
            "name": member["name"]
        }
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