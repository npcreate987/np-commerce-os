import { Module } from '@nestjs/common';
import { AiOpsController } from './aiops.controller';
import { AiOpsService } from './aiops.service';

@Module({
  controllers: [AiOpsController],
  providers: [AiOpsService],
})
export class AiOpsModule {}
