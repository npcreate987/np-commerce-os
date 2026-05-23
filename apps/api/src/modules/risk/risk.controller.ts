import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { LogisticsIssue, OrderRisk, ShopRisk } from '../../shared/types';
import { RiskService } from './risk.service';

@Controller('risk')
@UseGuards(JwtAuthGuard, AdminGuard)
export class RiskController {
  constructor(private readonly svc: RiskService) {}

  @Get('shops')
  shops(@Query('limit') limit?: string): Promise<ShopRisk[]> {
    const n = limit ? Number.parseInt(limit, 10) : 50;
    return this.svc.shops(Number.isFinite(n) ? n : 50);
  }

  @Get('shops/:shopId')
  async detail(@Param('shopId') shopId: string): Promise<ShopRisk> {
    const r = await this.svc.shopDetail(shopId);
    if (!r) throw new NotFoundException('ไม่พบร้าน');
    return r;
  }

  @Get('orders/suspicious')
  orders(@Query('limit') limit?: string): Promise<OrderRisk[]> {
    const n = limit ? Number.parseInt(limit, 10) : 50;
    return this.svc.suspiciousOrders(Number.isFinite(n) ? n : 50);
  }

  @Get('logistics')
  logistics(): Promise<LogisticsIssue[]> {
    return this.svc.logisticsIssues();
  }
}
