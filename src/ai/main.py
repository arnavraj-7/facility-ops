from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import uuid

# Import our compiled dynamic LangGraph engine
from src.ai.workflow import ai_dispatch_engine

# Initialize the FastAPI application
app = FastAPI(title="Salesforce AI Dispatch Gateway", version="1.0")

# Allow your teammate's Express server to connect seamlessly
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 📥 DATA CONTRACTS (Pydantic Models)
# ==========================================
class TicketRequest(BaseModel):
    ticketId: int
    description: str

class ManagerDecision(BaseModel):
    is_approved: bool
    corrected_team: str | None = None # Allows the manager to override the AI's choice

# ==========================================
# 🛑 ENDPOINT 1: ANALYZE AND ROUTE (Dynamic Pause)
# ==========================================
@app.post("/api/ai/dispatch")
async def analyze_and_dispatch_ticket(request: TicketRequest):
    # 1. Generate a unique memory ID for this specific ticket flow
    thread_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    
    initial_state = {
        "ticketId": request.ticketId,
        "description": request.description
    }
    
    print(f"\n[API Gateway] Processing Ticket #{request.ticketId} on Thread {thread_id}...")
    
    # 2. Fire the LangGraph Engine
    ai_dispatch_engine.invoke(initial_state, config=config)
    
    # 3. Check the memory to see if the graph paused or finished
    current_state = ai_dispatch_engine.get_state(config)
    state_values = current_state.values
    
    # IF TRUE: The router sent it to the human_review node and paused it
    if current_state.next:
        return {
            "status": "pending_human_approval",
            "thread_id": thread_id,
            "message": "Critical ticket detected. Manager approval required.",
            "proposed_routing": {
                "category": state_values.get("category"),
                "assigned_team": state_values.get("assigned_team"),
                "priority": state_values.get("priority"),
                "requires_hardware_dispatch": state_values.get("requires_hardware_dispatch")
            }
        }
    
    # IF FALSE: The router bypassed human review and auto-committed it
    else:
        return {
            "status": "auto_committed",
            "thread_id": thread_id,
            "message": "Low/Medium/High ticket auto-routed successfully.",
            "final_routing": {
                "category": state_values.get("category"),
                "assigned_team": state_values.get("assigned_team"),
                "priority": state_values.get("priority"),
                "requires_hardware_dispatch": state_values.get("requires_hardware_dispatch")
            }
        }

# ==========================================
# ✅ ENDPOINT 2: HUMAN APPROVAL & OVERRIDE
# ==========================================
@app.post("/api/ai/resume/{thread_id}")
async def resume_ticket_dispatch(thread_id: str, decision: ManagerDecision):
    config = {"configurable": {"thread_id": thread_id}}
    
    # 1. Validate that this paused ticket actually exists in our memory
    current_state = ai_dispatch_engine.get_state(config)
    if not current_state.values:
        raise HTTPException(status_code=404, detail="Ticket thread not found or already completed.")
    
    # 2. OVERRIDE LOGIC: If manager provided a new team, safely update the frozen memory
    if decision.corrected_team:
        print(f"\n[SYSTEM] Manager overriding AI. Reassigning to: {decision.corrected_team}")
        ai_dispatch_engine.update_state(config, {
            "assigned_team": decision.corrected_team,
            "human_override": True
        })
    else:
        # Otherwise, log that the human agreed with the AI
        ai_dispatch_engine.update_state(config, {"human_override": False})

    print(f"[API Gateway] Resuming execution for Thread {thread_id}...")
    
    # 3. Wake the graph up and let it slide into the final commit node
    final_state = ai_dispatch_engine.invoke(None, config=config)
    
    return {
        "status": "committed",
        "thread_id": thread_id,
        "final_team": final_state.get("assigned_team"),
        "was_human_modified": final_state.get("human_override"),
        "message": "Ticket successfully dispatched to Express backend."
    }

# Basic health check
@app.get("/")
def health_check():
    return {"status": "AI Dispatch Microservice is Online"}