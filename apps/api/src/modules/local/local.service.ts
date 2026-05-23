import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  AssignMenuItemInput,
  CreateMenuCategoryInput,
  CreateTimeSlotInput,
  LocalStore,
  LocalStoreKind,
  MenuCategory,
  MenuGroup,
  NearbyQuery,
  OpenHours,
  TimeSlot,
  TimeSlotKind,
  UpsertLocalStoreInput,
} from '../../shared/types';

interface DbLocalStore {
  id: string;
  shopId: string;
  kind: string;
  lat: number;
  lng: number;
  addressText: string;
  deliveryRadiusKm: number;
  pickupEnabled: number;
  deliveryEnabled: number;
  prepTimeMinutes: number;
  openHoursJson: string;
  active: number;
  baseDeliveryCents: number;
  perKmCents: number;
  createdAt: string;
}

interface DbShopInfo {
  shopName: string | null;
  shopSlug: string | null;
}

interface DbMenuCategory {
  id: string;
  shopId: string;
  name: string;
  sort: number;
  createdAt: string;
}

interface DbTimeSlot {
  id: string;
  shopId: string;
  kind: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  taken: number;
  createdAt: string;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

/** Haversine distance (km) — good enough for nearby search. */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

@Injectable()
export class LocalService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Store
  // ---------------------------------------------------------------------------

  async upsertStore(
    userId: string,
    shopId: string,
    input: UpsertLocalStoreInput,
  ): Promise<LocalStore> {
    await this.assertShopOwner(shopId, userId);

    const existing = await this.findStoreByShop(shopId);
    if (existing) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE local_stores SET
            kind = ?, lat = ?, lng = ?, addressText = ?,
            deliveryRadiusKm = ?, pickupEnabled = ?, deliveryEnabled = ?,
            prepTimeMinutes = ?, openHoursJson = ?, active = ?,
            baseDeliveryCents = ?, perKmCents = ?, updatedAt = CURRENT_TIMESTAMP
          WHERE id = ?`,
        input.kind,
        input.lat,
        input.lng,
        input.addressText,
        input.deliveryRadiusKm,
        input.pickupEnabled ? 1 : 0,
        input.deliveryEnabled ? 1 : 0,
        input.prepTimeMinutes,
        JSON.stringify(input.openHours ?? {}),
        input.active ? 1 : 0,
        input.baseDeliveryCents,
        input.perKmCents,
        existing.id,
      );
    } else {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO local_stores
          (id, shopId, kind, lat, lng, addressText,
           deliveryRadiusKm, pickupEnabled, deliveryEnabled,
           prepTimeMinutes, openHoursJson, active,
           baseDeliveryCents, perKmCents)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        newId('lst'),
        shopId,
        input.kind,
        input.lat,
        input.lng,
        input.addressText,
        input.deliveryRadiusKm,
        input.pickupEnabled ? 1 : 0,
        input.deliveryEnabled ? 1 : 0,
        input.prepTimeMinutes,
        JSON.stringify(input.openHours ?? {}),
        input.active ? 1 : 0,
        input.baseDeliveryCents,
        input.perKmCents,
      );
    }

    const fresh = await this.findStoreByShop(shopId);
    if (!fresh) throw new Error('Local store upsert failed');
    return fresh;
  }

  async getStoreByShop(shopId: string): Promise<LocalStore | null> {
    return this.findStoreByShop(shopId);
  }

  async getStoreByShopOrThrow(shopId: string): Promise<LocalStore> {
    const store = await this.findStoreByShop(shopId);
    if (!store) throw new NotFoundException('ร้านนี้ยังไม่ได้ตั้งค่า Local Commerce');
    return store;
  }

  /**
   * Nearby search via Haversine; SQLite ไม่มี geo native ก็เลย load + filter ฝั่ง app.
   * Active set ขนาดเล็กพอที่ดีในเฟสนี้.
   */
  async nearby(query: NearbyQuery): Promise<LocalStore[]> {
    const condKind = query.kind ? `AND ls.kind = ?` : '';
    const params: unknown[] = [];
    if (query.kind) params.push(query.kind);

    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT ls.id, ls.shopId, ls.kind, ls.lat, ls.lng, ls.addressText,
              ls.deliveryRadiusKm, ls.pickupEnabled, ls.deliveryEnabled,
              ls.prepTimeMinutes, ls.openHoursJson, ls.active,
              ls.baseDeliveryCents, ls.perKmCents, ls.createdAt,
              s.name AS shopName, s.slug AS shopSlug
         FROM local_stores ls
         INNER JOIN shops s ON s.id = ls.shopId
         WHERE ls.active = 1
           AND s.status IN ('ACTIVE', 'PENDING')
           ${condKind}
         LIMIT 500`,
      ...params,
    )) as Array<DbLocalStore & DbShopInfo>;

    const out: LocalStore[] = [];
    for (const r of rows) {
      const distance = haversineKm(query.lat, query.lng, r.lat, r.lng);
      if (distance > query.radiusKm) continue;
      out.push({ ...this.toStore(r, r), distanceKm: Math.round(distance * 100) / 100 });
    }
    out.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    return out.slice(0, 80);
  }

  // ---------------------------------------------------------------------------
  // Menu categories
  // ---------------------------------------------------------------------------

  async createCategory(
    userId: string,
    shopId: string,
    input: CreateMenuCategoryInput,
  ): Promise<MenuCategory> {
    await this.assertShopOwner(shopId, userId);
    const id = newId('mcat');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO menu_categories (id, shopId, name, sort) VALUES (?, ?, ?, ?)`,
      id,
      shopId,
      input.name,
      input.sort,
    );
    const cat = await this.getCategory(id);
    if (!cat) throw new Error('Insert menu_category failed');
    return cat;
  }

  async listCategories(shopId: string): Promise<MenuCategory[]> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, shopId, name, sort, createdAt
         FROM menu_categories
         WHERE shopId = ?
         ORDER BY sort ASC, createdAt ASC`,
      shopId,
    )) as DbMenuCategory[];
    return rows.map((r) => this.toCategory(r));
  }

  async deleteCategory(userId: string, shopId: string, categoryId: string): Promise<void> {
    await this.assertShopOwner(shopId, userId);
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM menu_categories WHERE id = ? AND shopId = ?`,
      categoryId,
      shopId,
    );
  }

  async assignItem(
    userId: string,
    shopId: string,
    categoryId: string,
    input: AssignMenuItemInput,
  ): Promise<{ ok: true }> {
    await this.assertShopOwner(shopId, userId);

    // Validate category belongs to shop + product belongs to shop
    const catRows = (await this.prisma.$queryRawUnsafe(
      `SELECT id FROM menu_categories WHERE id = ? AND shopId = ?`,
      categoryId,
      shopId,
    )) as Array<{ id: string }>;
    if (catRows.length === 0) throw new NotFoundException('ไม่พบหมวด');

    const prodRows = (await this.prisma.$queryRawUnsafe(
      `SELECT id FROM products WHERE id = ? AND shopId = ?`,
      input.productId,
      shopId,
    )) as Array<{ id: string }>;
    if (prodRows.length === 0) throw new NotFoundException('สินค้านี้ไม่ใช่ของร้าน');

    const dup = (await this.prisma.$queryRawUnsafe(
      `SELECT id FROM menu_item_maps WHERE categoryId = ? AND productId = ?`,
      categoryId,
      input.productId,
    )) as Array<{ id: string }>;
    if (dup.length > 0) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE menu_item_maps SET sort = ? WHERE categoryId = ? AND productId = ?`,
        input.sort,
        categoryId,
        input.productId,
      );
    } else {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO menu_item_maps (id, categoryId, productId, sort) VALUES (?, ?, ?, ?)`,
        newId('mim'),
        categoryId,
        input.productId,
        input.sort,
      );
    }
    return { ok: true };
  }

  async removeItem(
    userId: string,
    shopId: string,
    categoryId: string,
    productId: string,
  ): Promise<void> {
    await this.assertShopOwner(shopId, userId);
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM menu_item_maps
         WHERE categoryId = ? AND productId = ?
           AND categoryId IN (SELECT id FROM menu_categories WHERE shopId = ?)`,
      categoryId,
      productId,
      shopId,
    );
  }

  /**
   * Return menu grouped: [{ category, items: Product[] }, ..., unsorted at end].
   * Includes only ACTIVE products.
   */
  async listMenu(shopId: string): Promise<MenuGroup[]> {
    const cats = await this.listCategories(shopId);

    const mapRows = (await this.prisma.$queryRawUnsafe(
      `SELECT m.categoryId, m.productId, m.sort,
              p.name, p.description, p.priceCents, p.stock,
              (SELECT pm.url FROM product_media pm
                  WHERE pm.productId = p.id
                  ORDER BY pm.sort ASC, pm.createdAt ASC LIMIT 1) AS mediaUrl
         FROM menu_item_maps m
         INNER JOIN products p ON p.id = m.productId
         WHERE p.shopId = ? AND p.status = 'ACTIVE'
         ORDER BY m.sort ASC, p.createdAt ASC`,
      shopId,
    )) as Array<{
      categoryId: string;
      productId: string;
      sort: number;
      name: string;
      description: string | null;
      priceCents: number;
      stock: number;
      mediaUrl: string | null;
    }>;

    const itemsByCat = new Map<string, typeof mapRows>();
    for (const m of mapRows) {
      const arr = itemsByCat.get(m.categoryId) ?? [];
      arr.push(m);
      itemsByCat.set(m.categoryId, arr);
    }

    const out: MenuGroup[] = cats.map((c) => ({
      category: c,
      items: (itemsByCat.get(c.id) ?? []).map((m) => ({
        id: m.productId,
        name: m.name,
        description: m.description,
        priceCents: Number(m.priceCents),
        stock: Number(m.stock),
        mediaUrl: m.mediaUrl,
      })),
    }));

    // Add "unsorted" — products not assigned to any category
    const unsorted = (await this.prisma.$queryRawUnsafe(
      `SELECT p.id, p.name, p.description, p.priceCents, p.stock,
              (SELECT pm.url FROM product_media pm
                  WHERE pm.productId = p.id
                  ORDER BY pm.sort ASC, pm.createdAt ASC LIMIT 1) AS mediaUrl
         FROM products p
         WHERE p.shopId = ? AND p.status = 'ACTIVE'
           AND p.id NOT IN (SELECT productId FROM menu_item_maps)
         ORDER BY p.createdAt ASC
         LIMIT 200`,
      shopId,
    )) as Array<{
      id: string;
      name: string;
      description: string | null;
      priceCents: number;
      stock: number;
      mediaUrl: string | null;
    }>;
    if (unsorted.length > 0) {
      out.push({
        category: null,
        items: unsorted.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          priceCents: Number(p.priceCents),
          stock: Number(p.stock),
          mediaUrl: p.mediaUrl,
        })),
      });
    }

    return out;
  }

  // ---------------------------------------------------------------------------
  // Time slots
  // ---------------------------------------------------------------------------

  async createSlot(
    userId: string,
    shopId: string,
    input: CreateTimeSlotInput,
  ): Promise<TimeSlot> {
    await this.assertShopOwner(shopId, userId);
    const starts = new Date(input.startsAt);
    const ends = new Date(input.endsAt);
    if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) {
      throw new BadRequestException('Invalid date');
    }
    if (ends <= starts) {
      throw new BadRequestException('endsAt ต้องมากกว่า startsAt');
    }
    const id = newId('slot');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO time_slots (id, shopId, kind, startsAt, endsAt, capacity)
        VALUES (?, ?, ?, ?, ?, ?)`,
      id,
      shopId,
      input.kind,
      starts.toISOString(),
      ends.toISOString(),
      input.capacity,
    );
    const fresh = await this.getSlot(id);
    if (!fresh) throw new Error('Insert slot failed');
    return fresh;
  }

  async listSlots(
    shopId: string,
    kind?: TimeSlotKind,
    fromIso?: string,
  ): Promise<TimeSlot[]> {
    const fromTs = fromIso ? new Date(fromIso).toISOString() : new Date().toISOString();
    const params: unknown[] = [shopId, fromTs];
    let cond = '';
    if (kind) {
      cond = `AND kind = ?`;
      params.push(kind);
    }
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, shopId, kind, startsAt, endsAt, capacity, taken, createdAt
         FROM time_slots
         WHERE shopId = ? AND startsAt >= ? ${cond}
         ORDER BY startsAt ASC
         LIMIT 200`,
      ...params,
    )) as DbTimeSlot[];
    return rows.map((r) => this.toSlot(r));
  }

  async deleteSlot(userId: string, shopId: string, slotId: string): Promise<void> {
    await this.assertShopOwner(shopId, userId);
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM time_slots WHERE id = ? AND shopId = ?`,
      slotId,
      shopId,
    );
  }

  /** Increment taken on a slot. Returns updated slot. Throws if full. */
  async reserveSlot(slotId: string): Promise<TimeSlot> {
    const slot = await this.getSlot(slotId);
    if (!slot) throw new NotFoundException('ไม่พบช่วงเวลา');
    if (slot.taken >= slot.capacity) {
      throw new BadRequestException('ช่วงเวลานี้เต็มแล้ว');
    }
    await this.prisma.$executeRawUnsafe(
      `UPDATE time_slots SET taken = taken + 1 WHERE id = ? AND taken < capacity`,
      slotId,
    );
    const next = await this.getSlot(slotId);
    if (!next) throw new Error('Slot disappeared');
    return next;
  }

  // ---------------------------------------------------------------------------
  // Delivery quote (used in checkout for local stores)
  // ---------------------------------------------------------------------------

  /** Calculate delivery cost from local store to a destination lat/lng. */
  async quoteDelivery(
    shopId: string,
    dropLat: number,
    dropLng: number,
  ): Promise<{
    distanceKm: number;
    costCents: number;
    inRange: boolean;
  }> {
    const store = await this.getStoreByShopOrThrow(shopId);
    const distanceKm = haversineKm(store.lat, store.lng, dropLat, dropLng);
    const inRange = distanceKm <= store.deliveryRadiusKm;
    const beyond = Math.max(0, distanceKm - 1);
    const costCents = store.baseDeliveryCents + Math.ceil(beyond) * store.perKmCents;
    return {
      distanceKm: Math.round(distanceKm * 100) / 100,
      costCents,
      inRange,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async assertShopOwner(shopId: string, userId: string): Promise<void> {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('ไม่พบร้านค้า');
    if (shop.ownerId !== userId) throw new ForbiddenException('ไม่ใช่ร้านของคุณ');
  }

  private async findStoreByShop(shopId: string): Promise<LocalStore | null> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT ls.id, ls.shopId, ls.kind, ls.lat, ls.lng, ls.addressText,
              ls.deliveryRadiusKm, ls.pickupEnabled, ls.deliveryEnabled,
              ls.prepTimeMinutes, ls.openHoursJson, ls.active,
              ls.baseDeliveryCents, ls.perKmCents, ls.createdAt,
              s.name AS shopName, s.slug AS shopSlug
         FROM local_stores ls
         LEFT JOIN shops s ON s.id = ls.shopId
         WHERE ls.shopId = ?`,
      shopId,
    )) as Array<DbLocalStore & DbShopInfo>;
    const first = rows[0];
    return first ? this.toStore(first, first) : null;
  }

  private async getCategory(id: string): Promise<MenuCategory | null> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, shopId, name, sort, createdAt
         FROM menu_categories WHERE id = ?`,
      id,
    )) as DbMenuCategory[];
    return rows[0] ? this.toCategory(rows[0]) : null;
  }

  private async getSlot(id: string): Promise<TimeSlot | null> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, shopId, kind, startsAt, endsAt, capacity, taken, createdAt
         FROM time_slots WHERE id = ?`,
      id,
    )) as DbTimeSlot[];
    return rows[0] ? this.toSlot(rows[0]) : null;
  }

  private toStore(r: DbLocalStore, info: DbShopInfo): LocalStore {
    let openHours: OpenHours = {};
    try {
      openHours = JSON.parse(r.openHoursJson || '{}') as OpenHours;
    } catch {
      openHours = {};
    }
    return {
      id: r.id,
      shopId: r.shopId,
      shopName: info.shopName ?? null,
      shopSlug: info.shopSlug ?? null,
      kind: r.kind as LocalStoreKind,
      lat: Number(r.lat),
      lng: Number(r.lng),
      addressText: r.addressText,
      deliveryRadiusKm: Number(r.deliveryRadiusKm),
      pickupEnabled: Number(r.pickupEnabled) === 1,
      deliveryEnabled: Number(r.deliveryEnabled) === 1,
      prepTimeMinutes: Number(r.prepTimeMinutes),
      openHours,
      active: Number(r.active) === 1,
      baseDeliveryCents: Number(r.baseDeliveryCents),
      perKmCents: Number(r.perKmCents),
      createdAt: new Date(r.createdAt).toISOString(),
    };
  }

  private toCategory(r: DbMenuCategory): MenuCategory {
    return {
      id: r.id,
      shopId: r.shopId,
      name: r.name,
      sort: Number(r.sort),
      createdAt: new Date(r.createdAt).toISOString(),
    };
  }

  private toSlot(r: DbTimeSlot): TimeSlot {
    const capacity = Number(r.capacity);
    const taken = Number(r.taken);
    return {
      id: r.id,
      shopId: r.shopId,
      kind: r.kind as TimeSlotKind,
      startsAt: new Date(r.startsAt).toISOString(),
      endsAt: new Date(r.endsAt).toISOString(),
      capacity,
      taken,
      available: Math.max(0, capacity - taken),
      createdAt: new Date(r.createdAt).toISOString(),
    };
  }
}
