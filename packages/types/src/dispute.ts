import { z } from 'zod';

export const disputeReasonSchema = z.enum([
  'ITEM_NOT_RECEIVED',
  'NOT_AS_DESCRIBED',
  'DAMAGED',
  'OTHER',
]);
export type DisputeReason = z.infer<typeof disputeReasonSchema>;

export const disputeStatusSchema = z.enum([
  'OPEN',
  'MERCHANT_REPLIED',
  'ESCALATED',
  'RESOLVED_REFUND',
  'RESOLVED_RELEASE',
  'CLOSED',
]);
export type DisputeStatus = z.infer<typeof disputeStatusSchema>;

export const disputeAuthorRoleSchema = z.enum(['CUSTOMER', 'MERCHANT', 'ADMIN']);
export type DisputeAuthorRole = z.infer<typeof disputeAuthorRoleSchema>;

export const disputeMessageSchema = z.object({
  id: z.string(),
  disputeId: z.string(),
  authorId: z.string(),
  authorRole: disputeAuthorRoleSchema,
  body: z.string(),
  createdAt: z.string(),
});
export type DisputeMessage = z.infer<typeof disputeMessageSchema>;

export const disputeSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  status: disputeStatusSchema,
  reason: disputeReasonSchema,
  description: z.string(),
  evidence: z.array(z.string().url()),
  messages: z.array(disputeMessageSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Dispute = z.infer<typeof disputeSchema>;

export const createDisputeInputSchema = z.object({
  reason: disputeReasonSchema,
  description: z.string().min(5).max(2000),
  evidence: z.array(z.string().url()).max(8).optional(),
});
export type CreateDisputeInput = z.infer<typeof createDisputeInputSchema>;

export const replyDisputeInputSchema = z.object({
  body: z.string().min(1).max(2000),
});
export type ReplyDisputeInput = z.infer<typeof replyDisputeInputSchema>;

export const resolveDisputeInputSchema = z.object({
  resolution: z.enum(['REFUND', 'RELEASE']),
});
export type ResolveDisputeInput = z.infer<typeof resolveDisputeInputSchema>;
