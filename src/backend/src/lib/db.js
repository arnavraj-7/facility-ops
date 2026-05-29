import mongoose from "mongoose";
import { env } from "../config/env.js";
import logger from "./logger.js";

export const connectDB = async () => {
    try {
        const conn = await mongoose.connect(env.MONGO_URI, {
            serverSelectionTimeoutMS: 10000, 
            maxPoolSize: 10,
        });

        logger.info(`MongoDB connected: ${conn.connection.host}`);

        mongoose.connection.on('disconnected', () => {
            logger.warn('MongoDB disconnected! Attempting to reconnect...');
        });

        mongoose.connection.on('reconnected', () => {
            logger.info('MongoDB reconnected successfully.');
        });

        mongoose.connection.on('error', (err) => {
            logger.error(`MongoDB connection error after initial connect: ${err.message}`);
        });

        return conn;
    } catch (error) {
        logger.error(`MongoDB initial connection failed: ${error.message}`);
        
        throw error; 
    }
};