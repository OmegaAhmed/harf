import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApplication } from '../src/bootstrap.js';
import { createLogger } from '../src/lib/logger.js';

test('shared bootstrap builds the Express app without database or storage side effects when disabled', async () => {
  const config = {
    mongodbUri: undefined,
    mongodbDatabase: 'harf_experimental',
    isProduction: false,
    mediaStorageDir: 'unused-test-storage',
    smtp: null,
    appOrigin: 'http://localhost:5173',
    clientOrigins: ['http://localhost:5173'],
    trustProxy: false,
    jitsi: {
      domain: 'meet.jit.si',
      parentEarlyJoinMinutes: 10,
      specialistEarlyJoinMinutes: 15,
      postAppointmentGraceMinutes: 30
    },
    videoTestLifetimeMinutes: 30
  };
  const logger = createLogger({ level: 'silent' });

  const runtime = await createApplication({ config, logger, initializeStorage: false });

  assert.equal(typeof runtime.app, 'function');
  assert.equal(typeof runtime.appointmentService.startExpiryWorker, 'function');
  assert.equal(typeof runtime.appointmentService.stopExpiryWorker, 'function');
});
