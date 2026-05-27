import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  AdminVideoRow,
  CreateVideoInput,
  ModerateVideoInput,
  ReportVideoInput,
  VideoFeedItem,
  VideoPost,
  VideoReportRow,
  VideoStatus,
  createVideoInputSchema,
  moderateVideoInputSchema,
  reportVideoInputSchema,
} from '../../shared/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import { Throttle } from '../../common/throttle/throttler';
import { FeedService, parseFeedTab } from './feed.service';

@Controller('feed')
export class FeedController {
  constructor(
    private readonly feed: FeedService,
    private readonly jwt: JwtService,
  ) {}

  // ===========================================================================
  // Public — optional auth for the "liked" flag
  // ===========================================================================

  @Get()
  list(
    @Req() req: any,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('tab') tab?: string,
  ): Promise<VideoFeedItem[]> {
    const userId = this.userFromHeader(req);
    // Phase 19.7 — Geo is optional. We accept it as strings (Capacitor URL
    // params are stringly-typed) and validate to finite numbers in normal
    // lat/lng ranges. Bogus input silently falls back to score order rather
    // than 400ing — the feed should never be unreachable.
    const latN = lat != null ? Number(lat) : NaN;
    const lngN = lng != null ? Number(lng) : NaN;
    const geo =
      Number.isFinite(latN) &&
      Number.isFinite(lngN) &&
      latN >= -90 &&
      latN <= 90 &&
      lngN >= -180 &&
      lngN <= 180
        ? { lat: latN, lng: lngN }
        : undefined;
    // Phase 20.5 — `tab` is opt-in; unknown values fall back to
    // "foryou" so older clients keep working through any future
    // server-side relabeling.
    return this.feed.feed(
      userId,
      cursor ? Number(cursor) : 0,
      limit ? Number(limit) : 20,
      geo,
      parseFeedTab(tab),
    );
  }

  // ===========================================================================
  // Authenticated — owner views. Must come BEFORE `:id` routes so Nest's
  // route matcher doesn't treat "mine" as a video id.
  // ===========================================================================

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ): Promise<VideoFeedItem[]> {
    return this.feed.listMine(user.userId, limit ? Number(limit) : 50);
  }

  // ===========================================================================
  // Admin moderation. Also BEFORE `:id` for the same routing reason.
  // ===========================================================================

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminList(
    @Query('status') status?: VideoStatus | 'ALL',
    @Query('onlyReported') onlyReported?: string,
    @Query('limit') limit?: string,
  ): Promise<AdminVideoRow[]> {
    return this.feed.adminList({
      status,
      onlyReported: onlyReported === 'true' || onlyReported === '1',
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('admin/reports')
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminReports(
    @Query('status') status?: 'PENDING' | 'RESOLVED' | 'ALL',
    @Query('limit') limit?: string,
  ): Promise<VideoReportRow[]> {
    return this.feed.adminListReports({
      status,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Patch('admin/:id/moderate')
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminModerate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moderateVideoInputSchema))
    body: ModerateVideoInput,
  ): Promise<{ ok: true; status: VideoStatus }> {
    return this.feed.adminModerate(user.userId, id, body);
  }

  // ===========================================================================
  // Public / per-video — order matters: specific paths above, dynamic last.
  // ===========================================================================

  @Get(':id')
  one(@Req() req: any, @Param('id') id: string): Promise<VideoFeedItem | null> {
    const userId = this.userFromHeader(req);
    return this.feed.byId(id, userId);
  }

  @Post(':id/view')
  view(@Param('id') id: string): Promise<{ ok: true }> {
    return this.feed.view(id);
  }

  // ===========================================================================
  // Authenticated writes
  // ===========================================================================

  @Post()
  @UseGuards(JwtAuthGuard)
  // Cap to 20 uploads/hour per user — generous for legitimate creators
  // (≈ 1 every 3 minutes) but blocks bulk-bot spam.
  @Throttle({ windowSec: 3600, max: 20 })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createVideoInputSchema)) input: CreateVideoInput,
  ): Promise<VideoPost> {
    return this.feed.create(user.userId, input);
  }

  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  like(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ liked: boolean; likes: number }> {
    return this.feed.like(user.userId, id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    return this.feed.remove(user.userId, id);
  }

  /**
   * Phase 12.2 — User reports a video.
   * Throttled 10/hour/IP — a determined bot would burn through quickly,
   * but combined with the per-(video,reporter) UNIQUE index in
   * `bootstrap-phase12-2.ts` it makes coordinated false-flag campaigns
   * costly while staying invisible to genuine reporters.
   */
  @Post(':id/report')
  @UseGuards(JwtAuthGuard)
  @Throttle({ windowSec: 3600, max: 10 })
  report(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reportVideoInputSchema)) body: ReportVideoInput,
  ): Promise<{ ok: true; pendingReports: number }> {
    return this.feed.report(user.userId, id, body);
  }

  private userFromHeader(req: any): string | null {
    try {
      const h = (req?.headers?.authorization ?? '') as string;
      if (!h.toLowerCase().startsWith('bearer ')) return null;
      const token = h.slice(7);
      const payload = this.jwt.verify(token) as { sub?: string };
      return payload?.sub ?? null;
    } catch {
      return null;
    }
  }
}
