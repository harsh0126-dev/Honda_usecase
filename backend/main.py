from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import psycopg2
import os
import logging

load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

db_connection = {"conn": None, "conn_string": None, "schema": None}


class ConnectRequest(BaseModel):
    connection_string: str = None


class QueryRequest(BaseModel):
    question: str


def get_schema(conn):
    cur = conn.cursor()
    cur.execute("""
        SELECT table_name, column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        ORDER BY table_name, ordinal_position
    """)
    rows = cur.fetchall()
    schema = {}
    for table, col, dtype in rows:
        schema.setdefault(table, []).append(f"{col} ({dtype})")
    cur.close()
    return schema


def get_sample_rows(conn, table, limit=3):
    cur = conn.cursor()
    try:
        cur.execute(f'SELECT * FROM "{table}" LIMIT {limit}')
        cols = [desc[0] for desc in cur.description]
        rows = cur.fetchall()
        cur.close()
        return cols, rows
    except Exception:
        cur.close()
        conn.rollback()
        return [], []


@app.post("/connect")
def connect(req: ConnectRequest):
    try:
        conn_str = req.connection_string or os.getenv("DATABASE_URL")
        if not conn_str:
            raise HTTPException(status_code=400, detail="No connection string provided")
        logger.info(f"Attempting database connection to: {conn_str.split('@')[-1] if '@' in conn_str else 'unknown'}")
        conn = psycopg2.connect(conn_str)
        schema = get_schema(conn)
        db_connection["conn"] = conn
        db_connection["conn_string"] = conn_str
        db_connection["schema"] = schema
        logger.info(f"Connected successfully. Found {len(schema)} tables: {list(schema.keys())}")
        return {"status": "connected", "tables": list(schema.keys())}
    except Exception as e:
        logger.error(f"Connection failed: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/query")
def query(req: QueryRequest):
    if not db_connection["conn"]:
        logger.warning("Query attempted without active database connection")
        raise HTTPException(status_code=400, detail="Not connected to database")
    
    logger.info(f"Received query: {req.question}")
    
    # Build schema context with sample rows
    schema_text = ""
    for table, cols in db_connection["schema"].items():
        schema_text += f"\nTable: {table}\nColumns: {', '.join(cols)}\n"
        sample_cols, sample_rows = get_sample_rows(db_connection["conn"], table)
        if sample_rows:
            schema_text += f"Sample data ({', '.join(sample_cols)}): {sample_rows[:2]}\n"

    logger.info("Schema context built, sending to agent...")
    from agent import run_agent
    result = run_agent(req.question, schema_text, db_connection["conn"])
    logger.info(f"Agent response received. is_db_question={result.get('is_db_question')}")
    return result


@app.get("/status")
def status():
    return {"connected": db_connection["conn"] is not None, "tables": list(db_connection["schema"].keys()) if db_connection["schema"] else []}
