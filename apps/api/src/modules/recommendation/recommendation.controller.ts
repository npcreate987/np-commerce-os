import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import {
  BuyAgainItem,
  ProductRecommendation,
  TrackProductViewInput,
  trackProductViewInputSchema,
} from '../../shared/types';
import { RecommendationService } from './recommendation.service';

@Controller('recommendations')
export class RecommendationController {
  constructor(private readonly recs: RecommendationService) {}

  /** "For You" — personalised; requires auth.
   *  Phase 10.2: routes through `forYou2` (taste-profile-aware) which
   *  silently falls back to legacy popularity-blended `forYou` for cold-start users. */
  @Get('for-you')
  @UseGuards(JwtAuthGuard)
  forYou(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ): Promise<ProductRecommendation[]> {
    const n = limit ? Number.parseInt(limit, 10) : 12;
    return this.recs.forYou2(user.userId, Number.isFinite(n) ? n : 12);
  }

  /** Per-candidate score breakdown — used by the privacy page so users can
   *  see *why* they're being shown each item. */
  @Get('for-you/explain')
  @UseGuards(JwtAuthGuard)
  forYouExplain(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ) {
    const n = limit ? Number.parseInt(limit, 10) : 12;
    return this.recs.forYou2Explain(user.userId, Number.isFinite(n) ? n : 12);
  }

  /** "Similar products" — public */
  @Get('similar/:productId')
  similar(
    @Param('productId') productId: string,
    @Query('limit') limit?: string,
  ): Promise<ProductRecommendation[]> {
    const n = limit ? Number.parseInt(limit, 10) : 8;
    return this.recs.similar(productId, Number.isFinite(n) ? n : 8);
  }

  /** "Trending" — public, no auth required */
  @Get('trending')
  trending(
    @Query('limit') limit?: string,
  ): Promise<ProductRecommendation[]> {
    const n = limit ? Number.parseInt(limit, 10) : 12;
    return this.recs.trending(Number.isFinite(n) ? n : 12);
  }

  /** "Buy again" — requires auth */
  @Get('buy-again')
  @UseGuards(JwtAuthGuard)
  buyAgain(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ): Promise<BuyAgainItem[]> {
    const n = limit ? Number.parseInt(limit, 10) : 12;
    return this.recs.buyAgain(user.userId, Number.isFinite(n) ? n : 12);
  }

  /** Track product view — public (writes anonymous if no token) */
  @Post('track-view')
  async trackView(
    @Body(new ZodValidationPipe(trackProductViewInputSchema))
    input: TrackProductViewInput,
  ): Promise<{ ok: true }> {
    await this.recs.trackView(null, input.productId, input.source);
    return { ok: true };
  }
}
