const MAX_SIDE = 400;
const QUALITY = 0.85;

export function isImageFile(file) {
  return typeof file.type === 'string' && file.type.startsWith('image/');
}

/** Scales an image down to fit maxSide × maxSide. WebP if the browser can encode it, else JPEG. */
export async function resizeImage(file, maxSide = MAX_SIDE) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); // rejects if the file can't be decoded
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // flatten transparency: JPEG has no alpha, and cards are white
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    const webp = await toBlob(canvas, 'image/webp');
    if (webp && webp.type === 'image/webp') return webp; // Safari silently returns PNG instead
    const jpeg = await toBlob(canvas, 'image/jpeg');
    if (!jpeg) throw new Error('Could not encode the image');
    return jpeg;
  } finally {
    bitmap.close();
  }
}

function toBlob(canvas, type) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}
