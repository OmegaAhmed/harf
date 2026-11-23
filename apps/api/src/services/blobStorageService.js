import { del, get, head, put, BlobNotFoundError } from '@vercel/blob';
import { Readable } from 'node:stream';
import { handleUpload } from '@vercel/blob/client';
import { AppError } from '../middleware/errors.js';

const PATHS = Object.freeze({
  media: /^media\/[a-f\d-]{36}$/i,
  specialistDocuments: /^specialist-documents\/(?:registration|[a-f\d]{24})\/[a-f\d-]{36}$/i,
  receipts: /^receipts\/(?:[a-f\d]{24}\/)?[a-f\d-]{36}$/i
});

export function isBlobStorageName(storageName, kind) {
  const pattern = kind ? PATHS[kind] : null;
  return typeof storageName === 'string'
    && (pattern ? pattern.test(storageName) : Object.values(PATHS).some((item) => item.test(storageName)));
}

export async function handleBlobUploadToken(request, response, {
  kind,
  pathPrefix,
  allowedContentTypes,
  maximumSizeInBytes
}) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new AppError(503, 'BLOB_STORAGE_NOT_CONFIGURED', 'File storage is not configured for direct uploads.');
  }
  const pathnamePattern = PATHS[kind];
  if (!pathnamePattern) throw new Error(`Unknown Blob upload kind: ${kind}`);

  const result = await handleUpload({
    body: request.body,
    request,
    onBeforeGenerateToken: async (pathname) => {
      if (!pathnamePattern.test(pathname)
        || (pathPrefix && !pathname.startsWith(`${pathPrefix}/`))) {
        throw new AppError(400, 'INVALID_BLOB_PATH', 'The upload destination is invalid.');
      }
      return {
        allowedContentTypes,
        maximumSizeInBytes,
        addRandomSuffix: false,
        allowOverwrite: false
      };
    }
  });
  response.json(result);
}

export class BlobStorageService {
  async put(storageName, buffer, contentType) {
    await put(storageName, buffer, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType
    });
    return storageName;
  }

  async read(storageName, maximumSizeInBytes = Infinity) {
    if (!isBlobStorageName(storageName)) return null;
    let metadata;
    try {
      metadata = await head(storageName);
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
    if (metadata.size > maximumSizeInBytes) {
      throw new AppError(413, 'BLOB_TOO_LARGE', 'The uploaded file exceeds the allowed size.');
    }

    const result = await get(storageName, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200) return null;
    const chunks = [];
    let size = 0;
    for await (const chunk of Readable.fromWeb(result.stream)) {
      size += chunk.length;
      if (size > maximumSizeInBytes) {
        throw new AppError(413, 'BLOB_TOO_LARGE', 'The uploaded file exceeds the allowed size.');
      }
      chunks.push(chunk);
    }
    return {
      buffer: Buffer.concat(chunks, size),
      contentType: result.blob.contentType,
      sizeBytes: size
    };
  }

  async exists(storageName) {
    if (!isBlobStorageName(storageName)) return false;
    try {
      await head(storageName);
      return true;
    } catch (error) {
      if (error instanceof BlobNotFoundError) return false;
      throw error;
    }
  }

  async remove(storageName) {
    if (isBlobStorageName(storageName)) await del(storageName);
  }
}
