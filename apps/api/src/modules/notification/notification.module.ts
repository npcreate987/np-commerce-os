import { Module } from '@nestjs/common';
import { IntegrationModule } from '../integration/integration.module';
import { NotificationController } from './notification.controller';
import { NotificationPrefsService } from './notification-prefs.service';
import { ReviewReminderService } from './review-reminder.service';

@Module({
  imports: [IntegrationModule],
  controllers: [NotificationController],
  providers: [NotificationPrefsService, ReviewReminderService],
  exports: [NotificationPrefsService],
})
export class NotificationModule {}
