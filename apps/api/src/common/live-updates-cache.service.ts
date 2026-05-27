import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

/**
 * Phase 19.3 — Persistent OTA manifest override store.
 *
 * Architecture: two-tier (Postgres + in-memory mirror)
 *
 *   - **Postgres** (`live_update_manifests` table) is the durable source
 *     of truth. Webhook writes here via upsert. Survives every Railway
 *     redeploy / OOM / process panic / scale event.
 *
 *   - **In-memory `Map<channel, override>`** is a read-through mirror.
 *     Rehydrated from Postgres in `onModuleInit()`, then kept in sync
 *     by `update()`. `GET /manifest` reads ONLY from memory so we never
 *     hit the DB on the hot path (manifest endpoint is called by every
 *     mobile cold-start + every 6h per device — could be 10K+ req/min
 *     at scale).
 *
 * Why this beats the v1 cache (Phase 19):
 *
 *   v1 was in-memory only. Pushing any code change to `main` triggered
 *   Railway auto-deploy → new process started with empty cache →
 *   manifest reverted to `initial` until the next workflow re-asserted
 *   it. That meant "every code push silently breaks OTA for ~10
 *   minutes" — see commit 27d9de1 for the verification.
 *
 *   v1.1 (this file) rehydrates from Postgres on boot, so the manifest
 *   carries across restarts. Boot adds one `findMany()` round-trip to
 *   the API startup sequence (~5-50 ms, well within the existing
 *   health-check timeout of 120s set in `railway.json`).
 *
 * Concurrency
 *
 *   JS is single-threaded so memory reads/writes don't race. Postgres
 *   upsert is atomic. If two webhooks fire for the same channel back-
 *   to-back, the last write wins — which is the desired semantic.
 *
 *   Multi-instance is NOT covered: if we ever scale Railway to N>1
 *   replicas, only the replica that handled the webhook will have
 *   fresh memory; others stay on their boot-time snapshot until they
 *   either restart or we add a pubsub channel (Postgres LISTEN/NOTIFY
 *   or Redis). Note: railway.json pins `numReplicas: 1` today so this
 *   is not a near-term concern.
 *
 * Failure modes
 *
 *   - DB unreachable on boot → log warning + start with empty memory.
 *     Manifest endpoint falls back to env vars. NOT a fatal error.
 *   - DB unreachable on write → webhook returns 500 (not 200). CI
 *     workflow will surface the failure as a red build. This is the
 *     desired behavior — we MUST NOT acknowledge a webhook we didn't
 *     persist (silent data loss is worse than a loud failure).
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
export class LiveUpdatesCacheService implements OnModuleInit {
  private readonly log = new Logger(LiveUpdatesCacheService.name);
  private readonly store = new Map<string, LiveUpdateOverride>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    // Rehydrate in-memory mirror from Postgres. Non-fatal on failure:
    // if Postgres is down we want the API to still come up (manifest
    // endpoint will simply fall back to env vars).
    try {
      const rows = await this.prisma.liveUpdateManifest.findMany();
      for (const row of rows) {
        this.store.set(row.channel, {
          channel: row.channel,
          version: row.version,
          buildId: row.buildId,
          url: row.url,
          checksum: row.checksum,
          size: row.size,
          rolloutPct: row.rolloutPct,
          minNativeVersion: row.minNativeVersion ?? undefined,
          updatedAt: row.updatedAt.toISOString(),
        });
      }
      this.log.log(
        `Rehydrated ${rows.length} OTA override(s) from db: [${rows.map((r) => r.channel).join(', ')}]`,
      );
    } catch (err) {
      this.log.warn(
        `Failed to rehydrate OTA overrides from db -- starting with empty cache. ` +
          `Manifest endpoint will fall back to env vars until the next webhook fires. ` +
          `Error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  get(channel: string): LiveUpdateOverride | undefined {
    return this.store.get(channel);
  }

  /**
   * Apply an override. Writes to Postgres FIRST, then mirror to memory
   * only on successful persistence. Returns the entry with its
   * server-assigned `updatedAt`.
   *
   * Throws if the Postgres upsert fails — caller (webhook controller)
   * must propagate as a 500 so CI sees a red build.
   */
  async update(payload: Omit<LiveUpdateOverride, 'updatedAt'>): Promise<LiveUpdateOverride> {
    const data = {
      channel: payload.channel,
      version: payload.version,
      buildId: payload.buildId,
      url: payload.url,
      checksum: payload.checksum,
      size: payload.size,
      rolloutPct: payload.rolloutPct,
      minNativeVersion: payload.minNativeVersion ?? null,
    };

    const row = await this.prisma.liveUpdateManifest.upsert({
      where: { channel: payload.channel },
      create: data,
      update: data,
    });

    const entry: LiveUpdateOverride = {
      channel: row.channel,
      version: row.version,
      buildId: row.buildId,
      url: row.url,
      checksum: row.checksum,
      size: row.size,
      rolloutPct: row.rolloutPct,
      minNativeVersion: row.minNativeVersion ?? undefined,
      updatedAt: row.updatedAt.toISOString(),
    };
    this.store.set(payload.channel, entry);

    this.log.log(
      `OTA manifest override persisted: channel=${entry.channel} buildId=${entry.buildId} rolloutPct=${entry.rolloutPct}`,
    );
    return entry;
  }

  /** Test/admin escape hatch — clear all overrides (env vars take over). */
  async clear(): Promise<void> {
    await this.prisma.liveUpdateManifest.deleteMany();
    this.store.clear();
  }

  /** Debug introspection — list all current overrides. */
  list(): LiveUpdateOverride[] {
    return Array.from(this.store.values());
  }
}
