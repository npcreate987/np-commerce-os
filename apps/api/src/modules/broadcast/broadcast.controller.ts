import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  Broadcast,
  CreateBroadcastInput,
  InAppMessage,
  createBroadcastInputSchema,
} from '../../shared/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import { BroadcastService } from './broadcast.service';

@Controller('broadcasts')
@UseGuards(JwtAuthGuard)
export class BroadcastController {
  constructor(private readonly bc: BroadcastService) {}

  // -------- Merchant --------

  @Get('shops/:shopId')
  listForShop(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId') shopId: string,
  ): Promise<Broadcast[]> {
    return this.bc.listForShop(user.userId, shopId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createBroadcastInputSchema)) input: CreateBroadcastInput,
  ): Promise<Broadcast> {
    return this.bc.create(user.userId, input);
  }

  @Post(':id/send')
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Broadcast> {
    return this.bc.send(user.userId, id);
  }

  /** Preview number of recipients for a given audience (drives live counters in UI). */
  @Get('audience/preview')
  audiencePreview(
    @CurrentUser() user: AuthenticatedUser,
    @Query('audience') audience: string,
    @Query('shopId') shopId?: string,
  ): Promise<{ count: number }> {
    return this.bc
      .audienceCount(user.userId, shopId ?? null, audience ?? 'ALL')
      .then((count) => ({ count }));
  }

  // -------- User Inbox --------

  @Get('inbox')
  inbox(
    @CurrentUser() user: AuthenticatedUser,
    @Query('unread') unread?: string,
  ): Promise<InAppMessage[]> {
    return this.bc.listMine(user.userId, unread === '1' || unread === 'true');
  }

  @Patch('inbox/:id/read')
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    return this.bc.markRead(user.userId, id);
  }

  @Patch('inbox/read-all')
  markAllRead(@CurrentUser() user: AuthenticatedUser): Promise<{ ok: true }> {
    return this.bc.markAllRead(user.userId);
  }
}
