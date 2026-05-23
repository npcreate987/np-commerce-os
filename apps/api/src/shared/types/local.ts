import { z } from 'zod';

// --------- LocalStore ---------

export const localStoreKindSchema = z.enum([
  'RESTAURANT',
  'CAFE',
  'GROCERY',
  'FRESH_MARKET',
  'LOCAL_GOODS',
  'SERVICE',
]);
export type LocalStoreKind = z.infer<typeof localStoreKindSchema>;

export const openHourRangeSchema = z.object({
  open: z.string().regex(/^\d{2}:\d{2}$/),
  close: z.string().regex(/^\d{2}:\d{2}$/),
});
export const openHoursSchema = z
  .object({
    mon: z.array(openHourRangeSchema).optional(),
    tue: z.array(openHourRangeSchema).optional(),
    wed: z.array(openHourRangeSchema).optional(),
    thu: z.array(openHourRangeSchema).optional(),
    fri: z.array(openHourRangeSchema).optional(),
    sat: z.array(openHourRangeSchema).optional(),
    sun: z.array(openHourRangeSchema).optional(),
  })
  .default({});
export type OpenHours = z.infer<typeof openHoursSchema>;

export const localStoreSchema = z.object({
  id: z.string().min(1),
  shopId: z.string().min(1),
  shopName: z.string().nullable(),
  shopSlug: z.string().nullable(),
  kind: localStoreKindSchema,
  lat: z.number(),
  lng: z.number(),
  addressText: z.string(),
  deliveryRadiusKm: z.number(),
  pickupEnabled: z.boolean(),
  deliveryEnabled: z.boolean(),
  prepTimeMinutes: z.number().int(),
  openHours: openHoursSchema,
  active: z.boolean(),
  baseDeliveryCents: z.number().int(),
  perKmCents: z.number().int(),
  /// คำนวณตอน query ถ้าส่ง lat/lng มา
  distanceKm: z.number().nullable().optional(),
  createdAt: z.string(),
});
export type LocalStore = z.infer<typeof localStoreSchema>;

export const upsertLocalStoreSchema = z.object({
  kind: localStoreKindSchema,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  addressText: z.string().min(1).max(300),
  deliveryRadiusKm: z.number().min(0).max(50).default(5),
  pickupEnabled: z.boolean().default(true),
  deliveryEnabled: z.boolean().default(true),
  prepTimeMinutes: z.number().int().min(0).max(180).default(20),
  openHours: openHoursSchema.optional(),
  active: z.boolean().default(true),
  baseDeliveryCents: z.number().int().min(0).default(3500),
  perKmCents: z.number().int().min(0).default(800),
});
export type UpsertLocalStoreInput = z.infer<typeof upsertLocalStoreSchema>;

export const nearbyQuerySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusKm: z.number().min(0.1).max(50).default(10),
  kind: localStoreKindSchema.optional(),
});
export type NearbyQuery = z.infer<typeof nearbyQuerySchema>;

// --------- Menu ---------

export const menuCategorySchema = z.object({
  id: z.string().min(1),
  shopId: z.string().min(1),
  name: z.string().min(1),
  sort: z.number().int(),
  createdAt: z.string(),
});
export type MenuCategory = z.infer<typeof menuCategorySchema>;

export const createMenuCategorySchema = z.object({
  name: z.string().min(1).max(80),
  sort: z.number().int().min(0).max(999).default(0),
});
export type CreateMenuCategoryInput = z.infer<typeof createMenuCategorySchema>;

export const assignMenuItemSchema = z.object({
  productId: z.string().min(1),
  sort: z.number().int().min(0).max(999).default(0),
});
export type AssignMenuItemInput = z.infer<typeof assignMenuItemSchema>;

export interface MenuItemView {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  stock: number;
  mediaUrl: string | null;
}
export interface MenuGroup {
  category: MenuCategory | null;
  items: MenuItemView[];
}

// --------- Time Slots ---------

export const timeSlotKindSchema = z.enum(['PICKUP', 'DELIVERY']);
export type TimeSlotKind = z.infer<typeof timeSlotKindSchema>;

export const timeSlotSchema = z.object({
  id: z.string().min(1),
  shopId: z.string().min(1),
  kind: timeSlotKindSchema,
  startsAt: z.string(),
  endsAt: z.string(),
  capacity: z.number().int(),
  taken: z.number().int(),
  available: z.number().int(),
  createdAt: z.string(),
});
export type TimeSlot = z.infer<typeof timeSlotSchema>;

export const createTimeSlotSchema = z.object({
  kind: timeSlotKindSchema,
  startsAt: z.string(),
  endsAt: z.string(),
  capacity: z.number().int().min(1).max(200).default(5),
});
export type CreateTimeSlotInput = z.infer<typeof createTimeSlotSchema>;

// --------- Rider ---------

export const riderVehicleSchema = z.enum(['BIKE', 'MOTORCYCLE', 'CAR']);
export type RiderVehicle = z.infer<typeof riderVehicleSchema>;

export const riderStatusSchema = z.enum(['PENDING', 'ACTIVE', 'SUSPENDED']);
export type RiderStatus = z.infer<typeof riderStatusSchema>;

export const riderOnlineSchema = z.enum(['OFFLINE', 'AVAILABLE', 'BUSY']);
export type RiderOnline = z.infer<typeof riderOnlineSchema>;

export const riderSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  vehicle: riderVehicleSchema,
  status: riderStatusSchema,
  online: riderOnlineSchema,
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  totalDeliveries: z.number().int(),
  totalEarningsCents: z.number().int(),
  createdAt: z.string(),
});
export type Rider = z.infer<typeof riderSchema>;

export const applyRiderSchema = z.object({
  vehicle: riderVehicleSchema.default('MOTORCYCLE'),
});
export type ApplyRiderInput = z.infer<typeof applyRiderSchema>;

export const riderLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  online: riderOnlineSchema.optional(),
});
export type RiderLocationInput = z.infer<typeof riderLocationSchema>;

// --------- Delivery Job ---------

export const deliveryJobStatusSchema = z.enum([
  'REQUESTED',
  'ASSIGNED',
  'PICKED_UP',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
]);
export type DeliveryJobStatus = z.infer<typeof deliveryJobStatusSchema>;

export const deliveryJobSchema = z.object({
  id: z.string().min(1),
  orderId: z.string().min(1),
  riderId: z.string().nullable(),
  riderName: z.string().nullable(),
  status: deliveryJobStatusSchema,
  pickupLat: z.number(),
  pickupLng: z.number(),
  pickupText: z.string(),
  dropLat: z.number(),
  dropLng: z.number(),
  dropText: z.string(),
  distanceKm: z.number(),
  riderFeeCents: z.number().int(),
  assignedAt: z.string().nullable(),
  pickedUpAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  createdAt: z.string(),
});
export type DeliveryJob = z.infer<typeof deliveryJobSchema>;
