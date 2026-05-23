import { z } from 'zod';

export const shopStatusSchema = z.enum(['PENDING', 'ACTIVE', 'SUSPENDED']);
export type ShopStatus = z.infer<typeof shopStatusSchema>;

export const shopSchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  logoUrl: z.string().url().nullable(),
  status: shopStatusSchema,
  createdAt: z.string(),
});
export type Shop = z.infer<typeof shopSchema>;

export const createShopSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase, digits, hyphen'),
  description: z.string().max(500).optional(),
});
export type CreateShopInput = z.infer<typeof createShopSchema>;
