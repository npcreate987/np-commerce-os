/**
 * Phase 9.3 — Optional LLM rephraser.
 *
 * The deterministic bot (intent classifier + tools) is the SOURCE OF TRUTH. An
 * LLM is only used to:
 *   1. Rephrase the tool result into natural Thai.
 *   2. (Future) propose a tool call when the intent classifier returned
 *      UNKNOWN with low confidence.
 *
 * Why this shape: we never let the LLM make up data — it only paraphrases
 * factual JSON we already produced. This eliminates hallucination of order IDs,
 * tracking numbers, prices, etc.
 *
 * Providers (chosen by env):
 *   - LLM_PROVIDER=openai     → uses OpenAI Chat Completions HTTP API
 *   - LLM_PROVIDER=anthropic  → uses Anthropic Messages HTTP API
 *   - LLM_PROVIDER=none (or unset) → noop (the deterministic summary is used)
 *
 * No SDK packages required: we call REST directly with `fetch`. Keeps the
 * dependency surface tiny and lets the app boot when no key is set.
 */

import { ChatRole } from '../../../shared/types';

export type LLMProvider = 'none' | 'openai' | 'anthropic';

export interface LLMTurn {
  role: ChatRole;
  content: string;
}

export interface LLMResult {
  ok: boolean;
  text: string;
  /** Provider used, or 'none' if we skipped the call. */
  provider: LLMProvider;
  durationMs: number;
  error?: string;
}

function resolveProvider(): LLMProvider {
  const env = (process.env.LLM_PROVIDER ?? '').toLowerCase();
  if (env === 'openai' || env === 'anthropic' || env === 'none') {
    return env;
  }
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return 'none';
}

export function getLLMProvider(): LLMProvider {
  return resolveProvider();
}

const SYSTEM_PROMPT = `คุณคือ "พี่ปัน" ผู้ช่วยลูกค้าของแพลตฟอร์ม np-commerce
ภารกิจของคุณ: เรียบเรียงข้อมูลจากระบบ (ส่วน "FACTS") ให้เป็นคำตอบภาษาไทยสั้น สุภาพ และเป็นมิตร
กฎ:
1) ห้ามแต่งข้อมูลเพิ่มเอง — ใช้เฉพาะที่อยู่ใน FACTS
2) ห้ามสร้าง orderId / tracking / ราคา / ลิงก์ ที่ไม่ปรากฏใน FACTS
3) ตอบสั้นกระชับ (ไม่เกิน 3 ย่อหน้า) ใช้สรรพนาม "ค่ะ" หรือ "ครับ" ก็ได้
4) ถ้า FACTS เป็นความล้มเหลว ให้บอกผู้ใช้ตามจริง พร้อมเสนอทางเลือก`;

/* ──────────────────────────────────────────────────────────────────────────
 * OpenAI
 * ────────────────────────────────────────────────────────────────────────── */

async function callOpenAI(
  history: LLMTurn[],
  facts: string,
  userText: string,
  signal: AbortSignal,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');
  const model = process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o-mini';
  const base = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-6).map((t) => ({
      role: t.role === 'USER' ? 'user' : t.role === 'ASSISTANT' ? 'assistant' : 'system',
      content: t.content,
    })),
    {
      role: 'system',
      content: `FACTS (ใช้ตอบคำถามต่อไปนี้เท่านั้น):\n${facts}`,
    },
    { role: 'user', content: userText },
  ];

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: 400,
    }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`openai ${res.status}: ${text.slice(0, 200)}`);
  }
  const j = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return j.choices?.[0]?.message?.content?.trim() ?? '';
}

/* ──────────────────────────────────────────────────────────────────────────
 * Anthropic
 * ────────────────────────────────────────────────────────────────────────── */

async function callAnthropic(
  history: LLMTurn[],
  facts: string,
  userText: string,
  signal: AbortSignal,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');
  const model = process.env.ANTHROPIC_CHAT_MODEL ?? 'claude-3-5-haiku-latest';
  const base = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com/v1';

  const messages = [
    ...history
      .slice(-6)
      .filter((t) => t.role === 'USER' || t.role === 'ASSISTANT')
      .map((t) => ({
        role: t.role === 'USER' ? 'user' : 'assistant',
        content: t.content,
      })),
    {
      role: 'user',
      content: `FACTS (ใช้ตอบคำถามต่อไปนี้เท่านั้น):\n${facts}\n\nคำถามของลูกค้า: ${userText}`,
    },
  ];

  const res = await fetch(`${base}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages,
      temperature: 0.3,
    }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`anthropic ${res.status}: ${text.slice(0, 200)}`);
  }
  const j = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  return (j.content?.find((c) => c.type === 'text')?.text ?? '').trim();
}

/* ──────────────────────────────────────────────────────────────────────────
 * Public
 * ────────────────────────────────────────────────────────────────────────── */

export async function rephrase(
  history: LLMTurn[],
  facts: string,
  userText: string,
  opts: { timeoutMs?: number } = {},
): Promise<LLMResult> {
  const provider = resolveProvider();
  const t0 = Date.now();
  if (provider === 'none') {
    return { ok: false, text: '', provider: 'none', durationMs: 0 };
  }
  const ac = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const to = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const text =
      provider === 'openai'
        ? await callOpenAI(history, facts, userText, ac.signal)
        : await callAnthropic(history, facts, userText, ac.signal);
    return {
      ok: Boolean(text),
      text: text || '',
      provider,
      durationMs: Date.now() - t0,
    };
  } catch (e) {
    return {
      ok: false,
      text: '',
      provider,
      durationMs: Date.now() - t0,
      error: e instanceof Error ? e.message : 'llm error',
    };
  } finally {
    clearTimeout(to);
  }
}
