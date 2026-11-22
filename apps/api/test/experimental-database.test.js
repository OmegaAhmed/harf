import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertExperimentalInitializationTarget } from '../src/db/experimentalInitialization.js';

test('experimental initialization requires an explicit experimental mode and database', () => {
  const validTarget = {
    mode: 'experimental',
    nodeEnv: 'development',
    databaseName: 'harf_experimental'
  };
  assert.doesNotThrow(() => assertExperimentalInitializationTarget(validTarget));
  assert.throws(
    () => assertExperimentalInitializationTarget({ ...validTarget, mode: undefined }),
    /explicit --mode=experimental/
  );
  assert.throws(
    () => assertExperimentalInitializationTarget({ ...validTarget, databaseName: 'harf_production' }),
    /requires MONGODB_DATABASE=harf_experimental/
  );
  assert.throws(
    () => assertExperimentalInitializationTarget({ ...validTarget, nodeEnv: 'production' }),
    /disabled in production mode/
  );
});
