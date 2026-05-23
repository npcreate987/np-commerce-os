import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import {
  CreateReviewInput,
  HidePhotoInput,
  HideReviewInput,
  ModerationReview,
  PendingReviewItem,
  RatingSummary,
  Review,
  ReviewListItem,
  ReviewPhoto,
  createReviewInputSchema,
  hidePhotoInputSchema,
  hideReviewInputSchema,
} from '../../shared/types';
import { JwtService } from '@nestjs/jwt';
import { ReviewService } from './review.service';

@Controller('reviews')
export class ReviewController {
  constructor(
    private readonly svc: ReviewService,
    private readonly jwt: JwtService,
  ) {}

  // ---- Public reads (optional auth → adds helpfulByMe) ----
  @Get('product/:productId')
  listForProduct(
    @Req() req: unknown,
    @Param('productId') productId: string,
    @Query('limit') limit?: string,
  ): Promise<ReviewListItem[]> {
    const n = limit ? Number.parseInt(limit, 10) : 20;
    const viewerId = this.userFromHeader(req);
    return this.svc.listForProduct(
      productId,
      Number.isFinite(n) ? n : 20,
      viewerId,
    );
  }

  @Get('product/:productId/summary')
  productSummary(
    @Param('productId') productId: string,
  ): Promise<RatingSummary> {
    return this.svc.summaryForProduct(productId);
  }

  @Get('shop/:shopId/summary')
  shopSummary(@Param('shopId') shopId: string): Promise<RatingSummary> {
    return this.svc.summaryForShop(shopId);
  }

  // ---- Auth: customer ----
  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createReviewInputSchema)) input: CreateReviewInput,
  ): Promise<Review> {
    return this.svc.create(user.userId, input);
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine')
  listMine(@CurrentUser() user: AuthenticatedUser): Promise<Review[]> {
    return this.svc.listMine(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('pending')
  pending(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PendingReviewItem[]> {
    return this.svc.pending(user.userId);
  }

  // ---- Admin moderation ----
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('moderation')
  moderation(@Query('limit') limit?: string): Promise<ModerationReview[]> {
    const n = limit ? Number.parseInt(limit, 10) : 50;
    return this.svc.moderationList(Number.isFinite(n) ? n : 50);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id/hide')
  hide(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(hideReviewInputSchema)) input: HideReviewInput,
  ): Promise<Review> {
    return this.svc.hide(id, input);
  }

  // ---- Helpful votes ----
  @UseGuards(JwtAuthGuard)
  @Post(':id/helpful')
  toggleHelpful(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ helpfulCount: number; helpfulByMe: boolean }> {
    return this.svc.toggleHelpful(user.userId, id);
  }

  // ---- Admin: per-photo moderation ----
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('photos/:photoId/hide')
  hidePhoto(
    @Param('photoId') photoId: string,
    @Body(new ZodValidationPipe(hidePhotoInputSchema)) input: HidePhotoInput,
  ): Promise<ReviewPhoto> {
    return this.svc.hidePhoto(photoId, input);
  }

  // ---- Helpers ----
  private userFromHeader(req: unknown): string | null {
    try {
      const h =
        ((req as { headers?: { authorization?: string } })?.headers
          ?.authorization ?? '') as string;
      if (!h.toLowerCase().startsWith('bearer ')) return null;
      const payload = this.jwt.verify(h.slice(7)) as { sub?: string };
      return payload?.sub ?? null;
    } catch {
      return null;
    }
  }
}
