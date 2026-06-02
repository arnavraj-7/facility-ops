import * as ticketService from '../services/ticketService.js';
import * as commentService from '../services/commentService.js';

export const createTicket = async (req, res) => {
  const ticket = await ticketService.createTicket({ user: req.user, ...req.validated.body });
  res.status(201).json({ ticket });
};

export const listTickets = async (req, res) => {
  const result = await ticketService.listTickets({ user: req.user, query: req.query });
  res.json(result);
};

export const getTicket = async (req, res) => {
  const ticket = await ticketService.getTicket({ user: req.user, id: req.params.id });
  res.json({ ticket });
};

export const assignEngineer = async (req, res) => {
  const ticket = await ticketService.assignEngineer({
    user: req.user,
    id: req.params.id,
    engineerId: req.validated.body.engineerId,
  });
  res.json({ ticket });
};

export const updateStatus = async (req, res) => {
  const ticket = await ticketService.updateStatus({
    user: req.user,
    id: req.params.id,
    status: req.validated.body.status,
    note: req.validated.body.note,
  });
  res.json({ ticket });
};

export const approveTicket = async (req, res) => {
  const ticket = await ticketService.approveTicket({
    user: req.user,
    id: req.params.id,
    isApproved: req.validated.body.isApproved,
    correctedTeam: req.validated.body.correctedTeam,
  });
  res.json({ ticket });
};

export const bulkUpdate = async (req, res) => {
  const result = await ticketService.bulkUpdate({ user: req.user, ...req.validated.body });
  res.json(result);
};

export const listComments = async (req, res) => {
  const comments = await commentService.listComments({ user: req.user, ticketId: req.params.id });
  res.json({ comments });
};

export const addComment = async (req, res) => {
  const comment = await commentService.addComment({
    user: req.user,
    ticketId: req.params.id,
    body: req.validated.body.body,
  });
  res.status(201).json({ comment });
};
