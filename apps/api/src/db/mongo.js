import mongoose from 'mongoose';
import { safeError } from '../lib/logger.js';

let connectionEventsRegistered = false;
let disconnecting = false;
let connectionPromise = null;
let connectionTarget = null;

function registerConnectionEvents(logger) {
  if (connectionEventsRegistered) return;
  connectionEventsRegistered = true;

  mongoose.connection.on('disconnected', () => {
    if (!disconnecting) {
      logger.warn('MongoDB connection lost; Mongoose will attempt to reconnect.');
    }
  });
  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB connection re-established.');
  });
  mongoose.connection.on('error', (error) => {
    logger.error({ error: safeError(error) }, 'MongoDB connection error.');
  });
}

export async function connectMongo(uri, { isProduction, logger, databaseName }) {
  if (!uri) {
    if (isProduction) throw new Error('MONGODB_URI is required in production.');
    logger.warn('MONGODB_URI is not set; the API will run without a database connection in development.');
    return false;
  }
  if (!databaseName) throw new Error('MONGODB_DATABASE is required when connecting to MongoDB.');

  registerConnectionEvents(logger);
  mongoose.set('strictQuery', true);
  mongoose.set('autoIndex', false);

  if (connectionPromise) {
    if (connectionTarget.uri !== uri || connectionTarget.databaseName !== databaseName) {
      return Promise.reject(new Error('MongoDB is already connecting to a different configured database.'));
    }
    return connectionPromise;
  }

  connectionTarget = { uri, databaseName };
  connectionPromise = Promise.resolve().then(() => mongoose.connect(uri, {
    dbName: databaseName,
    maxPoolSize: 10,
    minPoolSize: 0,
    maxIdleTimeMS: 30_000,
    serverSelectionTimeoutMS: 30_000
  })).then(() => {
    logger.info('MongoDB connection established.');
    return true;
  }).catch(async (error) => {
    logger.error({ error: safeError(error) }, 'MongoDB connection failed.');
    try {
      if (mongoose.connection.readyState !== 0) {
        disconnecting = true;
        try {
          await mongoose.disconnect();
        } catch (cleanupError) {
          logger.error({ error: safeError(cleanupError) }, 'MongoDB connection cleanup failed.');
        } finally {
          disconnecting = false;
        }
      }
    } finally {
      connectionPromise = null;
      connectionTarget = null;
    }
    throw new Error('MongoDB connection failed. Verify MONGODB_URI, MONGODB_DATABASE, network access, and database user permissions.');
  });
  return connectionPromise;
}

export function getDatabaseState() {
  return mongoose.connection.readyState;
}

export async function disconnectMongo() {
  disconnecting = true;
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  } finally {
    connectionPromise = null;
    connectionTarget = null;
    disconnecting = false;
  }
}
