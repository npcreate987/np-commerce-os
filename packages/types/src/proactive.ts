import { z } from 'zod';
import { productRecommendationSchema } from './intelligence';

/* ──────────────────────────────────────────────────────────────────────────
 * Phase 10.3 — Proactive Surfaces
 *
 * "Push the right thing to the right user at the right time, without making
 * them feel surveilled." Everything in here is derived from the firehose +
 * taste profile (10.1 / 10.2) — no new behavioural data is collected.
 * ────────────────────────────────────────────────────────────────────────── */

export const nudgeKindSchema = z.enum([
  'BROWSE_ABANDON',        // saw product N+ times, didn't add to cart / buy
  'CART_ABANDON',          // added to cart, abandoned (24h+)
  'WIN_BACK',              // inactive 14+ days
  'PRICE_DROP',            // price dropped on a product they viewed
  'FAV_SHOP_NEW_ARRIVAL',  // new product from a top-affinity shop
  'BACK_IN_STOCK',         // restocked an item they viewed while sold-out
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

// ── Feed rails (server-driven personalised shelves on /feed) ─────────

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
  /** What the user is currently doing — drives chat opener, banner, etc. */
  currentlyViewingProductId: z.string().nullable(),
  /** Recent search query — surfaced as a quick "search again" pill. */
  lastSearchQuery: z.string().nullable(),
  /** Last viewed shopId (so we can suggest "new from this shop"). */
  lastShopId: z.string().nullable(),
  /** Number of unread proactive nudges (in-app cards) the user hasn't seen. */
  pendingNudgeCount: z.number().int().nonnegative(),
});
export type ProactiveBar = z.infer<typeof proactiveBarSchema>;

// ── Cron sweep result (admin observability) ─────────────────────────

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
