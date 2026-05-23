/**
 * Phase 10.1 — Retention sweeper.
 *
 * Runs every 6 hours and purges `user_events` older than
 * `EVENT_RETENTION_DAYS` (default 180). Each user can also pick a tighter
 * retention via `/account/privacy`; that per-user override is honoured in the
 * 10.2 follow-up (here we just enforce the global floor).
 *
 * Implemented with setInterval so the boot path stays dependency-free.
 */

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { EventsService } from './events.service';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class EventsRetentionService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EventsRetentionService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly events: EventsService) {}

  onApplicationBootstrap(): void {
    if (process.env.EVENT_RETENTION_DISABLED === 'true') {
      this.logger.log('retention disabled via env');
      return;
    }
    // Stagger initial run by 60s so multiple boot phases don't fight.
    setTimeout(() => void this.runOnce(), 60_000);
    this.timer = setInterval(() => void this.runOnce(), SIX_HOURS_MS);
  }

  private async runOnce(): Promise<void> {
    const days = Number(process.env.EVENT_RETENTION_DAYS ?? 180);
    const safe = Number.isFinite(days) ? Math.max(30, Math.floor(days)) : 180;
    try {
      const { purged } = await this.events.purgeOlderThan(safe);
      if (purged > 0) {
        this.logger.log(`retention: purged ${purged} events older than ${safe}d`);
      }
    } catch (e) {
      this.logger.warn(`retention sweep failed: ${(e as Error).message}`);
    }
  }
}
