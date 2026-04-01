/**
 * Image compression and resizing utilities
 * Ensures images are within Claude's size limits before sending
 */

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'ico',
  'bmp',
  'avif',
]);

/** Maximum dimension (width or height) for images */
const MAX_DIMENSION = 2048;

/** Target file size in bytes (~1MB to stay well under 5MB API limit) */
const TARGET_SIZE_BYTES = 1 * 1024 * 1024;

/** Initial JPEG quality */
const INITIAL_QUALITY = 0.85;

/** Minimum JPEG quality before giving up */
const MIN_QUALITY = 0.5;

export interface CompressedImage {
  data: string; // base64 without prefix
  mimeType: string;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
}

export function isImageFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.has(ext);
}

export function isSvgFile(path: string): boolean {
  return (path.split('.').pop()?.toLowerCase() ?? '') === 'svg';
}

export function getImageMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    bmp: 'image/bmp',
    avif: 'image/avif',
  };

  return mimeMap[ext] ?? 'application/octet-stream';
}

/**
 * Compress and resize an image file to fit within Claude's limits
 * @param file - The image file to compress
 * @returns Promise with compressed image data
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  const originalSize = file.size;

  // Load image into an HTMLImageElement
  const img = await loadImage(file);

  // Calculate new dimensions (maintain aspect ratio, max 2048px)
  const { width, height } = calculateDimensions(img.width, img.height);

  // Draw to canvas at new size
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Use high-quality image smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  // Try to compress to target size
  let quality = INITIAL_QUALITY;
  let dataUrl: string;
  let base64Data: string;

  // For PNGs without transparency, convert to JPEG for better compression
  // For images with transparency, keep as PNG but resize
  const hasTransparency = checkTransparency(canvas, ctx);
  const outputType = hasTransparency ? 'image/png' : 'image/jpeg';

  do {
    if (outputType === 'image/jpeg') {
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    } else {
      dataUrl = canvas.toDataURL('image/png');
    }

    base64Data = dataUrl.split(',')[1] ?? '';
    const compressedSize = Math.round((base64Data.length * 3) / 4);

    if (
      compressedSize <= TARGET_SIZE_BYTES ||
      quality <= MIN_QUALITY ||
      outputType === 'image/png'
    ) {
      return {
        data: base64Data,
        mimeType: outputType,
        width,
        height,
        originalSize,
        compressedSize,
      };
    }

    // Reduce quality and try again
    quality -= 0.1;
  } while (quality >= MIN_QUALITY);

  // Return best effort
  return {
    data: base64Data,
    mimeType: outputType,
    width,
    height,
    originalSize,
    compressedSize: Math.round((base64Data.length * 3) / 4),
  };
}

/**
 * Load an image file into an HTMLImageElement
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = (): void => {
      resolve(img);
    };
    img.onerror = (): void => {
      reject(new Error('Failed to load image'));
    };

    const reader = new FileReader();
    reader.onload = (e): void => {
      const result = e.target?.result;
      if (typeof result !== 'string') {
        reject(new Error('FileReader did not produce a data URL string'));
        return;
      }
      img.src = result;
    };
    reader.onerror = (): void => {
      reject(new Error('Failed to read file'));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Calculate new dimensions maintaining aspect ratio
 */
function calculateDimensions(
  originalWidth: number,
  originalHeight: number
): { width: number; height: number } {
  if (originalWidth <= MAX_DIMENSION && originalHeight <= MAX_DIMENSION) {
    return { width: originalWidth, height: originalHeight };
  }

  const aspectRatio = originalWidth / originalHeight;

  if (originalWidth > originalHeight) {
    return {
      width: MAX_DIMENSION,
      height: Math.round(MAX_DIMENSION / aspectRatio),
    };
  } else {
    return {
      width: Math.round(MAX_DIMENSION * aspectRatio),
      height: MAX_DIMENSION,
    };
  }
}

/**
 * Check if the canvas has any transparent pixels
 */
function checkTransparency(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): boolean {
  // Sample a grid of pixels to check for transparency (faster than checking all)
  const sampleSize = 10;
  // Clamp step sizes to avoid zero-step infinite loops on tiny images.
  const stepX = Math.max(1, Math.floor(canvas.width / sampleSize));
  const stepY = Math.max(1, Math.floor(canvas.height / sampleSize));

  for (let x = 0; x < canvas.width; x += stepX) {
    for (let y = 0; y < canvas.height; y += stepY) {
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      const alpha = pixel[3];
      if (alpha !== undefined && alpha < 255) {
        return true;
      }
    }
  }

  return false;
}
