/**
 * Phase 9.3 — Deterministic intent classifier.
 *
 * The chatbot uses this *before* any LLM call: most CS questions are short,
 * routine, and benefit from a fast no-network response. If `classify()`
 * returns UNKNOWN we then optionally fall through to an LLM (if configured).
 *
 * The classifier is rule-based — Thai and English keyword/regex matching with
 * cheap scoring. It is intentionally biased toward action intents (lookup
 * order, etc.) so users get useful answers even when wording is awkward.
 */

import { ChatIntent } from '../../../shared/types';

export interface IntentResult {
  intent: ChatIntent;
  /** 0..1 confidence based on keyword density. */
  confidence: number;
  /** Whichever keywords matched, for debugging / admin views. */
  matched: string[];
}

interface Rule {
  intent: ChatIntent;
  /** Words / phrases (case-insensitive) — matched as plain substrings. */
  any?: string[];
  /** Regexes (already case-insensitive). */
  re?: RegExp[];
  /** Score boost so e.g. an exact "ติดตามพัสดุ" wins over plain "ของ". */
  weight?: number;
}

const RULES: Rule[] = [
  {
    intent: 'GREETING',
    any: [
      'สวัสดี',
      'หวัดดี',
      'hello',
      'hi',
      'hey',
      'ดีจ้า',
      'ดีครับ',
      'ดีค่ะ',
    ],
    weight: 1.2,
  },
  {
    intent: 'TRACK_ORDER',
    any: [
      'ติดตามพัสดุ',
      'ติดตามคำสั่งซื้อ',
      'ของยังไม่ถึง',
      'พัสดุอยู่ไหน',
      'ของหายเหรอ',
      'สถานะออเดอร์',
      'สถานะคำสั่งซื้อ',
      'track',
      'tracking',
      'order status',
      'where is my order',
    ],
    re: [/\bord[_-]?\w{4,}/i],
    weight: 1.5,
  },
  {
    intent: 'LIST_MY_ORDERS',
    any: [
      'คำสั่งซื้อของฉัน',
      'ออเดอร์ของฉัน',
      'ดูออเดอร์',
      'ออเดอร์ล่าสุด',
      'รายการสั่งซื้อ',
      'my orders',
      'list orders',
      'order history',
    ],
    weight: 1.3,
  },
  {
    intent: 'CANCEL_ORDER',
    any: [
      'ยกเลิกคำสั่งซื้อ',
      'ยกเลิกออเดอร์',
      'ขอยกเลิก',
      'cancel order',
      'cancel my order',
    ],
    weight: 1.5,
  },
  {
    intent: 'OPEN_DISPUTE',
    any: [
      'เปิดเคส',
      'ร้องเรียน',
      'ขอเงินคืน',
      'refund',
      'ขอคืนเงิน',
      'สินค้าเสียหาย',
      'สินค้าผิด',
      'สินค้าไม่ตรงปก',
      'dispute',
      'complaint',
      'claim',
    ],
    weight: 1.5,
  },
  {
    intent: 'LIST_MY_DISPUTES',
    any: ['เคสของฉัน', 'เรื่องร้องเรียนของฉัน', 'my disputes', 'my claims'],
    weight: 1.3,
  },
  {
    intent: 'PENDING_REVIEWS',
    any: [
      'รีวิวที่รอ',
      'รีวิวสินค้า',
      'อยากรีวิว',
      'pending reviews',
      'review pending',
      'รีวิวที่ยังไม่ทำ',
    ],
    weight: 1.3,
  },
  {
    intent: 'SHIPPING_POLICY',
    any: [
      'นโยบายการจัดส่ง',
      'ส่งกี่วัน',
      'จัดส่งกี่วัน',
      'ขนส่งอะไร',
      'shipping policy',
      'how long shipping',
    ],
    weight: 1.2,
  },
  {
    intent: 'RETURN_POLICY',
    any: [
      'นโยบายคืนสินค้า',
      'คืนสินค้า',
      'คืนเงิน',
      'return policy',
      'refund policy',
    ],
    weight: 1.2,
  },
  {
    intent: 'PAYMENT_HELP',
    any: [
      'ชำระเงิน',
      'จ่ายเงิน',
      'พร้อมเพย์',
      'promptpay',
      'qr code',
      'บัตรเครดิต',
      'payment',
      'pay',
      'จ่ายยังไง',
    ],
    weight: 1.2,
  },
  {
    intent: 'ACCOUNT_HELP',
    any: [
      'ลืมรหัสผ่าน',
      'เปลี่ยนรหัสผ่าน',
      'เปลี่ยนอีเมล',
      'ลบบัญชี',
      'forgot password',
      'reset password',
      'change email',
      'delete account',
    ],
    weight: 1.2,
  },
  {
    intent: 'HUMAN_HANDOFF',
    any: [
      'คุยกับแอดมิน',
      'ติดต่อแอดมิน',
      'ขอเจ้าหน้าที่',
      'คุยกับคน',
      'human',
      'live agent',
      'real person',
      'agent',
      'support team',
      'admin',
      'ติดต่อเจ้าหน้าที่',
    ],
    weight: 1.4,
  },
  {
    intent: 'BROWSE_HELP',
    any: [
      'แนะนำสินค้า',
      'ช่วยแนะนำ',
      'ของที่ดู',
      'ของที่ฉันดู',
      'เปรียบเทียบ',
      'ตัวไหนดี',
      'อันไหนดี',
      'recommend',
      'compare',
      'help me choose',
      'which one',
    ],
    weight: 1.2,
  },
  {
    intent: 'SMALLTALK',
    any: ['ขอบคุณ', 'ขอบคุณค่ะ', 'thank', 'thanks', 'thx', 'โอเค', 'ok'],
    weight: 0.6,
  },
];

const STRIP = /[\u200B\u200C\u200D\uFEFF]/g;

function normalize(s: string): string {
  return s.replace(STRIP, '').toLowerCase().trim();
}

export function classify(text: string): IntentResult {
  const norm = normalize(text);
  if (!norm) {
    return { intent: 'UNKNOWN', confidence: 0, matched: [] };
  }

  let best: IntentResult = { intent: 'UNKNOWN', confidence: 0, matched: [] };

  for (const rule of RULES) {
    const matched: string[] = [];
    let score = 0;

    if (rule.any) {
      for (const kw of rule.any) {
        if (norm.includes(kw.toLowerCase())) {
          matched.push(kw);
          score += 1;
        }
      }
    }
    if (rule.re) {
      for (const re of rule.re) {
        if (re.test(norm)) {
          matched.push(re.source);
          score += 1.5;
        }
      }
    }

    if (score === 0) continue;
    const weighted = score * (rule.weight ?? 1);
    const confidence = Math.min(1, weighted / 3);
    if (confidence > best.confidence) {
      best = { intent: rule.intent, confidence, matched };
    }
  }

  return best;
}
