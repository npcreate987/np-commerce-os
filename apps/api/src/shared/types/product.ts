import { z } from 'zod';

export const productStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']);
export type ProductStatus = z.infer<typeof productStatusSchema>;

export const productMediaSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  kind: z.enum(['IMAGE', 'VIDEO']),
  sort: z.number().int(),
});
export type ProductMedia = z.infer<typeof productMediaSchema>;

export const productSchema = z.object({
  id: z.string().min(1),
  shopId: z.string().min(1),
  name: z.string(),
  description: z.string().nullable(),
  priceCents: z.number().int().nonnegative(),
  stock: z.number().int().nonnegative(),
  status: productStatusSchema,
  media: z.array(productMediaSchema),
  createdAt: z.string(),
});
export type Product = z.infer<typeof productSchema>;

export const createProductSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  priceCents: z.number().int().min(0),
  stock: z.number().int().min(0).default(0),
  mediaUrls: z.array(z.string().url()).max(8).optional(),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial().extend({
  status: productStatusSchema.optional(),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
