import os
import logging
import re
import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any, TypedDict, Annotated
from langgraph.graph import StateGraph, END
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

logger = logging.getLogger(__name__)


def get_llm():
    return ChatOpenAI(model="gpt-4o", temperature=0, api_key=os.getenv("OPENAI_API_KEY"))


class AgentState(TypedDict):
    question: str
    schema: str
    is_db_question: bool
    sql: str
    query_result: str
    answer: str
    error: str
    wants_visualization: bool
    chart: dict[str, Any] | None


QUERY_INTENT_TERMS = {
    "average", "avg", "total", "sum", "count", "number", "many", "minimum", "maximum",
    "min", "max", "top", "bottom", "highest", "lowest", "most", "least", "show",
    "list", "find", "filter", "compare", "group", "grouped", "by", "where", "spent",
    "amount", "revenue", "sales", "orders", "customers", "users", "transactions"
}

VISUALIZATION_TERMS = {
    "visualize", "visualise", "visualization", "visualisation", "chart", "graph",
    "plot", "draw", "show", "display", "bar", "line", "pie", "scatter"
}

SCHEMA_STOPWORDS = {
    "table", "columns", "sample", "data", "rows", "row", "integer", "bigint",
    "numeric", "decimal", "double", "precision", "character", "varying",
    "varchar", "text", "date", "timestamp", "without", "with", "time", "zone",
    "boolean", "true", "false", "none", "null", "public"
}


def _tokens(text: str) -> set[str]:
    compacted = re.sub(r"([a-z])([A-Z])", r"\1 \2", text)
    return {token.lower() for token in re.findall(r"[a-zA-Z][a-zA-Z0-9]*", compacted)}


def _schema_terms(schema: str) -> set[str]:
    terms = _tokens(schema.replace("_", " "))
    return {term for term in terms if len(term) >= 3 and term not in SCHEMA_STOPWORDS}


def _looks_db_related(question: str, schema: str) -> bool:
    question_terms = _tokens(question.replace("_", " "))
    schema_matches = question_terms & _schema_terms(schema)
    intent_matches = question_terms & QUERY_INTENT_TERMS

    if len(schema_matches) >= 2:
        return True
    if schema_matches and intent_matches:
        return True
    if len(intent_matches) >= 2 and any(term in _schema_terms(schema) for term in {"amount", "spent", "state", "date", "gender", "age"}):
        return True
    return False


def wants_visualization(question: str) -> bool:
    question_terms = _tokens(question)
    return bool(question_terms & VISUALIZATION_TERMS)


def _json_safe(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _rows_to_records(cols, rows):
    return [
        {col: _json_safe(value) for col, value in zip(cols, row)}
        for row in rows
    ]


def _extract_json_object(content: str) -> dict[str, Any]:
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned, flags=re.IGNORECASE).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("LLM did not return a JSON object")
    return json.loads(cleaned[start:end + 1])


def classify_question(state: AgentState) -> AgentState:
    logger.info(f"[Classify] Determining if question is DB-related: '{state['question']}'")
    if _looks_db_related(state["question"], state["schema"]):
        state["is_db_question"] = True
        logger.info("[Classify] Heuristic matched schema/query intent; treating as DB question")
        return state

    response = get_llm().invoke([
        SystemMessage(content=f"""You are a forgiving database-question classifier. Given a database schema, sample rows, and a user question, determine if the question is asking for information that could plausibly be answered from the connected database.

Rules:
- Reply YES if the question asks for counts, totals, averages, filters, rankings, comparisons, grouped results, or row lookups using any table or column in the schema.
- Reply YES even if a filter value is not visible in the sample rows. Samples are incomplete.
- Reply YES when the user's words are close synonyms of column names, for example "spent" for an amount/spend column, or a state name for a state/location column.
- Tolerate typos and missing spaces in the question.
- Reply NO only for questions that are clearly unrelated to the connected data.

Schema:
{state['schema']}

Reply ONLY with "YES" or "NO"."""),
        HumanMessage(content=state["question"])
    ])
    state["is_db_question"] = response.content.strip().upper() == "YES"
    logger.info(f"[Classify] Result: is_db_question={state['is_db_question']}")
    return state


def generate_sql(state: AgentState) -> AgentState:
    logger.info(f"[Generate SQL] Converting question to SQL...")
    response = get_llm().invoke([
        SystemMessage(content=f"""You are a PostgreSQL expert. Convert the user question to a valid PostgreSQL query.

Rules:
- Use only tables and columns from the schema.
- Quote identifiers with double quotes.
- Infer likely column matches from natural language. For example, "spent" can map to an amount/spend column, and a state name can map to a state/location column.
- Filter text values case-insensitively with ILIKE when the exact capitalization is uncertain.
- Return a single SELECT query only.

Schema:
{state['schema']}

Return ONLY the SQL query, no explanation, no markdown."""),
        HumanMessage(content=state["question"])
    ])
    state["sql"] = response.content.strip().strip("`").replace("sql\n", "").strip()
    logger.info(f"[Generate SQL] Generated: {state['sql']}")
    return state


def execute_sql(state: AgentState) -> AgentState:
    # This is handled externally; placeholder
    return state


def format_answer(state: AgentState) -> AgentState:
    logger.info(f"[Format] Converting query results to natural language...")
    response = get_llm().invoke([
        SystemMessage(content="Convert the following SQL query result into a clear, natural English answer. Be concise and helpful."),
        HumanMessage(content=f"Question: {state['question']}\nSQL: {state['sql']}\nResult: {state['query_result']}")
    ])
    state["answer"] = response.content.strip()
    logger.info(f"[Format] Answer generated successfully")
    return state


def generate_chart(state: AgentState, records: list[dict[str, Any]], columns: list[str]) -> AgentState:
    logger.info("[Visualize] Choosing chart type and building chart spec...")
    response = get_llm().invoke([
        SystemMessage(content=f"""You are a data visualization assistant for a business chatbot.
Choose the best chart for the user's question and SQL result.

Allowed chart types:
- bar: comparing categories or rankings
- line: trends over dates/time or ordered sequences
- scatter: numeric relationships
- pie: parts of a whole with a small number of categories

Return ONLY valid JSON with this exact shape:
{{
  "type": "bar | line | scatter | pie",
  "title": "short chart title",
  "xLabel": "clear x-axis label",
  "yLabel": "clear y-axis label",
  "x": ["category/date values"],
  "y": [number values],
  "seriesName": "legend label",
  "insight": "two concise sentences: first state the key finding with numbers, then explain the business implication"
}}

Rules:
- Use the provided SQL result only.
- Prefer bar charts for department/project/employee comparisons.
- Prefer line charts for date/time trends.
- Keep labels human readable.
- If there are too many rows, use the most relevant top 12.
- y must be numeric.
- Write the insight as exactly two concise sentences.
- The first sentence should describe the strongest finding using actual values from the chart.
- The second sentence should explain what that means for a business user.
- Do not include SQL or markdown.

Schema:
{state['schema']}"""),
        HumanMessage(content=json.dumps({
            "question": state["question"],
            "columns": columns,
            "rows": records[:50],
        }, ensure_ascii=False))
    ])
    chart = _extract_json_object(response.content)
    chart.setdefault("seriesName", "Value")
    chart.setdefault("insight", "")
    state["chart"] = chart
    state["answer"] = chart.get("insight") or "Here is the visualization for your data."
    logger.info(f"[Visualize] Chart generated: {chart.get('type')}")
    return state


def route_question(state: AgentState):
    return "generate_sql" if state["is_db_question"] else END


# Build graph
workflow = StateGraph(AgentState)
workflow.add_node("classify", classify_question)
workflow.add_node("generate_sql", generate_sql)
workflow.add_node("format_answer", format_answer)

workflow.set_entry_point("classify")
workflow.add_conditional_edges("classify", route_question, {"generate_sql": "generate_sql", END: END})
workflow.add_edge("generate_sql", "format_answer")
workflow.add_edge("format_answer", END)

graph = workflow.compile()


def run_agent(question: str, schema: str, conn):
    logger.info(f"[Agent] Starting pipeline for: '{question}'")
    initial_state: AgentState = {
        "question": question,
        "schema": schema,
        "is_db_question": False,
        "sql": "",
        "query_result": "",
        "answer": "",
        "error": "",
        "wants_visualization": wants_visualization(question),
        "chart": None
    }

    state = initial_state.copy()
    
    # Classify
    state = classify_question(state)
    
    if not state["is_db_question"]:
        logger.info("[Agent] Not a DB question, returning early")
        return {"answer": "This question doesn't appear to be related to the connected database. Please ask a question about your data.", "is_db_question": False}

    # Generate SQL
    state = generate_sql(state)

    # Execute SQL against actual connection
    try:
        logger.info(f"[Execute SQL] Running query against database...")
        cur = conn.cursor()
        cur.execute(state["sql"])
        cols = [desc[0] for desc in cur.description]
        rows = cur.fetchall()
        cur.close()
        records = _rows_to_records(cols, rows)
        result_str = f"Columns: {cols}\nRows: {rows[:50]}"
        state["query_result"] = result_str
        logger.info(f"[Execute SQL] Success. Returned {len(rows)} rows")
    except Exception as e:
        conn.rollback()
        logger.error(f"[Execute SQL] Failed: {str(e)}")
        return {"answer": f"SQL execution error: {str(e)}", "sql": state["sql"], "is_db_question": True, "error": True}

    if state["wants_visualization"]:
        if not rows:
            return {"answer": "I could not build a chart because the query returned no rows.", "is_db_question": True}
        state = generate_chart(state, records, cols)
        logger.info("[Agent] Visualization pipeline complete")
        return {"answer": state["answer"], "chart": state["chart"], "is_db_question": True}

    state = format_answer(state)

    logger.info("[Agent] Pipeline complete")
    return {"answer": state["answer"], "sql": state["sql"], "is_db_question": True}
