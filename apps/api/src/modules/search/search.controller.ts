import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import {
  ProductSearchInput,
  ProductSearchResult,
  ShopSearchHit,
  Suggestion,
  TrackSearchInput,
  TrendingQuery,
  productSearchInputSchema,
  trackSearchInputSchema,
} from '../../shared/types';
import { SearchService } from './search.service';

interface MaybeAuthRequest {
  user?: { userId: string };
}

@Controller('search')
export class SearchController {
  constructor(private readonly svc: SearchService) {}

  /**
   * Public product search. If caller has a valid JWT we attribute the query,
   * but auth is not required (anonymous browsing is allowed).
   */
  @Post('products')
  products(
    @Body(new ZodValidationPipe(productSearchInputSchema)) input: ProductSearchInput,
    @Req() req: MaybeAuthRequest,
  ): Promise<ProductSearchResult> {
    return this.svc.searchProducts(input, req.user?.userId ?? null);
  }

  @Get('shops')
  shops(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ): Promise<ShopSearchHit[]> {
    const n = limit ? Number.parseInt(limit, 10) : 12;
    return this.svc.searchShops(q ?? '', Number.isFinite(n) ? n : 12);
  }

  @Get('suggestions')
  suggestions(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ): Promise<Suggestion[]> {
    const n = limit ? Number.parseInt(limit, 10) : 8;
    return this.svc.suggestions(q ?? '', Number.isFinite(n) ? n : 8);
  }

  @Post('track')
  track(
    @Body(new ZodValidationPipe(trackSearchInputSchema)) input: TrackSearchInput,
    @Req() req: MaybeAuthRequest,
  ): Promise<{ ok: true }> {
    return this.svc.track(input, req.user?.userId ?? null);
  }

  // ---- Admin analytics ----
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('analytics/trending')
  trending(@Query('limit') limit?: string): Promise<TrendingQuery[]> {
    const n = limit ? Number.parseInt(limit, 10) : 30;
    return this.svc.trendingQueries(Number.isFinite(n) ? n : 30);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('analytics/zero-result')
  zeroResult(@Query('limit') limit?: string): Promise<TrendingQuery[]> {
    const n = limit ? Number.parseInt(limit, 10) : 30;
    return this.svc.zeroResultQueries(Number.isFinite(n) ? n : 30);
  }
}
