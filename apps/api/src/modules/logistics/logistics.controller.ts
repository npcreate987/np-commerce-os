import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  Carrier,
  Shipment,
  ShippingQuote,
  ShippingQuoteRequest,
  shippingQuoteRequestSchema,
} from '../../shared/types';
import { LogisticsService } from './logistics.service';

@Controller()
export class LogisticsPublicController {
  constructor(private readonly logistics: LogisticsService) {}

  @Get('carriers')
  carriers(): Promise<Carrier[]> {
    return this.logistics.listCarriers();
  }

  @Post('shipping/quote')
  quote(
    @Body(new ZodValidationPipe(shippingQuoteRequestSchema)) input: ShippingQuoteRequest,
  ): Promise<ShippingQuote> {
    return this.logistics.quote(input);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('shipments')
export class ShipmentController {
  constructor(private readonly logistics: LogisticsService) {}

  @Get(':orderId')
  byOrder(@Param('orderId') orderId: string): Promise<Shipment> {
    return this.logistics.getShipment(orderId);
  }

  @Post(':orderId/advance')
  advance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
  ): Promise<Shipment> {
    return this.logistics.advanceMock(orderId, user.userId);
  }
}
