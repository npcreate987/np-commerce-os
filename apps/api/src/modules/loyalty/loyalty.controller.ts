import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  LoyaltyAccount,
  LoyaltyEntry,
  RedeemLoyaltyInput,
  redeemLoyaltyInputSchema,
} from '../../shared/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import { LoyaltyService } from './loyalty.service';

@Controller('loyalty')
@UseGuards(JwtAuthGuard)
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<LoyaltyAccount> {
    return this.loyalty.getOrCreate(user.userId);
  }

  @Get('me/entries')
  entries(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ): Promise<LoyaltyEntry[]> {
    return this.loyalty.getEntries(user.userId, limit ? Number(limit) : 50);
  }

  @Post('redeem')
  redeem(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(redeemLoyaltyInputSchema)) input: RedeemLoyaltyInput,
  ): Promise<{ discountCents: number; account: LoyaltyAccount }> {
    return this.loyalty.redeem(user.userId, input.points);
  }
}
