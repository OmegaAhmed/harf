import { safeError } from './lib/logger.js';

export function createServerlessHandler({ initializeApplication, logger }) {
  let applicationPromise = null;

  return async function handleRequest(request, response, next) {
    try {
      if (!applicationPromise) {
        applicationPromise = Promise.resolve()
          .then(initializeApplication)
          .catch((error) => {
            applicationPromise = null;
            throw error;
          });
      }

      const runtime = await applicationPromise;
      if (typeof runtime?.app !== 'function') {
        throw new Error('Application bootstrap did not return an Express app.');
      }
      return runtime.app(request, response, next);
    } catch (error) {
      logger.error({ error: safeError(error) }, 'Serverless application initialization failed.');
      if (response.headersSent) {
        next(error);
        return;
      }
      response.status(503).json({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'The service is temporarily unavailable.'
        }
      });
    }
  };
}
