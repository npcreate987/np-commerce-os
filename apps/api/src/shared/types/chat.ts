import { z } from 'zod';

/* ──────────────────────────────────────────────────────────────────────────
 * Roles, statuses
 * ────────────────────────────────────────────────────────────────────────── */

export const chatRoleSchema = z.enum(['USER', 'ASSISTANT', 'TOOL', 'SYSTEM']);
export type ChatRole = z.infer<typeof chatRoleSchema>;

export const chatConversationStatusSchema = z.enum(['OPEN', 'CLOSED']);
export type ChatConversationStatus = z.infer<typeof chatConversationStatusSchema>;

/**
 * Hand-off lifecycle:
 *   BOT       → bot is replying
 *   REQUESTED → user requested human; admin not yet picked up; bot stops replying
 *   HUMAN     → admin took over; bot stays silent
 *   RESOLVED  → admin closed; bot may resume on next user message
 */
export const handoffStatusSchema = z.enum(['BOT', 'REQUESTED', 'HUMAN', 'RESOLVED']);
export type HandoffStatus = z.infer<typeof handoffStatusSchema>;

/* ──────────────────────────────────────────────────────────────────────────
 * Intents (the deterministic baseline understands these without an LLM)
 * ────────────────────────────────────────────────────────────────────────── */

export const chatIntentSchema = z.enum([
  'GREETING',
  'TRACK_ORDER',
  'LIST_MY_ORDERS',
  'CANCEL_ORDER',
  'OPEN_DISPUTE',
  'LIST_MY_DISPUTES',
  'PENDING_REVIEWS',
  'SHIPPING_POLICY',
  'RETURN_POLICY',
  'PAYMENT_HELP',
  'ACCOUNT_HELP',
  'HUMAN_HANDOFF',
  'BROWSE_HELP',
  'SMALLTALK',
  'UNKNOWN',
]);
export type ChatIntent = z.infer<typeof chatIntentSchema>;

/* ──────────────────────────────────────────────────────────────────────────
 * Suggested actions (rendered as buttons under bot replies)
 * ────────────────────────────────────────────────────────────────────────── */

export const chatActionSchema = z.object({
  label: z.string().min(1).max(64),
  /** Frontend route to push when clicked. */
  href: z.string().min(1).max(512).optional(),
  /** Optional follow-up message text that the widget will auto-send when clicked. */
  send: z.string().min(1).max(512).optional(),
  /** Optional intent hint (the chatbot can ignore intent inference next turn). */
  intent: chatIntentSchema.optional(),
});
export type ChatAction = z.infer<typeof chatActionSchema>;

/* ──────────────────────────────────────────────────────────────────────────
 * Messages / Conversations
 * ────────────────────────────────────────────────────────────────────────── */

export const chatMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: chatRoleSchema,
  content: z.string(),
  intent: chatIntentSchema.optional(),
  toolName: z.string().optional(),
  toolArgs: z.record(z.unknown()).optional(),
  toolResult: z.unknown().optional(),
  suggestedActions: z.array(chatActionSchema).default([]),
  durationMs: z.number().int().nonnegative().default(0),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatConversationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  status: chatConversationStatusSchema,
  handoffStatus: handoffStatusSchema,
  lastMessageAt: z.string(),
  unreadByAdmin: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type ChatConversation = z.infer<typeof chatConversationSchema>;

/* ──────────────────────────────────────────────────────────────────────────
 * Inputs
 * ────────────────────────────────────────────────────────────────────────── */

export const sendChatMessageInputSchema = z.object({
  conversationId: z.string().optional(),
  text: z.string().min(1).max(2000),
  intentHint: chatIntentSchema.optional(),
  context: z
    .object({
      productId: z.string().optional(),
      shopId: z.string().optional(),
      surface: z.string().optional(),
    })
    .optional(),
});
export type SendChatMessageInput = z.infer<typeof sendChatMessageInputSchema>;

export const sendChatMessageResultSchema = z.object({
  conversation: chatConversationSchema,
  userMessage: chatMessageSchema,
  /** Always present unless conversation is in HUMAN handoff. */
  assistantMessage: chatMessageSchema.nullable(),
});
export type SendChatMessageResult = z.infer<typeof sendChatMessageResultSchema>;

export const adminReplyChatInputSchema = z.object({
  conversationId: z.string(),
  text: z.string().min(1).max(2000),
  closeAfter: z.boolean().default(false),
});
export type AdminReplyChatInput = z.infer<typeof adminReplyChatInputSchema>;

/* ──────────────────────────────────────────────────────────────────────────
 * Public config
 * ────────────────────────────────────────────────────────────────────────── */

export const chatbotConfigSchema = z.object({
  enabled: z.boolean(),
  llmProvider: z.enum(['none', 'openai', 'anthropic']),
  greetingMessage: z.string(),
  /** Quick-reply suggestions to render in an empty chat. */
  starterActions: z.array(chatActionSchema).default([]),
});
export type ChatbotConfig = z.infer<typeof chatbotConfigSchema>;
