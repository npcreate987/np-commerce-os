import { z } from 'zod';

export const cartItemSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  productName: z.string(),
  unitPriceCents: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  mediaUrl: z.string().url().nullable(),
});
export type CartItem = z.infer<typeof cartItemSchema>;

export const cartSchema = z.object({
  id: z.string().min(1),
  items: z.array(cartItemSchema),
  subtotalCents: z.number().int().nonnegative(),
});
export type Cart = z.infer<typeof cartSchema>;

export const addToCartSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive().max(99).default(1),
});
export type AddToCartInput = z.infer<typeof addToCartSchema>;

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(0).max(99),
});
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
