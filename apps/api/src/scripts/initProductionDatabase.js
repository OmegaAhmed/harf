import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { initializeDatabaseIndexes } from '../db/databaseIndexes.js';
import { assertProductionInitializationTarget } from '../db/productionInitialization.js';
import { connectMongo, disconnectMongo } from '../db/mongo.js';
import { seedSystemRoles } from '../db/roleRepository.js';
import { createLogger, safeError } from '../lib/logger.js';

function readConfirmedDatabase(args) {
  const prefix = '--confirm-database=';
  if (args.length !== 1 || !args[0].startsWith(prefix)) {
    throw new Error('Usage: npm run db:init:production -- --confirm-database=<MONGODB_DATABASE>');
  }
  return args[0].slice(prefix.length).trim();
}

async function findCollectionsWithData() {
  const collections = await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray();
  const populatedCollections = [];
  for (const { name } of collections) {
    if (name.startsWith('system.')) continue;
    const document = await mongoose.connection.db.collection(name).findOne({}, { projection: { _id: 1 } });
    if (document) populatedCollections.push(name);
  }
  return populatedCollections;
}

async function main() {
  if (!config.mongodbUri) throw new Error('MONGODB_URI is required for production database initialization.');
  const confirmedDatabaseName = readConfirmedDatabase(process.argv.slice(2));
  assertProductionInitializationTarget({
    databaseName: config.mongodbDatabase,
    confirmedDatabaseName
  });

  const logger = createLogger({ level: config.logLevel, isProduction: config.isProduction });
  let connected = false;
  try {
    await connectMongo(config.mongodbUri, {
      isProduction: config.isProduction,
      logger,
      databaseName: config.mongodbDatabase
    });
    connected = true;

    const collectionsWithData = await findCollectionsWithData();
    assertProductionInitializationTarget({
      databaseName: config.mongodbDatabase,
      confirmedDatabaseName,
      collectionsWithData
    });

    await initializeDatabaseIndexes();
    await seedSystemRoles();
    logger.info(
      { databaseName: config.mongodbDatabase },
      'Production database indexes and system roles initialized without sample data.'
    );
  } finally {
    if (connected) await disconnectMongo();
  }
}

main().catch((error) => {
  process.stderr.write(`${safeError(error).message}\n`);
  process.exitCode = 1;
});
