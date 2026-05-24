import { Module } from '@nestjs/common';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { MerchantModule } from './modules/merchant/merchant.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CartModule } from './modules/cart/cart.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { OrderModule } from './modules/order/order.module';
import { PaymentModule } from './modules/payment/payment.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { LogisticsModule } from './modules/logistics/logistics.module';
import { DisputeModule } from './modules/dispute/dispute.module';
import { CreatorModule } from './modules/creator/creator.module';
import { LocalModule } from './modules/local/local.module';
import { RiderModule } from './modules/rider/rider.module';
import { CouponModule } from './modules/coupon/coupon.module';
import { LoyaltyModule } from './modules/loyalty/loyalty.module';
import { ReferralModule } from './modules/referral/referral.module';
import { CampaignModule } from './modules/campaign/campaign.module';
import { FeedModule } from './modules/feed/feed.module';
import { BroadcastModule } from './modules/broadcast/broadcast.module';
import { RecommendationModule } from './modules/recommendation/recommendation.module';
import { InsightsModule } from './modules/insights/insights.module';
import { RiskModule } from './modules/risk/risk.module';
import { AiOpsModule } from './modules/aiops/aiops.module';
import { ReviewModule } from './modules/review/review.module';
import { SearchModule } from './modules/search/search.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { NotificationModule } from './modules/notification/notification.module';
import { StorageModule } from './modules/storage/storage.module';
import { ChatModule } from './modules/chat/chat.module';
import { EventsModule } from './modules/events/events.module';
import { TasteModule } from './modules/taste/taste.module';
import { ProactiveModule } from './modules/proactive/proactive.module';
import { HealthController } from './common/health.controller';
import { MetricsController } from './common/observability/metrics.controller';
import { AppVersionController } from './common/app-version.controller';
import { LiveUpdatesController } from './common/live-updates.controller';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UserModule,
    MerchantModule,
    CatalogModule,
    CartModule,
    CheckoutModule,
    OrderModule,
    PaymentModule,
    WalletModule,
    LogisticsModule,
    DisputeModule,
    CreatorModule,
    LocalModule,
    RiderModule,
    CouponModule,
    LoyaltyModule,
    ReferralModule,
    CampaignModule,
    FeedModule,
    BroadcastModule,
    RecommendationModule,
    InsightsModule,
    RiskModule,
    AiOpsModule,
    ReviewModule,
    SearchModule,
    IntegrationModule,
    NotificationModule,
    StorageModule,
    ChatModule,
    EventsModule,
    TasteModule,
    ProactiveModule,
  ],
  controllers: [
    HealthController,
    MetricsController,
    AppVersionController,
    LiveUpdatesController,
  ],
})
export class AppModule {}
