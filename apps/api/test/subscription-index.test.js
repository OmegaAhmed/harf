import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Subscription } from '../src/models/Subscription.js';

test('payment request uniqueness only applies to non-null ObjectId references', () => {
  const index = Subscription.schema.indexes().find(([keys]) => keys.paymentRequestId === 1);
  assert.ok(index);
  assert.equal(index[1].unique, true);
  assert.deepEqual(index[1].partialFilterExpression, {
    paymentRequestId: { $type: 'objectId' }
  });
  assert.equal(index[1].name, 'subscription_by_payment_request');
  assert.equal(index[1].sparse, undefined);
});
