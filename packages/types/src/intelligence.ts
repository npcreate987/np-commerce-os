import { z } from 'zod';

// =============================================================================
// Phase 6 — AI Engine
//
// All algorithms are deterministic baselines:
//   - recommendations: collaborative (category co-purchase) + content (tag/cat)
//     + popularity, no external LLM required
//   - insights: window aggregations on orders/products + rule-based anomalies
//   - risk: rule-based scoring (refund rate, dispute rate, velocity, etc.)
//
// All numeric scores are 0..100 unless stated otherwise.
// =============================================================================

// -----------------------------------------------------------------------------
// Recommendations (customer-facing)
// -----------------------------------------------------------------------------

export const recommendationReasonSchema = z.enum([
  'POPULAR', // overall best-sellers
  'BECAUSE_BOUGHT', // co-purchase with something user owns
  'SAME_CATEGORY', // similar product (content-based)
  'BUY_AGAIN', // user ordered before
  'NEARBY', // local store within radius
  'TRENDING', // surge in recent days
  // Phase 10.2 — taste-profile-based reasons
  'BECAUSE_VIEWED', // user looked at related items recently
  'FAVOURITE_SHOP', // user visits this shop a lot
  'PRICE_MATCH', // price falls in user's typical band
  'EXPLORE', // randomly seeded to break the filter bubble
]);
export type RecommendationReason = z.infer<typeof recommendationReasonSchema>;

export const productRecommendationSchema = z.object({
  productId: z.string(),
  name: z.string(),
  priceCents: z.number().int().nonnegative(),
  thumbUrl: z.string().nullable(),
  shopId: z.string(),
  shopName: z.string().nullable(),
  score: z.number(), // 0..1 ranking signal
  reason: recommendationReasonSchema,
  reasonText: z.string(), // human-readable explanation in Thai
});
export type ProductRecommendation = z.infer<typeof productRecommendationSchema>;

export const buyAgainItemSchema = z.object({
  productId: z.string(),
  name: z.string(),
  priceCents: z.number().int().nonnegative(),
  thumbUrl: z.string().nullable(),
  shopId: z.string(),
  shopName: z.string().nullable(),
  lastOrderedAt: z.string(),
  timesBought: z.number().int().nonnegative(),
});
export type BuyAgainItem = z.infer<typeof buyAgainItemSchema>;

// -----------------------------------------------------------------------------
// Insights (merchant-facing)
// -----------------------------------------------------------------------------

export const shopInsightsOverviewSchema = z.object({
  shopId: z.string(),
  windowDays: z.number().int().positive(),
  gmvCents: z.number().int().nonnegative(),
  orderCount: z.number().int().nonnegative(),
  uniqueCustomers: z.number().int().nonnegative(),
  avgOrderValueCents: z.number().int().nonnegative(),
  refundCount: z.number().int().nonnegative(),
  refundRateBps: z.number().int().nonnegative(), // basis points (10000 = 100%)
  conversionHint: z.string(), // human note
  // delta vs previous equivalent window
  gmvDeltaBps: z.number().int(), // signed
  orderDeltaBps: z.number().int(),
  // Phase 7 — reputation
  avgRating: z.number().min(0).max(5),
  reviewCount: z.number().int().nonnegative(),
});
export type ShopInsightsOverview = z.infer<typeof shopInsightsOverviewSchema>;

export const demandForecastPointSchema = z.object({
  date: z.string(), // ISO YYYY-MM-DD
  gmvCents: z.number().int().nonnegative(),
  orderCount: z.number().int().nonnegative(),
  lowerCents: z.number().int().nonnegative(), // confidence band lower
  upperCents: z.number().int().nonnegative(), // confidence band upper
});
export type DemandForecastPoint = z.infer<typeof demandForecastPointSchema>;

export const salesTrendPointSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  gmvCents: z.number().int().nonnegative(),
  orderCount: z.number().int().nonnegative(),
});
export type SalesTrendPoint = z.infer<typeof salesTrendPointSchema>;

export const topProductSchema = z.object({
  productId: z.string(),
  name: z.string(),
  unitsSold: z.number().int().nonnegative(),
  gmvCents: z.number().int().nonnegative(),
  priceCents: z.number().int().nonnegative(),
  stock: z.number().int(),
});
export type TopProduct = z.infer<typeof topProductSchema>;

export const insightAnomalyKindSchema = z.enum([
  'GMV_DROP_WOW', // week-over-week GMV drop > threshold
  'ORDER_DROP_WOW', // order count drop
  'REFUND_SURGE', // refund rate spiked
  'LOW_STOCK_HOT', // popular product < 5 units
  'ZERO_SALES', // shop had zero orders this week
]);
export type InsightAnomalyKind = z.infer<typeof insightAnomalyKindSchema>;

export const insightAnomalySchema = z.object({
  kind: insightAnomalyKindSchema,
  severity: z.enum(['INFO', 'WARN', 'CRITICAL']),
  message: z.string(),
  refType: z.string().nullable(), // 'product' | 'shop' | null
  refId: z.string().nullable(),
  metricValue: z.number().nullable(),
});
export type InsightAnomaly = z.infer<typeof insightAnomalySchema>;

export const priceSuggestionSchema = z.object({
  productId: z.string(),
  name: z.string(),
  currentPriceCents: z.number().int().nonnegative(),
  categoryMedianCents: z.number().int().nonnegative(),
  suggestedPriceCents: z.number().int().nonnegative(),
  rationale: z.string(),
  direction: z.enum(['INCREASE', 'DECREASE', 'KEEP']),
});
export type PriceSuggestion = z.infer<typeof priceSuggestionSchema>;

// -----------------------------------------------------------------------------
// RFM customer segmentation (per shop)
// -----------------------------------------------------------------------------

export const customerSegmentSchema = z.enum([
  'CHAMPIONS', // recent + frequent + high value
  'LOYAL', // frequent + high value
  'NEW', // recent, low frequency
  'AT_RISK', // was good, slipping
  'LOST', // hasn't bought in 90d+
  'REGULAR', // everyone else
]);
export type CustomerSegment = z.infer<typeof customerSegmentSchema>;

export const segmentSummarySchema = z.object({
  segment: customerSegmentSchema,
  label: z.string(), // Thai label
  count: z.number().int().nonnegative(),
  gmvCents: z.number().int().nonnegative(), // total spend of this segment
  description: z.string(),
  sampleEmails: z.array(z.string()).max(5),
});
export type SegmentSummary = z.infer<typeof segmentSummarySchema>;

export const creatorMatchSchema = z.object({
  creatorId: z.string(),
  displayName: z.string(),
  matchScore: z.number(), // 0..1
  reason: z.string(),
  activeLinks: z.number().int().nonnegative(),
  totalClicks: z.number().int().nonnegative(),
});
export type CreatorMatch = z.infer<typeof creatorMatchSchema>;

// -----------------------------------------------------------------------------
// Risk (admin-facing)
// -----------------------------------------------------------------------------

export const riskFactorSchema = z.object({
  key: z.string(), // 'refund_rate' | 'dispute_rate' | ...
  label: z.string(), // human Thai label
  value: z.number(),
  threshold: z.number(),
  weight: z.number(),
  triggered: z.boolean(),
});
export type RiskFactor = z.infer<typeof riskFactorSchema>;

export const shopRiskSchema = z.object({
  shopId: z.string(),
  shopName: z.string(),
  ownerEmail: z.string(),
  score: z.number().int().min(0).max(100),
  level: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  factors: z.array(riskFactorSchema),
  // raw stats for context
  gmv30dCents: z.number().int().nonnegative(),
  orders30d: z.number().int().nonnegative(),
  disputes30d: z.number().int().nonnegative(),
  refunds30d: z.number().int().nonnegative(),
  accountAgeDays: z.number().int().nonnegative(),
});
export type ShopRisk = z.infer<typeof shopRiskSchema>;

export const orderRiskSchema = z.object({
  orderId: z.string(),
  customerEmail: z.string(),
  shopId: z.string(),
  shopName: z.string(),
  totalCents: z.number().int().nonnegative(),
  createdAt: z.string(),
  score: z.number().int().min(0).max(100),
  level: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  flags: z.array(z.string()), // Thai reasons
});
export type OrderRisk = z.infer<typeof orderRiskSchema>;

export const logisticsIssueSchema = z.object({
  carrierCode: z.string(),
  carrierName: z.string(),
  shipments30d: z.number().int().nonnegative(),
  lateRateBps: z.number().int().nonnegative(),
  claimRateBps: z.number().int().nonnegative(),
  avgLeadHours: z.number(),
  level: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  note: z.string(),
});
export type LogisticsIssue = z.infer<typeof logisticsIssueSchema>;

// -----------------------------------------------------------------------------
// Tracking input
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// AI Ops — model_runs telemetry summary (admin-only)
// -----------------------------------------------------------------------------

export const modelRunSummarySchema = z.object({
  kind: z.string(),
  runs24h: z.number().int().nonnegative(),
  runs7d: z.number().int().nonnegative(),
  avgMs: z.number().nonnegative(),
  p95Ms: z.number().nonnegative(),
  failRate: z.number().min(0).max(1), // 0..1 in last 7d
  lastRunAt: z.string().nullable(),
});
export type ModelRunSummary = z.infer<typeof modelRunSummarySchema>;

export const modelRunRecentSchema = z.object({
  id: z.string(),
  kind: z.string(),
  status: z.enum(['OK', 'FAIL']),
  durationMs: z.number().int().nonnegative(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type ModelRunRecent = z.infer<typeof modelRunRecentSchema>;

export const trackProductViewInputSchema = z.object({
  productId: z.string().min(1),
  source: z.string().max(40).optional(), // 'feed' | 'search' | 'recommendation' | ...
});
export type TrackProductViewInput = z.infer<typeof trackProductViewInputSchema>;
