'use client';

import type { PresignUploadResult } from '@np/types';
import { api } from './api';
import type { PreparedUpload } from './upload';

/**
 * Phase 12.1 — client helpers for short-video uploads.
 *
 * Why a separate module?
 *   - `upload.ts::uploadFile` **always** compresses to a flattened image; that
 *     would destroy a video. Videos must be uploaded as raw bytes.
 *   - Videos can be 100 MB+; we want XHR `upload.onprogress` events so the
 *     composer can render a progress bar (fetch in browsers without
 *     streaming-body support cannot emit upload progress).
 *   - We also need a way to extract a JPEG **poster frame** so the feed
 *     doesn't render a black tile while the video buffers.
 */

// ============================================================================
// 1) Probe video metadata (duration + dimensions) from a local File.
// ============================================================================

export interface VideoProbe {
  durationSec: number;
  width: number;
  height: number;
  /** width / height (9:16 ≈ 0.5625) */
  aspect: number;
}

export async function probeVideo(file: File): Promise<VideoProbe> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<VideoProbe>((resolve, reject) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      v.playsInline = true;
      v.src = url;
      v.onloadedmetadata = (): void => {
        resolve({
          durationSec: v.duration,
          width: v.videoWidth,
          height: v.videoHeight,
          aspect: v.videoWidth / Math.max(1, v.videoHeight),
        });
      };
      v.onerror = (): void =>
        reject(new Error('ไม่สามารถอ่านข้อมูลคลิปได้ — ไฟล์อาจเสียหรือฟอร์แมตไม่รองรับ'));
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ============================================================================
// 2) Extract a JPEG poster frame at `atSec` (default 0.5s), cropped/cover to
//    the supplied target aspect (default 9:16 / 720×1280).
// ============================================================================

export interface PosterOptions {
  /** Seek time in seconds. Default 0.5. Clamped to [0, duration-0.05]. */
  atSec?: number;
  /** Target output width. Default 720. */
  width?: number;
  /** Target output height. Default 1280. */
  height?: number;
  /** JPEG quality 0..1. Default 0.82. */
  quality?: number;
}

export async function extractVideoPoster(
  file: File,
  opts: PosterOptions = {},
): Promise<Blob> {
  const targetW = opts.width ?? 720;
  const targetH = opts.height ?? 1280;
  const quality = opts.quality ?? 0.82;
  const wanted = Math.max(0, opts.atSec ?? 0.5);

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous';
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.src = url;

      const cleanup = (): void => {
        v.onloadedmetadata = null;
        v.onseeked = null;
        v.onerror = null;
      };

      v.onloadedmetadata = (): void => {
        const seekTo = Math.min(wanted, Math.max(0, v.duration - 0.05));
        v.currentTime = seekTo;
      };

      v.onseeked = (): void => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            cleanup();
            reject(new Error('canvas not supported'));
            return;
          }
          // object-cover: scale + center-crop
          const videoRatio = v.videoWidth / Math.max(1, v.videoHeight);
          const targetRatio = targetW / targetH;
          let sx = 0;
          let sy = 0;
          let sw = v.videoWidth;
          let sh = v.videoHeight;
          if (videoRatio > targetRatio) {
            // Source is wider → crop sides
            sw = v.videoHeight * targetRatio;
            sx = (v.videoWidth - sw) / 2;
          } else {
            // Source is taller → crop top/bottom
            sh = v.videoWidth / targetRatio;
            sy = (v.videoHeight - sh) / 2;
          }
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.drawImage(v, sx, sy, sw, sh, 0, 0, targetW, targetH);
          canvas.toBlob(
            (b) => {
              cleanup();
              if (b) resolve(b);
              else reject(new Error('toBlob failed'));
            },
            'image/jpeg',
            quality,
          );
        } catch (e) {
          cleanup();
          reject(e);
        }
      };

      v.onerror = (): void => {
        cleanup();
        reject(new Error('โหลดคลิปไม่สำเร็จ — ฟอร์แมตอาจไม่รองรับ'));
      };
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ============================================================================
// 3) PUT with XHR-based progress reporting.
// ============================================================================

async function putWithProgress(
  url: string,
  blob: Blob,
  headers: Record<string, string> | undefined,
  contentType: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    const finalHeaders = headers ?? { 'Content-Type': contentType };
    for (const [k, v] of Object.entries(finalHeaders)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e: ProgressEvent): void => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = (): void => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`upload failed: HTTP ${xhr.status}`));
    };
    xhr.onerror = (): void => reject(new Error('network error during upload'));
    xhr.onabort = (): void => reject(new Error('upload aborted'));
    xhr.send(blob);
  });
}

// ============================================================================
// 4) High-level `uploadVideoFile`: presign → PUT (with progress) → confirm.
// ============================================================================

export interface UploadVideoOptions {
  /** Progress callback 0..1. Sums only the video PUT step. */
  onProgress?: (pct: number) => void;
}

export async function uploadVideoFile(
  token: string,
  file: File,
  opts: UploadVideoOptions = {},
): Promise<PreparedUpload> {
  // Honour browser-reported MIME; fall back to mp4 (most cameras).
  const contentType = file.type || 'video/mp4';
  const presign: PresignUploadResult = await api.storage.presign(token, {
    purpose: 'video',
    contentType,
    sizeBytes: file.size,
    filename: file.name?.slice(0, 120),
  });

  // Mock driver: server already marked CONFIRMED — just confirm metadata.
  if (presign.uploadUrl.startsWith('data:application/x-mock')) {
    opts.onProgress?.(1);
    await api.storage.confirm(token, {
      uploadId: presign.uploadId,
      sizeBytes: file.size,
    });
    return {
      uploadId: presign.uploadId,
      publicUrl: presign.publicUrl,
      objectKey: presign.objectKey,
    };
  }

  await putWithProgress(
    presign.uploadUrl,
    file,
    presign.headers,
    contentType,
    opts.onProgress,
  );
  await api.storage.confirm(token, {
    uploadId: presign.uploadId,
    sizeBytes: file.size,
  });
  return {
    uploadId: presign.uploadId,
    publicUrl: presign.publicUrl,
    objectKey: presign.objectKey,
  };
}

// ============================================================================
// 5) Upload a poster Blob (JPEG) using the `video_thumb` purpose.
//    Skip on mock just like uploadVideoFile does — the contract is identical.
// ============================================================================

export async function uploadVideoPoster(
  token: string,
  blob: Blob,
): Promise<PreparedUpload> {
  const contentType = blob.type || 'image/jpeg';
  const presign: PresignUploadResult = await api.storage.presign(token, {
    purpose: 'video_thumb',
    contentType,
    sizeBytes: blob.size,
    filename: 'poster.jpg',
  });

  if (presign.uploadUrl.startsWith('data:application/x-mock')) {
    await api.storage.confirm(token, {
      uploadId: presign.uploadId,
      sizeBytes: blob.size,
    });
    return {
      uploadId: presign.uploadId,
      publicUrl: presign.publicUrl,
      objectKey: presign.objectKey,
    };
  }

  await putWithProgress(
    presign.uploadUrl,
    blob,
    presign.headers,
    contentType,
  );
  await api.storage.confirm(token, {
    uploadId: presign.uploadId,
    sizeBytes: blob.size,
  });
  return {
    uploadId: presign.uploadId,
    publicUrl: presign.publicUrl,
    objectKey: presign.objectKey,
  };
}
