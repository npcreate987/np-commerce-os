import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateShopInput, Shop, ShopStatus } from '../../shared/types';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ShopService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: string, input: CreateShopInput): Promise<Shop> {
    const exists = await this.prisma.shop.findUnique({ where: { slug: input.slug } });
    if (exists) {
      throw new ConflictException('Shop slug already taken');
    }
    const shop = await this.prisma.shop.create({
      data: {
        ownerId,
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        status: 'PENDING',
      },
    });
    await this.prisma.user.update({
      where: { id: ownerId },
      data: { role: 'MERCHANT' },
    });
    return this.toShop(shop);
  }

  async findMine(ownerId: string): Promise<Shop[]> {
    const list = await this.prisma.shop.findMany({ where: { ownerId } });
    return list.map((s) => this.toShop(s));
  }

  async findBySlug(slug: string): Promise<Shop> {
    const shop = await this.prisma.shop.findUnique({ where: { slug } });
    if (!shop) throw new NotFoundException('Shop not found');
    return this.toShop(shop);
  }

  async assertOwner(shopId: string, userId: string): Promise<void> {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('Shop not found');
    if (shop.ownerId !== userId) throw new ForbiddenException('Not your shop');
  }

  private toShop(s: {
    id: string;
    ownerId: string;
    name: string;
    slug: string;
    description: string | null;
    logoUrl: string | null;
    status: string;
    createdAt: Date;
  }): Shop {
    return {
      id: s.id,
      ownerId: s.ownerId,
      name: s.name,
      slug: s.slug,
      description: s.description,
      logoUrl: s.logoUrl,
      status: s.status as ShopStatus,
      createdAt: s.createdAt.toISOString(),
    };
  }
}
