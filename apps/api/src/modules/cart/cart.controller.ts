import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  AddToCartInput,
  Cart,
  UpdateCartItemInput,
  addToCartSchema,
  updateCartItemSchema,
} from '../../shared/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import { CartService } from './cart.service';

@UseGuards(JwtAuthGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<Cart> {
    return this.cart.getOrCreate(user.userId);
  }

  @Post('items')
  add(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(addToCartSchema)) body: AddToCartInput,
  ): Promise<Cart> {
    return this.cart.addItem(user.userId, body);
  }

  @Patch('items/:id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCartItemSchema)) body: UpdateCartItemInput,
  ): Promise<Cart> {
    return this.cart.updateItem(user.userId, id, body);
  }

  @Delete()
  async clear(@CurrentUser() user: AuthenticatedUser): Promise<{ ok: true }> {
    await this.cart.clear(user.userId);
    return { ok: true };
  }
}
