from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from workflow import ai_graph_engine, TicketState

# 1. Initialize the FastAPI Application
app = FastAPI(
    title="Apex-AI Operations Microservice",
    description="LangGraph state machine gateway for infrastructure triage.",
    version="1.0.0"
)

# 2. Define the exact JSON structure we expect from the Express.js teammate
class IncidentRequest(BaseModel):
    ticketId: int
    description: str

# 3. Create the API Endpoint
@app.post("/api/ai/triage")
async def process_incident(request: IncidentRequest):
    print(f"\n[NETWORK ENTRY] Received HTTP Request for Ticket: {request.ticketId}")
    
    try:
        # Convert the incoming web request into our LangGraph State object
        input_state = TicketState(
            ticketId=request.ticketId,
            description=request.description
        )
        
        # Trigger the LangGraph Engine
        final_output = ai_graph_engine.invoke(input_state)
        
        # Return the structured payload back across the network
        return {
            "success": True,
            "message": "Incident successfully processed via LangGraph.",
            "payload": {
                "category": final_output['category'],
                "priority": final_output['priority'],
                "summary": final_output['aiSummary'],
                "isAutoFixable": final_output['isAutoFixable'],
                "suggestedFix": final_output['suggestedFix']
            }
        }
        
    except Exception as e:
        print(f"[CRITICAL ERROR] {str(e)}")
        raise HTTPException(status_code=500, detail="Internal AI Engine Failure")