import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AddToCartInput, Cart, CartItem, UpdateCartItemInput } from '../../shared/types';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(userId: string): Promise<Cart> {
    const existing = await this.prisma.cart.findUnique({
      where: { userId },
      include: { items: { include: { product: { include: { media: true } } } } },
    });
    if (existing) return this.toCart(existing);

    const created = await this.prisma.cart.create({
      data: { userId },
      include: { items: { include: { product: { include: { media: true } } } } },
    });
    return this.toCart(created);
  }

  async addItem(userId: string, input: AddToCartInput): Promise<Cart> {
    const product = await this.prisma.product.findUnique({ where: { id: input.productId } });
    if (!product || product.status !== 'ACTIVE') {
      throw new NotFoundException('Product not available');
    }
    if (product.stock < input.quantity) {
      throw new BadRequestException('Insufficient stock');
    }

    const cart = await this.prisma.cart.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });

    await this.prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId: input.productId } },
      update: { quantity: { increment: input.quantity }, unitPriceCents: product.priceCents },
      create: {
        cartId: cart.id,
        productId: input.productId,
        quantity: input.quantity,
        unitPriceCents: product.priceCents,
      },
    });

    return this.getOrCreate(userId);
  }

  async updateItem(userId: string, itemId: string, input: UpdateCartItemInput): Promise<Cart> {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (!cart) throw new NotFoundException('Cart not found');
    const item = await this.prisma.cartItem.findUnique({ where: { id: itemId } });
    if (!item || item.cartId !== cart.id) throw new NotFoundException('Item not found');

    if (input.quantity === 0) {
      await this.prisma.cartItem.delete({ where: { id: itemId } });
    } else {
      await this.prisma.cartItem.update({
        where: { id: itemId },
        data: { quantity: input.quantity },
      });
    }
    return this.getOrCreate(userId);
  }

  async clear(userId: string): Promise<void> {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (!cart) return;
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  }

  private toCart(c: {
    id: string;
    items: {
      id: string;
      productId: string;
      quantity: number;
      unitPriceCents: number;
      product: { name: string; media: { url: string; sort: number }[] };
    }[];
  }): Cart {
    const items: CartItem[] = c.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      productName: it.product.name,
      unitPriceCents: it.unitPriceCents,
      quantity: it.quantity,
      mediaUrl:
        it.product.media.length > 0
          ? [...it.product.media].sort((a, b) => a.sort - b.sort)[0]!.url
          : null,
    }));
    const subtotalCents = items.reduce((sum, x) => sum + x.unitPriceCents * x.quantity, 0);
    return { id: c.id, items, subtotalCents };
  }
}
