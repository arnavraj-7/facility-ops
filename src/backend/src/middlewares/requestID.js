// src/middleware/requestId.js
import { randomUUID } from 'node:crypto';

export const requestId = (req, res, next) => {
  // If a proxy (like Nginx or a frontend) already generated an ID, trust it.
  // Otherwise, generate a fresh one.
  const incoming = req.get('X-Request-Id');
  req.id = incoming || randomUUID();
  
  // Attach it to the response so the client gets it too
  res.set('X-Request-Id', req.id);
  
  next();
};