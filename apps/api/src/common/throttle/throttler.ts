import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';

/**
 * Phase 13.3a — Minimal in-process rate limiter.
 *
 * Why hand-rolled instead of `@nestjs/throttler`?
 *   1. Zero new dependencies (we already touched too many install loops today).
 *   2. We currently run a single API process; an in-memory map is the *correct*
 *      design at this scale. When we scale out we'll swap the backing store for
 *      Redis without changing the decorator surface (`@Throttle({...})`).
 *   3. We need per-endpoint windows + a "by IP+email" key for login that
 *      `@nestjs/throttler@5` makes verbose.
 *
 * Algorithm: sliding-window counters held in a `Map<key, hits[]>`. Old hits are
 * GC'd lazily on each request. Worst-case memory ~= active unique keys × window
 * × hits.
 */

export interface ThrottleOpts {
  /** Sliding window length in seconds. */
  windowSec: number;
  /** Max number of hits allowed inside that window. */
  max: number;
  /**
   * Optional override for the rate-limit key. Default uses client IP. Pass
   * `'ip+body.email'` to also include the request body's `email` field — useful
   * for login where one IP fronts a dorm/office of users.
   */
  keyBy?: 'ip' | 'ip+body.email';
}

export const THROTTLE_META = Symbol('np.throttle');

/** Decorator form: `@Throttle({ windowSec: 60, max: 10 })`. */
export const Throttle = (opts: ThrottleOpts): MethodDecorator & ClassDecorator =>
  SetMetadata(THROTTLE_META, opts);

// =============================================================================
// Backing store — module-singleton so the Map survives across requests.
// =============================================================================

const buckets = new Map<string, number[]>();

function pushHit(key: string, windowMs: number, now: number): number {
  const arr = buckets.get(key) ?? [];
  // GC: drop hits older than the window
  const cutoff = now - windowMs;
  let i = 0;
  while (i < arr.length && arr[i] < cutoff) i++;
  const trimmed = i > 0 ? arr.slice(i) : arr;
  trimmed.push(now);
  buckets.set(key, trimmed);
  return trimmed.length;
}

// Periodic full sweep — cheap insurance against unbounded growth from keys
// that hit once and never come back. Runs every 5 minutes.
const SWEEP_MS = 5 * 60 * 1000;
let sweepHandle: ReturnType<typeof setInterval> | null = null;
function ensureSweep(maxWindowMs: number): void {
  if (sweepHandle) return;
  sweepHandle = setInterval(() => {
    const cutoff = Date.now() - maxWindowMs;
    for (const [k, arr] of buckets) {
      if (arr.length === 0 || arr[arr.length - 1] < cutoff) buckets.delete(k);
    }
  }, SWEEP_MS).unref();
}

// =============================================================================
// Guard — reads metadata, computes the key, enforces the budget.
// =============================================================================

@Injectable()
export class ThrottleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const opts = this.reflector.getAllAndOverride<ThrottleOpts | undefined>(
      THROTTLE_META,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!opts) return true;

    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const ip = clientIp(req);
    let key = `${req.routerPath}::ip:${ip}`;
    if (opts.keyBy === 'ip+body.email') {
      const email = (req.body as { email?: unknown } | undefined)?.email;
      if (typeof email === 'string') {
        key += `::email:${email.toLowerCase().slice(0, 200)}`;
      }
    }

    const windowMs = opts.windowSec * 1000;
    ensureSweep(Math.max(windowMs, 60_000));
    const hits = pushHit(key, windowMs, Date.now());
    if (hits > opts.max) {
      // RFC 6585 — Too Many Requests
      throw new HttpException(
        {
          statusCode: 429,
          message: `ส่งคำขอเร็วเกินไป — รออีก ${opts.windowSec}s แล้วลองใหม่`,
          retryAfterSec: opts.windowSec,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}

function clientIp(req: FastifyRequest): string {
  // Fastify's `trustProxy: true` populates `req.ip` from `x-forwarded-for`.
  // Fall back to the socket address only when the proxy header is missing.
  const ip = (req.ip ?? req.socket?.remoteAddress ?? '0.0.0.0').trim();
  // IPv6-mapped IPv4 like ::ffff:1.2.3.4 → 1.2.3.4 for cleaner keys
  return ip.replace(/^::ffff:/, '');
}

// =============================================================================
// Diagnostic helper for tests / runbook.
// =============================================================================

export function _throttleSize(): number {
  return buckets.size;
}

export function _throttleReset(): void {
  buckets.clear();
}
