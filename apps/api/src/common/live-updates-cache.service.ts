import { Injectable, Logger } from '@nestjs/common';

/**
 * Phase 19 — In-memory override cache for OTA manifest metadata.
 *
 * Why a cache and not just env vars?
 *
 *   The OTA pipeline (`.github/workflows/mobile-live-update.yml`) needs to
 *   tell every API instance "here's the new bundle URL + checksum" right
 *   after it finishes uploading the zip to R2. Without this cache the only
 *   way to do that is to redeploy the API with new env vars, which costs
 *   ~30-60s of downtime per OTA release. That's untenable when we ship
 *   3-5 OTAs per week.
 *
 *   So instead the workflow POSTs an HMAC-signed payload to
 *   `POST /v1/app/live-updates/webhook`, which writes the new values into
 *   this service. `GET /manifest` then reads from here first and falls
 *   back to the matching `LIVE_UPDATES_*` env var if no override exists
 *   for the requested channel.
 *
 * Limitations (intentional for v1)
 *
 *   - In-memory only. If the API process restarts (Railway redeploy, OOM,
 *     panic) the cache is gone and we fall back to env vars until the
 *     next CI run pushes the override again. Acceptable because:
 *       a) The env vars hold the *last shipped* bundle anyway, so users
 *          aren't stuck on a stale version after restart — they just stop
 *          getting the very latest until CI re-asserts.
 *       b) Restarts are rare in steady state.
 *       c) Persisting to Postgres can land in 19.1 without a schema
 *          break — this service is the only writer.
 *
 *   - Single-process. If we run multiple API instances behind a load
 *     balancer the webhook only updates one of them; others stay on env
 *     vars until they're also POSTed to. Mitigation: Railway runs a
 *     single instance by default in our tier. When we scale out (Phase
 *     19.5+) we'll add Redis pubsub here.
 *
 * Concurrency
 *
 *   JavaScript single-threaded model means `update()` and `get()` never
 *   race. Map operations are atomic at the engine level. No mutex needed.
 */
export interface LiveUpdateOverride {
  /** "production" | "beta" — keyed separately so canary doesn't leak into prod */
  channel: string;
  version: string;
  buildId: string;
  url: string;
  checksum: string;
  size: number;
  rolloutPct: number;
  /** Optional — falls back to LIVE_UPDATES_MIN_NATIVE_VERSION env if absent */
  minNativeVersion?: string;
  /** When this override was applied — useful for debugging stale caches */
  updatedAt: string;
}

@Injectable()
export class LiveUpdatesCacheService {
  private readonly log = new Logger(LiveUpdatesCacheService.name);
  private readonly store = new Map<string, LiveUpdateOverride>();

  get(channel: string): LiveUpdateOverride | undefined {
    return this.store.get(channel);
  }

  update(payload: Omit<LiveUpdateOverride, 'updatedAt'>): LiveUpdateOverride {
    const entry: LiveUpdateOverride = {
      ...payload,
      updatedAt: new Date().toISOString(),
    };
    this.store.set(payload.channel, entry);
    this.log.log(
      `OTA manifest override applied: channel=${entry.channel} buildId=${entry.buildId} rolloutPct=${entry.rolloutPct}`,
    );
    return entry;
  }

  /** Test/admin escape hatch — clear all overrides (env vars take over). */
  clear(): void {
    this.store.clear();
  }

  /** Debug introspection — list all current overrides. */
  list(): LiveUpdateOverride[] {
    return Array.from(this.store.values());
  }
}
