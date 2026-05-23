/**
 * Phase 10.2 — TasteModule
 *
 * Pulls in EventsModule so TasteWorker can subscribe to fresh ingest events.
 * Exports TasteService so RecommendationModule (and any future surfaces) can
 * consume the precomputed profile.
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { EventsModule } from '../events/events.module';
import { TasteController } from './taste.controller';
import { TasteService } from './taste.service';
import { TasteWorkerService } from './taste-worker.service';

@Module({
  imports: [PrismaModule, EventsModule],
  controllers: [TasteController],
  providers: [TasteService, TasteWorkerService],
  exports: [TasteService],
})
export class TasteModule {}
