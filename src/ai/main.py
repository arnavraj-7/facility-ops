from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

# Import our compiled LangGraph engine from the workflow file
from src.ai.workflow import ai_dispatch_engine

# Initialize the FastAPI application
app = FastAPI(title="Salesforce AI Dispatch Gateway", version="1.0")

# Allow Express server to talk to this API without security blocks
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 📥 1. DATA CONTRACT (What Express Sends)
# ==========================================
class TicketRequest(BaseModel):
    ticketId: int
    description: str

# ==========================================
# 🚀 2. THE API ENDPOINT
# ==========================================
@app.post("/api/ai/dispatch")
async def analyze_and_dispatch_ticket(request: TicketRequest):
    print(f"\n[API Gateway] Received Ticket #{request.ticketId} from Express.js")
    
    try:
        # 1. Package the incoming data into the dictionary LangGraph expects
        initial_state = {
            "ticketId": request.ticketId,
            "description": request.description
        }
        
        # 2. Fire the LangGraph Engine (This runs the workflow.py file!)
        print("[API Gateway] Handing off to LangGraph AI Engine...")
        final_state = ai_dispatch_engine.invoke(initial_state)
        
        # 3. Format the final JSON response to send back to Express
        response_payload = {
            "success": True,
            "message": "AI Dispatch routing complete.",
            "data": {
                "ticketId": final_state.get("ticketId"),
                "category": final_state.get("category"),
                "priority": final_state.get("priority"),
                "summary": final_state.get("summary"),
                "assigned_team": final_state.get("assigned_team"),
                "requires_hardware_dispatch": final_state.get("requires_hardware_dispatch")
            }
        }
        
        print(f"[API Gateway] Returning structured payload for Ticket #{request.ticketId}")
        return response_payload
        
    except Exception as e:
        print(f"[API Gateway ERROR] {str(e)}")
        # If anything crashes, return a clean 500 error instead of killing the server
        raise HTTPException(status_code=500, detail="Internal AI Engine Failure")

# Basic health check endpoint
@app.get("/")
def health_check():
    return {"status": "AI Dispatch Microservice is Online"}