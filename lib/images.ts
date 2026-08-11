'use client';

/**
 * Client-side image preparation.
 *
 * Photos come off a phone at 4000px and several megabytes. We downscale to
 * 1100px before the upload ever starts, and generate a 260px thumbnail for the
 * card. Neither ever becomes base64 in the database — the full image and the
 * thumb both live in Supabase Storage.
 */

export const MAX_DIMENSION = 1100;
export const THUMB_DIMENSION = 260;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGES_PER_DROP = 6;

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export interface PreparedImage {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  /** Object URL for immediate optimistic display; revoke when done. */
  previewUrl: string;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That image would not open.'));
    };
    img.src = url;
  });
}

function scaleTo(width: number, height: number, max: number): { w: number; h: number } {
  if (width <= max && height <= max) return { w: width, h: height };
  const ratio = width > height ? max / width : max / height;
  return { w: Math.round(width * ratio), h: Math.round(height * ratio) };
}

async function render(img: HTMLImageElement, max: number, quality: number): Promise<Blob> {
  const { w, h } = scaleTo(img.naturalWidth, img.naturalHeight, max);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process that image.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', quality),
  );
  if (!blob) throw new Error('Could not process that image.');
  return blob;
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    throw new Error('Images only — JPEG, PNG or WebP.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('That one is over 8MB.');
  }

  const img = await loadImage(file);
  const [full, thumb] = await Promise.all([
    render(img, MAX_DIMENSION, 0.82),
    render(img, THUMB_DIMENSION, 0.7),
  ]);

  const { w, h } = scaleTo(img.naturalWidth, img.naturalHeight, MAX_DIMENSION);
  return { full, thumb, width: w, height: h, previewUrl: URL.createObjectURL(thumb) };
}

/** Guest mode has no Storage bucket, so the thumb stays a data URL in the tab. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.readAsDataURL(blob);
  });
}
