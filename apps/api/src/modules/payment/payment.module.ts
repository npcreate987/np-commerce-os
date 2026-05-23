import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { LocalModule } from '../local/local.module';
import { RiderModule } from '../rider/rider.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';

@Module({
  imports: [WalletModule, LocalModule, RiderModule, LoyaltyModule],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
