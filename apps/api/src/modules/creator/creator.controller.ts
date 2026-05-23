import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  AffiliateAttribution,
  ApplyCreatorInput,
  CreateLinkInput,
  CreatorLink,
  CreatorProfile,
  CreatorStats,
  LinkResolve,
  applyCreatorSchema,
  createLinkSchema,
} from '../../shared/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import { CreatorService } from './creator.service';

@Controller('creators')
export class CreatorController {
  constructor(private readonly creators: CreatorService) {}

  // -------- Public discovery --------

  @Get()
  list(): Promise<CreatorProfile[]> {
    return this.creators.listActive();
  }

  // -------- Public link resolve (used by /r/[code] page) --------

  @Get('links/resolve/:code')
  resolveLink(@Param('code') code: string): Promise<LinkResolve> {
    return this.creators.resolve(code);
  }

  @Post('links/click/:code')
  trackClick(
    @Param('code') code: string,
    @Headers('user-agent') ua: string,
    @Headers('referer') ref: string,
  ): Promise<{ ok: true }> {
    return this.creators.trackClick(code, { ua, ref });
  }

  // -------- Authenticated routes for the creator themselves --------

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<CreatorProfile | null> {
    return this.creators.me(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('apply')
  apply(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(applyCreatorSchema)) body: ApplyCreatorInput,
  ): Promise<CreatorProfile> {
    return this.creators.apply(user.userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/stats')
  stats(@CurrentUser() user: AuthenticatedUser): Promise<CreatorStats> {
    return this.creators.myStats(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/links')
  myLinks(@CurrentUser() user: AuthenticatedUser): Promise<CreatorLink[]> {
    return this.creators.listMyLinks(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/links')
  createLink(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createLinkSchema)) body: CreateLinkInput,
  ): Promise<CreatorLink> {
    return this.creators.createLink(user.userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/links/:id')
  getMyLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<CreatorLink> {
    return this.creators.getMyLink(user.userId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/attributions')
  myAttributions(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AffiliateAttribution[]> {
    return this.creators.myAttributions(user.userId);
  }
}
