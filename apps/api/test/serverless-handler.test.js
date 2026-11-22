import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServerlessHandler } from '../src/serverlessHandler.js';

function createResponse() {
  return {
    headersSent: false,
    statusCode: 200,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      this.headersSent = true;
      return this;
    }
  };
}

const logger = {
  error() {}
};

test('serverless initialization is shared across concurrent and warm requests', async () => {
  let initializeCalls = 0;
  let workerStarts = 0;
  const handler = createServerlessHandler({
    initializeApplication: async () => {
      initializeCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return {
        app(_request, response) {
          response.status(200).json({ ok: true });
        },
        startBackgroundWorkers() {
          workerStarts += 1;
        }
      };
    },
    logger
  });
  const requests = Array.from({ length: 3 }, () => ({
    request: {},
    response: createResponse()
  }));

  await Promise.all(requests.map(({ request, response }) => handler(request, response, () => {})));
  await handler({}, createResponse(), () => {});

  assert.equal(initializeCalls, 1);
  assert.equal(workerStarts, 0);
  assert.equal(requests[0].response.statusCode, 200);
  assert.deepEqual(requests[0].response.body, { ok: true });
});

test('failed initialization returns a safe 503 and allows a later retry', async () => {
  let initializeCalls = 0;
  const loggedErrors = [];
  const handler = createServerlessHandler({
    initializeApplication: async () => {
      initializeCalls += 1;
      if (initializeCalls === 1) {
        throw new Error('Connection failed: mongodb://user:password@database.example/harf');
      }
      return {
        app(_request, response) {
          response.status(200).json({ ok: true });
        }
      };
    },
    logger: { error: (...args) => loggedErrors.push(args) }
  });
  const failedResponse = createResponse();

  await handler({}, failedResponse, () => {});

  assert.equal(failedResponse.statusCode, 503);
  assert.deepEqual(failedResponse.body, {
    error: { code: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable.' }
  });
  assert.equal(JSON.stringify(failedResponse.body).includes('password'), false);
  assert.equal(JSON.stringify(loggedErrors).includes('user:password'), false);

  const retriedResponse = createResponse();
  await handler({}, retriedResponse, () => {});

  assert.equal(initializeCalls, 2);
  assert.equal(retriedResponse.statusCode, 200);
});
