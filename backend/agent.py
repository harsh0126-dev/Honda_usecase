"""
================================================================================
  SQL AGENT  —  LangGraph pipeline
================================================================================

Sections
--------
  1. Imports & Logger
  2. LLM Factory
  3. Agent State
  4. Utilities  (JSON extraction, type-safe serialisation, SQL sanitisation)
  5. Visualization intent detector
  6. Node: Classifier
  7. Node: SQL Generator
  8. Node: Format Answer
  9. Node: Chart Generator
 10. Graph definition
 11. Public entry-point  run_agent()

================================================================================
"""


# ── 1. Imports & Logger ──────────────────────────────────────────────────────

import json
import logging
import os
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph

logger = logging.getLogger(__name__)


# ── 2. LLM Factory ───────────────────────────────────────────────────────────

def get_llm() -> ChatOpenAI:
    return ChatOpenAI(
        model="gpt-4o",
        temperature=0,
        api_key=os.getenv("OPENAI_API_KEY"),
    )


# ── 3. Agent State ───────────────────────────────────────────────────────────

class AgentState(TypedDict):
    question: str
    schema: str
    conversation_context: str
    is_db_question: bool
    wants_visualization: bool
    sql: str                        # may be a JSON array of SQL strings for multi-query
    query_result: str
    answer: str
    error: str
    chart: dict[str, Any] | None


# ── 4. Utilities ─────────────────────────────────────────────────────────────

def _json_safe(value: Any) -> Any:
    """Make a single value JSON-serialisable."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _rows_to_records(cols: list[str], rows: list[tuple]) -> list[dict[str, Any]]:
    return [
        {col: _json_safe(val) for col, val in zip(cols, row)}
        for row in rows
    ]


def _extract_json_object(content: str) -> dict[str, Any]:
    """Pull the first JSON object out of an LLM response, stripping markdown fences."""
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned, flags=re.IGNORECASE).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError(f"LLM did not return a JSON object. Raw response:\n{content}")
    return json.loads(cleaned[start : end + 1])


def _strip_sql_fence(text: str) -> str:
    """Remove markdown code fences and leading dialect tags from a SQL string."""
    text = text.strip().strip("`")
    text = re.sub(r"^sql\s*\n", "", text, flags=re.IGNORECASE)
    return text.strip()


# ── 5. Visualization Intent Detector ─────────────────────────────────────────

_VIZ_PREFIXES = re.compile(
    r"^(show\s+me|visualize|visualise)\b",
    re.IGNORECASE,
)


def _wants_visualization(question: str) -> bool:
    """
    Return True only when the user explicitly opens the question with
    'show me …' or 'visualize …' / 'visualise …'.
    """
    return bool(_VIZ_PREFIXES.match(question.strip()))


# ── 6. Node: Classifier ───────────────────────────────────────────────────────

def classify_question(state: AgentState) -> AgentState:
    """
    Determine whether the question is answerable from the connected database.
    Delegates entirely to the LLM — no keyword lists.
    """
    logger.info("[Classify] question='%s'", state["question"])

    system = f"""You are a database-question classifier.

Given a database schema (with sample rows) and a user question, decide whether
the question is asking for information that can plausibly be answered by querying
the connected database.

Guidelines
- Answer YES for any question about counts, totals, averages, filters, rankings,
  comparisons, grouped results, or individual row lookups that map to the schema.
- Answer YES for follow-up questions that build on a previous database answer,
  even when the wording is short or informal.
- Answer YES when the user's phrasing is a natural-language synonym of a column
  or table name (e.g. "how much was spent" → an amount/spend column).
- Answer NO only when the question is clearly unrelated to the connected data.

Schema:
{state["schema"]}

Recent conversation:
{state["conversation_context"] or "None"}

Reply with exactly one word: YES or NO."""

    response = get_llm().invoke([
        SystemMessage(content=system),
        HumanMessage(content=state["question"]),
    ])
    decision = response.content.strip().upper()
    state["is_db_question"] = decision == "YES"
    logger.info("[Classify] is_db_question=%s", state["is_db_question"])
    return state


# ── 7. Node: SQL Generator ────────────────────────────────────────────────────

def generate_sql(state: AgentState) -> AgentState:
    """
    Convert the user question into one or more PostgreSQL SELECT statements.

    The LLM decides whether a single query suffices or whether multiple
    independent queries are needed (e.g. the question spans unrelated
    aggregations that are cleaner as separate statements).

    Output stored in state["sql"]:
      - single query  → plain SQL string
      - multiple      → JSON array of SQL strings, e.g. ["SELECT …", "SELECT …"]
    """
    logger.info("[SQL Generator] Generating SQL for: '%s'", state["question"])

    system = f"""You are an expert PostgreSQL query writer.

Your job is to convert the user's natural-language question into correct,
efficient PostgreSQL SELECT statement(s).

Core rules
- Use ONLY the tables and columns that appear in the schema below.
- Always double-quote identifiers (table names, column names).
- Match text values case-insensitively with ILIKE when the exact casing is uncertain.
- For date/time filtering, use appropriate PostgreSQL date functions
  (DATE_TRUNC, EXTRACT, TO_DATE, etc.).
- Resolve pronouns and references ("them", "those", "the same period", etc.)
  using the recent conversation context.
- Never add LIMIT unless the user explicitly asks for a "top N" result.
- Never use CTEs unless the logic genuinely requires intermediate results.

Single vs. multiple queries
- If the question can be fully answered by one SELECT, return just that SQL string.
- If the question requires truly independent aggregations (e.g. "compare Q1 and
  Q2 sales by region"), return a JSON array of SQL strings so that each can be
  executed separately and their results merged for the answer.
  Example of multi-query output:
      ["SELECT ...", "SELECT ..."]

Output format
- Single query  → raw SQL only, no markdown, no explanation.
- Multiple queries → valid JSON array of SQL strings, no markdown, no explanation.

Schema:
{state["schema"]}

Recent conversation:
{state["conversation_context"] or "None"}"""

    response = get_llm().invoke([
        SystemMessage(content=system),
        HumanMessage(content=state["question"]),
    ])

    raw = _strip_sql_fence(response.content)

    # Detect multi-query JSON array
    if raw.lstrip().startswith("["):
        try:
            queries = json.loads(raw)
            if isinstance(queries, list) and all(isinstance(q, str) for q in queries):
                state["sql"] = json.dumps(queries)
                logger.info("[SQL Generator] Multi-query (%d statements)", len(queries))
                return state
        except json.JSONDecodeError:
            pass  # fall through to single-query path

    state["sql"] = raw
    logger.info("[SQL Generator] Single query: %s", state["sql"])
    return state


# ── 8. Node: Format Answer ────────────────────────────────────────────────────

def format_answer(state: AgentState) -> AgentState:
    """Convert raw query result(s) into a clear, natural-language answer."""
    logger.info("[Format Answer] Formatting response")

    response = get_llm().invoke([
        SystemMessage(content=(
            "Convert the SQL query result(s) into a concise, natural English answer. "
            "If multiple result sets are present, synthesise them into one coherent response."
        )),
        HumanMessage(content=(
            f"Conversation context: {state['conversation_context'] or 'None'}\n"
            f"Question: {state['question']}\n"
            f"SQL: {state['sql']}\n"
            f"Result: {state['query_result']}"
        )),
    ])
    state["answer"] = response.content.strip()
    logger.info("[Format Answer] Done")
    return state


# ── 9. Node: Chart Generator ──────────────────────────────────────────────────

def generate_chart(
    state: AgentState,
    records: list[dict[str, Any]],
    columns: list[str],
) -> AgentState:
    """
    Choose an appropriate chart type and build a chart spec from the query result.
    The LLM selects chart type, axes, and writes a two-sentence business insight.
    """
    logger.info("[Chart Generator] Building chart spec")

    system = f"""You are a data-visualization assistant.

Given a SQL result, choose the most informative chart and return a JSON spec.

Allowed chart types: bar | line | scatter | pie

Return ONLY valid JSON with this exact shape:
{{
  "type": "bar | line | scatter | pie",
  "title": "short descriptive title",
  "xLabel": "x-axis label",
  "yLabel": "y-axis label",
  "x": ["category or date values"],
  "y": [numeric values],
  "seriesName": "legend label",
  "insight": "Two sentences: the first states the key finding with specific numbers; the second explains the business implication."
}}

Rules
- y values must be numeric.
- Cap at the 12 most relevant rows if there are more.
- No markdown, no SQL, no extra keys.

Schema:
{state["schema"]}

Conversation context:
{state["conversation_context"] or "None"}"""

    payload = {
        "question": state["question"],
        "columns": columns,
        "rows": records[:50],
    }

    response = get_llm().invoke([
        SystemMessage(content=system),
        HumanMessage(content=json.dumps(payload, ensure_ascii=False)),
    ])

    chart = _extract_json_object(response.content)
    chart.setdefault("seriesName", "Value")
    chart.setdefault("insight", "")

    state["chart"] = chart
    state["answer"] = chart["insight"] or "Here is the visualization for your data."
    logger.info("[Chart Generator] Chart type: %s", chart.get("type"))
    return state


# ── 10. Graph Definition ──────────────────────────────────────────────────────

def _route_after_classify(state: AgentState) -> str:
    return "generate_sql" if state["is_db_question"] else END


workflow = StateGraph(AgentState)
workflow.add_node("classify", classify_question)
workflow.add_node("generate_sql", generate_sql)
workflow.add_node("format_answer", format_answer)

workflow.set_entry_point("classify")
workflow.add_conditional_edges(
    "classify",
    _route_after_classify,
    {"generate_sql": "generate_sql", END: END},
)
workflow.add_edge("generate_sql", "format_answer")
workflow.add_edge("format_answer", END)

graph = workflow.compile()


# ── 11. Public Entry-point ────────────────────────────────────────────────────

def _execute_queries(
    sql_value: str,
    conn,
) -> tuple[str, list[dict[str, Any]], list[str]]:
    """
    Execute one or more SQL statements against *conn*.

    Returns
    -------
    result_str : str
        Human-readable summary of all result sets (passed to the LLM).
    all_records : list[dict]
        Merged records from all result sets (used for chart generation).
    all_cols : list[str]
        Column names from the last result set.
    """
    # Detect multi-query payload
    queries: list[str]
    if sql_value.lstrip().startswith("["):
        try:
            queries = json.loads(sql_value)
        except json.JSONDecodeError:
            queries = [sql_value]
    else:
        queries = [sql_value]

    result_parts: list[str] = []
    all_records: list[dict[str, Any]] = []
    all_cols: list[str] = []

    cur = conn.cursor()
    try:
        for idx, sql in enumerate(queries, start=1):
            logger.info("[Execute SQL] Query %d/%d: %s", idx, len(queries), sql)
            cur.execute(sql)
            cols = [desc[0] for desc in cur.description]
            rows = cur.fetchall()
            records = _rows_to_records(cols, rows)

            label = f"Query {idx}" if len(queries) > 1 else "Query"
            result_parts.append(
                f"{label}\nColumns: {cols}\nRows: {rows[:50]}"
            )
            all_records.extend(records)
            all_cols = cols
            logger.info("[Execute SQL] Query %d returned %d rows", idx, len(rows))
    finally:
        cur.close()

    return "\n\n".join(result_parts), all_records, all_cols


def run_agent(
    question: str,
    schema: str,
    conn,
    conversation_context: str = "",
) -> dict[str, Any]:
    """
    Main entry-point.

    Parameters
    ----------
    question             : user's natural-language question
    schema               : database schema (DDL + sample rows)
    conn                 : active psycopg2 (or compatible) connection
    conversation_context : recent chat history for follow-up resolution

    Returns
    -------
    dict with keys: answer, sql (optional), chart (optional),
                    is_db_question, error (optional)
    """
    logger.info("[Agent] Starting pipeline — question='%s'", question)

    state: AgentState = {
        "question": question,
        "schema": schema,
        "conversation_context": conversation_context,
        "is_db_question": False,
        "wants_visualization": _wants_visualization(question),
        "sql": "",
        "query_result": "",
        "answer": "",
        "error": "",
        "chart": None,
    }

    # ── Classify ──────────────────────────────────────────────────────────────
    state = classify_question(state)

    if not state["is_db_question"]:
        logger.info("[Agent] Not a DB question — returning early")
        return {
            "answer": (
                "This question doesn't appear to be related to the connected database. "
                "Please ask a question about your data."
            ),
            "is_db_question": False,
        }

    # ── Generate SQL ──────────────────────────────────────────────────────────
    state = generate_sql(state)

    # ── Execute SQL ───────────────────────────────────────────────────────────
    try:
        result_str, all_records, all_cols = _execute_queries(state["sql"], conn)
        state["query_result"] = result_str
    except Exception as exc:
        conn.rollback()
        logger.error("[Execute SQL] Failed: %s", exc)
        return {
            "answer": f"SQL execution error: {exc}",
            "sql": state["sql"],
            "is_db_question": True,
            "error": True,
        }

    # ── Visualization path ────────────────────────────────────────────────────
    if state["wants_visualization"]:
        if not all_records:
            return {
                "answer": "The query returned no rows — nothing to visualize.",
                "is_db_question": True,
            }
        state = generate_chart(state, all_records, all_cols)
        logger.info("[Agent] Visualization pipeline complete")
        return {
            "answer": state["answer"],
            "chart": state["chart"],
            "is_db_question": True,
        }

    # ── Text answer path ──────────────────────────────────────────────────────
    state = format_answer(state)
    logger.info("[Agent] Pipeline complete")
    return {
        "answer": state["answer"],
        "sql": state["sql"],
        "is_db_question": True,
    }