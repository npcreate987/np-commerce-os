/**
 * Phase 10.1 — EventsService.
 *
 * The single ingestion path for behavioural telemetry. Every interaction in the
 * web app (and eventually the mobile shell) lands here. Designed for high
 * write volume; the 10.2 ranker will subscribe to the same table to learn user
 * tastes.
 *
 * Design choices:
 *   - INSERT in a single transaction per batch (SQLite throughput pattern).
 *   - Server-side dedupe: drop events that share (sessionId, kind, entityId)
 *     within a 1-second window — common bounce when React Strict Mode mounts
 *     a component twice in dev.
 *   - Opt-out gate is checked once per batch (per userId) — not per event.
 *   - Anonymous tracking still records anonId; a follow-up `linkAnon()` call
 *     stitches history to a userId at login time.
 *   - Never throws on the hot path — failures are logged and dropped so a bad
 *     event payload doesn't kill the user's request.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  EventFirehoseStats,
  StartSessionInput,
  TrackBatchInput,
  UserEvent,
  UserEventInput,
  UserEventKind,
} from '../../shared/types';
import { ConsentService } from './consent.service';

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

interface DbEvent {
  id: string;
  userId: string | null;
  anonId: string | null;
  sessionId: string;
  kind: string;
  entityType: string | null;
  entityId: string | null;
  surface: string | null;
  metaJson: string;
  dwellMs: number | null;
  scrollPct: number | null;
  ts: Date | string;
}

interface IngestContext {
  userId: string | null;
  ip?: string | null;
  userAgent?: string | null;
  referrer?: string | null;
}

interface IngestResult {
  accepted: number;
  dropped: number;
  reason?: string;
}

type IngestListener = (userIds: Set<string>) => void;

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private listeners: IngestListener[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: ConsentService,
  ) {}

  /**
   * Phase 10.2 hook — registered by TasteWorker at boot. Anything that needs
   * to react to fresh firehose activity (e.g. user-profile rebuild,
   * realtime-personalisation cache) can subscribe here without creating a
   * circular module dependency.
   */
  registerIngestListener(cb: IngestListener): void {
    this.listeners.push(cb);
  }

  private notifyListeners(userIds: Set<string>): void {
    if (userIds.size === 0 || this.listeners.length === 0) return;
    for (const cb of this.listeners) {
      try {
        cb(userIds);
      } catch (e) {
        this.logger.warn(`ingest listener failed: ${(e as Error).message}`);
      }
    }
  }

  /* ────────────────────────────────────────────────────────────────────
   * Sessions
   * ──────────────────────────────────────────────────────────────────── */

  async startSession(
    userId: string | null,
    input: StartSessionInput,
  ): Promise<{ sessionId: string; anonId: string; startedAt: string }> {
    const sessionId = newId('ses');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO user_sessions
        (id, anonId, userId, userAgent, platform, startedAt, lastSeenAt, eventCount)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)`,
      sessionId,
      input.anonId,
      userId,
      input.userAgent ?? null,
      input.platform ?? null,
    );
    return {
      sessionId,
      anonId: input.anonId,
      startedAt: new Date().toISOString(),
    };
  }

  /** Called on login: stitch all anonymous activity to the new userId so the
   *  ranker sees a continuous history. */
  async linkAnonToUser(anonId: string, userId: string): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(
        `UPDATE user_events SET userId = ?
           WHERE anonId = ? AND (userId IS NULL OR userId = '')`,
        userId,
        anonId,
      );
      await this.prisma.$executeRawUnsafe(
        `UPDATE user_sessions SET userId = ?
           WHERE anonId = ? AND (userId IS NULL OR userId = '')`,
        userId,
        anonId,
      );
    } catch (e) {
      this.logger.warn(`linkAnonToUser failed: ${(e as Error).message}`);
    }
    // Trigger immediate taste rebuild — the user just got a chunk of new
    // history attributed to them.
    this.notifyListeners(new Set([userId]));
  }

  /* ────────────────────────────────────────────────────────────────────
   * Ingestion
   * ──────────────────────────────────────────────────────────────────── */

  async ingestBatch(
    ctx: IngestContext,
    input: TrackBatchInput,
  ): Promise<IngestResult> {
    if (await this.consent.isBehavioralOptedOut(ctx.userId)) {
      return { accepted: 0, dropped: input.events.length, reason: 'OPTED_OUT' };
    }

    const events = input.events;
    if (events.length === 0) return { accepted: 0, dropped: 0 };

    // ── 1. Dedupe within batch (same sessionId+kind+entityId in same second) ──
    const seen = new Set<string>();
    const filtered: UserEventInput[] = [];
    for (const e of events) {
      const tsBucket = e.clientTs
        ? Math.floor(new Date(e.clientTs).getTime() / 1000)
        : Math.floor(Date.now() / 1000);
      const key = `${e.sessionId}|${e.kind}|${e.entityId ?? ''}|${tsBucket}`;
      if (seen.has(key)) continue;
      seen.add(key);
      filtered.push(e);
    }

    // ── 2. Insert in a single transaction ──
    let inserted = 0;
    const ua = ctx.userAgent ?? null;
    const ref = ctx.referrer ?? null;

    try {
      // Build the multi-VALUES insert manually — Prisma's createMany doesn't
      // support raw tables, and one $executeRawUnsafe per event is too slow.
      const rows: unknown[] = [];
      const placeholders: string[] = [];
      for (const e of filtered) {
        const id = newId('evt');
        const meta = JSON.stringify(e.meta ?? {});
        placeholders.push(
          '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
        );
        rows.push(
          id,
          ctx.userId,
          e.anonId,
          e.sessionId,
          e.kind,
          e.entityType ?? null,
          e.entityId ?? null,
          e.surface ?? null,
          meta,
          e.dwellMs ?? null,
          e.scrollPct ?? null,
          ref,
          ua,
        );
      }
      if (placeholders.length > 0) {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO user_events
            (id, userId, anonId, sessionId, kind, entityType, entityId, surface,
             metaJson, dwellMs, scrollPct, referrer, userAgent, ts)
           VALUES ${placeholders.join(', ')}`,
          ...rows,
        );
        inserted = filtered.length;
      }

      // Bump session counters (one UPDATE per distinct session in batch)
      const sessionSet = new Set(filtered.map((e) => e.sessionId));
      for (const sid of sessionSet) {
        await this.prisma.$executeRawUnsafe(
          `UPDATE user_sessions
              SET lastSeenAt = CURRENT_TIMESTAMP,
                  eventCount = eventCount + ?
            WHERE id = ?`,
          filtered.filter((e) => e.sessionId === sid).length,
          sid,
        );
      }
    } catch (e) {
      this.logger.warn(`ingestBatch insert failed: ${(e as Error).message}`);
      return {
        accepted: inserted,
        dropped: events.length - inserted,
        reason: 'INSERT_ERROR',
      };
    }

    // ── 3. Notify downstream listeners (Phase 10.2 taste worker, etc.) ──
    if (inserted > 0 && ctx.userId) {
      // For now we only notify on logged-in events; anonymous traffic still
      // gets recorded but the taste profile is keyed by userId.
      this.notifyListeners(new Set([ctx.userId]));
    }

    return {
      accepted: inserted,
      dropped: events.length - inserted,
    };
  }

  /* ────────────────────────────────────────────────────────────────────
   * Reads — for "what does the system know about me", admin debugging, and
   * the 10.2 ranker.
   * ──────────────────────────────────────────────────────────────────── */

  async recentForUser(userId: string, limit = 100): Promise<UserEvent[]> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, userId, anonId, sessionId, kind, entityType, entityId,
              surface, metaJson, dwellMs, scrollPct, ts
         FROM user_events
         WHERE userId = ?
         ORDER BY ts DESC
         LIMIT ?`,
      userId,
      Math.max(1, Math.min(500, limit)),
    )) as DbEvent[];
    return rows.map(this.toEvent);
  }

  async stats(): Promise<EventFirehoseStats> {
    const totalRows = (await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS c FROM user_events
         WHERE ts >= datetime('now','-1 day')`,
    )) as Array<{ c: number }>;
    const totalLast24h = Number(totalRows[0]?.c ?? 0);

    const userRows = (await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT userId) AS c FROM user_events
         WHERE ts >= datetime('now','-1 day') AND userId IS NOT NULL`,
    )) as Array<{ c: number }>;
    const uniqueUsersLast24h = Number(userRows[0]?.c ?? 0);

    const sessionRows = (await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT sessionId) AS c FROM user_events
         WHERE ts >= datetime('now','-1 day')`,
    )) as Array<{ c: number }>;
    const uniqueSessionsLast24h = Number(sessionRows[0]?.c ?? 0);

    const kindRows = (await this.prisma.$queryRawUnsafe(
      `SELECT kind, COUNT(*) AS c FROM user_events
         WHERE ts >= datetime('now','-1 day')
         GROUP BY kind
         ORDER BY c DESC`,
    )) as Array<{ kind: string; c: number }>;

    const surfaceRows = (await this.prisma.$queryRawUnsafe(
      `SELECT surface, COUNT(*) AS c FROM user_events
         WHERE ts >= datetime('now','-1 day') AND surface IS NOT NULL
         GROUP BY surface
         ORDER BY c DESC
         LIMIT 20`,
    )) as Array<{ surface: string; c: number }>;

    return {
      totalLast24h,
      uniqueUsersLast24h,
      uniqueSessionsLast24h,
      byKind: kindRows.map((r) => ({
        kind: r.kind as UserEventKind,
        count: Number(r.c),
      })),
      bySurface: surfaceRows.map((r) => ({
        surface: r.surface,
        count: Number(r.c),
      })),
    };
  }

  /* ────────────────────────────────────────────────────────────────────
   * Retention — invoked by the cron in EventsRetentionService.
   * ──────────────────────────────────────────────────────────────────── */

  async purgeOlderThan(days: number): Promise<{ purged: number }> {
    const safeDays = Math.max(7, Math.floor(days));
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS c FROM user_events WHERE ts < datetime('now', ?)`,
      `-${safeDays} days`,
    )) as Array<{ c: number }>;
    const purged = Number(rows[0]?.c ?? 0);
    if (purged > 0) {
      await this.prisma.$executeRawUnsafe(
        `DELETE FROM user_events WHERE ts < datetime('now', ?)`,
        `-${safeDays} days`,
      );
      await this.prisma.$executeRawUnsafe(
        `DELETE FROM user_sessions WHERE lastSeenAt < datetime('now', ?)`,
        `-${safeDays} days`,
      );
    }
    return { purged };
  }

  /* ────────────────────────────────────────────────────────────────────
   * Mappers
   * ──────────────────────────────────────────────────────────────────── */

  private toEvent = (row: DbEvent): UserEvent => {
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(row.metaJson || '{}') as Record<string, unknown>;
    } catch {
      meta = {};
    }
    return {
      id: row.id,
      userId: row.userId ?? null,
      anonId: row.anonId ?? null,
      sessionId: row.sessionId,
      kind: row.kind as UserEventKind,
      entityType: row.entityType,
      entityId: row.entityId,
      surface: row.surface,
      meta,
      dwellMs: row.dwellMs,
      scrollPct: row.scrollPct,
      ts:
        row.ts instanceof Date
          ? row.ts.toISOString()
          : String(row.ts),
    };
  };
}
