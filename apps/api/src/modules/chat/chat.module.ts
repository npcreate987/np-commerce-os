import { Module } from '@nestjs/common';
import { IntegrationModule } from '../integration/integration.module';
import { OrderModule } from '../order/order.module';
import { DisputeModule } from '../dispute/dispute.module';
import { ReviewModule } from '../review/review.module';
import { ProactiveModule } from '../proactive/proactive.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [
    IntegrationModule,
    OrderModule,
    DisputeModule,
    ReviewModule,
    ProactiveModule,
  ],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
