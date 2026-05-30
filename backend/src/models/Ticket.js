import mongoose from 'mongoose';

const { Schema } = mongoose;

const ticketSchema = new Schema({
    // 1. Core User Input
    ticketId: { 
        type: Number, 
        required: true, 
        unique: true 
    },
    description: { 
        type: String, 
        required: true 
    },
    
    createdBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        required: true
    },

    // 2. System State
    status: { 
        type: String, 
        enum: ['open', 'pending_approval', 'resolved'], 
        default: 'open' 
    },

    // 3. AI Generated Routing Data
    category: { type: String },
    priority: { type: String },
    summary: { type: String },
    assignedTeam: { type: String },
    requiresHardwareDispatch: { type: Boolean, default: false },

    // 4. Human-in-the-Loop Tracking
    threadId: { type: String }, 
    humanModified: { type: Boolean, default: false }

}, { 
    timestamps: true 
});

const Ticket = mongoose.model('Ticket', ticketSchema);
export default Ticket;