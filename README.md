# Honda Data Assistant

A ChatGPT-style interface for querying PostgreSQL databases using natural language. Built for Honda with their brand color scheme (Red #CC0000, dark theme).

---

## What This App Does

1. You connect to any local PostgreSQL database by providing a connection string.
2. You ask questions in plain English (e.g., "How many orders were placed last month?").
3. An AI agent determines if the question is database-related, converts it to SQL, executes it, and returns the answer in plain English.

---

## Architecture & Agentic Flow

```
User Question
    ↓
[1. Classify] — LLM checks if question relates to DB (using schema + sample rows)
    ├── NO → "Not a database question"
    └── YES ↓
[2. Generate SQL] — LLM converts question to valid PostgreSQL
    ↓
[3. Execute SQL] — Runs query against connected database
    ↓
[4. Format Answer] — LLM converts raw results to plain English
    ↓
Display to user (answer + SQL shown)
```

This flow is implemented using **LangGraph** (graph-based agent orchestration).

---

## Project Structure

```
hondaChat/
├── README.md
├── backend/
│   ├── .env              ← Your API keys and DB connection string
│   ├── .env.example      ← Template for .env
│   ├── main.py           ← FastAPI server (endpoints: /connect, /query, /status)
│   ├── agent.py          ← LangGraph agentic text-to-SQL flow
│   └── requirements.txt  ← Python dependencies
└── frontend/
    ├── package.json
    ├── public/index.html
    └── src/
        ├── index.js
        ├── index.css
        └── App.js        ← Honda-themed ChatGPT-style UI
```

---

## Prerequisites

- Python 3.9+
- Node.js 16+
- A running PostgreSQL database
- An OpenAI API key (GPT-4o access recommended)

---

## Setup & Running

### 1. Configure Environment Variables

Edit `backend/.env`:

```
OPENAI_API_KEY=sk-your-actual-openai-key
DATABASE_URL=postgresql://user:password@localhost:5432/your_database
```

### 2. Start the Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Backend runs at http://localhost:8000

### 3. Start the Frontend

```bash
cd frontend
npm install
npm start
```

Frontend runs at http://localhost:3000

---

## How to Use

1. Open http://localhost:3000 in your browser.
2. You'll see a connection form. Fill in:
   - **Host** (e.g., `localhost`)
   - **Port** (e.g., `5432`)
   - **Username** (e.g., `postgres`)
   - **Password** (your database password)
   - **Database** (your database name)
3. Click **Connect**. The app stitches these into a connection string and connects automatically.
4. Once connected, you're taken to the chat page. The sidebar shows all discovered tables.
5. Type a question in the chat input (e.g., "What are the top 5 customers by revenue?") and press Enter.
6. The assistant will respond with a plain English answer and show the SQL it generated.

---

## Tech Stack

| Layer     | Technology                     |
|-----------|--------------------------------|
| Frontend  | React, Axios, React Markdown   |
| Backend   | FastAPI (Python)               |
| AI/Agent  | OpenAI GPT-4o, LangGraph       |
| Database  | PostgreSQL (psycopg2)          |

---

## Notes

- The app extracts your database schema and sample rows to give the LLM context for accurate SQL generation.
- If a question is unrelated to the database, the assistant will tell you so instead of generating bad SQL.
- The generated SQL is displayed below each answer for transparency.
