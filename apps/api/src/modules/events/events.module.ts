import { Module } from '@nestjs/common';
import { ConsentService } from './consent.service';
import { EventsController } from './events.controller';
import { EventsRetentionService } from './events-retention.service';
import { EventsService } from './events.service';

/**
 * Phase 10.1 — Behavioural Event Firehose.
 *
 * Provides:
 *   - `EventsService`  → ingestion + reads (consumed by future ranker in 10.2)
 *   - `ConsentService` → privacy gate (re-used outside this module)
 *   - `EventsController` → `/v1/events/*` and `/v1/me/privacy`
 *   - `EventsRetentionService` → background cron purging old events
 */
@Module({
  controllers: [EventsController],
  providers: [EventsService, ConsentService, EventsRetentionService],
  exports: [EventsService, ConsentService],
})
export class EventsModule {}
