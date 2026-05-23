import { z } from 'zod';

export const paymentMethodSchema = z.enum(['PROMPTPAY', 'CARD', 'COD']);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const paymentStatusSchema = z.enum([
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'REFUNDED',
]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const paymentSchema = z.object({
  id: z.string().min(1),
  orderId: z.string().min(1),
  method: paymentMethodSchema,
  status: paymentStatusSchema,
  amountCents: z.number().int(),
  qrCodePayload: z.string().nullable(),
  createdAt: z.string(),
});
export type Payment = z.infer<typeof paymentSchema>;

export const createPaymentSchema = z.object({
  orderId: z.string().min(1),
  method: paymentMethodSchema,
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
