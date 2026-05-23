import { z } from 'zod';
import { recommendationReasonSchema } from './intelligence';

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

export const recommendationBreakdownSchema = z.object({
  productId: z.string(),
  total: z.number(),
  contentSim: z.number(),
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
