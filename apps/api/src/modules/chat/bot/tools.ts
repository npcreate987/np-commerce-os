/**
 * Phase 9.3 — Chatbot tools.
 *
 * Each tool is a pure async function `(ctx, args) => result`. The chat service
 * decides which tool to call based on the inferred intent (see ./intent.ts) and
 * the optional LLM "function-calling" output. Results are JSON-serialized and
 * stored on the message row, so the conversation history is fully reproducible.
 *
 * Tools are intentionally narrow:
 *   - They always run as the authenticated user (no cross-tenant data leak).
 *   - They return shapes optimized for ChatGPT-style summarization AND for the
 *     deterministic-renderer fallback, so the bot still works when no LLM is
 *     configured.
 */

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { OrderService } from '../../order/order.service';
import { DisputeService } from '../../dispute/dispute.service';
import { ReviewService } from '../../review/review.service';
import { ProactiveService } from '../../proactive/proactive.service';

export interface ToolCtx {
  userId: string;
  prisma: PrismaService;
  orders: OrderService;
  disputes: DisputeService;
  reviews: ReviewService;
  proactive: ProactiveService;
  /** Phase 10.3 — optional client-side context the widget passes through. */
  context?: {
    productId?: string;
    shopId?: string;
    surface?: string;
  };
}

export type ToolName =
  | 'lookup_order'
  | 'list_my_orders'
  | 'recent_disputes'
  | 'pending_reviews'
  | 'policy_info'
  | 'request_human_handoff'
  // Phase 10.3
  | 'recent_browse'
  | 'product_context';

export interface ToolResult {
  ok: boolean;
  /** Compact summary text the deterministic renderer falls back to. */
  summary: string;
  data?: unknown;
  /** UI suggested actions to render under the assistant message. */
  actions?: Array<{
    label: string;
    href?: string;
    send?: string;
  }>;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────────────── */

function formatTHB(cents: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function shortDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const ORDER_ID_PATTERN = /\b(ord_[a-z0-9]+|ord-[a-z0-9]+|ord[_-]?[a-z0-9]{4,})\b/i;

export function extractOrderId(text: string): string | null {
  const m = text.match(ORDER_ID_PATTERN);
  if (!m) return null;
  return m[1].toLowerCase().replace(/^ord[-_]?/, 'ord_');
}

/* ──────────────────────────────────────────────────────────────────────────
 * Tools
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Find a specific order (current user only). Falls back to "list my latest 5"
 * if no orderId is provided.
 */
export async function lookupOrder(
  ctx: ToolCtx,
  args: { orderId?: string | null },
): Promise<ToolResult> {
  if (!args.orderId) {
    return listMyOrders(ctx, { limit: 5 });
  }
  try {
    const order = await ctx.orders.getOne(ctx.userId, 'CUSTOMER', args.orderId);
    const lines: string[] = [];
    lines.push(`คำสั่งซื้อ ${order.id} — สถานะ: ${order.status}`);
    lines.push(`ยอดรวม ${formatTHB(order.totalCents)} (${shortDate(order.createdAt)})`);
    if (order.items?.length) {
      lines.push('รายการ:');
      for (const it of order.items.slice(0, 5)) {
        lines.push(`  • ${it.productName} × ${it.quantity}`);
      }
    }
    const actions: ToolResult['actions'] = [
      { label: 'ดูคำสั่งซื้อ', href: `/orders/${order.id}` },
    ];
    if (order.status === 'SHIPPED' || order.status === 'DELIVERED') {
      actions.push({ label: 'ติดตามพัสดุ', href: `/orders/${order.id}#shipment` });
    }
    if (order.status === 'DELIVERED' || order.status === 'COMPLETED') {
      actions.push({ label: 'รีวิวสินค้า', send: 'อยากรีวิวสินค้า' });
    }
    if (order.status === 'PAID' || order.status === 'READY_TO_SHIP') {
      actions.push({ label: 'ยกเลิกคำสั่งซื้อ', send: 'ขอยกเลิกคำสั่งซื้อนี้' });
    }
    return { ok: true, summary: lines.join('\n'), data: order, actions };
  } catch (e) {
    if (e instanceof NotFoundException || e instanceof ForbiddenException) {
      return {
        ok: false,
        summary:
          `ไม่พบคำสั่งซื้อ "${args.orderId}" หรือคุณไม่มีสิทธิ์ดู ` +
          `ลองตรวจสอบรหัสอีกครั้ง หรือดูรายการคำสั่งซื้อล่าสุดของคุณได้`,
        actions: [{ label: 'คำสั่งซื้อของฉัน', href: '/orders' }],
      };
    }
    throw e;
  }
}

export async function listMyOrders(
  ctx: ToolCtx,
  args: { limit?: number },
): Promise<ToolResult> {
  const orders = await ctx.orders.listMyOrders(ctx.userId);
  const limit = Math.min(args.limit ?? 5, 10);
  const slice = orders.slice(0, limit);
  if (!slice.length) {
    return {
      ok: true,
      summary: 'ยังไม่มีคำสั่งซื้อในระบบ — เริ่มช้อปได้ที่หน้าแรก',
      actions: [{ label: 'ไปหน้าร้าน', href: '/' }],
    };
  }
  const lines = slice.map(
    (o) =>
      `• ${o.id} — ${o.status} — ${formatTHB(o.totalCents)} (${shortDate(o.createdAt)})`,
  );
  return {
    ok: true,
    summary: `คำสั่งซื้อล่าสุด ${slice.length} รายการ:\n${lines.join('\n')}`,
    data: slice,
    actions: [{ label: 'ดูทั้งหมด', href: '/orders' }],
  };
}

export async function recentDisputes(
  ctx: ToolCtx,
  _args: Record<string, never>,
): Promise<ToolResult> {
  const list = await ctx.disputes.listMine(ctx.userId);
  if (!list.length) {
    return {
      ok: true,
      summary: 'ยังไม่มีเคสร้องเรียนค่ะ — หวังว่าทุกออเดอร์จะเรียบร้อยดี',
    };
  }
  const lines = list
    .slice(0, 5)
    .map(
      (d) =>
        `• ${d.id} — ${d.status} — สาเหตุ: ${d.reason} (${shortDate(d.createdAt)})`,
    );
  return {
    ok: true,
    summary: `เคสล่าสุด:\n${lines.join('\n')}`,
    data: list.slice(0, 5),
    actions: [{ label: 'ดูเคสทั้งหมด', href: '/account/disputes' }],
  };
}

export async function pendingReviews(
  ctx: ToolCtx,
  _args: Record<string, never>,
): Promise<ToolResult> {
  const items = await ctx.reviews.pending(ctx.userId);
  if (!items.length) {
    return {
      ok: true,
      summary: 'ยังไม่มีสินค้าที่ต้องรีวิว เยี่ยมเลย!',
    };
  }
  const lines = items
    .slice(0, 5)
    .map((it) => `• ${it.productName} (คำสั่งซื้อ ${it.orderId})`);
  return {
    ok: true,
    summary: `มีสินค้ารอรีวิว ${items.length} รายการ:\n${lines.join('\n')}`,
    data: items.slice(0, 5),
    actions: [{ label: 'รีวิวเลย', href: '/account/reviews/pending' }],
  };
}

/**
 * Static policy answers — replaces what an LLM would otherwise hallucinate.
 * Kept short; the bot UI can deep-link to the full policy page.
 */
export async function policyInfo(
  _ctx: ToolCtx,
  args: { topic?: 'shipping' | 'return' | 'payment' | 'account' | 'general' },
): Promise<ToolResult> {
  const topic = args.topic ?? 'general';
  const ANSWERS: Record<string, { summary: string; href?: string }> = {
    shipping: {
      summary:
        'การจัดส่ง: ร้านค้าจะแพ็คและส่งภายใน 1–3 วันทำการหลังคุณชำระเงิน ' +
        'ระบบจะอัปเดตเลขพัสดุให้อัตโนมัติ ตรวจสอบได้ที่หน้าคำสั่งซื้อ',
      href: '/help/shipping',
    },
    return: {
      summary:
        'การคืนสินค้า / Refund: ทุกออเดอร์มีหน้าต่าง escrow 7 วันหลังจัดส่ง ' +
        'ถ้าสินค้ามีปัญหา เปิดเคส (Dispute) ภายในระยะนี้ ระบบจะกันเงินไว้จนกว่าทั้งสองฝ่ายจะตกลงกันได้',
      href: '/help/returns',
    },
    payment: {
      summary:
        'การชำระเงิน: รองรับ PromptPay QR / โอนผ่านธนาคาร / บัตรเครดิต ' +
        'หากชำระแล้วแต่สถานะคำสั่งซื้อยังไม่อัปเดตภายใน 5 นาที โปรดติดต่อแอดมิน',
      href: '/help/payment',
    },
    account: {
      summary:
        'บัญชี: เปลี่ยนรหัสผ่าน / อีเมล / ที่อยู่ได้ที่หน้าโปรไฟล์ ' +
        'ลบบัญชี: ส่งคำขอผ่านการแชทนี้ แอดมินจะดำเนินการภายใน 7 วันทำการ',
      href: '/account',
    },
    general: {
      summary:
        'ผมช่วยตอบคำถามได้หลายเรื่อง: ติดตามคำสั่งซื้อ ตรวจสอบเคสร้องเรียน รีวิวที่รอ ' +
        'หรือพิมพ์ "ติดต่อแอดมิน" เพื่อคุยกับเจ้าหน้าที่จริง',
    },
  };
  const a = ANSWERS[topic] ?? ANSWERS.general;
  return {
    ok: true,
    summary: a.summary,
    actions: a.href ? [{ label: 'อ่านเพิ่มเติม', href: a.href }] : undefined,
  };
}

/**
 * Bot signals "please escalate to a human". The actual flip of
 * `conversation.handoffStatus = REQUESTED` happens in ChatService, this just
 * returns the user-facing acknowledgement.
 */
export async function requestHumanHandoff(
  _ctx: ToolCtx,
  args: { reason?: string },
): Promise<ToolResult> {
  return {
    ok: true,
    summary:
      'ส่งคำขอติดต่อเจ้าหน้าที่แล้วค่ะ — โดยปกติแอดมินจะตอบภายใน 1 ชั่วโมงทำการ ' +
      'ระหว่างนี้สามารถพิมพ์ข้อความเพิ่มเติมไว้ได้ เจ้าหน้าที่จะอ่านทั้งหมดเมื่อรับเรื่อง',
    data: { reason: args.reason ?? 'user_request' },
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Phase 10.3 — context-aware tools
 * ────────────────────────────────────────────────────────────────────────── */

async function recentBrowse(
  ctx: ToolCtx,
  args: { limit?: number },
): Promise<ToolResult> {
  const items = await ctx.proactive.recentBrowseSummary(
    ctx.userId,
    args.limit ?? 5,
  );
  if (items.length === 0) {
    return {
      ok: true,
      summary: 'ยังไม่มีประวัติการดูสินค้าค่ะ ลองเปิดดูสินค้าก่อนนะ',
    };
  }
  const lines = items.map(
    (it, i) =>
      `${i + 1}. ${it.name}${it.shopName ? ` (${it.shopName})` : ''}`,
  );
  return {
    ok: true,
    summary: `ของที่คุณเพิ่งดู ${items.length} ชิ้น:\n${lines.join('\n')}`,
    data: { items },
    actions: items.slice(0, 3).map((it) => ({
      label: truncateLabel(it.name, 24),
      href: `/product/${it.productId}`,
    })),
  };
}

async function productContext(
  ctx: ToolCtx,
  args: { productId?: string },
): Promise<ToolResult> {
  const productId = args.productId ?? ctx.context?.productId;
  if (!productId) {
    return {
      ok: false,
      summary: 'ไม่พบสินค้าที่กำลังดูอยู่ค่ะ ลองพิมพ์ชื่อสินค้าให้ดูแทนนะคะ',
    };
  }
  const rows = (await ctx.prisma.$queryRawUnsafe(
    `SELECT p.id, p.name, p.description, p.priceCents, p.status,
            s.id AS shopId, s.name AS shopName
     FROM products p
     LEFT JOIN shops s ON s.id = p.shopId
     WHERE p.id = ?
     LIMIT 1`,
    productId,
  )) as Array<{
    id: string;
    name: string;
    description: string | null;
    priceCents: number;
    status: string;
    shopId: string;
    shopName: string | null;
  }>;
  const row = rows[0];
  if (!row) {
    return {
      ok: false,
      summary: 'ไม่พบสินค้าชิ้นนี้ในระบบค่ะ',
    };
  }
  const summary = [
    `${row.name}${row.shopName ? ` — ${row.shopName}` : ''}`,
    `ราคา: ${formatTHB(row.priceCents)}`,
    row.status === 'ACTIVE' ? 'พร้อมส่ง' : 'สินค้าหมด/หยุดขาย',
    row.description ? `รายละเอียด: ${truncateLabel(row.description, 140)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return {
    ok: true,
    summary,
    data: {
      productId: row.id,
      name: row.name,
      priceCents: row.priceCents,
      shopId: row.shopId,
    },
    actions: [
      { label: 'เปิดดูสินค้า', href: `/product/${row.id}` },
      { label: 'ที่คุณเพิ่งดู', send: 'ของที่ฉันดู' },
    ],
  };
}

function truncateLabel(s: string, max: number): string {
  if (!s) return '';
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Dispatcher
 * ────────────────────────────────────────────────────────────────────────── */

export async function runTool(
  ctx: ToolCtx,
  name: ToolName,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case 'lookup_order':
      return lookupOrder(ctx, args as { orderId?: string });
    case 'list_my_orders':
      return listMyOrders(ctx, args as { limit?: number });
    case 'recent_disputes':
      return recentDisputes(ctx, args as Record<string, never>);
    case 'pending_reviews':
      return pendingReviews(ctx, args as Record<string, never>);
    case 'policy_info':
      return policyInfo(
        ctx,
        args as {
          topic?: 'shipping' | 'return' | 'payment' | 'account' | 'general';
        },
      );
    case 'request_human_handoff':
      return requestHumanHandoff(ctx, args as { reason?: string });
    case 'recent_browse':
      return recentBrowse(ctx, args as { limit?: number });
    case 'product_context':
      return productContext(ctx, args as { productId?: string });
    default:
      return {
        ok: false,
        summary: 'ขออภัย ยังไม่รองรับคำสั่งนี้ค่ะ',
      };
  }
}
