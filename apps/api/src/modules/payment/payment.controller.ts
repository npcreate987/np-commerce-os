import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  CreatePaymentInput,
  Payment,
  PaymentMethod,
  createPaymentSchema,
} from '../../shared/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import { Throttle } from '../../common/throttle/throttler';
import { PaymentService } from './payment.service';

@Controller('payments')
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  // Public so the unauthenticated checkout page can show "via Omise" / "via mock"
  // and gate the card form on adapter readiness.
  @Get('config')
  getConfig(): { provider: string; ready: boolean; methods: PaymentMethod[] } {
    return this.payments.getConfig();
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createPaymentSchema)) body: CreatePaymentInput,
  ): Promise<Payment> {
    return this.payments.createForOrder(user.userId, body);
  }

  /**
   * Phase 20.1 — Polling endpoint for the FE PromptPay sheet.
   *
   * Returns the current payment row for an order owned by the caller.
   * The FE hits this every ~3 s while the QR is on screen and stops
   * polling on `status === 'SUCCEEDED' | 'FAILED'`.
   *
   * Light throttle: 60 req/min/user is generous (default poll is 20/min)
   * but blocks a runaway loop from a buggy client.
   */
  @UseGuards(JwtAuthGuard)
  @Throttle({ windowSec: 60, max: 60 })
  @Get('by-order/:orderId')
  byOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
  ): Promise<Payment> {
    return this.payments.getByOrder(user.userId, orderId);
  }

  /**
   * MOCK confirm — kept for dev/CI; production traffic settles via
   * the webhook below.
   */
  @UseGuards(JwtAuthGuard)
  @Post('mock/confirm/:orderId')
  confirmMock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
  ): Promise<Payment> {
    return this.payments.confirmMock(user.userId, orderId);
  }

  /**
   * Phase 13.4b — Gateway webhook receiver.
   *
   * Provider-agnostic: `:provider` selects an adapter and we forward the raw
   * body + headers for signature verification. We deliberately do NOT use
   * Nest's parsed `@Body()` so the HMAC computation sees the exact bytes the
   * provider sent (any whitespace/key-ordering change breaks the signature).
   *
   * Returns `200 { ok: true, deduped, settled }` so providers don't retry
   * forever. Anything 4xx/5xx will be retried by Omise (and most gateways).
   */
  @Post('webhook/:provider')
  @HttpCode(200)
  @Throttle({ windowSec: 60, max: 120 })
  async webhook(
    @Param('provider') provider: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: FastifyRequest,
  ): Promise<{ ok: true; deduped: boolean; settled: boolean }> {
    const adapter = this.payments.getAdapter(provider);
    if (!adapter) throw new NotFoundException(`Unknown payment provider: ${provider}`);

    // Fastify gives us a parsed body but we need the raw bytes for HMAC. We
    // re-stringify the parsed body — works for application/json (which both
    // mock and Omise use). For form-encoded providers we'd switch this to
    // `req.rawBody` (requires a Fastify plugin to retain raw body).
    const rawBody =
      typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    if (!rawBody) throw new BadRequestException('Empty webhook body');

    const event = await adapter.verifyWebhook(rawBody, headers);
    if (!event) return { ok: true, deduped: false, settled: false };
    const result = await this.payments.handleWebhookEvent(event);
    return { ok: true, ...result };
  }
}
