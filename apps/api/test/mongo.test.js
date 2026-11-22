import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { afterEach, mock, test } from 'node:test';
import { connectMongo, disconnectMongo } from '../src/db/mongo.js';

afterEach(async () => {
  await disconnectMongo();
});

test('MongoDB selects the configured database and reuses a warm connection promise', async (t) => {
  const logger = {
    info: mock.fn(),
    warn: mock.fn(),
    error: mock.fn()
  };
  const connect = t.mock.method(mongoose, 'connect', async () => mongoose);

  const options = {
    isProduction: false,
    logger,
    databaseName: 'harf_experimental'
  };
  assert.equal(await connectMongo('mongodb+srv://cluster.example.invalid', options), true);
  assert.equal(await connectMongo('mongodb+srv://cluster.example.invalid', options), true);
  assert.equal(connect.mock.calls.length, 1);
  assert.equal(mongoose.get('autoIndex'), false);
  assert.deepEqual(connect.mock.calls[0].arguments[1], {
    dbName: 'harf_experimental',
    maxPoolSize: 10,
    minPoolSize: 0,
    maxIdleTimeMS: 30_000,
    serverSelectionTimeoutMS: 30_000
  });
  assert.deepEqual(logger.info.mock.calls[0].arguments, ['MongoDB connection established.']);
});

test('concurrent MongoDB initialization shares one in-flight connection attempt', async (t) => {
  const logger = {
    info: mock.fn(),
    warn: mock.fn(),
    error: mock.fn()
  };
  let resolveConnection;
  const connect = t.mock.method(mongoose, 'connect', () => new Promise((resolve) => {
    resolveConnection = resolve;
  }));
  const options = { isProduction: false, logger, databaseName: 'harf_experimental' };

  const first = connectMongo('mongodb+srv://cluster.example.invalid', options);
  const second = connectMongo('mongodb+srv://cluster.example.invalid', options);
  await Promise.resolve();
  assert.equal(connect.mock.calls.length, 1);
  resolveConnection(mongoose);
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
});

test('MongoDB connection failures are actionable without exposing the URI', async (t) => {
  const logger = {
    info: mock.fn(),
    warn: mock.fn(),
    error: mock.fn()
  };
  let attempts = 0;
  const connect = t.mock.method(mongoose, 'connect', async () => {
    attempts += 1;
    if (attempts === 1) {
      throw new Error('Unable to connect to mongodb+srv://cluster.example.invalid/harf_experimental');
    }
    return mongoose;
  });

  await assert.rejects(connectMongo('mongodb+srv://cluster.example.invalid/harf', {
    isProduction: false,
    logger,
    databaseName: 'harf_experimental'
  }), {
    message: 'MongoDB connection failed. Verify MONGODB_URI, MONGODB_DATABASE, network access, and database user permissions.'
  });
  assert.equal(connect.mock.calls.length, 1);
  assert.equal(JSON.stringify(logger.error.mock.calls).includes('mongodb+srv://cluster.example.invalid'), false);

  assert.equal(await connectMongo('mongodb+srv://cluster.example.invalid/harf', {
    isProduction: false,
    logger,
    databaseName: 'harf_experimental'
  }), true);
  assert.equal(connect.mock.calls.length, 2);
});
