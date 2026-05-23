import { z } from 'zod';

export const carrierKindSchema = z.enum(['PARCEL', 'EXPRESS_LOCAL']);
export type CarrierKind = z.infer<typeof carrierKindSchema>;

export const carrierSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  kind: carrierKindSchema,
  logoUrl: z.string().nullable(),
  baseRateCents: z.number().int(),
  perKgCents: z.number().int(),
  etaText: z.string().nullable(),
  active: z.boolean(),
});
export type Carrier = z.infer<typeof carrierSchema>;

export const shipmentStatusSchema = z.enum([
  'LABEL_CREATED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED',
  'RETURNED',
]);
export type ShipmentStatus = z.infer<typeof shipmentStatusSchema>;

export const shipmentEventSchema = z.object({
  status: shipmentStatusSchema,
  description: z.string(),
  at: z.string(),
});
export type ShipmentEvent = z.infer<typeof shipmentEventSchema>;

export const shipmentSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  carrierId: z.string(),
  carrierCode: z.string(),
  carrierName: z.string(),
  trackingNo: z.string().nullable(),
  labelUrl: z.string().nullable(),
  costCents: z.number().int(),
  status: shipmentStatusSchema,
  events: z.array(shipmentEventSchema),
  createdAt: z.string(),
});
export type Shipment = z.infer<typeof shipmentSchema>;

export const shippingQuoteRequestSchema = z.object({
  carrierCode: z.string(),
  subtotalCents: z.number().int(),
  weightGrams: z.number().int().min(100).default(1000),
});
export type ShippingQuoteRequest = z.infer<typeof shippingQuoteRequestSchema>;

export const shippingQuoteSchema = z.object({
  carrierCode: z.string(),
  carrierName: z.string(),
  etaText: z.string().nullable(),
  costCents: z.number().int(),
});
export type ShippingQuote = z.infer<typeof shippingQuoteSchema>;

export const shipOrderInputSchema = z.object({
  carrierCode: z.string(),
  trackingNo: z.string().min(3).max(60),
});
export type ShipOrderInput = z.infer<typeof shipOrderInputSchema>;
