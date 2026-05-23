import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { WalletModule } from '../wallet/wallet.module';
import { CreatorModule } from '../creator/creator.module';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  imports: [PrismaModule, LogisticsModule, WalletModule, CreatorModule],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
