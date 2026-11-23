import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertProductionInitializationTarget } from '../src/db/productionInitialization.js';

test('production initialization requires confirmation of a non-experimental database', () => {
  const target = {
    databaseName: 'harf-database',
    confirmedDatabaseName: 'harf-database'
  };
  assert.doesNotThrow(() => assertProductionInitializationTarget(target));
  assert.throws(
    () => assertProductionInitializationTarget({ ...target, confirmedDatabaseName: 'another_database' }),
    /exact MONGODB_DATABASE/
  );
  assert.throws(
    () => assertProductionInitializationTarget({
      databaseName: 'harf_experimental',
      confirmedDatabaseName: 'harf_experimental'
    }),
    /cannot target harf_experimental/
  );
});

test('production initialization stops when any application collection contains data', () => {
  assert.throws(
    () => assertProductionInitializationTarget({
      databaseName: 'harf-database',
      confirmedDatabaseName: 'harf-database',
      collectionsWithData: ['users']
    }),
    /database is not empty: users/
  );
});
