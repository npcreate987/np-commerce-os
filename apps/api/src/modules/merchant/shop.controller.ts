import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CreateShopInput, Shop, createShopSchema } from '../../shared/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import { ShopService } from './shop.service';

@Controller('shops')
export class ShopController {
  constructor(private readonly shop: ShopService) {}

  @Get(':slug')
  bySlug(@Param('slug') slug: string): Promise<Shop> {
    return this.shop.findBySlug(slug);
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine/list')
  mine(@CurrentUser() user: AuthenticatedUser): Promise<Shop[]> {
    return this.shop.findMine(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createShopSchema)) body: CreateShopInput,
  ): Promise<Shop> {
    return this.shop.create(user.userId, body);
  }
}
