import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { AppError } from '../middleware/errors.js';
import { isBlobStorageName } from './blobStorageService.js';

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);

export class PaymentReceiptService {
  constructor({ storageDirectory, blobStorage = null }) {
    this.storageDirectory = path.resolve(storageDirectory);
    this.blobStorage = blobStorage;
  }

  async initialize() {
    await mkdir(this.storageDirectory, { recursive: true, mode: 0o700 });
  }

  async store(file, { imagesOnly = false, ownerId } = {}) {
    const sourcePath = typeof file === 'string' ? file : file?.storageName;
    const pathPrefix = ownerId ? `receipts/${ownerId}` : 'receipts';
    if (sourcePath && (!isBlobStorageName(sourcePath, 'receipts')
      || !sourcePath.startsWith(`${pathPrefix}/`))) {
      throw new AppError(400, 'INVALID_RECEIPT_UPLOAD', 'The uploaded receipt is invalid.');
    }
    const buffer = file?.buffer ?? (sourcePath
      ? (await this.blobStorage?.read(sourcePath, MAX_RECEIPT_BYTES))?.buffer
      : null);
    if (!buffer?.length) throw new AppError(400, 'EMPTY_RECEIPT', 'ملف الإيصال فارغ أو غير موجود.');
    if (buffer.length > MAX_RECEIPT_BYTES) throw new AppError(413, 'RECEIPT_TOO_LARGE', 'الحد الأقصى لحجم الإيصال 5 ميجابايت.');
    const detected = await fileTypeFromBuffer(buffer);
    const allowedTypes = imagesOnly
      ? new Set(['image/png', 'image/jpeg', 'image/webp'])
      : ALLOWED_MIME_TYPES;
    if (!detected || !allowedTypes.has(detected.mime)) {
      if (sourcePath) await this.blobStorage?.remove(sourcePath);
      throw new AppError(400, 'UNSUPPORTED_RECEIPT_TYPE', 'ارفع صورة PNG أو JPEG أو WebP صالحة.');
    }
    const storageName = sourcePath ?? (this.blobStorage
      ? `${pathPrefix}/${randomUUID()}`
      : randomUUID());
    if (!sourcePath) {
      if (this.blobStorage) await this.blobStorage.put(storageName, buffer, detected.mime);
      else await writeFile(path.join(this.storageDirectory, storageName), buffer, { flag: 'wx', mode: 0o600 });
    }
    return { storageName, mimeType: detected.mime, sizeBytes: buffer.length };
  }

  async read(receipt) {
    if (isBlobStorageName(receipt?.storageName, 'receipts')) {
      const stored = await this.blobStorage?.read(receipt.storageName, MAX_RECEIPT_BYTES);
      return stored ? { buffer: stored.buffer, mimeType: receipt.mimeType } : null;
    }
    if (!receipt?.storageName || !/^[a-f\d-]{36}$/i.test(receipt.storageName)) return null;
    try {
      return { buffer: await readFile(path.join(this.storageDirectory, receipt.storageName)), mimeType: receipt.mimeType };
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async remove(receipt) {
    if (isBlobStorageName(receipt?.storageName, 'receipts')) {
      await this.blobStorage?.remove(receipt.storageName);
      return;
    }
    if (receipt?.storageName) await rm(path.join(this.storageDirectory, receipt.storageName), { force: true });
  }
}
