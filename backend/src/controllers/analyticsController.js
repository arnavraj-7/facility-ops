import * as analyticsService from '../services/analyticsService.js';

export const getDashboard = async (req, res) => {
  const stats = await analyticsService.getDashboardStats({ user: req.user });
  res.json(stats);
};
