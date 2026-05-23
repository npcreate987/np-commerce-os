import { z } from 'zod';

export const orderStatusSchema = z.enum([
  'PENDING_PAYMENT',
  'PAID',
  'READY_TO_SHIP',
  'SHIPPED',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const addressSchema = z.object({
  fullName: z.string().min(1).max(120),
  phone: z.string().min(8).max(20),
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional(),
  subDistrict: z.string().max(80).optional(),
  district: z.string().max(80).optional(),
  province: z.string().min(1).max(80),
  postalCode: z.string().min(4).max(10),
  note: z.string().max(300).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});
export type Address = z.infer<typeof addressSchema>;

export const orderItemSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  productName: z.string(),
  unitPriceCents: z.number().int(),
  quantity: z.number().int().positive(),
  subtotalCents: z.number().int(),
});
export type OrderItem = z.infer<typeof orderItemSchema>;

export const orderSchema = z.object({
  id: z.string().min(1),
  customerId: z.string().min(1),
  shopId: z.string().min(1),
  status: orderStatusSchema,
  items: z.array(orderItemSchema),
  subtotalCents: z.number().int(),
  shippingCents: z.number().int(),
  discountCents: z.number().int().nonnegative().default(0).optional(),
  totalCents: z.number().int(),
  shippingAddress: addressSchema,
  carrierCode: z.string().nullable().optional(),
  couponCode: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type Order = z.infer<typeof orderSchema>;

export const createCheckoutSchema = z.object({
  shippingAddress: addressSchema,
  carrierCode: z.string().optional(),
  affiliateCode: z.string().min(1).max(40).optional(),
  couponCode: z.string().min(3).max(32).optional(),
  redeemPoints: z.number().int().min(0).max(100000).optional(),
});
export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;
