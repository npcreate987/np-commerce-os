/**
 * Phase 10.3 — ProactiveModule.
 *
 * Depends on three Phase-9/10 modules:
 *   - IntegrationModule (NotificationService — outbound nudges)
 *   - EventsModule      (ConsentService — privacy gate)
 *   - TasteModule       (TasteService — affinity reads)
 *   - RecommendationModule (RecommendationService.similar)
 *
 * Exports ProactiveService so ChatModule can call `recentBrowseSummary` for
 * the `recent_browse` tool.
 */

import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { IntegrationModule } from '../integration/integration.module';
import { EventsModule } from '../events/events.module';
import { TasteModule } from '../taste/taste.module';
import { RecommendationModule } from '../recommendation/recommendation.module';
import { ProactiveController } from './proactive.controller';
import { ProactiveService } from './proactive.service';
import { ProactiveCronService } from './proactive-cron.service';

@Module({
  imports: [
    PrismaModule,
    IntegrationModule,
    EventsModule,
    TasteModule,
    forwardRef(() => RecommendationModule),
  ],
  controllers: [ProactiveController],
  providers: [ProactiveService, ProactiveCronService],
  exports: [ProactiveService],
})
export class ProactiveModule {}
