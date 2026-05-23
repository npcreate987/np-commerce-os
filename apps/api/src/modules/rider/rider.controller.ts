import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApplyRiderInput,
  DeliveryJob,
  DeliveryJobStatus,
  Rider,
  RiderLocationInput,
  applyRiderSchema,
  riderLocationSchema,
} from '../../shared/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import { RiderService } from './rider.service';

@Controller('riders')
export class RiderController {
  constructor(private readonly riders: RiderService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<Rider | null> {
    return this.riders.me(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('apply')
  apply(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(applyRiderSchema)) body: ApplyRiderInput,
  ): Promise<Rider> {
    return this.riders.apply(user.userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/location')
  updateLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(riderLocationSchema)) body: RiderLocationInput,
  ): Promise<Rider> {
    return this.riders.updateLocation(user.userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('jobs/open')
  openJobs(@CurrentUser() user: AuthenticatedUser): Promise<DeliveryJob[]> {
    return this.riders.openJobs(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('jobs/mine')
  myJobs(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ): Promise<DeliveryJob[]> {
    return this.riders.myJobs(user.userId, status as DeliveryJobStatus | undefined);
  }

  @UseGuards(JwtAuthGuard)
  @Post('jobs/:id/accept')
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<DeliveryJob> {
    return this.riders.accept(user.userId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('jobs/:id/pickup')
  pickup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<DeliveryJob> {
    return this.riders.pickup(user.userId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('jobs/:id/deliver')
  deliver(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<DeliveryJob> {
    return this.riders.deliver(user.userId, id);
  }

  // Public read of job state by orderId (visible to anyone w/ the orderId)
  @Get('jobs/by-order/:orderId')
  byOrder(@Param('orderId') orderId: string): Promise<DeliveryJob | null> {
    return this.riders.getJobByOrder(orderId);
  }
}
