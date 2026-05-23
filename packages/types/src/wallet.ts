import { z } from 'zod';

export const walletEntryKindSchema = z.enum([
  'ESCROW_HOLD',
  'ESCROW_RELEASE',
  'ESCROW_REFUND',
  'PAYOUT',
  'ADJUSTMENT',
  'COMMISSION_EARN',
  'COMMISSION_PAY',
]);
export type WalletEntryKind = z.infer<typeof walletEntryKindSchema>;

export const walletEntrySchema = z.object({
  id: z.string(),
  walletId: z.string(),
  kind: walletEntryKindSchema,
  amountCents: z.number().int(),
  orderId: z.string().nullable(),
  description: z.string().nullable(),
  createdAt: z.string(),
});
export type WalletEntry = z.infer<typeof walletEntrySchema>;

export const walletSchema = z.object({
  id: z.string(),
  userId: z.string(),
  availableCents: z.number().int(),
  pendingCents: z.number().int(),
  createdAt: z.string(),
});
export type Wallet = z.infer<typeof walletSchema>;
