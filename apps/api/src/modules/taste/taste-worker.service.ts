/**
 * Phase 10.2 — TasteWorker
 *
 * Periodically drains the `TasteService` rebuild queue. Producers (the
 * firehose `EventsService.ingestBatch`) call `taste.enqueue(userIds)`; this
 * worker batches them up and runs `taste.rebuildFor(userId)` for each, with
 * a small concurrency limit to avoid hammering SQLite under burst.
 *
 *   Why a queue (instead of rebuild-inline)?
 *     - Decouples write latency on `/events/batch` from profile recompute.
 *     - Coalesces bursts: a session can fire 50 events in 30s — they map to
 *       one rebuild per user, not fifty.
 *
 *   Worker tick: `TASTE_TICK_MS` (default 30s).
 *   Disable: set `TASTE_WORKER_DISABLED=true`.
 */

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { EventsService } from '../events/events.service';
import { TasteService } from './taste.service';

const DEFAULT_TICK_MS = 30_000;
const MAX_PER_TICK = 50;
const CONCURRENCY = 4;

@Injectable()
export class TasteWorkerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TasteWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly taste: TasteService,
    private readonly events: EventsService,
  ) {}

  onApplicationBootstrap(): void {
    // Always subscribe to the firehose so enqueue happens even when the
    // periodic worker is disabled (some envs prefer a manual rebuild trigger).
    this.events.registerIngestListener((userIds) => {
      this.taste.enqueue(userIds);
    });

    if (process.env.TASTE_WORKER_DISABLED === 'true') {
      this.logger.log('taste worker disabled via env');
      return;
    }
    const tickMs = Number(process.env.TASTE_TICK_MS ?? DEFAULT_TICK_MS);
    const safeMs = Number.isFinite(tickMs) ? Math.max(2_000, tickMs) : DEFAULT_TICK_MS;
    // Stagger initial run so other phase workers don't all fire at once.
    setTimeout(() => void this.tick(), 15_000);
    this.timer = setInterval(() => void this.tick(), safeMs);
  }

  private async tick(): Promise<void> {
    if (this.running) return; // skip overlapping ticks
    const batch = this.taste.takeBatch(MAX_PER_TICK);
    if (batch.length === 0) return;

    this.running = true;
    const started = Date.now();
    let ok = 0;
    let failed = 0;

    try {
      // Simple bounded-concurrency runner — no extra deps.
      let cursor = 0;
      const next = async (): Promise<void> => {
        while (cursor < batch.length) {
          const i = cursor++;
          const userId = batch[i];
          if (!userId) continue;
          try {
            await this.taste.rebuildFor(userId);
            ok++;
          } catch (e) {
            failed++;
            this.logger.warn(
              `rebuild failed for ${userId}: ${(e as Error).message}`,
            );
          }
        }
      };
      await Promise.all(
        Array.from({ length: CONCURRENCY }, () => next()),
      );
    } finally {
      this.running = false;
      const ms = Date.now() - started;
      if (ok > 0 || failed > 0) {
        this.logger.log(
          `taste rebuild: ok=${ok} fail=${failed} in ${ms}ms (queue=${this.taste.queueSize()})`,
        );
      }
    }
  }
}
