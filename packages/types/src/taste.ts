import { z } from 'zod';
import { recommendationReasonSchema } from './intelligence';

/* ──────────────────────────────────────────────────────────────────────────
 * Phase 10.2 — User Taste Profile.
 *
 * A sparse-vector representation of "what this user is into right now",
 * precomputed by `TasteService.rebuildFor(userId)` from the firehose. The
 * ranker reads it on every "For You" request — keep it tiny.
 *
 * NOTE on decay: this snapshot already reflects weighted+decayed signals at
 * the moment of `lastUpdatedAt`. The ranker may apply an additional on-read
 * decay (`exp(-Δdays / halfLife)`) to soften old profiles, but the
 * coefficients in the JSON maps are pre-baked.
 * ────────────────────────────────────────────────────────────────────────── */

export const userTasteProfileSchema = z.object({
  userId: z.string(),
  shopAffinity: z.record(z.number()),
  tagAffinity: z.record(z.number()),
  priceMedianCents: z.number().int().nonnegative(),
  priceStdCents: z.number().int().nonnegative(),
  recentItemIds: z.array(z.string()),
  boughtItemIds: z.array(z.string()),
  eventCount: z.number().int().nonnegative(),
  windowDays: z.number().int().positive(),
  generation: z.number().int().nonnegative(),
  lastUpdatedAt: z.string(),
});
export type UserTasteProfile = z.infer<typeof userTasteProfileSchema>;

/**
 * Per-candidate score breakdown — exposed by `/v1/me/taste/explain?id=...`
 * and rendered on the /profile/privacy page so the user can see exactly why
 * something is being recommended ("contentSim 0.41 + shopAffinity 0.28 …").
 */
export const recommendationBreakdownSchema = z.object({
  productId: z.string(),
  total: z.number(), // final blended score 0..1
  contentSim: z.number(), // similarity to recent items
  shopAffinity: z.number(),
  tagAffinity: z.number(),
  priceMatch: z.number(),
  popularity: z.number(),
  exploration: z.number(),
  reason: recommendationReasonSchema,
});
export type RecommendationBreakdown = z.infer<typeof recommendationBreakdownSchema>;

export const tasteProfileSummarySchema = z.object({
  userId: z.string(),
  isColdStart: z.boolean(),
  eventCount: z.number().int().nonnegative(),
  lastUpdatedAt: z.string(),
  topShops: z.array(
    z.object({
      shopId: z.string(),
      shopName: z.string().nullable(),
      weight: z.number(),
    }),
  ),
  topTags: z.array(z.object({ token: z.string(), weight: z.number() })),
  priceMedianCents: z.number().int().nonnegative(),
  priceStdCents: z.number().int().nonnegative(),
  recentItemCount: z.number().int().nonnegative(),
});
export type TasteProfileSummary = z.infer<typeof tasteProfileSummarySchema>;
