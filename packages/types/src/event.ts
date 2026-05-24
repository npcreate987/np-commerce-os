import { z } from 'zod';

/* ──────────────────────────────────────────────────────────────────────────
 * Event kinds — closed set on purpose so the ranker can rely on stable
 * semantics. Adding a new kind requires touching the ranker weights too.
 * ────────────────────────────────────────────────────────────────────────── */

export const userEventKindSchema = z.enum([
  // Navigation
  'page_view',
  'session_start',
  'session_end',
  // Browse
  'product_view',
  'product_dwell', // emitted once after >= 30s on PDP
  'product_scroll', // scrollPct >= 75 fires once
  'shop_view',
  'category_view',
  // Search
  'search_query',
  'search_click',
  // Cart
  'add_to_cart',
  'remove_from_cart',
  'update_cart_quantity',
  // Purchase funnel
  'checkout_start',
  'purchase',
  // Engagement
  'wishlist_add',
  'wishlist_remove',
  'follow_shop',
  'share',
  'video_play',
  'video_complete',
  // Cross-channel
  'noti_open',
  'email_open',
  'chat_open',
  // Recommendation impressions
  'reco_impression',
  'reco_click',
  // Phase 18 — Native shell lifecycle (Capacitor App plugin events).
  // Powers MAU/DAU split web vs native, retention per platform, and
  // pairs OTA rollout cohorts with crash trends.
  'app_open',
  'app_background',
  'app_resume',
  'app_url_open',
  'live_update_downloaded',
  'live_update_applied',
  'live_update_failed',
]);
export type UserEventKind = z.infer<typeof userEventKindSchema>;

/* ──────────────────────────────────────────────────────────────────────────
 * Single event input — what the client posts. Server fills userId/anonId/ip/ua/ts.
 * ────────────────────────────────────────────────────────────────────────── */

export const userEventInputSchema = z.object({
  kind: userEventKindSchema,
  /** Stable session id (per browser tab, in sessionStorage). */
  sessionId: z.string().min(8).max(64),
  /** Cookie-based id for anonymous tracking. Sent for both logged-in and
   *  logged-out users — server links anon → user on login. */
  anonId: z.string().min(8).max(64),
  /** Target entity, e.g. 'product' / 'shop' / 'category' / 'search' / 'reco'. */
  entityType: z.string().min(1).max(32).optional(),
  entityId: z.string().min(1).max(64).optional(),
  /** Where in the app — 'pdp' / 'home_for_you' / 'search_results' / 'cart' /
   *  'chat_widget' / 'push' / etc. Used for surface-level CTR analysis. */
  surface: z.string().min(1).max(64).optional(),
  /** Free-form payload — small (<2KB). The ranker only reads a few well-known
   *  keys (query, position, score, recoId). */
  meta: z.record(z.unknown()).optional(),
  /** Only set on product_dwell / video_complete / etc. */
  dwellMs: z.number().int().nonnegative().max(60 * 60 * 1000).optional(),
  /** Only set on product_scroll. 0..100. */
  scrollPct: z.number().int().min(0).max(100).optional(),
  /** Client clock — server clamps to its own clock if drift > 5 minutes. */
  clientTs: z.string().datetime().optional(),
});
export type UserEventInput = z.infer<typeof userEventInputSchema>;

export const trackBatchInputSchema = z.object({
  events: z.array(userEventInputSchema).min(1).max(100),
});
export type TrackBatchInput = z.infer<typeof trackBatchInputSchema>;

/* ──────────────────────────────────────────────────────────────────────────
 * Session bootstrap
 * ────────────────────────────────────────────────────────────────────────── */

export const startSessionInputSchema = z.object({
  anonId: z.string().min(8).max(64),
  userAgent: z.string().max(512).optional(),
  platform: z.string().max(32).optional(),
});
export type StartSessionInput = z.infer<typeof startSessionInputSchema>;

export const sessionInfoSchema = z.object({
  sessionId: z.string(),
  anonId: z.string(),
  startedAt: z.string(),
});
export type SessionInfo = z.infer<typeof sessionInfoSchema>;

/* ──────────────────────────────────────────────────────────────────────────
 * Consent / privacy
 * ────────────────────────────────────────────────────────────────────────── */

export const consentStateSchema = z.object({
  behavioralOptedOut: z.boolean(),
  marketingOptedOut: z.boolean(),
  retentionDays: z.number().int().min(30).max(730),
  updatedAt: z.string(),
});
export type ConsentState = z.infer<typeof consentStateSchema>;

export const updateConsentInputSchema = z.object({
  behavioralOptedOut: z.boolean().optional(),
  marketingOptedOut: z.boolean().optional(),
  retentionDays: z.number().int().min(30).max(730).optional(),
});
export type UpdateConsentInput = z.infer<typeof updateConsentInputSchema>;

/* ──────────────────────────────────────────────────────────────────────────
 * Read shapes (admin / debug / "what does the system know about me")
 * ────────────────────────────────────────────────────────────────────────── */

export const userEventSchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  anonId: z.string().nullable(),
  sessionId: z.string(),
  kind: userEventKindSchema,
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  surface: z.string().nullable(),
  meta: z.record(z.unknown()),
  dwellMs: z.number().int().nullable(),
  scrollPct: z.number().int().nullable(),
  ts: z.string(),
});
export type UserEvent = z.infer<typeof userEventSchema>;

export const eventFirehoseStatsSchema = z.object({
  totalLast24h: z.number().int().nonnegative(),
  uniqueUsersLast24h: z.number().int().nonnegative(),
  uniqueSessionsLast24h: z.number().int().nonnegative(),
  byKind: z.array(
    z.object({
      kind: userEventKindSchema,
      count: z.number().int().nonnegative(),
    }),
  ),
  bySurface: z.array(
    z.object({
      surface: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
});
export type EventFirehoseStats = z.infer<typeof eventFirehoseStatsSchema>;
