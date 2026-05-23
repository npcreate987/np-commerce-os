import { z } from 'zod';

/**
 * Phase 8 — Search & Discovery
 *
 * Approach:
 *   - Product search: TF-IDF on (name + description), then boosted by rating + popularity.
 *   - Shop search: ranked by name match + avg rating + activity.
 *   - Queries are logged to `search_queries` for trending + zero-result auditing.
 */

export const searchSortSchema = z.enum([
  'RELEVANCE', // default — TF-IDF score
  'PRICE_ASC',
  'PRICE_DESC',
  'RATING',
  'NEWEST',
  'POPULAR',
]);
export type SearchSort = z.infer<typeof searchSortSchema>;

export const productSearchInputSchema = z.object({
  query: z.string().trim().max(200),
  minPriceCents: z.number().int().nonnegative().optional(),
  maxPriceCents: z.number().int().nonnegative().optional(),
  minRating: z.number().min(0).max(5).optional(),
  shopId: z.string().optional(),
  sort: searchSortSchema.optional().default('RELEVANCE'),
  limit: z.number().int().positive().max(60).optional().default(24),
});
export type ProductSearchInput = z.infer<typeof productSearchInputSchema>;

export const productSearchHitSchema = z.object({
  productId: z.string(),
  name: z.string(),
  priceCents: z.number().int().nonnegative(),
  thumbUrl: z.string().nullable(),
  shopId: z.string(),
  shopName: z.string().nullable(),
  stock: z.number().int().nonnegative(),
  avgRating: z.number().min(0).max(5),
  reviewCount: z.number().int().nonnegative(),
  unitsSold30d: z.number().int().nonnegative(),
  /** 0..1 composite score (relevance + signals) */
  score: z.number().min(0).max(1),
  /** Highlight terms matched in the query (for UI marks) */
  matchedTerms: z.array(z.string()),
});
export type ProductSearchHit = z.infer<typeof productSearchHitSchema>;

export const productSearchResultSchema = z.object({
  hits: z.array(productSearchHitSchema),
  total: z.number().int().nonnegative(),
  tookMs: z.number().int().nonnegative(),
  /** Friendly explanation of how results were ranked */
  explanation: z.string(),
});
export type ProductSearchResult = z.infer<typeof productSearchResultSchema>;

export const shopSearchHitSchema = z.object({
  shopId: z.string(),
  name: z.string(),
  avgRating: z.number().min(0).max(5),
  reviewCount: z.number().int().nonnegative(),
  productCount: z.number().int().nonnegative(),
  unitsSold30d: z.number().int().nonnegative(),
  score: z.number().min(0).max(1),
});
export type ShopSearchHit = z.infer<typeof shopSearchHitSchema>;

export const suggestionSchema = z.object({
  text: z.string(),
  kind: z.enum(['PRODUCT', 'TRENDING']),
  count: z.number().int().nonnegative(),
});
export type Suggestion = z.infer<typeof suggestionSchema>;

export const trendingQuerySchema = z.object({
  query: z.string(),
  count: z.number().int().nonnegative(),
  zeroResultRatio: z.number().min(0).max(1),
});
export type TrendingQuery = z.infer<typeof trendingQuerySchema>;

export const trackSearchInputSchema = z.object({
  query: z.string().min(1).max(200),
  resultCount: z.number().int().nonnegative(),
});
export type TrackSearchInput = z.infer<typeof trackSearchInputSchema>;
