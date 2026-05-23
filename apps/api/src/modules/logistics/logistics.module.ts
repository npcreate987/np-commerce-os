import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { LogisticsPublicController, ShipmentController } from './logistics.controller';
import { LogisticsService } from './logistics.service';

@Module({
  imports: [PrismaModule],
  controllers: [LogisticsPublicController, ShipmentController],
  providers: [LogisticsService],
  exports: [LogisticsService],
})
export class LogisticsModule {}
