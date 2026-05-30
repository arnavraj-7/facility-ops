import axios from 'axios';
import Ticket from '../models/Ticket.js';

// Define the URL for your Python AI Microservice
const AI_MICROSERVICE_URL = process.env.AI_MICROSERVICE_URL || 'http://127.0.0.1:8000/api/ai';

// ==========================================
// 🚀 1. CREATE TICKET & TRIGGER AI
// ==========================================
export const createAndRouteTicket = async (req, res, next) => {
    try {
        const { ticketId, description } = req.body;
        
        // Extract the logged-in user's ID from the security middleware
        const createdBy = req.user._id; 

      
        const aiResponse = await axios.post(`${AI_MICROSERVICE_URL}/dispatch`, {
            ticketId,
            description
        });

        const aiData = aiResponse.data;

        
        if (aiData.status === 'auto_committed') {
            const newTicket = await Ticket.create({
                ticketId,
                description,
                createdBy,
                status: 'open',
                category: aiData.final_routing.category,
                priority: aiData.final_routing.priority,
                summary: aiData.final_routing.summary,
                assignedTeam: aiData.final_routing.assigned_team,
                requiresHardwareDispatch: aiData.final_routing.requires_hardware_dispatch
            });

            return res.status(201).json({ 
                success: true, 
                message: "Ticket instantly routed by AI.", 
                data: newTicket 
            });
        } 
        
      
        if (aiData.status === 'pending_human_approval') {
            const pendingTicket = await Ticket.create({
                ticketId,
                description,
                createdBy,
                status: 'pending_approval',
                category: aiData.proposed_routing.category,
                priority: aiData.proposed_routing.priority,
                summary: aiData.proposed_routing.summary,
                assignedTeam: aiData.proposed_routing.assigned_team,
                requiresHardwareDispatch: aiData.proposed_routing.requires_hardware_dispatch,
                threadId: aiData.thread_id 
            });

            return res.status(202).json({ 
                success: true, 
                message: "Ticket requires manager approval.", 
                data: pendingTicket 
            });
        }

    } catch (error) {
        console.error("[AI Dispatch Error]:", error.message);
        return res.status(502).json({ 
            success: false, 
            error: "Failed to communicate with AI routing engine." 
        });
    }
};

// ==========================================
// ✅ 2. MANAGER OVERRIDE & RESUME
// ==========================================
export const managerOverride = async (req, res, next) => {
    try {
        const { threadId } = req.params;
        const { isApproved, correctedTeam } = req.body;

        // 1. Wake up the Python AI and send the manager's decision
        const aiResponse = await axios.post(`${AI_MICROSERVICE_URL}/resume/${threadId}`, {
            is_approved: isApproved,
            corrected_team: correctedTeam || null
        });

        const finalDecision = aiResponse.data;

        // 2. Update the MongoDB Ticket
        const updatedTicket = await Ticket.findOneAndUpdate(
            { threadId: threadId },
            { 
                status: 'open', 
                assignedTeam: finalDecision.final_team,
                humanModified: finalDecision.was_human_modified
            },
            { new: true } 
        ).populate('createdBy', 'name email'); 

        
        if (!updatedTicket) {
            return res.status(404).json({ 
                success: false, 
                error: "Ticket with that thread ID not found." 
            });
        }

        return res.status(200).json({ 
            success: true, 
            message: "Ticket officially routed.", 
            data: updatedTicket 
        });

    } catch (error) {
        console.error("[AI Resume Error]:", error.message);
        return res.status(502).json({ 
            success: false, 
            error: "Failed to resume AI routing thread." 
        });
    }
};