const MAX_IMAGE_DIMENSION = 1920;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const OPTIMIZE_THRESHOLD_BYTES = 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('تعذر تجهيز الصورة للرفع. جرّب صورة أخرى.'));
        return;
      }
      resolve(blob);
    }, 'image/webp', quality);
  });
}

export async function optimizeImageFile(file) {
  if (!IMAGE_TYPES.has(file.type)) return file;
  if (typeof createImageBitmap !== 'function') {
    if (file.size <= OPTIMIZE_THRESHOLD_BYTES) return file;
    throw new Error('هذا المتصفح لا يدعم تحسين الصور تلقائيًا. جرّب متصفحًا أحدث أو صورة أصغر.');
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (file.size <= OPTIMIZE_THRESHOLD_BYTES) return file;
    throw new Error('تعذر قراءة الصورة لتحسينها. اختر صورة PNG أو JPG أو WebP صالحة.');
  }

  try {
    const largestDimension = Math.max(bitmap.width, bitmap.height);
    if (largestDimension <= MAX_IMAGE_DIMENSION && file.size <= OPTIMIZE_THRESHOLD_BYTES) return file;

    let scale = Math.min(1, MAX_IMAGE_DIMENSION / largestDimension);
    let blob;
    for (let resizeAttempt = 0; resizeAttempt < 4; resizeAttempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('تعذر تجهيز الصورة للرفع. جرّب متصفحًا أحدث.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.84, 0.72, 0.6]) {
        blob = await canvasToBlob(canvas, quality);
        if (blob.size <= MAX_OUTPUT_BYTES) break;
      }
      if (blob.size <= MAX_OUTPUT_BYTES) break;
      scale *= 0.75;
    }

    if (!blob || blob.size > MAX_UPLOAD_BYTES) {
      throw new Error('حجم الصورة ما زال كبيرًا بعد تحسينها. اختر صورة أصغر.');
    }
    if (blob.size >= file.size && file.size <= MAX_UPLOAD_BYTES) return file;

    const extension = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp'
    }[blob.type];
    if (!extension) throw new Error('تعذر تحديد صيغة الصورة المحسّنة.');
    const filename = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${filename}.${extension}`, {
      type: blob.type,
      lastModified: file.lastModified
    });
  } finally {
    bitmap.close();
  }
}
