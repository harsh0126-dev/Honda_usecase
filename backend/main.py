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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# -----------------------------
# FIXED TABLE CONFIGURATION
# -----------------------------

FIXED_TABLES = ["Honda_Data"]

FIXED_SCHEMA_CONTEXT = """
Database Domain:
Honda Manufacturing Production, Inventory, Quality, and Shipping Operations Analytics.

Table Name: Honda_Data

Description:
This table contains manufacturing production KPIs, inventory metrics,
quality indicators, shipping performance, downtime information,
and operational recovery details for Honda manufacturing plants and production lines.

===========================================================
TABLE: Honda_Data
===========================================================

Columns:

1. Plant (Text)
Description:
Represents the manufacturing plant code or facility where the units/products are produced.
Different plant codes help identify production locations and compare operational performance across manufacturing sites.

Sample Values:
- AAPA
- HCMA
- IAPA
- MAPA
- ELPA
- HDMCA

-----------------------------------------------------------

2. Line (Text)
Description:
Refers to the production line code within a plant.
Each line may perform a specific manufacturing activity such as welding,
painting, assembly, inspection, or packaging.

Sample Values:
- L1
- L2
- TM

-----------------------------------------------------------

3. Date (Timestamp)
Description:
Indicates the production date on which the manufacturing activity
or unit production was recorded.

-----------------------------------------------------------

4. Linecapacity (numeric)
Description:
Defines the maximum number of units that a production line is capable
of manufacturing within a specific time period.

-----------------------------------------------------------

5. Baseplan (numeric)
Description:
Represents the planned production target or expected number of units
that should be manufactured on a particular date.

-----------------------------------------------------------

6. Coretimeunits (numeric)
Description:
Indicates the number of units manufactured during the standard planned production hours.

-----------------------------------------------------------

7. EPRunits (numeric)
Description:
Extra Product Recovery Units.
Additional units produced beyond the planned target to compensate
for previous shortages or improve production output.

-----------------------------------------------------------

8. LPRunits (numeric)
Description:
Loss Product Recovery Units.
Units recovered after production losses caused by downtime,
shortages, or operational disruptions.

-----------------------------------------------------------

9. CBUscrap (numeric)
Description:
Represents the number of Completely Built Units rejected due to
quality failures or inspection issues.

-----------------------------------------------------------

10. Totalunits (numeric)
Description:
Final number of acceptable manufactured units after accounting
for all production and recovery activities.

Formula:
Total Units = Core Time Units + EPR Units + LPR Units − CBU Scrap

-----------------------------------------------------------

11. Dailyprogress (numeric)
Description:
Net production progress achieved during the day compared
to the planned target.

-----------------------------------------------------------

12. Accumprogress (numeric)
Description:
Cumulative production progress over a period of time,
typically month-to-date.

-----------------------------------------------------------

13. Coretimeachieved (text)
Description:
Indicates whether the planned production target was achieved
within the standard production time.

Typical Values:
- Yes
- No

-----------------------------------------------------------

14. "CTA(Monthtodate)" (text)
Description:
Month-to-date count of how many times the Core Time target
was achieved versus missed.

Example:
- 5/7 means achieved on 5 out of 7 production days.

-----------------------------------------------------------

15. "CTA%(Monthtodate)" (numeric)
Description:
Percentage of successful Core Time Achievements during the month.

-----------------------------------------------------------

16. PlannedRecovery (date)
Description:
Target recovery date by which production losses, delays,
or shortages are expected to be recovered.

-----------------------------------------------------------

17. Noofdowntimeincidents (numeric)
Description:
Number of production downtime incidents where manufacturing
was interrupted for a significant duration.

-----------------------------------------------------------

18. GDPplan (numeric)
Description:
Planned Global Direct Pass target percentage.

-----------------------------------------------------------

19. GDPactual (numeric)
Description:
Actual achieved Global Direct Pass percentage.

-----------------------------------------------------------

20. Inventoryplan (numeric)
Description:
Planned inventory level required to support smooth production operations.

-----------------------------------------------------------

21. Inventoryactual (numeric)
Description:
Actual inventory available at a given point in time.

-----------------------------------------------------------

22. Inventorygap (numeric)
Description:
Difference between actual inventory and planned inventory.

Formula:
Inventory Gap = Inventory Actual − Inventory Plan

Positive Value:
Excess Inventory

Negative Value:
Inventory Shortage

-----------------------------------------------------------

23. Inventoryplannedrecovery (date)
Description:
Expected recovery date by which inventory levels should return
to planned target quantity.

-----------------------------------------------------------

24. Agedinventory (numeric)
Description:
Inventory units that have remained unsold, unused,
or inactive for more than a defined period.

-----------------------------------------------------------

25. Classicinventory (numeric)
Description:
Outdated, obsolete, or older-version inventory units.

-----------------------------------------------------------

26. StragglersPlan (numeric)
Description:
Planned number of delayed or pending units within the production cycle.

-----------------------------------------------------------

27. StragglersActual (numeric)
Description:
Actual number of delayed or lagging units observed.

-----------------------------------------------------------

28. Shippingactual (numeric)
Description:
Total number of units successfully shipped or dispatched.

-----------------------------------------------------------

29. Ontimeshipping (numeric)
Description:
Percentage or count of units shipped within the committed timeline.

-----------------------------------------------------------

30. Runrateplan (numeric)
Description:
Planned production rate indicating expected manufacturing speed.

-----------------------------------------------------------

31. Runrateactual (numeric)
Description:
Actual achieved production rate during manufacturing operations.

===========================================================
BUSINESS UNDERSTANDING / QUERY MEANINGS
===========================================================

Common User Query Meanings:

- "plant", "factory", "facility"
  → Plant

- "line", "production line"
  → Line

- "production", "units produced", "manufactured units"
  → Totalunits or Coretimeunits

- "target", "plan"
  → Baseplan or Linecapacity

- "core time"
  → Coretimeunits or Coretimeachieved

- "recovery units"
  → EPRunits or LPRunits

- "scrap", "rejected units", "defects"
  → CBUscrap

- "daily progress"
  → Dailyprogress

- "monthly progress", "accumulated progress"
  → Accumprogress

- "CTA"
  → CTA(Monthtodate) or CTA%(Monthtodate)

- "downtime", "incidents"
  → Noofdowntimeincidents

- "GDP"
  → GDPplan or GDPactual

- "inventory"
  → Inventoryplan, Inventoryactual, Inventorygap

- "aged inventory"
  → Agedinventory

- "classic inventory"
  → Classicinventory

- "stragglers"
  → StragglersPlan or StragglersActual

- "shipping", "dispatch"
  → Shippingactual

- "on time shipping"
  → Ontimeshipping

- "run rate"
  → Runrateplan or Runrateactual

===========================================================
IMPORTANT NOTES
===========================================================

- Missing values may exist as NULL.
- Dates can appear in multiple formats in source systems.
- Numeric KPI columns should be aggregated using SUM, AVG,
  MAX, or MIN depending on the query intent.
- Percent columns should usually use AVG aggregation.
- Production and inventory KPIs are commonly analyzed
  by Plant, Line, and Date.
"""

db_connection = {"conn": None, "conn_string": None}


# -----------------------------
# REQUEST MODELS
# -----------------------------

class ConnectRequest(BaseModel):
    connection_string: str = None


class ChatMessage(BaseModel):
    role: Literal["user", "bot", "assistant"]
    content: str


class QueryRequest(BaseModel):
    question: str
    history: list[ChatMessage] = Field(default_factory=list)


# -----------------------------
# CONVERSATION CONTEXT
# -----------------------------

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


# -----------------------------
# DATABASE CONNECT
# -----------------------------

@app.post("/connect")
def connect(req: ConnectRequest):
    try:
        conn_str = req.connection_string or os.getenv("DATABASE_URL")

        if not conn_str:
            raise HTTPException(
                status_code=400,
                detail="No connection string provided"
            )

        logger.info(
            f"Attempting database connection to: "
            f"{conn_str.split('@')[-1] if '@' in conn_str else 'unknown'}"
        )

        conn = psycopg2.connect(conn_str)

        db_connection["conn"] = conn
        db_connection["conn_string"] = conn_str

        logger.info(
            f"Connected successfully. Using fixed schema for tables: {FIXED_TABLES}"
        )

        return {
            "status": "connected",
            "tables": FIXED_TABLES
        }

    except Exception as e:
        logger.error(f"Connection failed: {str(e)}")

        raise HTTPException(
            status_code=400,
            detail=str(e)
        )


# -----------------------------
# QUERY API
# -----------------------------

@app.post("/query")
def query(req: QueryRequest):

    if not db_connection["conn"]:
        logger.warning("Query attempted without active database connection")

        raise HTTPException(
            status_code=400,
            detail="Not connected to database"
        )

    logger.info(f"Received query: {req.question}")

    conversation_context = build_conversation_context(req.history)

    logger.info("Using fixed Honda schema context, sending to agent...")

    from agent import run_agent

    result = run_agent(
        req.question,
        FIXED_SCHEMA_CONTEXT,
        db_connection["conn"],
        conversation_context
    )

    logger.info(
        f"Agent response received. "
        f"is_db_question={result.get('is_db_question')}"
    )

    return result


# -----------------------------
# STATUS API
# -----------------------------

@app.get("/status")
def status():
    return {
        "connected": db_connection["conn"] is not None,
        "tables": FIXED_TABLES
    }