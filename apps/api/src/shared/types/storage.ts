import { z } from 'zod';

export const storageUploadPurposeSchema = z.enum([
  'review_photo',
  'product_media',
  'shop_logo',
  'video', // Phase 12.1 — short-video reel uploads
  'video_thumb',
  'cs_attachment',
]);
export type StorageUploadPurpose = z.infer<typeof storageUploadPurposeSchema>;

/** Per-purpose size caps in bytes (must match `packages/types/src/storage.ts`). */
export const STORAGE_LIMITS: Record<StorageUploadPurpose, number> = {
  review_photo: 8 * 1024 * 1024,
  product_media: 8 * 1024 * 1024,
  shop_logo: 4 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  video_thumb: 2 * 1024 * 1024,
  cs_attachment: 8 * 1024 * 1024,
};

const MAX_REQUEST_BYTES = 110 * 1024 * 1024;

export const presignUploadInputSchema = z.object({
  purpose: storageUploadPurposeSchema.default('review_photo'),
  contentType: z
    .string()
    .regex(/^[\w.+-]+\/[\w.+-]+$/, 'รูปแบบ contentType ไม่ถูกต้อง'),
  sizeBytes: z.number().int().min(1).max(MAX_REQUEST_BYTES),
  filename: z.string().max(120).optional(),
});
export type PresignUploadInput = z.infer<typeof presignUploadInputSchema>;

export const presignUploadResultSchema = z.object({
  uploadUrl: z.string().url(),
  method: z.enum(['PUT', 'POST']),
  objectKey: z.string(),
  publicUrl: z.string().url(),
  headers: z.record(z.string()).optional(),
  fields: z.record(z.string()).optional(),
  expiresInSec: z.number().int().positive(),
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
  driver: z.enum(['s3', 'r2', 'minio', 'mock', 'disabled']),
  /** Legacy global ceiling — kept for back-compat; prefer `limits` per purpose. */
  maxSizeBytes: z.number().int().positive(),
  allowedContentTypes: z.array(z.string()),
  /** Per-purpose size caps (Phase 12.1) */
  limits: z.record(z.number().int().positive()).optional(),
  /** Per-purpose MIME whitelist (Phase 12.1) */
  allowedByPurpose: z.record(z.array(z.string())).optional(),
});
export type StorageConfig = z.infer<typeof storageConfigSchema>;
