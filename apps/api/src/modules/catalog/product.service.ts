import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CreateProductInput,
  Product,
  ProductMedia,
  ProductStatus,
  UpdateProductInput,
} from '../../shared/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ShopService } from '../merchant/shop.service';

interface DbProduct {
  id: string;
  shopId: string;
  name: string;
  description: string | null;
  priceCents: number;
  stock: number;
  status: string;
  createdAt: Date;
  media: { id: string; url: string; kind: string; sort: number }[];
}

@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: ShopService,
  ) {}

  async listPublic(params: { limit?: number; cursor?: string }): Promise<Product[]> {
    const limit = Math.min(params.limit ?? 24, 100);
    const list = await this.prisma.product.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
      include: { media: { orderBy: { sort: 'asc' } } },
    });
    return list.map((p) => this.toProduct(p));
  }

  async listByShop(shopId: string): Promise<Product[]> {
    const list = await this.prisma.product.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
      include: { media: { orderBy: { sort: 'asc' } } },
    });
    return list.map((p) => this.toProduct(p));
  }

  async getById(id: string): Promise<Product> {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: { media: { orderBy: { sort: 'asc' } } },
    });
    if (!p) throw new NotFoundException('Product not found');
    return this.toProduct(p);
  }

  async create(userId: string, shopId: string, input: CreateProductInput): Promise<Product> {
    await this.shops.assertOwner(shopId, userId);
    const created = await this.prisma.product.create({
      data: {
        shopId,
        name: input.name,
        description: input.description ?? null,
        priceCents: input.priceCents,
        stock: input.stock,
        status: 'ACTIVE',
        media: input.mediaUrls?.length
          ? { create: input.mediaUrls.map((url, sort) => ({ url, kind: 'IMAGE', sort })) }
          : undefined,
      },
      include: { media: { orderBy: { sort: 'asc' } } },
    });
    return this.toProduct(created);
  }

  async update(userId: string, productId: string, input: UpdateProductInput): Promise<Product> {
    const existing = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!existing) throw new NotFoundException('Product not found');
    await this.shops.assertOwner(existing.shopId, userId);

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: {
        name: input.name,
        description: input.description,
        priceCents: input.priceCents,
        stock: input.stock,
        status: input.status,
      },
      include: { media: { orderBy: { sort: 'asc' } } },
    });
    return this.toProduct(updated);
  }

  private toProduct(p: DbProduct): Product {
    const media: ProductMedia[] = p.media.map((m) => ({
      id: m.id,
      url: m.url,
      kind: m.kind === 'VIDEO' ? 'VIDEO' : 'IMAGE',
      sort: m.sort,
    }));
    return {
      id: p.id,
      shopId: p.shopId,
      name: p.name,
      description: p.description,
      priceCents: p.priceCents,
      stock: p.stock,
      status: p.status as ProductStatus,
      media,
      createdAt: p.createdAt.toISOString(),
    };
  }
}
