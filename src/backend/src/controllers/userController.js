import AppError from '../utils/AppError.js';
import User from '../models/User.js'; // <-- Import the Mongoose model

export const getUsers = async (req, res) => {
  // .lean() strips the heavy Mongoose features for fast read-only responses
  const users = await User.find({ deletedAt: null }).lean();
  
  res.status(200).json({ 
    users, 
    count: users.length 
  });
};

export const getUserById = async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id).lean();

  if (!user) {
    throw AppError.notFound(`No user found with the ID: ${id}`);
  }

  res.status(200).json({ user });
};

