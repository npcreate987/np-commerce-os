import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  LineLink,
  LinkLineInput,
  NotificationConfig,
  NotificationPref,
  PushSubscription,
  RegisterDeviceInput,
  SubscribePushInput,
  UpdateNotificationPrefInput,
  UserDevice,
  linkLineInputSchema,
  registerDeviceInputSchema,
  subscribePushInputSchema,
  updateNotificationPrefInputSchema,
} from '../../shared/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import { Throttle } from '../../common/throttle/throttler';
import { NotificationService } from '../integration/notification.service';
import { NotificationPrefsService } from './notification-prefs.service';

/**
 * Phase 9.1 — `/v1/notifications/*`
 *
 * Public-but-auth endpoint surface for:
 *   - GET  /config                 (returns which channels are enabled +
 *                                   VAPID public key so the SW can subscribe)
 *   - POST /push/subscribe         (Web Push)
 *   - DELETE /push/subscribe       (unsubscribe by endpoint)
 *   - GET  /push                   (list my Web Push subs)
 *   - POST /devices                (register FCM/APNs token)
 *   - DELETE /devices/:token
 *   - GET  /devices
 *   - GET  /prefs                  (channel preferences)
 *   - PATCH /prefs
 *   - GET  /line/me                (line link, if any)
 *   - POST /line/link              (link or update)
 *   - DELETE /line/link
 *   - POST /test                   (admin/dev only — fire a test notification)
 */
@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly prefs: NotificationPrefsService,
    private readonly notif: NotificationService,
  ) {}

  // ---- Public: client needs to know which channels exist + VAPID key
  @Get('config')
  getConfig(): NotificationConfig {
    return this.notif.getConfig();
  }

  // ---- Web Push ----
  @Post('push/subscribe')
  @UseGuards(JwtAuthGuard)
  subscribePush(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(subscribePushInputSchema))
    input: SubscribePushInput,
  ): Promise<PushSubscription> {
    return this.prefs.subscribePush(user.userId, input);
  }

  @Delete('push/subscribe')
  @UseGuards(JwtAuthGuard)
  unsubscribePush(
    @CurrentUser() user: AuthenticatedUser,
    @Query('endpoint') endpoint: string,
  ): Promise<{ ok: true }> {
    return this.prefs.unsubscribePush(user.userId, endpoint);
  }

  @Get('push')
  @UseGuards(JwtAuthGuard)
  listMyPush(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PushSubscription[]> {
    return this.prefs.listMyPush(user.userId);
  }

  // ---- Native devices (FCM / APNs) ----
  @Post('devices')
  @UseGuards(JwtAuthGuard)
  registerDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(registerDeviceInputSchema))
    input: RegisterDeviceInput,
  ): Promise<UserDevice> {
    return this.prefs.registerDevice(user.userId, input);
  }

  @Delete('devices/:token')
  @UseGuards(JwtAuthGuard)
  unregisterDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('token') token: string,
  ): Promise<{ ok: true }> {
    return this.prefs.unregisterDevice(user.userId, token);
  }

  @Get('devices')
  @UseGuards(JwtAuthGuard)
  listMyDevices(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserDevice[]> {
    return this.prefs.listMyDevices(user.userId);
  }

  // ---- LINE link ----
  @Get('line/me')
  @UseGuards(JwtAuthGuard)
  getLine(@CurrentUser() user: AuthenticatedUser): Promise<LineLink | null> {
    return this.prefs.getLineLink(user.userId);
  }

  @Post('line/link')
  @UseGuards(JwtAuthGuard)
  linkLine(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(linkLineInputSchema)) input: LinkLineInput,
  ): Promise<LineLink> {
    return this.prefs.linkLine(user.userId, input);
  }

  @Delete('line/link')
  @UseGuards(JwtAuthGuard)
  unlinkLine(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ ok: true }> {
    return this.prefs.unlinkLine(user.userId);
  }

  // ---- Preferences ----
  @Get('prefs')
  @UseGuards(JwtAuthGuard)
  listPrefs(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NotificationPref[]> {
    return this.prefs.listPrefs(user.userId);
  }

  @Patch('prefs')
  @UseGuards(JwtAuthGuard)
  upsertPref(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateNotificationPrefInputSchema))
    input: UpdateNotificationPrefInput,
  ): Promise<NotificationPref> {
    return this.prefs.upsertPref(user.userId, input);
  }

  // ---- Self-test (admin only) ----
  // Phase 13.3d — was open to any authenticated user, which let anyone trigger
  // their own push/email/LINE noise on demand. Now admin-gated; throttled to
  // 6/min as a defence-in-depth even for admins.
  @Post('test')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Throttle({ windowSec: 60, max: 6 })
  async test(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ results: Array<{ channel: string; status: string; error?: string }> }> {
    const results = await this.notif.notifyUser(
      user.userId,
      'AUTO',
      'SYSTEM',
      {
        title: '🔔 NP Commerce',
        body: 'การแจ้งเตือนทำงานปกติ ทุกช่องที่เปิดไว้จะได้รับข้อความนี้',
        url: '/profile/notifications',
        tag: 'np-test',
      },
    );
    return {
      results: results.map((r) => ({
        channel: r.channel,
        status: r.status,
        error: r.error,
      })),
    };
  }
}
