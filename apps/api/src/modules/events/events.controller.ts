import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import {
  ConsentState,
  EventFirehoseStats,
  StartSessionInput,
  TrackBatchInput,
  UpdateConsentInput,
  UserEvent,
  startSessionInputSchema,
  trackBatchInputSchema,
  updateConsentInputSchema,
} from '../../shared/types';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { ConsentService } from './consent.service';
import { EventsService } from './events.service';

interface OptionalUserRequest extends FastifyRequest {
  user?: AuthenticatedUser;
}

/**
 * Phase 10.1 — `/v1/events/*` and `/v1/me/privacy`.
 *
 * Two distinct surfaces:
 *
 *   1. **Telemetry ingestion** — open to anonymous traffic. We accept any batch
 *      with valid anonId+sessionId. The JWT is *optional*: when present, the
 *      events get tagged with userId, otherwise they stay anonymous.
 *
 *   2. **Privacy controls** — JWT required. Lets the user inspect their own
 *      data, toggle behavioural tracking, and erase their history.
 */
@Controller()
export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly consent: ConsentService,
  ) {}

  /* ── Telemetry (open) ── */

  @Post('events/session')
  @UseGuards(OptionalJwtAuthGuard)
  async startSession(
    @Req() req: OptionalUserRequest,
    @Body(new ZodValidationPipe(startSessionInputSchema))
    input: StartSessionInput,
  ): Promise<{ sessionId: string; anonId: string; startedAt: string }> {
    return this.events.startSession(req.user?.userId ?? null, input);
  }

  @Post('events/batch')
  @UseGuards(OptionalJwtAuthGuard)
  async ingest(
    @Req() req: OptionalUserRequest,
    @Body(new ZodValidationPipe(trackBatchInputSchema))
    input: TrackBatchInput,
  ): Promise<{ accepted: number; dropped: number; reason?: string }> {
    const ua =
      (req.headers['user-agent'] as string | undefined)?.slice(0, 512) ?? null;
    const referrer =
      (req.headers.referer as string | undefined)?.slice(0, 512) ?? null;
    return this.events.ingestBatch(
      {
        userId: req.user?.userId ?? null,
        userAgent: ua,
        referrer,
      },
      input,
    );
  }

  /** Hook called by the auth flow after a successful login — stitch any
   *  anonymous events to the new userId. */
  @Post('events/link-anon')
  @UseGuards(JwtAuthGuard)
  async linkAnon(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { anonId?: string },
  ): Promise<{ ok: true }> {
    if (body?.anonId && typeof body.anonId === 'string') {
      await this.events.linkAnonToUser(body.anonId, user.userId);
    }
    return { ok: true };
  }

  /* ── Privacy (JWT required) ── */

  @Get('me/privacy')
  @UseGuards(JwtAuthGuard)
  getPrivacy(@CurrentUser() user: AuthenticatedUser): Promise<ConsentState> {
    return this.consent.get(user.userId);
  }

  @Patch('me/privacy')
  @UseGuards(JwtAuthGuard)
  updatePrivacy(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateConsentInputSchema))
    input: UpdateConsentInput,
  ): Promise<ConsentState> {
    return this.consent.update(user.userId, input);
  }

  @Get('me/events')
  @UseGuards(JwtAuthGuard)
  myEvents(@CurrentUser() user: AuthenticatedUser): Promise<UserEvent[]> {
    return this.events.recentForUser(user.userId, 100);
  }

  @Delete('me/events')
  @UseGuards(JwtAuthGuard)
  deleteMyEvents(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ deletedEvents: number }> {
    return this.consent.deleteMyHistory(user.userId);
  }

  /* ── Admin firehose KPIs ── */

  @Get('events/stats')
  @UseGuards(JwtAuthGuard)
  stats(@CurrentUser() user: AuthenticatedUser): Promise<EventFirehoseStats> {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Admins only');
    return this.events.stats();
  }
}
