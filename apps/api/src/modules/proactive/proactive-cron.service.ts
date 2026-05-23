/**
 * Phase 10.3 — Proactive sweep cron.
 *
 * Runs the periodic nudges at a sensible cadence:
 *
 *   • Browse-abandon       every 6h
 *   • Cart-abandon         every 4h
 *   • Win-back             every 24h (stagger off-peak)
 *   • Fav-shop new arrival every 6h
 *   • Price snapshot       every 24h (00:30 local)
 *   • Price drop           every 6h (always after a recent snapshot)
 *
 * Each sweep is idempotent at the row level (via `proactive_nudges` dedupe
 * ledger), so over-running a sweep is safe — at worst it short-circuits early.
 *
 * Disable per-kind with `PROACTIVE_<KIND>_DISABLED=true`, or globally with
 * `PROACTIVE_SWEEPS_DISABLED=true`.
 */

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ProactiveService } from './proactive.service';

const H = 60 * 60 * 1000;

@Injectable()
export class ProactiveCronService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProactiveCronService.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(private readonly proactive: ProactiveService) {}

  onApplicationBootstrap(): void {
    if (process.env.PROACTIVE_SWEEPS_DISABLED === 'true') {
      this.logger.log('proactive sweeps disabled');
      return;
    }
    // Stagger the initial runs so a fresh boot doesn't fire everything at once.
    this.schedule('BROWSE_ABANDON', 6 * H, 5 * 60_000, () =>
      this.proactive.sweepBrowseAbandon(),
    );
    this.schedule('CART_ABANDON', 4 * H, 7 * 60_000, () =>
      this.proactive.sweepCartAbandon(),
    );
    this.schedule('FAV_SHOP_NEW_ARRIVAL', 6 * H, 9 * 60_000, () =>
      this.proactive.sweepFavShopNewArrival(),
    );
    this.schedule('WIN_BACK', 24 * H, 60 * 60_000, () =>
      this.proactive.sweepWinBack(),
    );
    // Snapshot first, then sweep — ordering matters for the 24h baseline math.
    this.schedule('PRICE_SNAPSHOT', 24 * H, 15 * 60_000, () =>
      this.proactive.snapshotPrices().then((r) => ({
        kind: 'PRICE_DROP' as const,
        scanned: r.snapped,
        matched: 0,
        sent: 0,
        skipped: 0,
        failed: 0,
        durationMs: 0,
      })),
    );
    this.schedule('PRICE_DROP', 6 * H, 25 * 60_000, () =>
      this.proactive.sweepPriceDrop(),
    );
  }

  private schedule(
    kind: string,
    intervalMs: number,
    initialDelayMs: number,
    fn: () => Promise<{ scanned: number; sent: number; failed: number } | unknown>,
  ): void {
    const envKey = `PROACTIVE_${kind}_DISABLED`;
    if (process.env[envKey] === 'true') {
      this.logger.log(`proactive ${kind} disabled via env`);
      return;
    }
    const tick = async (): Promise<void> => {
      try {
        const r = (await fn()) as {
          scanned: number;
          sent: number;
          failed: number;
          skipped?: number;
          durationMs?: number;
        };
        if (r && (r.scanned || r.sent)) {
          this.logger.log(
            `${kind}: scanned=${r.scanned} sent=${r.sent} failed=${r.failed} (${r.durationMs ?? '?'}ms)`,
          );
        }
      } catch (e) {
        this.logger.warn(`${kind} sweep failed: ${(e as Error).message}`);
      }
    };
    setTimeout(() => void tick(), initialDelayMs);
    this.timers.push(setInterval(() => void tick(), intervalMs));
  }
}
