import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MediaAssetService } from '../src/services/mediaAssetService.js';
import { PaymentReceiptService } from '../src/services/paymentReceiptService.js';
import { SpecialistDocumentService } from '../src/services/specialistDocumentService.js';

const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/r4sAAAAASUVORK5CYII=',
  'base64'
);
const uuid = '550e8400-e29b-41d4-a716-446655440000';

function createBlobStorage(initial = []) {
  const blobs = new Map(initial);
  return {
    blobs,
    async put(pathname, buffer) { blobs.set(pathname, buffer); },
    async read(pathname) {
      const buffer = blobs.get(pathname);
      return buffer ? { buffer, contentType: 'image/png', sizeBytes: buffer.length } : null;
    },
    async exists(pathname) { return blobs.has(pathname); },
    async remove(pathname) { blobs.delete(pathname); }
  };
}

test('media service verifies and reads a private Blob pathname without changing its authorization URL', async () => {
  const storageName = `media/${uuid}`;
  const blobStorage = createBlobStorage([[storageName, image]]);
  let savedAsset;
  const repository = {
    async createAsset(asset) {
      savedAsset = { ...asset, _id: '0123456789abcdef01234567' };
      return savedAsset;
    },
    async findAsset() { return savedAsset; },
    async isAssetReferenced() { return false; },
    async deleteAsset() { savedAsset = null; }
  };
  const service = new MediaAssetService({ repository, storageDirectory: '.', blobStorage });

  const asset = await service.upload({
    file: { storageName },
    displayName: 'Test image',
    kind: 'image',
    createdBy: '0123456789abcdef01234567'
  });

  assert.equal(savedAsset.storageName, storageName);
  assert.equal(asset.url, `/api/v1/media/${asset.id}`);
  const read = await service.readAdminAsset(asset.id);
  assert.deepEqual(read.buffer, image);
  await service.delete(asset.id);
  assert.equal(blobStorage.blobs.has(storageName), false);
});

test('specialist documents accept only the current specialist scoped Blob paths', async () => {
  const ownerId = '0123456789abcdef01234567';
  const storageName = `specialist-documents/${ownerId}/${uuid}`;
  const blobStorage = createBlobStorage([[storageName, image]]);
  const service = new SpecialistDocumentService({ storageDirectory: '.', blobStorage });
  const documents = {
    profilePhoto: storageName,
    medicalCardFront: storageName,
    medicalCardBack: storageName
  };

  const stored = await service.storeRequired(documents, { ownerId });
  assert.equal(stored.profilePhoto.storageName, storageName);
  assert.deepEqual((await service.read(stored.profilePhoto)).buffer, image);
  await assert.rejects(
    service.storeRequired(documents, { ownerId: '1123456789abcdef01234567' }),
    { code: 'INVALID_SPECIALIST_DOCUMENTS' }
  );
});

test('payment receipts cannot be attached across parent accounts', async () => {
  const ownerId = '0123456789abcdef01234567';
  const storageName = `receipts/${ownerId}/${uuid}`;
  const blobStorage = createBlobStorage([[storageName, image]]);
  const service = new PaymentReceiptService({ storageDirectory: '.', blobStorage });

  const receipt = await service.store(storageName, { ownerId });
  assert.equal(receipt.storageName, storageName);
  assert.deepEqual((await service.read(receipt)).buffer, image);
  await assert.rejects(
    service.store(storageName, { ownerId: '1123456789abcdef01234567' }),
    { code: 'INVALID_RECEIPT_UPLOAD' }
  );
});
