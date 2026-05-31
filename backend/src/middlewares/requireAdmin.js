export const requireAdmin = (req, res, next) => {
    
    if (!req.user) {
        return res.status(401).json({ 
            success: false, 
            error: "Authentication required." 
        });
    }

  
    if (req.user.role !== 'admin') {
        return res.status(403).json({ 
            success: false, 
            error: "Access denied. Admin privileges required to override AI routing." 
        });
    }

    next();
};