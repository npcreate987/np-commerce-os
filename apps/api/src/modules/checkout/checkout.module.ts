import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { CreatorModule } from '../creator/creator.module';
import { CouponModule } from '../coupon/coupon.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

@Module({
  imports: [
    PrismaModule,
    CartModule,
    LogisticsModule,
    CreatorModule,
    CouponModule,
    LoyaltyModule,
  ],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
