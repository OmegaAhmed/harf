import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import mongoose from 'mongoose';
import { MediaAsset } from '../src/models/MediaAsset.js';
import { MediaAssetService } from '../src/services/mediaAssetService.js';

function ebmlElement(id, payload) {
  return Buffer.concat([Buffer.from(id, 'hex'), Buffer.from([0x80 + payload.length]), payload]);
}

function webmWithTracks(trackTypes) {
  const entries = trackTypes.map((trackType) => (
    ebmlElement('ae', ebmlElement('83', Buffer.from([trackType])))
  ));
  const tracks = ebmlElement('1654ae6b', Buffer.concat(entries));
  const header = ebmlElement('1a45dfa3', ebmlElement('4282', Buffer.from('webm')));
  const unknownSegmentSize = Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  return Buffer.concat([header, Buffer.from('18538067', 'hex'), unknownSegmentSize, tracks]);
}

function createAssetRepository() {
  let nextId = 0;
  return {
    async createAsset(asset) {
      nextId += 1;
      return { _id: `asset-${nextId}`, ...asset };
    }
  };
}

test('validates WebM audio and video track types', async () => {
  const storageDirectory = await mkdtemp(path.join(os.tmpdir(), 'harf-media-assets-'));
  const service = new MediaAssetService({
    repository: createAssetRepository(),
    storageDirectory
  });

  try {
    await service.initialize();
    const audio = await service.upload({
      file: { buffer: webmWithTracks([2]) },
      displayName: 'Audio WebM',
      kind: 'audio',
      createdBy: 'test'
    });
    const video = await service.upload({
      file: { buffer: webmWithTracks([1, 2]) },
      displayName: 'Video WebM',
      kind: 'video',
      createdBy: 'test'
    });

    assert.equal(audio.mimeType, 'audio/webm');
    assert.equal(video.mimeType, 'video/webm');
    await assert.rejects(
      service.upload({
        file: { buffer: webmWithTracks([1]) },
        displayName: 'Wrong WebM kind',
        kind: 'audio',
        createdBy: 'test'
      }),
      { code: 'UNSUPPORTED_MEDIA_TYPE' }
    );
  } finally {
    await rm(storageDirectory, { recursive: true, force: true });
  }
});

test('media asset schema accepts audio-only and video WebM records', async () => {
  for (const [kind, mimeType] of [['audio', 'audio/webm'], ['video', 'video/webm']]) {
    const asset = new MediaAsset({
      displayName: `${kind} WebM`,
      kind,
      mimeType,
      storageName: `media/${randomUUID()}`,
      sizeBytes: 1024,
      createdBy: new mongoose.Types.ObjectId()
    });
    await assert.doesNotReject(asset.validate());
  }
});
