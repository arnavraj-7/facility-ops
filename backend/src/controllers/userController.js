import mongoose from 'mongoose';
import AppError from '../utils/AppError.js';
import User from '../models/User.js';
import * as authService from '../services/authService.js';

const PUBLIC_FIELDS = 'name email role team status createdAt lastLoginAt';

/** Admin adds an engineer/manager/user to their tenant. */
export const createMember = async (req, res) => {
  const user = await authService.createMember({ admin: req.user, ...req.validated.body });
  res.status(201).json({ user });
};

/** List all users in the caller's tenant (manager/admin). */
export const getUsers = async (req, res) => {
  const filter = { tenantId: req.user.tenantId, deletedAt: null };
  if (req.query.role) filter.role = req.query.role;

  const docs = await User.find(filter).select(PUBLIC_FIELDS).sort({ createdAt: -1 });
  const users = docs.map((u) => u.toJSON());
  res.status(200).json({ users, count: users.length });
};

/** Lightweight list of engineers in the tenant — used to populate assign menus. */
export const getEngineers = async (req, res) => {
  const docs = await User.find({
    tenantId: req.user.tenantId,
    role: 'engineer',
    deletedAt: null,
  })
    .select('name email team')
    .sort({ name: 1 });
  res.status(200).json({ engineers: docs.map((u) => u.toJSON()) });
};

export const getUserById = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw AppError.badRequest('Invalid user id');

  const user = await User.findOne({ _id: id, tenantId: req.user.tenantId }).select(PUBLIC_FIELDS);
  if (!user) throw AppError.notFound(`No user found with the ID: ${id}`);

  res.status(200).json({ user: user.toJSON() });
};
