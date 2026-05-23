import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  CreateProductInput,
  Product,
  UpdateProductInput,
  createProductSchema,
  updateProductSchema,
} from '../../shared/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import { ProductService } from './product.service';

@Controller('products')
export class ProductController {
  constructor(private readonly products: ProductService) {}

  @Get()
  list(@Query('limit') limit?: string, @Query('cursor') cursor?: string): Promise<Product[]> {
    return this.products.listPublic({
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }

  @Get(':id')
  getOne(@Param('id') id: string): Promise<Product> {
    return this.products.getById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('shop/:shopId/list')
  byShop(@Param('shopId') shopId: string): Promise<Product[]> {
    return this.products.listByShop(shopId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('shop/:shopId')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId') shopId: string,
    @Body(new ZodValidationPipe(createProductSchema)) body: CreateProductInput,
  ): Promise<Product> {
    return this.products.create(user.userId, shopId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) body: UpdateProductInput,
  ): Promise<Product> {
    return this.products.update(user.userId, id, body);
  }
}
