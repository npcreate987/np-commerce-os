import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import {
  CreateDisputeInput,
  Dispute,
  DisputeMessage,
  ReplyDisputeInput,
  ResolveDisputeInput,
  createDisputeInputSchema,
  replyDisputeInputSchema,
  resolveDisputeInputSchema,
} from '../../shared/types';
import { DisputeService } from './dispute.service';

@UseGuards(JwtAuthGuard)
@Controller('disputes')
export class DisputeController {
  constructor(private readonly disputes: DisputeService) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUser): Promise<Dispute[]> {
    return this.disputes.listMine(user.userId);
  }

  @Get('shop/:shopId')
  forShop(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId') shopId: string,
  ): Promise<Dispute[]> {
    return this.disputes.listForShop(user.userId, shopId);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<Dispute> {
    return this.disputes.getOne(user.userId, user.role, id);
  }

  @Post('order/:orderId')
  open(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body(new ZodValidationPipe(createDisputeInputSchema)) input: CreateDisputeInput,
  ): Promise<Dispute> {
    return this.disputes.open(user.userId, orderId, input);
  }

  @Post(':id/reply')
  reply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(replyDisputeInputSchema)) input: ReplyDisputeInput,
  ): Promise<DisputeMessage> {
    return this.disputes.reply(user.userId, user.role, id, input);
  }

  @Post(':id/resolve')
  resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resolveDisputeInputSchema)) input: ResolveDisputeInput,
  ): Promise<Dispute> {
    return this.disputes.resolve(user.userId, user.role, id, input);
  }
}
