import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ConfirmUploadInput,
  PresignUploadInput,
  PresignUploadResult,
  StorageConfig,
  confirmUploadInputSchema,
  presignUploadInputSchema,
} from '../../shared/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import { StorageService } from './storage.service';

/**
 * Phase 9.2 — `/v1/storage/*`
 *
 * Flow:
 *   1) Client compresses image client-side → calls POST /presign
 *   2) Server stores audit row + returns `uploadUrl` (PUT presigned)
 *   3) Client PUTs the file directly to the storage provider
 *   4) Client calls POST /confirm with uploadId + sha256
 *   5) Other endpoints (e.g. review.create) accept the same uploadId to
 *      attach the object to a domain row
 */
@Controller('storage')
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(private readonly svc: StorageService) {}

  @Get('config')
  config(): StorageConfig {
    return this.svc.getConfig();
  }

  @Post('presign')
  presign(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(presignUploadInputSchema))
    input: PresignUploadInput,
  ): Promise<PresignUploadResult> {
    return this.svc.presign(user.userId, input);
  }

  @Post('confirm')
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(confirmUploadInputSchema))
    input: ConfirmUploadInput,
  ): Promise<{ ok: true; objectKey: string; publicUrl: string }> {
    return this.svc.confirm(user.userId, input);
  }
}
