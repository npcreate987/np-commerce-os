// Plain ESM seed — runs with `node prisma/seed.mjs` (no tsx, no IPC pipe).
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await argon2.hash('password123');

  const merchant = await prisma.user.upsert({
    where: { email: 'shop@np.dev' },
    update: {},
    create: {
      email: 'shop@np.dev',
      name: 'NP Demo Shop Owner',
      role: 'MERCHANT',
      passwordHash,
    },
  });

  const customer = await prisma.user.upsert({
    where: { email: 'user@np.dev' },
    update: {},
    create: {
      email: 'user@np.dev',
      name: 'NP Demo Customer',
      role: 'CUSTOMER',
      passwordHash,
    },
  });

  const shop = await prisma.shop.upsert({
    where: { slug: 'np-demo-shop' },
    update: {},
    create: {
      ownerId: merchant.id,
      name: 'NP Demo Shop',
      slug: 'np-demo-shop',
      description: 'ร้านตัวอย่างสำหรับทดสอบ NP Commerce OS',
      status: 'ACTIVE',
    },
  });

  const sampleProducts = [
    {
      name: 'เสื้อยืดคอกลม Cotton 100%',
      description: 'นุ่ม ระบายอากาศดี ใส่สบายทุกโอกาส',
      priceCents: 29900,
      stock: 50,
      media: 'https://picsum.photos/seed/np1/600/600',
    },
    {
      name: 'หูฟัง Bluetooth ไร้สาย',
      description: 'เสียงดี แบตอึด กันน้ำ IPX5',
      priceCents: 89000,
      stock: 30,
      media: 'https://picsum.photos/seed/np2/600/600',
    },
    {
      name: 'แก้วน้ำเก็บอุณหภูมิ 500ml',
      description: 'เย็น 24 ชม. ร้อน 12 ชม.',
      priceCents: 45000,
      stock: 100,
      media: 'https://picsum.photos/seed/np3/600/600',
    },
  ];

  // Skip if already seeded
  const existing = await prisma.product.count({ where: { shopId: shop.id } });
  if (existing === 0) {
    for (const p of sampleProducts) {
      await prisma.product.create({
        data: {
          shopId: shop.id,
          name: p.name,
          description: p.description,
          priceCents: p.priceCents,
          stock: p.stock,
          status: 'ACTIVE',
          media: {
            create: [{ url: p.media, kind: 'IMAGE', sort: 0 }],
          },
        },
      });
    }
  }

  console.log('Seed complete', {
    merchant: merchant.email,
    customer: customer.email,
    shop: shop.slug,
    products: sampleProducts.length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
