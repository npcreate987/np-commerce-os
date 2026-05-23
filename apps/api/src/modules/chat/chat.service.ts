/**
 * Phase 9.3 — ChatService.
 *
 * Customer-facing CS chatbot. The flow is:
 *
 *   1. User sends a message → we persist it.
 *   2. If conversation is in `BOT` handoff state:
 *        a. Classify intent (deterministic).
 *        b. Pick a tool (or static reply) for that intent.
 *        c. Run the tool. The tool's output (text + data + actions) is the
 *           "FACTS" payload.
 *        d. If an LLM is configured, ask it to rephrase the FACTS into a
 *           natural reply. If not (or it errors out), use the deterministic
 *           summary verbatim.
 *        e. Persist a single ASSISTANT message that includes:
 *             - the user-visible text
 *             - the tool name + args + result snapshot
 *             - the suggested actions
 *   3. If conversation is in `REQUESTED` or `HUMAN` handoff: we ack with a
 *      short sentinel ASSISTANT message and do NOT call the LLM/tools — admin
 *      sees the message in their inbox.
 *
 * Hand-off rules:
 *   - Bot detecting intent=HUMAN_HANDOFF → flip status to REQUESTED.
 *   - Admin replies via `adminReply()` → status=HUMAN.
 *   - Admin closes (closeAfter=true) → status=RESOLVED, conversation status=CLOSED.
 *   - New message after RESOLVED → bot resumes (status=BOT).
 */

import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { logModelRun } from '../../common/ai/model-runs';
import { NotificationService } from '../integration/notification.service';
import { OrderService } from '../order/order.service';
import { DisputeService } from '../dispute/dispute.service';
import { ReviewService } from '../review/review.service';
import { ProactiveService } from '../proactive/proactive.service';
import {
  AdminReplyChatInput,
  ChatAction,
  ChatbotConfig,
  ChatConversation,
  ChatIntent,
  ChatMessage,
  ChatRole,
  HandoffStatus,
  SendChatMessageInput,
  SendChatMessageResult,
} from '../../shared/types';
import { classify } from './bot/intent';
import { getLLMProvider, LLMTurn, rephrase } from './bot/llm';
import { extractOrderId, runTool, ToolCtx, ToolName, ToolResult } from './bot/tools';

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

interface DbConv {
  id: string;
  userId: string;
  title: string;
  status: string;
  handoffStatus: string;
  lastMessageAt: Date;
  unreadByAdmin: number;
  createdAt: Date;
}

interface DbMsg {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  intent: string | null;
  toolName: string | null;
  toolArgs: string | null;
  toolResult: string | null;
  suggestedActionsJson: string;
  durationMs: number;
  createdAt: Date;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notif: NotificationService,
    private readonly orders: OrderService,
    private readonly disputes: DisputeService,
    private readonly reviews: ReviewService,
    private readonly proactive: ProactiveService,
  ) {}

  /* ────────────────────────────────────────────────────────────────────
   * Public config
   * ──────────────────────────────────────────────────────────────────── */

  getConfig(): ChatbotConfig {
    return {
      enabled: process.env.CHATBOT_ENABLED !== 'false',
      llmProvider: getLLMProvider(),
      greetingMessage:
        process.env.CHATBOT_GREETING ??
        'สวัสดีค่ะ ฉันคือพี่ปัน ผู้ช่วยลูกค้า — มีอะไรให้ช่วยไหมคะ?',
      starterActions: [
        { label: 'ติดตามคำสั่งซื้อ', send: 'อยากติดตามคำสั่งซื้อ' },
        { label: 'คำสั่งซื้อของฉัน', send: 'ดูคำสั่งซื้อของฉัน' },
        { label: 'นโยบายคืนสินค้า', send: 'นโยบายการคืนสินค้า' },
        { label: 'ติดต่อเจ้าหน้าที่', send: 'คุยกับแอดมิน' },
      ],
    };
  }

  /* ────────────────────────────────────────────────────────────────────
   * Conversations
   * ──────────────────────────────────────────────────────────────────── */

  async listMyConversations(userId: string): Promise<ChatConversation[]> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, userId, title, status, handoffStatus, lastMessageAt,
              unreadByAdmin, createdAt
         FROM chat_conversations
         WHERE userId = ?
         ORDER BY lastMessageAt DESC
         LIMIT 50`,
      userId,
    )) as DbConv[];
    return rows.map(this.toConversation);
  }

  async getOrCreateActive(userId: string): Promise<ChatConversation> {
    const existing = (await this.prisma.$queryRawUnsafe(
      `SELECT id, userId, title, status, handoffStatus, lastMessageAt,
              unreadByAdmin, createdAt
         FROM chat_conversations
         WHERE userId = ? AND status = 'OPEN'
         ORDER BY lastMessageAt DESC LIMIT 1`,
      userId,
    )) as DbConv[];
    if (existing.length > 0 && existing[0]) {
      return this.toConversation(existing[0]);
    }
    return this.createConversation(userId);
  }

  async listMessages(userId: string, conversationId: string): Promise<ChatMessage[]> {
    const conv = await this.requireConversation(userId, conversationId);
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, conversationId, role, content, intent, toolName, toolArgs,
              toolResult, suggestedActionsJson, durationMs, createdAt
         FROM chat_messages
         WHERE conversationId = ?
         ORDER BY createdAt ASC LIMIT 200`,
      conv.id,
    )) as DbMsg[];
    return rows.map(this.toMessage);
  }

  /* ────────────────────────────────────────────────────────────────────
   * Main send flow (user → bot)
   * ──────────────────────────────────────────────────────────────────── */

  async send(
    userId: string,
    input: SendChatMessageInput,
  ): Promise<SendChatMessageResult> {
    const conv = input.conversationId
      ? await this.requireConversation(userId, input.conversationId)
      : await this.getOrCreateActive(userId);

    const reopened =
      conv.handoffStatus === 'RESOLVED' || conv.status === 'CLOSED';
    if (reopened) {
      await this.updateConvStatus(conv.id, { status: 'OPEN', handoffStatus: 'BOT' });
      conv.status = 'OPEN';
      conv.handoffStatus = 'BOT';
    }

    const userMessage = await this.insertMessage(conv.id, {
      role: 'USER',
      content: input.text,
      intent: input.intentHint,
    });

    const prevHandoff: HandoffStatus = conv.handoffStatus;
    if (prevHandoff === 'HUMAN' || prevHandoff === 'REQUESTED') {
      await this.bumpForAdmin(conv.id);
      return {
        conversation: await this.requireConversation(userId, conv.id),
        userMessage,
        assistantMessage: null,
      };
    }

    const t0 = Date.now();
    const intentResult = classify(input.text);
    const intent = input.intentHint ?? intentResult.intent;

    let toolName: ToolName | null = null;
    let toolArgs: Record<string, unknown> = {};
    let toolResult: ToolResult;
    let nextHandoff: HandoffStatus = conv.handoffStatus;

    switch (intent) {
      case 'TRACK_ORDER': {
        const orderId = extractOrderId(input.text);
        toolName = 'lookup_order';
        toolArgs = { orderId };
        toolResult = await this.runToolSafely(userId, toolName, toolArgs, input.context);
        break;
      }
      case 'LIST_MY_ORDERS':
        toolName = 'list_my_orders';
        toolArgs = { limit: 5 };
        toolResult = await this.runToolSafely(userId, toolName, toolArgs, input.context);
        break;
      case 'LIST_MY_DISPUTES':
      case 'OPEN_DISPUTE':
        toolName = 'recent_disputes';
        toolArgs = {};
        toolResult = await this.runToolSafely(userId, toolName, toolArgs, input.context);
        if (intent === 'OPEN_DISPUTE') {
          toolResult = {
            ...toolResult,
            summary:
              `${toolResult.summary}\n\nหากจะเปิดเคสใหม่ ไปที่หน้าคำสั่งซื้อแล้วกด "เปิดเคส" ` +
              'หรือพิมพ์ "คุยกับแอดมิน" ให้เจ้าหน้าที่ดูแลโดยตรงค่ะ',
            actions: [
              ...(toolResult.actions ?? []),
              { label: 'คุยกับแอดมิน', send: 'คุยกับแอดมิน' },
            ],
          };
        }
        break;
      case 'PENDING_REVIEWS':
        toolName = 'pending_reviews';
        toolArgs = {};
        toolResult = await this.runToolSafely(userId, toolName, toolArgs, input.context);
        break;
      case 'SHIPPING_POLICY':
        toolName = 'policy_info';
        toolArgs = { topic: 'shipping' };
        toolResult = await this.runToolSafely(userId, toolName, toolArgs, input.context);
        break;
      case 'RETURN_POLICY':
        toolName = 'policy_info';
        toolArgs = { topic: 'return' };
        toolResult = await this.runToolSafely(userId, toolName, toolArgs, input.context);
        break;
      case 'PAYMENT_HELP':
        toolName = 'policy_info';
        toolArgs = { topic: 'payment' };
        toolResult = await this.runToolSafely(userId, toolName, toolArgs, input.context);
        break;
      case 'ACCOUNT_HELP':
        toolName = 'policy_info';
        toolArgs = { topic: 'account' };
        toolResult = await this.runToolSafely(userId, toolName, toolArgs, input.context);
        break;
      case 'CANCEL_ORDER': {
        const orderId = extractOrderId(input.text);
        toolName = 'lookup_order';
        toolArgs = { orderId };
        toolResult = await this.runToolSafely(userId, toolName, toolArgs, input.context);
        toolResult = {
          ...toolResult,
          summary:
            `${toolResult.summary}\n\n` +
            'การยกเลิกคำสั่งซื้อต้องตรวจสอบสถานะการแพ็คก่อน — ' +
            'แนะนำคุยกับเจ้าหน้าที่เพื่อความรวดเร็วค่ะ',
          actions: [
            ...(toolResult.actions ?? []),
            { label: 'คุยกับแอดมิน', send: 'คุยกับแอดมิน' },
          ],
        };
        break;
      }
      case 'HUMAN_HANDOFF':
        toolName = 'request_human_handoff';
        toolArgs = { reason: 'user_request' };
        toolResult = await this.runToolSafely(userId, toolName, toolArgs, input.context);
        nextHandoff = 'REQUESTED';
        break;
      case 'BROWSE_HELP': {
        // Two flavours of this intent:
        //   (a) user is on a PDP and wants help with this specific product
        //       → run `product_context` (uses input.context.productId)
        //   (b) user just wants their recent picks
        //       → run `recent_browse`
        const onProductPage = Boolean(input.context?.productId);
        if (onProductPage) {
          toolName = 'product_context';
          toolArgs = { productId: input.context!.productId };
        } else {
          toolName = 'recent_browse';
          toolArgs = { limit: 5 };
        }
        toolResult = await this.runToolSafely(userId, toolName, toolArgs, input.context);
        break;
      }
      case 'GREETING': {
        // Phase 10.3 — if the user opened chat from a product page, lead
        // with the product-aware action; this is the "Facebook nudge"
        // moment ("เห็นว่ากำลังดู X อยู่ — ให้ช่วยอะไรไหม?").
        const actions: ChatAction[] = [];
        if (input.context?.productId) {
          actions.push({
            label: 'ถามเกี่ยวกับสินค้านี้',
            send: 'ช่วยแนะนำสินค้านี้',
            intent: 'BROWSE_HELP',
          });
        }
        actions.push(
          { label: 'ติดตามคำสั่งซื้อ', send: 'อยากติดตามคำสั่งซื้อ' },
          { label: 'รีวิวที่ยังไม่ทำ', send: 'รีวิวที่รอ' },
          { label: 'นโยบายคืนสินค้า', send: 'นโยบายการคืนสินค้า' },
        );
        toolResult = {
          ok: true,
          summary: input.context?.productId
            ? 'สวัสดีค่ะ เห็นว่ากำลังดูสินค้าอยู่ — ให้ช่วยอะไรไหมคะ?'
            : 'สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ? ลองเลือกจากเมนูด้านล่าง ' +
              'หรือพิมพ์คำถามเข้ามาได้เลย',
          actions,
        };
        break;
      }
      case 'SMALLTALK':
        toolResult = {
          ok: true,
          summary: 'ยินดีค่ะ มีอะไรเพิ่มเติมแจ้งได้เลยนะคะ',
        };
        break;
      case 'UNKNOWN':
      default:
        toolName = 'policy_info';
        toolArgs = { topic: 'general' };
        toolResult = await this.runToolSafely(userId, toolName, toolArgs, input.context);
        toolResult = {
          ...toolResult,
          summary:
            'ขออภัยนะคะ ฉันยังไม่แน่ใจในคำถาม ลองเลือกเมนูด้านล่างหรือ ' +
            'พิมพ์ "คุยกับแอดมิน" ถ้าต้องการเจ้าหน้าที่ค่ะ',
          actions: [
            ...(toolResult.actions ?? []),
            { label: 'คุยกับแอดมิน', send: 'คุยกับแอดมิน' },
          ],
        };
        break;
    }

    // Optional LLM rephrase — never replaces the facts, only the wording.
    let assistantText = toolResult.summary;
    let usedProvider = 'none';
    if (toolResult.ok && getLLMProvider() !== 'none') {
      const history = await this.buildLLMHistory(conv.id);
      const r = await rephrase(history, toolResult.summary, input.text);
      if (r.ok && r.text) {
        assistantText = r.text;
        usedProvider = r.provider;
      } else if (r.error) {
        this.logger.debug(`llm rephrase failed: ${r.error}`);
      }
    }

    const assistantMessage = await this.insertMessage(conv.id, {
      role: 'ASSISTANT',
      content: assistantText,
      intent,
      toolName: toolName ?? undefined,
      toolArgs,
      toolResult,
      suggestedActions: toolResult.actions ?? [],
      durationMs: Date.now() - t0,
    });

    if (nextHandoff !== prevHandoff) {
      await this.updateConvStatus(conv.id, { handoffStatus: nextHandoff });
    }

    void logModelRun(this.prisma, 'chatbot.turn', Date.now() - t0, {
      status: 'OK',
      note: `intent=${intent} provider=${usedProvider}`,
    });

    // If we flipped to REQUESTED, notify admins (best-effort, fire-and-forget).
    // (We already early-returned above if the conv was already in REQUESTED/HUMAN.)
    if (nextHandoff === 'REQUESTED') {
      void this.notifyAdminsOfHandoff(conv.id, userId);
    }

    return {
      conversation: await this.requireConversation(userId, conv.id),
      userMessage,
      assistantMessage,
    };
  }

  /* ────────────────────────────────────────────────────────────────────
   * Admin operations
   * ──────────────────────────────────────────────────────────────────── */

  async adminList(opts: {
    handoff?: HandoffStatus | 'ALL';
    limit?: number;
  }): Promise<ChatConversation[]> {
    const limit = Math.min(opts.limit ?? 100, 200);
    let where = '';
    const params: unknown[] = [];
    if (opts.handoff && opts.handoff !== 'ALL') {
      where = 'WHERE handoffStatus = ?';
      params.push(opts.handoff);
    }
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, userId, title, status, handoffStatus, lastMessageAt,
              unreadByAdmin, createdAt
         FROM chat_conversations ${where}
         ORDER BY (handoffStatus = 'REQUESTED') DESC,
                  unreadByAdmin DESC,
                  lastMessageAt DESC
         LIMIT ${limit}`,
      ...params,
    )) as DbConv[];
    return rows.map(this.toConversation);
  }

  async adminMessages(conversationId: string): Promise<ChatMessage[]> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, conversationId, role, content, intent, toolName, toolArgs,
              toolResult, suggestedActionsJson, durationMs, createdAt
         FROM chat_messages
         WHERE conversationId = ?
         ORDER BY createdAt ASC LIMIT 500`,
      conversationId,
    )) as DbMsg[];
    // mark read
    await this.prisma.$executeRawUnsafe(
      `UPDATE chat_conversations SET unreadByAdmin = 0 WHERE id = ?`,
      conversationId,
    );
    return rows.map(this.toMessage);
  }

  async adminReply(adminUserId: string, input: AdminReplyChatInput): Promise<ChatMessage> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, userId, title, status, handoffStatus, lastMessageAt,
              unreadByAdmin, createdAt
         FROM chat_conversations WHERE id = ?`,
      input.conversationId,
    )) as DbConv[];
    const row = rows[0];
    if (!row) throw new NotFoundException('Conversation not found');

    const msg = await this.insertMessage(input.conversationId, {
      role: 'ASSISTANT',
      content: input.text,
      intent: 'HUMAN_HANDOFF',
      toolName: 'admin_reply',
      toolArgs: { adminUserId },
    });

    const nextHandoff: HandoffStatus = input.closeAfter ? 'RESOLVED' : 'HUMAN';
    const nextStatus = input.closeAfter ? 'CLOSED' : 'OPEN';
    await this.updateConvStatus(input.conversationId, {
      handoffStatus: nextHandoff,
      status: nextStatus,
    });

    // Notify user that the agent replied (best-effort, push if subscribed).
    void this.notif
      .notifyUser(row.userId, 'AUTO', 'TRANSACTIONAL', {
        title: 'มีข้อความใหม่จากเจ้าหน้าที่',
        body: input.text.slice(0, 140),
        url: '/account/support',
      })
      .catch(() => undefined);

    return msg;
  }

  async adminTakeOver(_adminUserId: string, conversationId: string): Promise<ChatConversation> {
    await this.updateConvStatus(conversationId, {
      handoffStatus: 'HUMAN',
      status: 'OPEN',
    });
    const conv = await this.requireConversationById(conversationId);
    return conv;
  }

  /* ────────────────────────────────────────────────────────────────────
   * Internals
   * ──────────────────────────────────────────────────────────────────── */

  private async createConversation(userId: string): Promise<ChatConversation> {
    const id = newId('cnv');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO chat_conversations
         (id, userId, title, status, handoffStatus, lastMessageAt, unreadByAdmin, createdAt, updatedAt)
       VALUES (?, ?, '', 'OPEN', 'BOT', CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id,
      userId,
    );
    return this.requireConversationById(id);
  }

  private async requireConversation(
    userId: string,
    conversationId: string,
  ): Promise<ChatConversation> {
    const conv = await this.requireConversationById(conversationId);
    if (conv.userId !== userId) throw new ForbiddenException('Not your conversation');
    return conv;
  }

  private async requireConversationById(conversationId: string): Promise<ChatConversation> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, userId, title, status, handoffStatus, lastMessageAt,
              unreadByAdmin, createdAt
         FROM chat_conversations WHERE id = ?`,
      conversationId,
    )) as DbConv[];
    const row = rows[0];
    if (!row) throw new NotFoundException('Conversation not found');
    return this.toConversation(row);
  }

  private async insertMessage(
    conversationId: string,
    msg: {
      role: ChatRole;
      content: string;
      intent?: ChatIntent;
      toolName?: string;
      toolArgs?: Record<string, unknown>;
      toolResult?: unknown;
      suggestedActions?: ChatAction[];
      durationMs?: number;
    },
  ): Promise<ChatMessage> {
    const id = newId('msg');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO chat_messages
        (id, conversationId, role, content, intent, toolName, toolArgs, toolResult,
         suggestedActionsJson, durationMs, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      id,
      conversationId,
      msg.role,
      msg.content,
      msg.intent ?? null,
      msg.toolName ?? null,
      msg.toolArgs ? JSON.stringify(msg.toolArgs) : null,
      msg.toolResult !== undefined ? JSON.stringify(msg.toolResult) : null,
      JSON.stringify(msg.suggestedActions ?? []),
      msg.durationMs ?? 0,
    );

    // Bump conversation
    if (msg.role === 'USER') {
      await this.prisma.$executeRawUnsafe(
        `UPDATE chat_conversations
            SET lastMessageAt = CURRENT_TIMESTAMP,
                updatedAt = CURRENT_TIMESTAMP,
                title = CASE WHEN title = '' THEN ? ELSE title END
          WHERE id = ?`,
        msg.content.slice(0, 60),
        conversationId,
      );
    } else {
      await this.prisma.$executeRawUnsafe(
        `UPDATE chat_conversations
            SET lastMessageAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
          WHERE id = ?`,
        conversationId,
      );
    }

    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, conversationId, role, content, intent, toolName, toolArgs,
              toolResult, suggestedActionsJson, durationMs, createdAt
         FROM chat_messages WHERE id = ?`,
      id,
    )) as DbMsg[];
    const row = rows[0];
    if (!row) throw new NotFoundException('Insert failed');
    return this.toMessage(row);
  }

  private async updateConvStatus(
    conversationId: string,
    patch: { status?: string; handoffStatus?: HandoffStatus },
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.status) {
      sets.push('status = ?');
      params.push(patch.status);
    }
    if (patch.handoffStatus) {
      sets.push('handoffStatus = ?');
      params.push(patch.handoffStatus);
    }
    if (!sets.length) return;
    sets.push('updatedAt = CURRENT_TIMESTAMP');
    params.push(conversationId);
    await this.prisma.$executeRawUnsafe(
      `UPDATE chat_conversations SET ${sets.join(', ')} WHERE id = ?`,
      ...params,
    );
  }

  private async bumpForAdmin(conversationId: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE chat_conversations
          SET unreadByAdmin = unreadByAdmin + 1,
              lastMessageAt = CURRENT_TIMESTAMP,
              updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?`,
      conversationId,
    );
  }

  private async runToolSafely(
    userId: string,
    name: ToolName,
    args: Record<string, unknown>,
    context?: SendChatMessageInput['context'],
  ): Promise<ToolResult> {
    const ctx: ToolCtx = {
      userId,
      prisma: this.prisma,
      orders: this.orders,
      disputes: this.disputes,
      reviews: this.reviews,
      proactive: this.proactive,
      context,
    };
    try {
      return await runTool(ctx, name, args);
    } catch (e) {
      this.logger.warn(`tool ${name} failed: ${(e as Error).message}`);
      return {
        ok: false,
        summary:
          'ขออภัย ระบบมีปัญหาชั่วคราวขณะดึงข้อมูล ลองใหม่อีกครั้ง ' +
          'หรือพิมพ์ "คุยกับแอดมิน" ค่ะ',
      };
    }
  }

  private async buildLLMHistory(conversationId: string): Promise<LLMTurn[]> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT role, content
         FROM chat_messages
         WHERE conversationId = ?
         ORDER BY createdAt DESC LIMIT 10`,
      conversationId,
    )) as Array<{ role: string; content: string }>;
    return rows
      .reverse()
      .filter((r) => r.role === 'USER' || r.role === 'ASSISTANT')
      .map((r) => ({ role: r.role as ChatRole, content: r.content }));
  }

  private async notifyAdminsOfHandoff(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    // Find one admin to notify. Cheaper than fan-out: admin dashboard polls
    // anyway, this is just a nudge.
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id FROM users WHERE role = 'ADMIN' LIMIT 5`,
    )) as Array<{ id: string }>;
    for (const a of rows) {
      try {
        await this.notif.notifyUser(a.id, 'AUTO', 'TRANSACTIONAL', {
          title: 'มีลูกค้าขอคุยกับเจ้าหน้าที่',
          body: `Conversation ${conversationId} จากผู้ใช้ ${userId}`,
          url: `/admin/chat?c=${conversationId}`,
        });
      } catch {
        // best-effort
      }
    }
  }

  /* ────────────────────────────────────────────────────────────────────
   * Mappers
   * ──────────────────────────────────────────────────────────────────── */

  private toConversation = (row: DbConv): ChatConversation => ({
    id: row.id,
    userId: row.userId,
    title: row.title || '',
    status: (row.status as ChatConversation['status']) ?? 'OPEN',
    handoffStatus: (row.handoffStatus as HandoffStatus) ?? 'BOT',
    lastMessageAt: this.toIso(row.lastMessageAt),
    unreadByAdmin: row.unreadByAdmin ?? 0,
    createdAt: this.toIso(row.createdAt),
  });

  private toMessage = (row: DbMsg): ChatMessage => {
    let actions: ChatAction[] = [];
    try {
      actions = JSON.parse(row.suggestedActionsJson || '[]') as ChatAction[];
    } catch {
      actions = [];
    }
    let toolArgs: Record<string, unknown> | undefined;
    let toolResult: unknown;
    if (row.toolArgs) {
      try {
        toolArgs = JSON.parse(row.toolArgs) as Record<string, unknown>;
      } catch {
        toolArgs = undefined;
      }
    }
    if (row.toolResult) {
      try {
        toolResult = JSON.parse(row.toolResult);
      } catch {
        toolResult = undefined;
      }
    }
    return {
      id: row.id,
      conversationId: row.conversationId,
      role: row.role as ChatRole,
      content: row.content,
      intent: (row.intent ?? undefined) as ChatIntent | undefined,
      toolName: row.toolName ?? undefined,
      toolArgs,
      toolResult,
      suggestedActions: actions,
      durationMs: row.durationMs ?? 0,
      createdAt: this.toIso(row.createdAt),
    };
  };

  private toIso(d: Date | string | null | undefined): string {
    if (!d) return new Date().toISOString();
    if (typeof d === 'string') return d;
    return d.toISOString();
  }
}
