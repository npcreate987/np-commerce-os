import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { WalletModule } from '../wallet/wallet.module';
import { CreatorModule } from '../creator/creator.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { DisputeController } from './dispute.controller';
import { DisputeService } from './dispute.service';

@Module({
  imports: [PrismaModule, WalletModule, CreatorModule, LoyaltyModule],
  controllers: [DisputeController],
  providers: [DisputeService],
  exports: [DisputeService],
})
export class DisputeModule {}
