import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MediaAsset } from '../src/models/MediaAsset.js';
import { createPlatformSettingsRepository } from '../src/db/platformSettingsRepository.js';

test('platform settings repository checks active image assets for logo and homepage images', async () => {
  const assetId = '0123456789abcdef01234567';
  const asset = { _id: assetId, kind: 'image', active: true };
  const originalFindOne = MediaAsset.findOne;
  let filter;
  MediaAsset.findOne = (query) => {
    filter = query;
    return { lean: async () => asset };
  };

  try {
    const repository = createPlatformSettingsRepository();
    assert.equal(await repository.findActiveImageAsset(assetId), asset);
    assert.deepEqual(filter, { _id: assetId, kind: 'image', active: true });
  } finally {
    MediaAsset.findOne = originalFindOne;
  }
});
