import { z } from 'zod';
import { productRecommendationSchema } from './intelligence';

export const nudgeKindSchema = z.enum([
  'BROWSE_ABANDON',
  'CART_ABANDON',
  'WIN_BACK',
  'PRICE_DROP',
  'FAV_SHOP_NEW_ARRIVAL',
  'BACK_IN_STOCK',
]);
export type NudgeKind = z.infer<typeof nudgeKindSchema>;

export const proactiveNudgeSchema = z.object({
  id: z.string(),
  userId: z.string(),
  kind: nudgeKindSchema,
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  channel: z.string(),
  payload: z.record(z.unknown()),
  status: z.string(),
  sentAt: z.string(),
});
export type ProactiveNudge = z.infer<typeof proactiveNudgeSchema>;

export const feedRailKindSchema = z.enum([
  'RECENTLY_VIEWED',
  'FAV_SHOPS_NEW',
  'BARGAINS_FROM_BROWSE',
  'SIMILAR_TO_RECENT',
]);
export type FeedRailKind = z.infer<typeof feedRailKindSchema>;

export const feedRailSchema = z.object({
  kind: feedRailKindSchema,
  title: z.string(),
  caption: z.string(),
  items: z.array(productRecommendationSchema),
});
export type FeedRail = z.infer<typeof feedRailSchema>;

export const proactiveBarSchema = z.object({
  currentlyViewingProductId: z.string().nullable(),
  lastSearchQuery: z.string().nullable(),
  lastShopId: z.string().nullable(),
  pendingNudgeCount: z.number().int().nonnegative(),
});
export type ProactiveBar = z.infer<typeof proactiveBarSchema>;

export const sweepReportSchema = z.object({
  kind: nudgeKindSchema,
  scanned: z.number().int().nonnegative(),
  matched: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
});
export type SweepReport = z.infer<typeof sweepReportSchema>;
