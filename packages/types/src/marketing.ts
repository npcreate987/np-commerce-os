import { z } from 'zod';

// =============================================================================
// Coupons
// =============================================================================

export const couponKindSchema = z.enum(['PERCENT', 'FIXED', 'FREE_SHIPPING']);
export type CouponKind = z.infer<typeof couponKindSchema>;

export const couponSchema = z.object({
  id: z.string(),
  shopId: z.string().nullable(),
  code: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  kind: couponKindSchema,
  value: z.number().int().nonnegative(),
  minSpendCents: z.number().int().nonnegative(),
  maxDiscountCents: z.number().int().nonnegative(),
  totalLimit: z.number().int().nonnegative(),
  perUserLimit: z.number().int().nonnegative(),
  used: z.number().int().nonnegative(),
  startsAt: z.string(),
  endsAt: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Coupon = z.infer<typeof couponSchema>;

export const createCouponInputSchema = z.object({
  shopId: z.string().min(1).nullable().optional(),
  code: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[A-Z0-9_-]+$/, 'รหัสคูปองใช้ A-Z, 0-9, _ และ - เท่านั้น'),
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  kind: couponKindSchema,
  value: z.number().int().min(0).max(1_000_000),
  minSpendCents: z.number().int().min(0).default(0),
  maxDiscountCents: z.number().int().min(0).default(0),
  totalLimit: z.number().int().min(0).default(0),
  perUserLimit: z.number().int().min(0).default(1),
  startsAt: z.string().optional(),
  endsAt: z.string().nullable().optional(),
});
export type CreateCouponInput = z.infer<typeof createCouponInputSchema>;

export const applyCouponInputSchema = z.object({
  code: z.string().min(1),
  subtotalCents: z.number().int().min(0),
  shippingCents: z.number().int().min(0),
  shopId: z.string().min(1).optional(),
});
export type ApplyCouponInput = z.infer<typeof applyCouponInputSchema>;

export const couponQuoteSchema = z.object({
  couponId: z.string(),
  code: z.string(),
  kind: couponKindSchema,
  discountCents: z.number().int().nonnegative(),
  freeShipping: z.boolean(),
  message: z.string(),
});
export type CouponQuote = z.infer<typeof couponQuoteSchema>;

// =============================================================================
// Loyalty
// =============================================================================

export const loyaltyTierSchema = z.enum(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']);
export type LoyaltyTier = z.infer<typeof loyaltyTierSchema>;

export const loyaltyAccountSchema = z.object({
  id: z.string(),
  userId: z.string(),
  points: z.number().int(),
  lifetimePoints: z.number().int(),
  tier: loyaltyTierSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LoyaltyAccount = z.infer<typeof loyaltyAccountSchema>;

export const loyaltyEntryKindSchema = z.enum([
  'EARN',
  'REDEEM',
  'EXPIRE',
  'REVERSE',
  'ADJUST',
]);
export type LoyaltyEntryKind = z.infer<typeof loyaltyEntryKindSchema>;

export const loyaltyEntrySchema = z.object({
  id: z.string(),
  accountId: z.string(),
  kind: loyaltyEntryKindSchema,
  points: z.number().int(),
  refType: z.string().nullable(),
  refId: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type LoyaltyEntry = z.infer<typeof loyaltyEntrySchema>;

export const redeemLoyaltyInputSchema = z.object({
  points: z.number().int().min(1),
});
export type RedeemLoyaltyInput = z.infer<typeof redeemLoyaltyInputSchema>;

// =============================================================================
// Referrals
// =============================================================================

export const referralSchema = z.object({
  id: z.string(),
  inviterId: z.string(),
  code: z.string(),
  rewardPoints: z.number().int(),
  inviteeRewardPoints: z.number().int(),
  uses: z.number().int(),
  createdAt: z.string(),
});
export type Referral = z.infer<typeof referralSchema>;

export const referralClaimSchema = z.object({
  id: z.string(),
  referralId: z.string(),
  inviteeId: z.string(),
  status: z.enum(['PENDING', 'REWARDED', 'REVERSED']),
  rewardedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ReferralClaim = z.infer<typeof referralClaimSchema>;

export const claimReferralInputSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[A-Z0-9]+$/i),
});
export type ClaimReferralInput = z.infer<typeof claimReferralInputSchema>;

// =============================================================================
// Campaigns
// =============================================================================

export const campaignKindSchema = z.enum(['FLASH_DEAL', 'BOOST', 'BANNER']);
export type CampaignKind = z.infer<typeof campaignKindSchema>;

export const campaignSchema = z.object({
  id: z.string(),
  shopId: z.string().nullable(),
  kind: campaignKindSchema,
  title: z.string(),
  description: z.string().nullable(),
  value: z.number().int(),
  metaJson: z.string(),
  bannerUrl: z.string().nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Campaign = z.infer<typeof campaignSchema>;

export const createCampaignInputSchema = z.object({
  shopId: z.string().min(1).nullable().optional(),
  kind: campaignKindSchema,
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  value: z.number().int().min(0).default(0),
  bannerUrl: z.string().url().optional(),
  startsAt: z.string(),
  endsAt: z.string(),
});
export type CreateCampaignInput = z.infer<typeof createCampaignInputSchema>;

export const joinCampaignInputSchema = z.object({
  productId: z.string().min(1),
  flashPriceCents: z.number().int().min(0).optional(),
  stockCap: z.number().int().min(0).default(0),
});
export type JoinCampaignInput = z.infer<typeof joinCampaignInputSchema>;

export const campaignProductSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  productId: z.string(),
  flashPriceCents: z.number().int().nullable(),
  stockCap: z.number().int(),
  sold: z.number().int(),
  createdAt: z.string(),
});
export type CampaignProduct = z.infer<typeof campaignProductSchema>;

export interface CampaignProductView extends CampaignProduct {
  productName: string;
  basePriceCents: number;
  mediaUrl: string | null;
  shopId: string;
  shopName: string;
}

// =============================================================================
// Video Feed
// =============================================================================

// Phase 12.2 — add 'REPORTED' so the admin queue can surface flagged videos
// without immediately hiding them from the author. State transitions:
//   ACTIVE  → REPORTED  (auto, on first user report)
//   ACTIVE  → HIDDEN    (admin: hide via /admin/videos)
//   *       → DELETED   (author: DELETE /feed/:id  OR  admin: delete)
//   REPORTED→ ACTIVE    (admin: keep — resolves all open reports)
export const videoStatusSchema = z.enum(['ACTIVE', 'REPORTED', 'HIDDEN', 'DELETED']);
export type VideoStatus = z.infer<typeof videoStatusSchema>;

export const videoPostSchema = z.object({
  id: z.string(),
  authorId: z.string(),
  productId: z.string().nullable(),
  shopId: z.string().nullable(),
  videoUrl: z.string(),
  thumbUrl: z.string().nullable(),
  caption: z.string(),
  tagsJson: z.string(),
  likes: z.number().int(),
  views: z.number().int(),
  comments: z.number().int(),
  status: videoStatusSchema,
  score: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type VideoPost = z.infer<typeof videoPostSchema>;

export const createVideoInputSchema = z.object({
  videoUrl: z.string().url(),
  thumbUrl: z.string().url().optional(),
  caption: z.string().max(500).default(''),
  productId: z.string().min(1).optional(),
  shopId: z.string().min(1).optional(),
  tags: z.array(z.string().min(1).max(40)).max(10).optional(),
});
export type CreateVideoInput = z.infer<typeof createVideoInputSchema>;

export interface VideoFeedItem extends VideoPost {
  authorName: string;
  productName: string | null;
  productPriceCents: number | null;
  shopName: string | null;
  liked: boolean;
}

// =============================================================================
// Phase 12.2 — Video reports & admin moderation
// =============================================================================

/**
 * Fixed report taxonomy. Keeping it short keeps the UI buttons clean and lets
 * admins triage by reason. `OTHER` always pairs with a free-text `note`.
 */
export const videoReportReasonSchema = z.enum([
  'SPAM',
  'NUDITY',
  'VIOLENCE',
  'HATE',
  'MISINFO',
  'COPYRIGHT',
  'OTHER',
]);
export type VideoReportReason = z.infer<typeof videoReportReasonSchema>;

export const reportVideoInputSchema = z
  .object({
    reason: videoReportReasonSchema,
    note: z.string().max(500).optional(),
  })
  .refine((v) => v.reason !== 'OTHER' || (v.note && v.note.trim().length > 0), {
    message: 'กรุณาใส่รายละเอียดเมื่อเลือก "อื่น ๆ"',
    path: ['note'],
  });
export type ReportVideoInput = z.infer<typeof reportVideoInputSchema>;

export const videoReportSchema = z.object({
  id: z.string(),
  videoId: z.string(),
  reporterId: z.string(),
  reason: videoReportReasonSchema,
  note: z.string().nullable(),
  status: z.enum(['PENDING', 'RESOLVED']),
  resolvedBy: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  resolution: z.enum(['HIDE', 'KEEP', 'DELETE']).nullable(),
  createdAt: z.string(),
});
export type VideoReport = z.infer<typeof videoReportSchema>;

/**
 * Row shape returned by `GET /v1/feed/admin/all` — a `VideoFeedItem`
 * augmented with moderation metadata (open report count, last reason).
 */
export interface AdminVideoRow extends VideoFeedItem {
  pendingReports: number;
  lastReportReason: VideoReportReason | null;
  lastReportAt: string | null;
}

/** Row returned by `GET /v1/feed/admin/reports`. */
export interface VideoReportRow extends VideoReport {
  videoCaption: string;
  videoThumbUrl: string | null;
  videoStatus: VideoStatus;
  authorId: string;
  authorName: string | null;
  reporterName: string | null;
}

export const moderateVideoInputSchema = z.object({
  action: z.enum(['HIDE', 'RESTORE', 'DELETE']),
  note: z.string().max(500).optional(),
});
export type ModerateVideoInput = z.infer<typeof moderateVideoInputSchema>;

// =============================================================================
// Broadcast / InApp
// =============================================================================

export const broadcastChannelSchema = z.enum(['PUSH', 'INAPP', 'LINE', 'EMAIL']);
export const broadcastAudienceSchema = z.enum([
  'ALL',
  'BUYERS',
  'ABANDONED_CART',
  'WIN_BACK',
  'VIP',
  // AI-driven segments (Phase 6.2) — resolved via RFM analysis at send-time
  'SEG_CHAMPIONS',
  'SEG_LOYAL',
  'SEG_NEW',
  'SEG_AT_RISK',
  'SEG_LOST',
]);

export const broadcastSchema = z.object({
  id: z.string(),
  shopId: z.string().nullable(),
  channel: broadcastChannelSchema,
  title: z.string(),
  body: z.string(),
  audience: broadcastAudienceSchema,
  status: z.enum(['DRAFT', 'QUEUED', 'SENT', 'FAILED']),
  sentCount: z.number().int(),
  failedCount: z.number().int(),
  scheduledAt: z.string().nullable(),
  sentAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Broadcast = z.infer<typeof broadcastSchema>;

export const createBroadcastInputSchema = z.object({
  shopId: z.string().min(1).nullable().optional(),
  channel: broadcastChannelSchema.default('INAPP'),
  audience: broadcastAudienceSchema.default('ALL'),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(2000),
  scheduledAt: z.string().nullable().optional(),
});
export type CreateBroadcastInput = z.infer<typeof createBroadcastInputSchema>;

export const inAppMessageSchema = z.object({
  id: z.string(),
  userId: z.string(),
  broadcastId: z.string().nullable(),
  title: z.string(),
  body: z.string(),
  ctaJson: z.string(),
  read: z.boolean(),
  createdAt: z.string(),
});
export type InAppMessage = z.infer<typeof inAppMessageSchema>;
