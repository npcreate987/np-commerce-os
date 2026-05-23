/**
 * Phase 10.3 — Proactive Surfaces endpoints.
 *
 *   GET /v1/me/feed/rails      → bundle of personalised feed shelves
 *   GET /v1/me/feed/bar        → tiny "currently viewing/recent search" context
 *   GET /v1/me/nudges          → list of in-app nudges sent to me (latest first)
 *   POST /v1/admin/proactive/sweep/:kind → manually trigger a sweep (admin)
 *   POST /v1/admin/proactive/snapshot   → manually run price snapshot (admin)
 */

import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProactiveService } from './proactive.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FeedRail, ProactiveBar, SweepReport } from '../../shared/types';

@Controller()
export class ProactiveController {
  constructor(
    private readonly proactive: ProactiveService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('me/feed/rails')
  @UseGuards(JwtAuthGuard)
  rails(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ): Promise<FeedRail[]> {
    const n = limit ? Number.parseInt(limit, 10) : 10;
    return this.proactive.homeRails(user.userId, Number.isFinite(n) ? n : 10);
  }

  @Get('me/feed/bar')
  @UseGuards(JwtAuthGuard)
  bar(@CurrentUser() user: AuthenticatedUser): Promise<ProactiveBar> {
    return this.proactive.proactiveBar(user.userId);
  }

  @Get('me/nudges')
  @UseGuards(JwtAuthGuard)
  async myNudges(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ): Promise<
    Array<{
      id: string;
      kind: string;
      entityType: string | null;
      entityId: string | null;
      title: string;
      body: string;
      deepLink: string;
      sentAt: string;
    }>
  > {
    const n = limit ? Number.parseInt(limit, 10) : 20;
    const safe = Number.isFinite(n) ? Math.max(1, Math.min(n, 100)) : 20;
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, kind, entityType, entityId, payloadJson, sentAt
       FROM proactive_nudges
       WHERE userId = ?
         AND channel = 'INAPP'
       ORDER BY sentAt DESC
       LIMIT ?`,
      user.userId,
      safe,
    )) as Array<{
      id: string;
      kind: string;
      entityType: string | null;
      entityId: string | null;
      payloadJson: string;
      sentAt: string;
    }>;
    return rows.map((r) => {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(r.payloadJson) as Record<string, unknown>;
      } catch {
        payload = {};
      }
      return {
        id: r.id,
        kind: r.kind,
        entityType: r.entityType,
        entityId: r.entityId,
        title: String(payload.title ?? ''),
        body: String(payload.body ?? ''),
        deepLink: String(payload.deepLink ?? '/feed'),
        sentAt: r.sentAt,
      };
    });
  }

  // ── Admin: manual sweep triggers (great for QA / first prod run) ──

  @Post('admin/proactive/sweep/:kind')
  @UseGuards(JwtAuthGuard)
  async manualSweep(
    @CurrentUser() user: AuthenticatedUser,
    @Param('kind') kind: string,
  ): Promise<SweepReport> {
    if (user.role !== 'ADMIN') throw new ForbiddenException('admin only');
    switch (kind) {
      case 'browse-abandon':
        return this.proactive.sweepBrowseAbandon();
      case 'cart-abandon':
        return this.proactive.sweepCartAbandon();
      case 'win-back':
        return this.proactive.sweepWinBack();
      case 'fav-shop-new':
        return this.proactive.sweepFavShopNewArrival();
      case 'price-drop':
        return this.proactive.sweepPriceDrop();
      default:
        throw new ForbiddenException(`unknown sweep: ${kind}`);
    }
  }

  @Post('admin/proactive/snapshot')
  @UseGuards(JwtAuthGuard)
  async manualSnapshot(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ snapped: number }> {
    if (user.role !== 'ADMIN') throw new ForbiddenException('admin only');
    return this.proactive.snapshotPrices();
  }
}
