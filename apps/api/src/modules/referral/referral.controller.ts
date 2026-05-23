import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ClaimReferralInput,
  Referral,
  ReferralClaim,
  claimReferralInputSchema,
} from '../../shared/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import { ReferralService } from './referral.service';

@Controller('referrals')
@UseGuards(JwtAuthGuard)
export class ReferralController {
  constructor(private readonly referral: ReferralService) {}

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<Referral> {
    return this.referral.getOrCreate(user.userId);
  }

  @Get('me/claims')
  myClaims(@CurrentUser() user: AuthenticatedUser): Promise<ReferralClaim[]> {
    return this.referral.myClaims(user.userId);
  }

  @Post('claim')
  claim(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(claimReferralInputSchema)) input: ClaimReferralInput,
  ): Promise<ReferralClaim> {
    return this.referral.claim(user.userId, input.code);
  }
}
