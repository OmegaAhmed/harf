import { put } from '@vercel/blob/client';
import { apiRequest } from './api.js';

export async function uploadPrivateBlob(file, handleUploadPath, pathPrefix, contentType = file?.type) {
  if (!(file instanceof File) || !file.size) throw new Error('اختر ملفًا صالحًا قبل الرفع.');
  if (!contentType) throw new Error('تعذر تحديد نوع الملف. اختر الملف مرة أخرى.');

  const pathname = `${pathPrefix}/${crypto.randomUUID()}`;
  let tokenResult;
  try {
    tokenResult = await apiRequest(handleUploadPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'blob.generate-client-token',
        payload: { pathname, multipart: false, clientPayload: null }
      })
    });
  } catch (error) {
    if (import.meta.env.DEV && error.code === 'BLOB_STORAGE_NOT_CONFIGURED') return null;
    throw error;
  }
  const { clientToken } = tokenResult;
  if (!clientToken) throw new Error('تعذر تجهيز رفع الملف بأمان.');

  const result = await put(pathname, file, {
    access: 'private',
    token: clientToken,
    contentType
  });
  return result.pathname;
}
