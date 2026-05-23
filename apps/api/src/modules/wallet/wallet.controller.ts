import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Wallet, WalletEntry } from '../../shared/types';
import { WalletService } from './wallet.service';

@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  mine(@CurrentUser() user: AuthenticatedUser): Promise<Wallet> {
    return this.wallet.myWallet(user.userId);
  }

  @Get('entries')
  entries(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ): Promise<WalletEntry[]> {
    const n = limit ? Math.max(1, Math.min(200, Number(limit))) : 50;
    return this.wallet.myEntries(user.userId, n);
  }
}
