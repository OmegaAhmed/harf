import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { AppError } from '../middleware/errors.js';
import { isBlobStorageName } from './blobStorageService.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DOCUMENT_KEYS = ['profilePhoto', 'medicalCardFront', 'medicalCardBack'];
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const DOCUMENT_KEY_SET = new Set(DOCUMENT_KEYS);

export class SpecialistDocumentService {
  constructor({ storageDirectory, blobStorage = null }) {
    this.storageDirectory = path.resolve(storageDirectory);
    this.blobStorage = blobStorage;
  }

  async initialize() {
    await mkdir(this.storageDirectory, { recursive: true, mode: 0o700 });
  }

  async storeRequired(files, { ownerId, registration = false } = {}) {
    if (this.blobStorage && !registration && !ownerId) {
      throw new AppError(500, 'SPECIALIST_DOCUMENT_OWNER_REQUIRED', 'The verification document owner is required.');
    }
    if (Object.keys(files ?? {}).some((key) => !DOCUMENT_KEY_SET.has(key))) {
      throw new AppError(400, 'INVALID_SPECIALIST_DOCUMENTS', 'Only the designated specialist image fields are accepted.');
    }
    const uploads = Object.fromEntries(DOCUMENT_KEYS.map((key) => {
      const upload = files?.[key];
      return [key, typeof upload === 'string' ? upload : upload?.[0]];
    }));
    const missing = DOCUMENT_KEYS.filter((key) => (
      typeof uploads[key] !== 'string' && !uploads[key]?.buffer?.length
    ));
    if (missing.length) {
      throw new AppError(400, 'SPECIALIST_DOCUMENTS_REQUIRED', 'ارفع الصورة الشخصية وصورتي الكارنيه الطبي من الأمام والخلف.');
    }

    const metadata = {};
    const buffers = {};
    const written = [];
    const uploadedPaths = [];
    try {
      for (const key of DOCUMENT_KEYS) {
        const upload = uploads[key];
        const sourcePath = typeof upload === 'string' ? upload : null;
        const pathPrefix = registration
          ? 'specialist-documents/registration'
          : ownerId
            ? `specialist-documents/${ownerId}`
            : null;
        if (sourcePath && (!isBlobStorageName(sourcePath, 'specialistDocuments')
          || !pathPrefix
          || !sourcePath.startsWith(`${pathPrefix}/`))) {
          throw new AppError(400, 'INVALID_SPECIALIST_DOCUMENTS', 'The uploaded verification image is invalid.');
        }
        if (sourcePath) uploadedPaths.push(sourcePath);
        const buffer = sourcePath
          ? (await this.blobStorage?.read(sourcePath, MAX_IMAGE_BYTES))?.buffer
          : upload.buffer;
        if (!buffer) throw new AppError(404, 'SPECIALIST_DOCUMENT_NOT_FOUND', 'The uploaded verification image was not found.');
        if (buffer.length > MAX_IMAGE_BYTES) {
          throw new AppError(413, 'SPECIALIST_DOCUMENT_TOO_LARGE', 'الحد الأقصى لكل صورة 5 ميجابايت.');
        }
        const detected = await fileTypeFromBuffer(buffer);
        if (!detected || !ALLOWED_IMAGE_TYPES.has(detected.mime)) {
          throw new AppError(400, 'UNSUPPORTED_SPECIALIST_DOCUMENT', 'ارفع صور PNG أو JPEG أو WebP صالحة فقط.');
        }
        buffers[key] = buffer;
        metadata[key] = {
          storageName: sourcePath ?? (this.blobStorage
            ? `${pathPrefix}/${randomUUID()}`
            : randomUUID()),
          mimeType: detected.mime,
          sizeBytes: buffer.length
        };
      }

      for (const key of DOCUMENT_KEYS) {
        const storageName = metadata[key].storageName;
        if (typeof uploads[key] === 'string') continue;
        if (this.blobStorage) {
          await this.blobStorage.put(storageName, buffers[key], metadata[key].mimeType);
        } else {
          await writeFile(path.join(this.storageDirectory, storageName), buffers[key], {
            flag: 'wx',
            mode: 0o600
          });
        }
        written.push(storageName);
      }
      return metadata;
    } catch (error) {
      await Promise.all([...new Set([...written, ...uploadedPaths])]
        .map((storageName) => this.removeStorageName(storageName)));
      throw error;
    }
  }

  async read(document) {
    if (isBlobStorageName(document?.storageName, 'specialistDocuments')) {
      if (!this.blobStorage) return null;
      const stored = await this.blobStorage.read(document.storageName, MAX_IMAGE_BYTES);
      return stored ? { buffer: stored.buffer, mimeType: document.mimeType } : null;
    }
    if (!document?.storageName || !/^[a-f\d-]{36}$/i.test(document.storageName)) return null;
    try {
      return {
        buffer: await readFile(path.join(this.storageDirectory, document.storageName)),
        mimeType: document.mimeType
      };
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async remove(documents) {
    const stored = DOCUMENT_KEYS
      .map((key) => documents?.[key]?.storageName)
      .filter((name) => typeof name === 'string'
        && (/^[a-f\d-]{36}$/i.test(name) || isBlobStorageName(name, 'specialistDocuments')));
    await Promise.all(stored.map((name) => this.removeStorageName(name)));
  }

  async removeStorageName(storageName) {
    if (isBlobStorageName(storageName, 'specialistDocuments')) {
      await this.blobStorage?.remove(storageName);
      return;
    }
    await rm(path.join(this.storageDirectory, storageName), { force: true });
  }
}
