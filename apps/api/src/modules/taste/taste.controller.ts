/**
 * Phase 10.2 — Taste profile endpoints.
 *
 *   GET  /v1/me/taste              → summary of the caller's profile (transparency)
 *   POST /v1/me/taste/rebuild      → force-trigger a rebuild (useful right after
 *                                    deleting events or changing consent)
 *   DELETE /v1/me/taste            → wipe the profile (privacy)
 *   GET  /v1/admin/users/:id/taste → admin debug view
 */

import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TasteService } from './taste.service';
import { TasteProfileSummary } from '../../shared/types';

@Controller()
export class TasteController {
  constructor(private readonly taste: TasteService) {}

  @Get('me/taste')
  @UseGuards(JwtAuthGuard)
  myTaste(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TasteProfileSummary | null> {
    return this.taste.summary(user.userId);
  }

  @Post('me/taste/rebuild')
  @UseGuards(JwtAuthGuard)
  async rebuild(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ ok: true; eventCount: number; lastUpdatedAt: string }> {
    const p = await this.taste.rebuildFor(user.userId);
    return {
      ok: true,
      eventCount: p.eventCount,
      lastUpdatedAt: p.lastUpdatedAt,
    };
  }

  @Delete('me/taste')
  @UseGuards(JwtAuthGuard)
  async deleteMine(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ ok: true }> {
    await this.taste.deleteFor(user.userId);
    return { ok: true };
  }

  /** Admin view — gated to ADMIN role manually (no role guard yet). */
  @Get('admin/users/:userId/taste')
  @UseGuards(JwtAuthGuard)
  async adminView(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') targetUserId: string,
  ): Promise<TasteProfileSummary | null> {
    if (user.role !== 'ADMIN') throw new ForbiddenException('admin only');
    return this.taste.summary(targetUserId);
  }
}
