import { config } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { createApplication } from './bootstrap.js';
import { createServerlessHandler } from './serverlessHandler.js';

const logger = createLogger({ level: config.logLevel, isProduction: config.isProduction });

export default createServerlessHandler({
  initializeApplication: () => createApplication({
    config,
    logger,
    initializeStorage: false
  }),
  logger
});
