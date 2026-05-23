import { z } from 'zod';

/**
 * Phase 7 — Reviews & Reputation
 *
 * Scope:
 *   - 1 review per (order, product) pair (multi-product orders → per-item rating)
 *   - Eligibility: customer must own the order AND order.status === 'DELIVERED'
 *   - Reviews can be hidden by admin (soft moderation)
 */

export const reviewRatingSchema = z.number().int().min(1).max(5);
export type ReviewRating = z.infer<typeof reviewRatingSchema>;

// ---- Photos (Phase 9.2) ----
export const reviewPhotoSchema = z.object({
  id: z.string(),
  reviewId: z.string(),
  objectKey: z.string(),
  url: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  sizeBytes: z.number().int().nullable(),
  isHidden: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
});
export type ReviewPhoto = z.infer<typeof reviewPhotoSchema>;

export const reviewSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  productId: z.string(),
  customerId: z.string(),
  shopId: z.string(),
  rating: reviewRatingSchema,
  body: z.string(),
  isHidden: z.boolean(),
  flagReason: z.string().nullable(), // auto-flag reason from heuristics
  helpfulCount: z.number().int().nonnegative().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Review = z.infer<typeof reviewSchema>;

export const createReviewInputSchema = z.object({
  orderId: z.string(),
  productId: z.string(),
  rating: reviewRatingSchema,
  body: z.string().min(1).max(2000),
  /**
   * Phase 9.2: object keys from presigned-upload step. Max 5 photos —
   * heuristics may auto-hide if duplicate-sha256 spam is detected.
   */
  photoUploadIds: z
    .array(z.string().min(1).max(120))
    .max(5)
    .optional(),
});
export type CreateReviewInput = z.infer<typeof createReviewInputSchema>;

/** List item enriched with author display name (email prefix) — for product detail page */
export const reviewListItemSchema = reviewSchema.extend({
  authorDisplay: z.string(), // e.g. "som***@gmail.com"
  photos: z.array(reviewPhotoSchema).default([]),
  helpfulByMe: z.boolean().default(false),
});
export type ReviewListItem = z.infer<typeof reviewListItemSchema>;

/** Aggregate rating summary — used on product/shop cards */
export const ratingSummarySchema = z.object({
  avg: z.number().min(0).max(5),
  count: z.number().int().nonnegative(),
  /** distribution: histogram[i] = count of i-star reviews (i = 1..5) */
  histogram: z.tuple([
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
  ]),
});
export type RatingSummary = z.infer<typeof ratingSummarySchema>;

/** Admin moderation view: review with extra signals from heuristics */
export const moderationReviewSchema = reviewListItemSchema.extend({
  productName: z.string(),
  shopName: z.string().nullable(),
  /** Score 0..1 — higher = more suspicious */
  suspicionScore: z.number().min(0).max(1),
  /** Specific flags from heuristics (e.g. 'SHORT_BODY', 'DUPLICATE_TEXT', 'PHOTO_DUPLICATE') */
  flags: z.array(z.string()),
});
export type ModerationReview = z.infer<typeof moderationReviewSchema>;

/** Per-photo moderation action */
export const hidePhotoInputSchema = z.object({
  hidden: z.boolean(),
});
export type HidePhotoInput = z.infer<typeof hidePhotoInputSchema>;

export const hideReviewInputSchema = z.object({
  hidden: z.boolean(),
  reason: z.string().max(200).optional(),
});
export type HideReviewInput = z.infer<typeof hideReviewInputSchema>;

/** Items pending review (rendered on /orders for the customer) */
export const pendingReviewItemSchema = z.object({
  orderId: z.string(),
  productId: z.string(),
  productName: z.string(),
  shopId: z.string(),
  shopName: z.string().nullable(),
  deliveredAt: z.string(),
});
export type PendingReviewItem = z.infer<typeof pendingReviewItemSchema>;
