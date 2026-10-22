import os
from typing import Literal, Optional
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_openai import ChatOpenAI
from supabase import create_client, Client

load_dotenv()

app = FastAPI(title="Cold Call AI API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STAGES = [
    {"number": 1, "name": "Opening", "goal": "Get permission to continue and establish a professional tone."},
    {"number": 2, "name": "Reason for Calling", "goal": "Explain briefly why the call may be relevant to the prospect."},
    {"number": 3, "name": "Discovery", "goal": "Understand the prospect's current situation and needs."},
    {"number": 4, "name": "Problem Awareness", "goal": "Explore challenges, friction, or missed opportunities."},
    {"number": 5, "name": "Impact", "goal": "Understand why the challenge matters and what it affects."},
    {"number": 6, "name": "Value Proposition", "goal": "Connect a relevant benefit to what the prospect shared."},
    {"number": 7, "name": "Handle Concerns", "goal": "Acknowledge questions or objections and respond honestly."},
    {"number": 8, "name": "Next Steps / Close", "goal": "Agree on a clear next step or record the call outcome."},
]

class SuggestRequest(BaseModel):
    stage_number: int = Field(ge=1, le=8)
    prospect_words: str = Field(min_length=1, max_length=5000)
    company_context: str = Field(default="A company offering a product or service to business customers.", max_length=2000)
    previous_notes: str = Field(default="", max_length=3000)

class SuggestResponse(BaseModel):
    stage_number: int
    stage_name: str
    goal: str
    suggested_reply: str
    follow_up_question: str
    next_step: str

class CallCreate(BaseModel):
    prospect_name: str = "Unknown prospect"
    company_name: str = ""
    stage_reached: int = Field(ge=1, le=8)
    notes: str = ""
    prospect_words: str = ""
    outcome: Literal["Meeting booked", "Follow-up needed", "Not interested", "No answer", "Other"] = "Other"

def get_supabase() -> Optional[Client]:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if not url or not key:
        return None
    return create_client(url, key)

def get_llm():
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
    return ChatOpenAI(model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"), temperature=0.3, api_key=api_key)

@app.get("/")
def root():
    return {"message": "Cold Call AI API is running", "docs": "/docs"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/stages")
def get_stages():
    return STAGES

@app.post("/suggest", response_model=SuggestResponse)
def suggest(request: SuggestRequest):
    stage = STAGES[request.stage_number - 1]
    llm = get_llm()
    if llm is None:
        # Useful fallback so the app still runs before an LLM key is configured.
        return SuggestResponse(
            stage_number=stage["number"],
            stage_name=stage["name"],
            goal=stage["goal"],
            suggested_reply="Acknowledge what the prospect said, then connect your response to their needs without making unsupported claims.",
            follow_up_question="Could you tell me a little more about how you handle this today?",
            next_step="Use the prospect's answer to decide whether to continue this stage or move to the next one.",
        )

    prompt = ChatPromptTemplate.from_messages([
        ("system", """
You are a concise, ethical cold-call coach. Help a salesperson respond naturally.
Never invent product capabilities, prices, customer results, or promises.
Do not pressure or manipulate the prospect. Respect a clear request to end the call.
Return exactly three labeled sections:
Suggested reply: ...
Follow-up question: ...
Next step: ...
Keep the answer practical and brief.
"""),
        ("human", """
Company context: {company_context}
Current stage: {stage_name}
Stage goal: {goal}
Prospect's exact words: {prospect_words}
Earlier notes: {previous_notes}

Give a tailored response for this stage.
""")
    ])
    chain = prompt | llm | StrOutputParser()
    try:
        result = chain.invoke({
            "company_context": request.company_context,
            "stage_name": stage["name"],
            "goal": stage["goal"],
            "prospect_words": request.prospect_words,
            "previous_notes": request.previous_notes,
        })
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM request failed: {str(exc)}")

    sections = {"suggested_reply": "", "follow_up_question": "", "next_step": ""}
    current = None
    for line in result.splitlines():
        low = line.lower().strip()
        if low.startswith("suggested reply:"):
            current = "suggested_reply"
            sections[current] = line.split(":", 1)[1].strip()
        elif low.startswith("follow-up question:") or low.startswith("follow up question:"):
            current = "follow_up_question"
            sections[current] = line.split(":", 1)[1].strip()
        elif low.startswith("next step:"):
            current = "next_step"
            sections[current] = line.split(":", 1)[1].strip()
        elif current and line.strip():
            sections[current] += " " + line.strip()

    # Graceful fallback if the model returns a different format.
    if not sections["suggested_reply"]:
        sections["suggested_reply"] = result.strip()
    if not sections["follow_up_question"]:
        sections["follow_up_question"] = "What matters most to you when evaluating a solution like this?"
    if not sections["next_step"]:
        sections["next_step"] = "Use the prospect's answer to choose the next stage."

    return SuggestResponse(
        stage_number=stage["number"],
        stage_name=stage["name"],
        goal=stage["goal"],
        **sections,
    )

@app.post("/calls")
def save_call(call: CallCreate):
    db = get_supabase()
    payload = {"id": str(uuid4()), **call.model_dump()}
    if db is None:
        # Local demo mode: explain that persistence needs Supabase configuration.
        return {"saved": False, "mode": "demo", "call": payload,
                "message": "Configure Supabase environment variables to persist call history."}
    try:
        result = db.table("calls").insert(payload).execute()
        return {"saved": True, "call": result.data[0] if result.data else payload}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not save call: {str(exc)}")

@app.get("/calls")
def list_calls():
    db = get_supabase()
    if db is None:
        return {"saved": False, "mode": "demo", "calls": [],
                "message": "Configure Supabase environment variables to load saved history."}
    try:
        result = db.table("calls").select("*").order("created_at", desc=True).limit(100).execute()
        return {"saved": True, "calls": result.data}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not load calls: {str(exc)}")
