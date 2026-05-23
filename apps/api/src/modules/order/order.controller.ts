import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Order, ShipOrderInput, shipOrderInputSchema } from '../../shared/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import { OrderService } from './order.service';

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUser): Promise<Order[]> {
    return this.orders.listMyOrders(user.userId);
  }

  @Get('shop/:shopId')
  byShop(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId') shopId: string,
  ): Promise<Order[]> {
    return this.orders.listShopOrders(user.userId, shopId);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<Order> {
    return this.orders.getOne(user.userId, user.role, id);
  }

  @Post(':id/ship')
  ship(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(shipOrderInputSchema)) input: ShipOrderInput,
  ): Promise<Order> {
    return this.orders.ship(user.userId, id, input);
  }

  @Post(':id/confirm-received')
  confirmReceived(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Order> {
    return this.orders.confirmReceived(user.userId, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<Order> {
    return this.orders.cancel(user.userId, id);
  }
}
