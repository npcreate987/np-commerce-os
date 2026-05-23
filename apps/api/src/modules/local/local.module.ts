import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { LocalController } from './local.controller';
import { LocalService } from './local.service';

@Module({
  imports: [PrismaModule],
  controllers: [LocalController],
  providers: [LocalService],
  exports: [LocalService],
})
export class LocalModule {}
