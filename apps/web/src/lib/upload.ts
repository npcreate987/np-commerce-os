import type {
  PresignUploadResult,
  StorageUploadPurpose,
} from '@np/types';
import { api } from './api';

/**
 * Phase 9.2 — client helper for the presign → PUT → confirm round-trip.
 *
 * Pipeline:
 *   1) Read the user-selected File
 *   2) downscale to maxEdge px + recompress as JPEG (or WebP) at 0.82
 *      → keeps review photos under ~1MB so cellular upload is reasonable
 *   3) Hash the bytes (SHA-256) so the server can detect duplicate photos
 *   4) Hit `/storage/presign` to get a PUT URL + uploadId
 *   5) `fetch(uploadUrl, { method:PUT })` — direct to S3/R2/MinIO
 *   6) Hit `/storage/confirm` so the audit row is finalised
 *
 * Returns `{ uploadId, publicUrl }` ready to pass into `api.reviews.create`.
 */

export interface PreparedUpload {
  uploadId: string;
  publicUrl: string;
  objectKey: string;
}

async function compressImage(
  file: File,
  maxEdge = 1600,
  quality = 0.82,
): Promise<{ blob: Blob; type: string }> {
  // Some browsers don't decode HEIC etc. — fall back to raw if decode fails.
  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    return { blob: file, type: file.type || 'application/octet-stream' };
  }

  const { width, height } = img;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { blob: file, type: file.type };
  ctx.drawImage(img, 0, 0, w, h);

  // Prefer WebP for the size win when supported, fallback JPEG.
  const targetType = canvas
    .toDataURL('image/webp')
    .startsWith('data:image/webp')
    ? 'image/webp'
    : 'image/jpeg';

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), targetType, quality),
  );
  if (!blob) return { blob: file, type: file.type };
  return { blob, type: targetType };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = (): void => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (): void => {
      URL.revokeObjectURL(url);
      reject(new Error('decode-fail'));
    };
    img.src = url;
  });
}

async function sha256Hex(blob: Blob): Promise<string | undefined> {
  if (!('crypto' in window) || !crypto.subtle) return undefined;
  try {
    const buf = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return undefined;
  }
}

export async function uploadFile(
  token: string,
  file: File,
  purpose: StorageUploadPurpose = 'review_photo',
): Promise<PreparedUpload> {
  const { blob, type } = await compressImage(file);
  const sha = await sha256Hex(blob);

  const presign: PresignUploadResult = await api.storage.presign(token, {
    purpose,
    contentType: type,
    sizeBytes: blob.size,
    filename: file.name?.slice(0, 120),
  });

  // mock driver returns a data:application/x-mock URL — skip the PUT.
  if (presign.uploadUrl.startsWith('data:application/x-mock')) {
    await api.storage.confirm(token, {
      uploadId: presign.uploadId,
      sizeBytes: blob.size,
      sha256: sha,
    });
    return {
      uploadId: presign.uploadId,
      publicUrl: presign.publicUrl,
      objectKey: presign.objectKey,
    };
  }

  const res = await fetch(presign.uploadUrl, {
    method: presign.method,
    headers: presign.headers ?? { 'Content-Type': type },
    body: blob,
  });
  if (!res.ok) {
    throw new Error(`upload failed: HTTP ${res.status}`);
  }

  await api.storage.confirm(token, {
    uploadId: presign.uploadId,
    sizeBytes: blob.size,
    sha256: sha,
  });

  return {
    uploadId: presign.uploadId,
    publicUrl: presign.publicUrl,
    objectKey: presign.objectKey,
  };
}
