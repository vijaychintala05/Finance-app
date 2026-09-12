import { ExpenseReceiptUpload } from '../../types';

export const MAX_RECEIPT_IMAGES = 3;
const MAX_RECEIPT_BYTES = 900 * 1024;

export async function compressReceiptImage(file: File): Promise<ExpenseReceiptUpload> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error(`${file.name} is not a supported image. Use JPEG, PNG, or WebP.`);
  }

  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      element.src = imageUrl;
    });
    const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = Math.min(1, 1600 / Math.max(1, longestSide));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image compression is unavailable in this browser.');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let quality = 0.88;
    let blob: Blob | null = null;
    while (quality >= 0.45) {
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= MAX_RECEIPT_BYTES) break;
      quality -= 0.1;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (!blob || blob.size > MAX_RECEIPT_BYTES) {
      throw new Error(`${file.name} is too detailed to compress under 900 KB.`);
    }

    const dataBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { name: `${file.name.replace(/\.[^.]+$/, '')}.jpg`, mimeType: 'image/jpeg', dataBase64 };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}
