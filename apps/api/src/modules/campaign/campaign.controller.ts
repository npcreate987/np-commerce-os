import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  Campaign,
  CampaignKind,
  CampaignProduct,
  CampaignProductView,
  CreateCampaignInput,
  JoinCampaignInput,
  campaignKindSchema,
  createCampaignInputSchema,
  joinCampaignInputSchema,
} from '../../shared/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import { CampaignService } from './campaign.service';

@Controller('campaigns')
export class CampaignController {
  constructor(private readonly campaigns: CampaignService) {}

  // -------- Public --------

  @Get('active')
  active(@Query('kind') kind?: string): Promise<Campaign[]> {
    const k = kind ? (campaignKindSchema.parse(kind) as CampaignKind) : undefined;
    return this.campaigns.listActive(k);
  }

  @Get(':id')
  byId(@Param('id') id: string): Promise<Campaign | null> {
    return this.campaigns.getById(id);
  }

  @Get(':id/products')
  products(@Param('id') id: string): Promise<CampaignProductView[]> {
    return this.campaigns.listProducts(id);
  }

  // -------- Merchant --------

  @Get('shops/:shopId')
  @UseGuards(JwtAuthGuard)
  listForShop(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId') shopId: string,
  ): Promise<Campaign[]> {
    return this.campaigns.listForShop(user.userId, shopId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createCampaignInputSchema)) input: CreateCampaignInput,
  ): Promise<Campaign> {
    return this.campaigns.create(user.userId, input);
  }

  @Post(':id/products')
  @UseGuards(JwtAuthGuard)
  join(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(joinCampaignInputSchema)) input: JoinCampaignInput,
  ): Promise<CampaignProduct> {
    return this.campaigns.joinProduct(user.userId, id, input);
  }

  @Delete(':id/products/:productId')
  @UseGuards(JwtAuthGuard)
  leave(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('productId') productId: string,
  ): Promise<{ ok: true }> {
    return this.campaigns.leaveProduct(user.userId, id, productId);
  }

  @Patch(':id/toggle')
  @UseGuards(JwtAuthGuard)
  toggle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { active: boolean },
  ): Promise<Campaign> {
    return this.campaigns.toggle(user.userId, id, !!body.active);
  }
}
