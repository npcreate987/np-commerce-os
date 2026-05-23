import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApplyCouponInput,
  Coupon,
  CouponQuote,
  CreateCouponInput,
  applyCouponInputSchema,
  createCouponInputSchema,
} from '../../shared/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import { CouponService } from './coupon.service';

@Controller('coupons')
export class CouponController {
  constructor(private readonly coupons: CouponService) {}

  // -------- Public --------

  @Get('available')
  available(@Query('shopId') shopId?: string): Promise<Coupon[]> {
    return this.coupons.listAvailable(shopId);
  }

  @Post('quote')
  @UseGuards(JwtAuthGuard)
  quote(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(applyCouponInputSchema)) input: ApplyCouponInput,
  ): Promise<CouponQuote> {
    return this.coupons.quote(user.userId, input);
  }

  // -------- Merchant --------

  @Get('shops/:shopId')
  @UseGuards(JwtAuthGuard)
  listForShop(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId') shopId: string,
  ): Promise<Coupon[]> {
    return this.coupons.listForShop(user.userId, shopId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createCouponInputSchema)) input: CreateCouponInput,
  ): Promise<Coupon> {
    return this.coupons.create(user.userId, input);
  }

  @Patch(':id/toggle')
  @UseGuards(JwtAuthGuard)
  toggle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { active: boolean },
  ): Promise<Coupon> {
    return this.coupons.toggle(user.userId, id, !!body.active);
  }
}
