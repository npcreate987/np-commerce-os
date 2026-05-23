import { Module } from '@nestjs/common';
import { ApnsAdapter } from './adapters/apns.adapter';
import { EmailAdapter } from './adapters/email.adapter';
import { FcmAdapter } from './adapters/fcm.adapter';
import { InAppAdapter } from './adapters/inapp.adapter';
import { LineAdapter } from './adapters/line.adapter';
import { WebPushAdapter } from './adapters/web-push.adapter';
import { NotificationService } from './notification.service';

/**
 * Phase 9.1 — Integration / Notification delivery layer.
 *
 * Exports a single `NotificationService` facade so other modules
 * (broadcast, payment, dispute, review reminder cron, etc.) don't
 * need to know which channel adapters exist.
 */
@Module({
  providers: [
    InAppAdapter,
    WebPushAdapter,
    FcmAdapter,
    ApnsAdapter,
    EmailAdapter,
    LineAdapter,
    NotificationService,
  ],
  exports: [NotificationService],
})
export class IntegrationModule {}
