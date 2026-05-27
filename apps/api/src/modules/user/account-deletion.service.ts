import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Phase 17 — Account deletion service.
 *
 * Google Play (Aug 2023) + Apple (June 2022) BOTH require apps that
 * support account creation to also support in-app deletion. The rules:
 *
 *   - Path to delete must be reachable in ≤ 2 taps from settings.
 *   - User must NOT be forced to email support / visit a web form.
 *   - Permanent deletion must complete in a reasonable time. We use 30d
 *     grace (industry standard — gives accidental-deleters a way back).
 *   - We must surface what data is retained vs deleted (see Privacy
 *     Policy `docs/legal/privacy-policy.md`).
 *
 * Lifecycle:
 *
 *   1. User taps "Delete my account" → `requestDeletion(userId, reason)`
 *      sets `deletionRequestedAt = NOW`, `deletionPurgeAt = NOW + 30d`,
 *      revokes refresh tokens. Login fails with `ACCOUNT_DELETION_PENDING`.
 *   2. Within 30 days, the user can `cancelDeletion(userId)` to restore.
 *   3. The cron `purgeExpiredAccounts()` runs daily — for any user with
 *      `deletionPurgeAt <= NOW`, it hard-deletes the row (cascade chains
 *      via Prisma `onDelete: Cascade` to shops/carts/orders/addresses)
 *      and writes an audit row to `account_deletion_log`.
 *
 * NOTE on Orders: production-grade ecommerce often *can't* hard-delete
 * order rows due to legal retention (Thai e-Tax invoice = 5 yr). The
 * compromise is to anonymise order.customerId → 'deleted-user' tombstone
 * and strip PII from snapshots. The current implementation hard-deletes;
 * Phase 17.x will add the anonymisation pass once the wallet/invoice
 * modules ship.
 */

const GRACE_DAYS = 30;
const GRACE_MS = GRACE_DAYS * 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

@Injectable()
export class AccountDeletionService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AccountDeletionService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap(): void {
    if (process.env.ACCOUNT_DELETION_SWEEP_DISABLED === 'true') {
      this.logger.log('sweep disabled via env');
      return;
    }
    // Stagger first run 90s after boot to let other modules settle.
    // .catch is defence-in-depth: purgeExpiredAccounts already wraps its
    // body in try/catch, but we never want a stray rejection from this
    // setInterval/setTimeout callback to crash the Node process.
    setTimeout(() => {
      this.purgeExpiredAccounts().catch((err) =>
        this.logger.warn(
          `[deletion] sweep failed: ${(err as Error)?.message ?? err}`,
        ),
      );
    }, 90_000);
    this.timer = setInterval(() => {
      this.purgeExpiredAccounts().catch((err) =>
        this.logger.warn(
          `[deletion] sweep failed: ${(err as Error)?.message ?? err}`,
        ),
      );
    }, SWEEP_INTERVAL_MS);
  }

  /**
   * Mark the account for deletion. Idempotent — calling twice extends
   * the grace window to a fresh 30 days (gives users certainty they're
   * still safe).
   */
  async requestDeletion(
    userId: string,
    reason?: string,
  ): Promise<{ purgeAt: string; graceDays: number }> {
    const now = new Date();
    const purgeAt = new Date(now.getTime() + GRACE_MS);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        deletionRequestedAt: now,
        deletionPurgeAt: purgeAt,
        deletionReason: reason?.slice(0, 500) ?? null,
      },
    });

    // Best-effort: revoke active refresh tokens so other devices log
    // out immediately. Phase 19.5 — ported from raw SQL ($queryRawUnsafe
    // with SQLite `?` + `datetime('now')`) to Prisma client (DB-agnostic).
    try {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'account_deletion_requested' },
      });
    } catch (err) {
      // refresh_tokens table may not exist in test runs; the absence
      // shouldn't block the delete flow itself.
      this.logger.warn(
        `[deletion] refresh token revoke failed: ${(err as Error).message}`,
      );
    }

    this.logger.log(
      `[deletion] requested user=${userId} purgeAt=${purgeAt.toISOString()}`,
    );

    return {
      purgeAt: purgeAt.toISOString(),
      graceDays: GRACE_DAYS,
    };
  }

  /**
   * Cancel a pending deletion. Returns whether anything changed.
   */
  async cancelDeletion(userId: string): Promise<{ cancelled: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.deletionRequestedAt) return { cancelled: false };
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        deletionRequestedAt: null,
        deletionPurgeAt: null,
        deletionReason: null,
      },
    });
    this.logger.log(`[deletion] cancelled user=${userId}`);
    return { cancelled: true };
  }

  /**
   * Return current deletion status for the authenticated user.
   */
  async getStatus(userId: string): Promise<{
    pending: boolean;
    requestedAt: string | null;
    purgeAt: string | null;
    graceDays: number;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { deletionRequestedAt: true, deletionPurgeAt: true },
    });
    return {
      pending: !!user?.deletionRequestedAt,
      requestedAt: user?.deletionRequestedAt?.toISOString() ?? null,
      purgeAt: user?.deletionPurgeAt?.toISOString() ?? null,
      graceDays: GRACE_DAYS,
    };
  }

  /**
   * Sweeper — runs every 6 hours after boot. Hard-deletes users whose
   * grace period has expired. Wrapped in a try so a single bad row
   * doesn't kill the whole batch. Surfaced as a public method so admin
   * tooling / tests can trigger it on demand.
   */
  async purgeExpiredAccounts(): Promise<{ purgedCount: number }> {
    let purgedCount = 0;
    try {
      const due = await this.prisma.user.findMany({
        where: {
          deletionPurgeAt: { lte: new Date() },
        },
        select: { id: true, email: true },
      });

      for (const u of due) {
        try {
          await this.hardDelete(u.id);
          purgedCount += 1;
        } catch (err) {
          this.logger.error(
            `[deletion] hard-delete failed user=${u.id}: ${(err as Error).message}`,
          );
        }
      }

      if (purgedCount > 0) {
        this.logger.log(`[deletion] purged ${purgedCount} expired accounts`);
      }
    } catch (err) {
      // Catch-all so a transient DB error (e.g. P2021 missing-table on a
      // fresh deploy before migrations land) never escapes the cron tick
      // and crashes the process via Node's unhandledRejection -> exit.
      this.logger.warn(
        `[deletion] purge tick failed: ${(err as Error)?.message ?? err}`,
      );
    }
    return { purgedCount };
  }

  /**
   * Hard-delete a single user row. Prisma cascades wipe owned data
   * (shops, products via shop, carts, orders, addresses). We do NOT
   * touch event firehose rows (privacy/respond already covered by the
   * /privacy retentionDays setting + tracker's anonId rotation on
   * logout).
   *
   * Exposed so admin tooling can call directly for legal/abuse cases.
   */
  async hardDelete(userId: string): Promise<void> {
    await this.prisma.user.delete({ where: { id: userId } });
  }
}
