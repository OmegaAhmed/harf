import { config } from '../config/env.js';
import { connectMongo, disconnectMongo } from '../db/mongo.js';
import {
  assertExperimentalInitializationTarget,
  initializeExperimentalDatabase
} from '../db/experimentalInitialization.js';
import { createLogger, safeError } from '../lib/logger.js';

function readInitializationMode(args) {
  if (args.length !== 1 || !args[0].startsWith('--mode=')) {
    throw new Error('Usage: npm run db:init:experimental -- --mode=experimental');
  }
  return args[0].slice('--mode='.length);
}

async function main() {
  const mode = readInitializationMode(process.argv.slice(2));
  if (!config.mongodbUri) throw new Error('MONGODB_URI is required for experimental database initialization.');
  const logger = createLogger({ level: config.logLevel, isProduction: config.isProduction });
  const initializationOptions = {
    mode,
    nodeEnv: config.nodeEnv,
    databaseName: config.mongodbDatabase
  };
  assertExperimentalInitializationTarget(initializationOptions);

  await connectMongo(config.mongodbUri, {
    isProduction: config.isProduction,
    logger,
    databaseName: config.mongodbDatabase
  });
  try {
    await initializeExperimentalDatabase(initializationOptions);
    logger.info({ databaseName: config.mongodbDatabase }, 'Experimental database initialization completed.');
  } finally {
    await disconnectMongo();
  }
}

main().catch((error) => {
  process.stderr.write(`${safeError(error).message}\n`);
  process.exitCode = 1;
});
