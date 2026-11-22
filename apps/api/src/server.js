import { config } from './config/env.js';
import { disconnectMongo } from './db/mongo.js';
import { createLogger, safeError } from './lib/logger.js';
import { createApplication } from './bootstrap.js';

const logger = createLogger({ level: config.logLevel, isProduction: config.isProduction });

async function start() {
  const runtime = await createApplication({ config, logger });
  const { app } = runtime;
  const server = app.listen(config.port, config.host, () => {
    logger.info({ host: config.host, port: config.port }, 'Harf API listening.');
  });
  if (runtime.databaseConnected) runtime.appointmentService.startExpiryWorker();

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down Harf API.');
    runtime.appointmentService.stopExpiryWorker();
    server.close(async (error) => {
      if (error) {
        logger.error({ error: safeError(error) }, 'HTTP server failed to close cleanly.');
        process.exitCode = 1;
      }
      try {
        await disconnectMongo();
      } catch (disconnectError) {
        logger.error({ error: safeError(disconnectError) }, 'MongoDB failed to disconnect cleanly.');
        process.exitCode = 1;
      }
    });
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

void start().catch((error) => {
  logger.fatal({ error: safeError(error) }, 'Harf API failed to start.');
  void disconnectMongo().then(() => {
    process.exitCode = 1;
  }).catch((disconnectError) => {
    logger.error({ error: safeError(disconnectError) }, 'MongoDB failed to disconnect after startup failure.');
    process.exitCode = 1;
  });
});
