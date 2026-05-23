/**
 * Phase 10.1 — ConsentService.
 *
 * Source of truth for "is user X allowed to be tracked?". Cached in-process for
 * 30 seconds so the hot tracking path doesn't hit the DB on every event.
 *
 * Default policy (chosen by product): everyone is tracked unless they opt out.
 * The frontend exposes an explicit toggle on /account/privacy.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConsentState, UpdateConsentInput } from '../../shared/types';

interface DbConsent {
  userId: string;
  behavioralOptedOut: number;
  marketingOptedOut: number;
  retentionDays: number;
  updatedAt: Date | string;
}

const CACHE_TTL_MS = 30_000;

@Injectable()
export class ConsentService {
  private cache: Map<string, { state: ConsentState; expiresAt: number }> =
    new Map();

  constructor(private readonly prisma: PrismaService) {}

  /** Default state for users who have never touched the privacy page. */
  private defaultState(): ConsentState {
    const retentionDays = Number(process.env.EVENT_RETENTION_DAYS ?? 180);
    return {
      behavioralOptedOut: false,
      marketingOptedOut: false,
      retentionDays: Number.isFinite(retentionDays) ? retentionDays : 180,
      updatedAt: new Date(0).toISOString(),
    };
  }

  async get(userId: string): Promise<ConsentState> {
    const now = Date.now();
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > now) return cached.state;

    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT userId, behavioralOptedOut, marketingOptedOut, retentionDays, updatedAt
         FROM user_consents WHERE userId = ?`,
      userId,
    )) as DbConsent[];

    const row = rows[0];
    const state: ConsentState = row
      ? {
          behavioralOptedOut: row.behavioralOptedOut === 1,
          marketingOptedOut: row.marketingOptedOut === 1,
          retentionDays: row.retentionDays,
          updatedAt:
            row.updatedAt instanceof Date
              ? row.updatedAt.toISOString()
              : String(row.updatedAt),
        }
      : this.defaultState();

    this.cache.set(userId, { state, expiresAt: now + CACHE_TTL_MS });
    return state;
  }

  /** Hot-path helper used by EventsService. Falls open (returns false) on
   *  errors so a transient DB hiccup doesn't silently drop all telemetry. */
  async isBehavioralOptedOut(userId: string | null): Promise<boolean> {
    if (!userId) return false;
    try {
      const s = await this.get(userId);
      return s.behavioralOptedOut;
    } catch {
      return false;
    }
  }

  async update(userId: string, input: UpdateConsentInput): Promise<ConsentState> {
    const current = await this.get(userId);
    const next: ConsentState = {
      behavioralOptedOut:
        input.behavioralOptedOut ?? current.behavioralOptedOut,
      marketingOptedOut:
        input.marketingOptedOut ?? current.marketingOptedOut,
      retentionDays: input.retentionDays ?? current.retentionDays,
      updatedAt: new Date().toISOString(),
    };
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO user_consents
         (userId, behavioralOptedOut, marketingOptedOut, retentionDays, updatedAt)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(userId) DO UPDATE SET
         behavioralOptedOut = excluded.behavioralOptedOut,
         marketingOptedOut = excluded.marketingOptedOut,
         retentionDays = excluded.retentionDays,
         updatedAt = excluded.updatedAt`,
      userId,
      next.behavioralOptedOut ? 1 : 0,
      next.marketingOptedOut ? 1 : 0,
      next.retentionDays,
    );
    this.cache.delete(userId);
    return next;
  }

  /** GDPR-style "delete my history". Removes ALL user_events and ALL sessions
   *  that belonged to this user (does NOT cascade to orders / messages, which
   *  are business records). */
  async deleteMyHistory(userId: string): Promise<{ deletedEvents: number }> {
    const result = (await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS c FROM user_events WHERE userId = ?`,
      userId,
    )) as Array<{ c: number }>;
    const deletedEvents = Number(result[0]?.c ?? 0);

    await this.prisma.$executeRawUnsafe(
      `DELETE FROM user_events WHERE userId = ?`,
      userId,
    );
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM user_sessions WHERE userId = ?`,
      userId,
    );

    return { deletedEvents };
  }
}
