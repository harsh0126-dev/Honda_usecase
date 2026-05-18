from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv
import psycopg2
import os
import logging
from typing import Literal

load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

FIXED_TABLES = ["departments", "employees", "projects"]

FIXED_SCHEMA_CONTEXT = """
Database domain: employee departments and projects.

Table: departments
Columns:
- department_id (integer, primary key)
- department_name (varchar)
- location (varchar)
Sample rows:
- (1, 'Engineering', 'Mumbai')
- (2, 'HR', 'Delhi')
- (3, 'Finance', 'Bangalore')
- (4, 'Marketing', 'Pune')
- (5, 'Operations', 'Hyderabad')

Table: employees
Columns:
- employee_id (integer, primary key)
- first_name (varchar)
- last_name (varchar)
- email (varchar)
- salary (numeric)
- department_id (integer, foreign key to departments.department_id)
- joining_date (date)
Sample rows:
- (1, 'Aman', 'Sharma', 'aman.sharma@gmail.com', 75000, 1, '2022-01-10')
- (2, 'Priya', 'Verma', 'priya.verma@gmail.com', 68000, 2, '2021-05-14')
- (3, 'Rahul', 'Mehta', 'rahul.mehta@gmail.com', 82000, 1, '2020-03-18')
- (4, 'Sneha', 'Kapoor', 'sneha.kapoor@gmail.com', 59000, 3, '2023-07-22')

Table: projects
Columns:
- project_id (integer, primary key)
- project_name (varchar)
- budget (numeric)
- employee_id (integer, foreign key to employees.employee_id)
- start_date (date)
Sample rows:
- (1, 'AI Chatbot', 500000, 1, '2024-01-10')
- (2, 'Payroll System', 250000, 2, '2024-02-15')
- (3, 'Trading Dashboard', 700000, 3, '2024-03-01')
- (4, 'Finance Tracker', 300000, 4, '2024-01-25')

Relationships:
- employees.department_id joins departments.department_id
- projects.employee_id joins employees.employee_id

Common query meanings:
- "employee", "staff", "person" usually means rows in employees.
- "department" means departments.department_name or the departments table.
- "location", "city", or city names like Mumbai/Delhi/Bangalore/Pune/Hyderabad refer to departments.location.
- "project" means projects.project_name or the projects table.
- "salary", "pay", or "compensation" refers to employees.salary.
- "budget", "project cost", or "project amount" refers to projects.budget.
- To answer department/location questions about employees or projects, join through the foreign keys above.
"""

db_connection = {"conn": None, "conn_string": None}


class ConnectRequest(BaseModel):
    connection_string: str = None


class ChatMessage(BaseModel):
    role: Literal["user", "bot", "assistant"]
    content: str


class QueryRequest(BaseModel):
    question: str
    history: list[ChatMessage] = Field(default_factory=list)


def build_conversation_context(history: list[ChatMessage], max_user_turns: int = 3) -> str:
    if not history:
        return ""

    selected = []
    user_turns = 0
    for message in reversed(history):
        if not message.content.strip():
            continue
        selected.append(message)
        if message.role == "user":
            user_turns += 1
        if user_turns >= max_user_turns:
            break

    lines = []
    for message in reversed(selected):
        role = "User" if message.role == "user" else "Assistant"
        content = " ".join(message.content.split())
        lines.append(f"{role}: {content[:700]}")
    return "\n".join(lines)


@app.post("/connect")
def connect(req: ConnectRequest):
    try:
        conn_str = req.connection_string or os.getenv("DATABASE_URL")
        if not conn_str:
            raise HTTPException(status_code=400, detail="No connection string provided")
        logger.info(f"Attempting database connection to: {conn_str.split('@')[-1] if '@' in conn_str else 'unknown'}")
        conn = psycopg2.connect(conn_str)
        db_connection["conn"] = conn
        db_connection["conn_string"] = conn_str
        logger.info(f"Connected successfully. Using fixed schema for tables: {FIXED_TABLES}")
        return {"status": "connected", "tables": FIXED_TABLES}
    except Exception as e:
        logger.error(f"Connection failed: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/query")
def query(req: QueryRequest):
    if not db_connection["conn"]:
        logger.warning("Query attempted without active database connection")
        raise HTTPException(status_code=400, detail="Not connected to database")
    
    logger.info(f"Received query: {req.question}")
    conversation_context = build_conversation_context(req.history)

    logger.info("Using fixed schema context, sending to agent...")
    from agent import run_agent
    result = run_agent(req.question, FIXED_SCHEMA_CONTEXT, db_connection["conn"], conversation_context)
    logger.info(f"Agent response received. is_db_question={result.get('is_db_question')}")
    return result


@app.get("/status")
def status():
    return {"connected": db_connection["conn"] is not None, "tables": FIXED_TABLES}
