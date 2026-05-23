import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import {
  CreatorMatch,
  DemandForecastPoint,
  InsightAnomaly,
  PriceSuggestion,
  SalesTrendPoint,
  SegmentSummary,
  ShopInsightsOverview,
  TopProduct,
} from '../../shared/types';
import { InsightsService } from './insights.service';

@Controller('insights')
@UseGuards(JwtAuthGuard)
export class InsightsController {
  constructor(private readonly svc: InsightsService) {}

  @Get('shops/:shopId/overview')
  overview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId') shopId: string,
    @Query('days') days?: string,
  ): Promise<ShopInsightsOverview> {
    const n = days ? Number.parseInt(days, 10) : 30;
    return this.svc.overview(user.userId, shopId, Number.isFinite(n) ? n : 30);
  }

  @Get('shops/:shopId/trend')
  trend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId') shopId: string,
    @Query('days') days?: string,
  ): Promise<SalesTrendPoint[]> {
    const n = days ? Number.parseInt(days, 10) : 14;
    return this.svc.trend(user.userId, shopId, Number.isFinite(n) ? n : 14);
  }

  @Get('shops/:shopId/forecast')
  forecast(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId') shopId: string,
    @Query('horizon') horizon?: string,
  ): Promise<DemandForecastPoint[]> {
    const n = horizon ? Number.parseInt(horizon, 10) : 7;
    return this.svc.forecast(
      user.userId,
      shopId,
      Number.isFinite(n) ? n : 7,
    );
  }

  @Get('shops/:shopId/top-products')
  top(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId') shopId: string,
    @Query('limit') limit?: string,
  ): Promise<TopProduct[]> {
    const n = limit ? Number.parseInt(limit, 10) : 10;
    return this.svc.topProducts(user.userId, shopId, Number.isFinite(n) ? n : 10);
  }

  @Get('shops/:shopId/anomalies')
  anomalies(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId') shopId: string,
  ): Promise<InsightAnomaly[]> {
    return this.svc.anomalies(user.userId, shopId);
  }

  @Get('shops/:shopId/price-suggestions')
  prices(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId') shopId: string,
  ): Promise<PriceSuggestion[]> {
    return this.svc.priceSuggestions(user.userId, shopId);
  }

  @Get('shops/:shopId/creator-matches')
  creators(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId') shopId: string,
    @Query('limit') limit?: string,
  ): Promise<CreatorMatch[]> {
    const n = limit ? Number.parseInt(limit, 10) : 5;
    return this.svc.creatorMatches(user.userId, shopId, Number.isFinite(n) ? n : 5);
  }

  @Get('shops/:shopId/segments')
  segments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId') shopId: string,
  ): Promise<SegmentSummary[]> {
    return this.svc.segments(user.userId, shopId);
  }
}
