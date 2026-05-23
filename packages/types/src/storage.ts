import { z } from 'zod';

// =============================================================================
// Presigned upload (Phase 9.2 storage layer)
// =============================================================================

export const storageUploadPurposeSchema = z.enum([
  'review_photo',
  'product_media',
  'shop_logo',
  'video', // Phase 12.1 — short-video reel uploads
  'video_thumb',
  'cs_attachment',
]);
export type StorageUploadPurpose = z.infer<typeof storageUploadPurposeSchema>;

/**
 * Per-purpose size caps (bytes).
 *
 * Exposed to the client so it can validate *before* uploading and so we can
 * surface a friendly message ("ไฟล์ใหญ่กว่า 100MB"). The server re-validates
 * inside `StorageService.presign` so this is *not* a security boundary.
 */
export const STORAGE_LIMITS: Record<StorageUploadPurpose, number> = {
  review_photo: 8 * 1024 * 1024, // 8 MB — compressed JPEG/WebP
  product_media: 8 * 1024 * 1024,
  shop_logo: 4 * 1024 * 1024, // 4 MB — small logo
  video: 100 * 1024 * 1024, // 100 MB — TikTok-mode 9:16 ≤ 90s mp4/webm
  video_thumb: 2 * 1024 * 1024, // 2 MB — JPEG poster ≤ 720×1280
  cs_attachment: 8 * 1024 * 1024,
};

// Single Zod ceiling for the request payload itself. Per-purpose enforcement
// happens server-side using `STORAGE_LIMITS[purpose]`. Setting the request
// ceiling to the biggest purpose (video) keeps validators in sync.
const MAX_REQUEST_BYTES = 110 * 1024 * 1024;

export const presignUploadInputSchema = z.object({
  purpose: storageUploadPurposeSchema.default('review_photo'),
  contentType: z
    .string()
    .regex(/^[\w.+-]+\/[\w.+-]+$/, 'รูปแบบ contentType ไม่ถูกต้อง'),
  sizeBytes: z
    .number()
    .int()
    .min(1)
    .max(MAX_REQUEST_BYTES, `ไฟล์ใหญ่กว่า ${Math.floor(MAX_REQUEST_BYTES / 1024 / 1024)}MB`),
  /** Optional client-provided filename — purely for audit */
  filename: z.string().max(120).optional(),
});
export type PresignUploadInput = z.infer<typeof presignUploadInputSchema>;

/**
 * Two delivery shapes:
 *   1) PUT presigned URL  → simple direct upload (S3, R2, MinIO, GCS w/ signed URL)
 *   2) POST policy form   → fallback when PUT presign isn't supported
 *      (currently unused but reserved so the client API doesn't break later)
 */
export const presignUploadResultSchema = z.object({
  uploadUrl: z.string().url(),
  method: z.enum(['PUT', 'POST']),
  objectKey: z.string(),
  publicUrl: z.string().url(),
  headers: z.record(z.string()).optional(),
  fields: z.record(z.string()).optional(),
  expiresInSec: z.number().int().positive(),
  /** echoes back what the API recorded so client can attach to its mutation */
  uploadId: z.string(),
});
export type PresignUploadResult = z.infer<typeof presignUploadResultSchema>;

export const confirmUploadInputSchema = z.object({
  uploadId: z.string(),
  sizeBytes: z.number().int().min(0).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
});
export type ConfirmUploadInput = z.infer<typeof confirmUploadInputSchema>;

export const storageConfigSchema = z.object({
  enabled: z.boolean(),
  /** Hint for clients — purely informative */
  driver: z.enum(['s3', 'r2', 'minio', 'mock', 'disabled']),
  /** Legacy global ceiling — kept for back-compat; prefer `limits` per purpose. */
  maxSizeBytes: z.number().int().positive(),
  allowedContentTypes: z.array(z.string()),
  /** Per-purpose size caps in bytes (Phase 12.1) */
  limits: z.record(z.number().int().positive()).optional(),
  /** Per-purpose MIME whitelist (Phase 12.1) */
  allowedByPurpose: z.record(z.array(z.string())).optional(),
});
export type StorageConfig = z.infer<typeof storageConfigSchema>;
