import { z } from 'zod';

export const creatorStatusSchema = z.enum(['PENDING', 'ACTIVE', 'SUSPENDED']);
export type CreatorStatus = z.infer<typeof creatorStatusSchema>;

export const socialAccountSchema = z.object({
  platform: z.enum(['TIKTOK', 'INSTAGRAM', 'YOUTUBE', 'FACEBOOK', 'X', 'LINE', 'OTHER']),
  url: z.string().url(),
});
export type SocialAccount = z.infer<typeof socialAccountSchema>;

export const creatorProfileSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  displayName: z.string().min(1),
  bio: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  social: z.array(socialAccountSchema),
  status: creatorStatusSchema,
  defaultCommissionBps: z.number().int(),
  totalSalesCents: z.number().int(),
  totalCommissionCents: z.number().int(),
  createdAt: z.string(),
});
export type CreatorProfile = z.infer<typeof creatorProfileSchema>;

export const applyCreatorSchema = z.object({
  displayName: z.string().min(2).max(60),
  bio: z.string().max(400).optional(),
  avatarUrl: z.string().url().optional(),
  social: z.array(socialAccountSchema).max(8).optional(),
});
export type ApplyCreatorInput = z.infer<typeof applyCreatorSchema>;

export const creatorLinkSchema = z.object({
  id: z.string().min(1),
  creatorId: z.string().min(1),
  code: z.string().min(1),
  productId: z.string().nullable(),
  shopId: z.string().nullable(),
  label: z.string().nullable(),
  commissionBps: z.number().int().nullable(),
  clickCount: z.number().int(),
  conversionCount: z.number().int(),
  active: z.boolean(),
  createdAt: z.string(),
});
export type CreatorLink = z.infer<typeof creatorLinkSchema>;

export const createLinkSchema = z
  .object({
    productId: z.string().min(1).optional(),
    shopId: z.string().min(1).optional(),
    label: z.string().max(80).optional(),
    commissionBps: z.number().int().min(0).max(5000).optional(),
  })
  .refine((v) => Boolean(v.productId || v.shopId), {
    message: 'productId หรือ shopId อย่างน้อย 1 อย่าง',
    path: ['productId'],
  });
export type CreateLinkInput = z.infer<typeof createLinkSchema>;

export const attributionStatusSchema = z.enum(['PENDING', 'RELEASED', 'REVERSED']);
export type AttributionStatus = z.infer<typeof attributionStatusSchema>;

export const affiliateAttributionSchema = z.object({
  id: z.string().min(1),
  orderId: z.string().min(1),
  linkId: z.string().min(1),
  linkCode: z.string().min(1),
  creatorId: z.string().min(1),
  shopId: z.string().min(1),
  productId: z.string().nullable(),
  commissionBps: z.number().int(),
  commissionCents: z.number().int(),
  status: attributionStatusSchema,
  createdAt: z.string(),
  releasedAt: z.string().nullable(),
});
export type AffiliateAttribution = z.infer<typeof affiliateAttributionSchema>;

export const linkResolveSchema = z.object({
  code: z.string().min(1),
  productId: z.string().nullable(),
  shopId: z.string().nullable(),
  label: z.string().nullable(),
  creator: z.object({
    id: z.string(),
    displayName: z.string(),
    avatarUrl: z.string().nullable(),
  }),
  product: z
    .object({
      id: z.string(),
      name: z.string(),
      priceCents: z.number().int(),
      mediaUrl: z.string().nullable(),
    })
    .nullable(),
  shop: z
    .object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
    })
    .nullable(),
});
export type LinkResolve = z.infer<typeof linkResolveSchema>;

export const creatorStatsSchema = z.object({
  totalLinks: z.number().int(),
  activeLinks: z.number().int(),
  totalClicks: z.number().int(),
  totalConversions: z.number().int(),
  totalSalesCents: z.number().int(),
  pendingCommissionCents: z.number().int(),
  releasedCommissionCents: z.number().int(),
});
export type CreatorStats = z.infer<typeof creatorStatsSchema>;
