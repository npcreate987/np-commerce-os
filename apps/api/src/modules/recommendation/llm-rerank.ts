/**
 * Phase 10.2 — Optional LLM rerank stage.
 *
 * Takes the top-K candidates produced by the deterministic ranker
 * (`forYou2`), serialises a compact summary of each, plus a one-line taste
 * snapshot for the user, and asks the LLM:
 *
 *   "Reorder these IDs so the most likely to delight the user comes first."
 *
 * Hallucination guard: the response is parsed as JSON, then EVERY returned
 * ID is checked against the input set. Unknown IDs are silently dropped.
 * Anything missing from the response is appended at the end in original
 * order. This means the LLM literally cannot inject a fake product.
 *
 *   Provider selection: same env-driven `LLM_PROVIDER` switch as the
 *   chatbot. Enable with `LLM_RERANK_ENABLED=true` (off by default — costs
 *   money and adds 200-800ms latency).
 */

import {
  ProductRecommendation,
  TasteProfileSummary,
} from '../../shared/types';
import { getLLMProvider } from '../chat/bot/llm';

interface RerankInput {
  user: TasteProfileSummary | null;
  candidates: ProductRecommendation[];
  /** How many final items to keep. Defaults to candidates.length. */
  topK?: number;
}

interface RerankResult {
  ranked: ProductRecommendation[];
  provider: 'none' | 'openai' | 'anthropic';
  durationMs: number;
  fellBack: boolean;
  error?: string;
}

const SYSTEM = `You are a product-feed rerank engine.
Inputs:
  - "user" : a JSON summary of the customer's recent shopping behaviour.
  - "candidates" : an array of products with id, name, price, shopName, and
    a tentative "reason" from a deterministic ranker.

Task: return ONLY a JSON array of candidate IDs, ordered best→worst for this
specific customer. Optimise for engagement and conversion.

Hard rules:
  1. You MUST only return ids that appear in candidates.
  2. You MUST return at most ${'${TOP_K}'} ids.
  3. Output must be raw JSON (no markdown fences, no commentary).
  4. If you are unsure, preserve the original order.
`;

function buildUserPayload(input: RerankInput): string {
  const user = input.user;
  const userBrief = user
    ? {
        topShops: user.topShops.slice(0, 5).map((s) => ({
          name: s.shopName ?? s.shopId,
          weight: round2(s.weight),
        })),
        topTags: user.topTags.slice(0, 8).map((t) => ({
          tag: t.token,
          weight: round2(t.weight),
        })),
        priceMedianCents: user.priceMedianCents,
        eventCount: user.eventCount,
      }
    : { cold: true };

  const cands = input.candidates.slice(0, 30).map((c) => ({
    id: c.productId,
    name: c.name.slice(0, 80),
    priceCents: c.priceCents,
    shop: c.shopName ?? c.shopId,
    reason: c.reason,
  }));

  return JSON.stringify({ user: userBrief, candidates: cands });
}

export async function rerankWithLLM(
  input: RerankInput,
): Promise<RerankResult> {
  const enabled = process.env.LLM_RERANK_ENABLED === 'true';
  const provider = enabled ? getLLMProvider() : 'none';
  const started = Date.now();

  if (provider === 'none' || input.candidates.length <= 1) {
    return {
      ranked: input.candidates,
      provider: 'none',
      durationMs: Date.now() - started,
      fellBack: true,
    };
  }

  const topK = input.topK ?? input.candidates.length;
  const system = SYSTEM.replace('${TOP_K}', String(topK));
  const userPayload = buildUserPayload(input);

  // 4s timeout — feed responsiveness > LLM-perfect order
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 4000);
  let text = '';
  try {
    text =
      provider === 'openai'
        ? await callOpenAIRerank(system, userPayload, ac.signal)
        : await callAnthropicRerank(system, userPayload, ac.signal);
  } catch (e) {
    return {
      ranked: input.candidates,
      provider,
      durationMs: Date.now() - started,
      fellBack: true,
      error: (e as Error).message,
    };
  } finally {
    clearTimeout(timer);
  }

  const ids = parseIds(text);
  if (ids.length === 0) {
    return {
      ranked: input.candidates,
      provider,
      durationMs: Date.now() - started,
      fellBack: true,
      error: 'parse_failed',
    };
  }

  const byId = new Map(input.candidates.map((c) => [c.productId, c] as const));
  const seen = new Set<string>();
  const reordered: ProductRecommendation[] = [];
  for (const id of ids) {
    if (!byId.has(id) || seen.has(id)) continue; // hallucination guard
    seen.add(id);
    reordered.push(byId.get(id)!);
    if (reordered.length >= topK) break;
  }
  // Backfill any candidates the LLM forgot about — preserve original order.
  for (const c of input.candidates) {
    if (reordered.length >= topK) break;
    if (!seen.has(c.productId)) reordered.push(c);
  }

  return {
    ranked: reordered,
    provider,
    durationMs: Date.now() - started,
    fellBack: false,
  };
}

// ── Providers (REST direct, no SDKs) ─────────────────────────────────────

async function callOpenAIRerank(
  system: string,
  user: string,
  signal: AbortSignal,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');
  const model = process.env.OPENAI_RERANK_MODEL ?? process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o-mini';
  const base = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      max_tokens: 600,
    }),
    signal,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`openai ${res.status}: ${txt.slice(0, 200)}`);
  }
  const j = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return j.choices?.[0]?.message?.content?.trim() ?? '';
}

async function callAnthropicRerank(
  system: string,
  user: string,
  signal: AbortSignal,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');
  const model =
    process.env.ANTHROPIC_RERANK_MODEL ??
    process.env.ANTHROPIC_CHAT_MODEL ??
    'claude-3-5-haiku-latest';
  const base = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com/v1';
  const res = await fetch(`${base}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: user }],
      temperature: 0.2,
    }),
    signal,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`anthropic ${res.status}: ${txt.slice(0, 200)}`);
  }
  const j = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  return (j.content?.find((c) => c.type === 'text')?.text ?? '').trim();
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Best-effort JSON-array extraction. Accepts:
 *   - bare array: ["id1","id2"]
 *   - wrapped: { "ids": [...] } or { "ranked": [...] }
 *   - markdown-fenced code despite the rules (be tolerant)
 */
function parseIds(raw: string): string[] {
  if (!raw) return [];
  let s = raw.trim();
  // Strip ``` fences if present
  if (s.startsWith('```')) {
    s = s.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
  }
  try {
    const j = JSON.parse(s) as unknown;
    if (Array.isArray(j)) return j.filter((x): x is string => typeof x === 'string');
    if (j && typeof j === 'object') {
      const obj = j as Record<string, unknown>;
      for (const key of ['ids', 'ranked', 'order', 'result']) {
        const arr = obj[key];
        if (Array.isArray(arr)) {
          return arr.filter((x): x is string => typeof x === 'string');
        }
      }
    }
  } catch {
    // fall through
  }
  return [];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
