import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { ModelRunRecent, ModelRunSummary } from '../../shared/types';
import { AiOpsService } from './aiops.service';

@Controller('aiops')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AiOpsController {
  constructor(private readonly svc: AiOpsService) {}

  @Get('summary')
  summary(): Promise<ModelRunSummary[]> {
    return this.svc.summary();
  }

  @Get('recent')
  recent(@Query('limit') limit?: string): Promise<ModelRunRecent[]> {
    const n = limit ? Number.parseInt(limit, 10) : 50;
    return this.svc.recent(Number.isFinite(n) ? n : 50);
  }
}
