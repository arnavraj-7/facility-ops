// src/lib/db.js
import mongoose from "mongoose";
import { env } from "../config/env.js";
import logger from "./logger.js";

const connectDB = async () => {
    try {
        
        const conn = await mongoose.connect(env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000,
            maxPoolSize: 10, // Maintain up to 10 socket connections
        });

        logger.info(`MongoDB connected: ${conn.connection.host}`);

        mongoose.connection.on('disconnected', () => {
            logger.warn(' MongoDB disconnected! Attempting to reconnect...');
        });

        mongoose.connection.on('reconnected', () => {
            logger.info(' MongoDB reconnected successfully.');
        });

        mongoose.connection.on('error', (err) => {
            logger.error(`MongoDB connection error after initial connect: ${err.message}`);
        });

        return conn;
    } catch (error) {
        logger.error(`MongoDB initial connection failed: ${error.message}`);
        process.exit(1); 
    }
};

export default connectDB;