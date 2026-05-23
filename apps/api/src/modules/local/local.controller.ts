import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AssignMenuItemInput,
  CreateMenuCategoryInput,
  CreateTimeSlotInput,
  LocalStore,
  LocalStoreKind,
  MenuCategory,
  TimeSlot,
  TimeSlotKind,
  UpsertLocalStoreInput,
  assignMenuItemSchema,
  createMenuCategorySchema,
  createTimeSlotSchema,
  localStoreKindSchema,
  upsertLocalStoreSchema,
} from '../../shared/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import { LocalService } from './local.service';

@Controller('local')
export class LocalController {
  constructor(private readonly local: LocalService) {}

  // -------- Public discovery --------

  @Get('stores/nearby')
  nearby(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('kind') kind?: string,
  ): Promise<LocalStore[]> {
    const parsed = {
      lat: Number(lat),
      lng: Number(lng),
      radiusKm: radiusKm ? Number(radiusKm) : 10,
      kind: (kind ? localStoreKindSchema.parse(kind) : undefined) as
        | LocalStoreKind
        | undefined,
    };
    return this.local.nearby(parsed);
  }

  @Get('stores/:shopId')
  async getStore(@Param('shopId') shopId: string): Promise<LocalStore | null> {
    return this.local.getStoreByShop(shopId);
  }

  @Get('stores/:shopId/menu')
  menu(@Param('shopId') shopId: string) {
    return this.local.listMenu(shopId);
  }

  @Get('stores/:shopId/slots')
  listSlots(
    @Param('shopId') shopId: string,
    @Query('kind') kind?: string,
    @Query('from') from?: string,
  ): Promise<TimeSlot[]> {
    const tk = (kind ? (kind as TimeSlotKind) : undefined) as TimeSlotKind | undefined;
    return this.local.listSlots(shopId, tk, from);
  }

  @Get('stores/:shopId/delivery-quote')
  deliveryQuote(
    @Param('shopId') shopId: string,
    @Query('lat') lat: string,
    @Query('lng') lng: string,
  ) {
    return this.local.quoteDelivery(shopId, Number(lat), Number(lng));
  }

  // -------- Merchant: store setup --------

  @UseGuards(JwtAuthGuard)
  @Put('shops/:shopId')
  upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId') shopId: string,
    @Body(new ZodValidationPipe(upsertLocalStoreSchema)) body: UpsertLocalStoreInput,
  ): Promise<LocalStore> {
    return this.local.upsertStore(user.userId, shopId, body);
  }

  // -------- Merchant: menu categories --------

  @UseGuards(JwtAuthGuard)
  @Get('shops/:shopId/menu/categories')
  categories(@Param('shopId') shopId: string): Promise<MenuCategory[]> {
    return this.local.listCategories(shopId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('shops/:shopId/menu/categories')
  createCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId') shopId: string,
    @Body(new ZodValidationPipe(createMenuCategorySchema)) body: CreateMenuCategoryInput,
  ): Promise<MenuCategory> {
    return this.local.createCategory(user.userId, shopId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('shops/:shopId/menu/categories/:id')
  deleteCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId') shopId: string,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    return this.local
      .deleteCategory(user.userId, shopId, id)
      .then(() => ({ ok: true as const }));
  }

  @UseGuards(JwtAuthGuard)
  @Post('shops/:shopId/menu/categories/:id/items')
  assignItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId') shopId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(assignMenuItemSchema)) body: AssignMenuItemInput,
  ): Promise<{ ok: true }> {
    return this.local.assignItem(user.userId, shopId, id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('shops/:shopId/menu/categories/:id/items/:productId')
  removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId') shopId: string,
    @Param('id') id: string,
    @Param('productId') productId: string,
  ): Promise<{ ok: true }> {
    return this.local
      .removeItem(user.userId, shopId, id, productId)
      .then(() => ({ ok: true as const }));
  }

  // -------- Merchant: time slots --------

  @UseGuards(JwtAuthGuard)
  @Post('shops/:shopId/slots')
  createSlot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId') shopId: string,
    @Body(new ZodValidationPipe(createTimeSlotSchema)) body: CreateTimeSlotInput,
  ): Promise<TimeSlot> {
    return this.local.createSlot(user.userId, shopId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('shops/:shopId/slots/:id')
  deleteSlot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId') shopId: string,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    return this.local
      .deleteSlot(user.userId, shopId, id)
      .then(() => ({ ok: true as const }));
  }
}
