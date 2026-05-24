import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { AccountDeletionService } from './account-deletion.service';

/**
 * Phase 17 — Account deletion endpoints (Google Play + Apple required).
 *
 * Flow:
 *   GET    /v1/me/account/deletion           — current status (pending/purgeAt/grace)
 *   DELETE /v1/me/account                    — request deletion (start 30d grace)
 *   POST   /v1/me/account/deletion/cancel    — cancel within grace window
 *
 * All three require JWT — the user must prove they own the account.
 * The 2-tap path from /profile → "ลบบัญชี" is wired in the web client.
 */
@UseGuards(JwtAuthGuard)
@Controller('me/account')
export class AccountDeletionController {
  constructor(private readonly deletion: AccountDeletionService) {}

  @Get('deletion')
  status(@CurrentUser() current: AuthenticatedUser): Promise<{
    pending: boolean;
    requestedAt: string | null;
    purgeAt: string | null;
    graceDays: number;
  }> {
    return this.deletion.getStatus(current.userId);
  }

  @Delete()
  @HttpCode(202)
  request(
    @CurrentUser() current: AuthenticatedUser,
    @Body() body: { reason?: string } = {},
  ): Promise<{ purgeAt: string; graceDays: number }> {
    return this.deletion.requestDeletion(current.userId, body.reason);
  }

  @Post('deletion/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<{ cancelled: boolean }> {
    return this.deletion.cancelDeletion(current.userId);
  }
}
