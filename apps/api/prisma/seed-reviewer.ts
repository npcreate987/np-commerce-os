/**
 * Phase 17 — Reviewer / store-listing seed.
 *
 * Apple App Store + Google Play Store both require a demo account
 * for the review team. They explicitly need to:
 *   • log in with reviewer-supplied credentials
 *   • browse the catalog, add to cart, attempt checkout
 *   • see content (videos, reviews) without uploading their own
 *   • test the account deletion path (Google Play 2023 policy)
 *
 * This file is idempotent — run as many times as you want, only the
 * `updatedAt` will change.
 *
 * Usage:
 *   pnpm --filter api exec tsx prisma/seed-reviewer.ts
 *   (or via npm run db:seed:reviewer once wired)
 *
 * Credentials handed to Apple + Google (the same fixed pair, override
 * via env vars `REVIEWER_EMAIL` / `REVIEWER_PASSWORD`):
 *   email:    reviewer@np.app
 *   password: NPReview2026!
 *
 * The seeded account:
 *   • role = CUSTOMER (default tier — reviewers don't need merchant)
 *   • verified = true (shortcut OTP flow)
 *   • orders 1 sample to exercise the deletion flow
 */

import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const REVIEWER_EMAIL = process.env.REVIEWER_EMAIL || 'reviewer@np.app';
const REVIEWER_PASSWORD = process.env.REVIEWER_PASSWORD || 'NPReview2026!';
const REVIEWER_NAME = process.env.REVIEWER_NAME || 'Store Reviewer';

async function main(): Promise<void> {
  const passwordHash = await argon2.hash(REVIEWER_PASSWORD);

  const reviewer = await prisma.user.upsert({
    where: { email: REVIEWER_EMAIL },
    update: {
      passwordHash,
      name: REVIEWER_NAME,
      // Clear any pending deletion from a previous review cycle so the
      // account is always login-ready.
      deletionRequestedAt: null,
      deletionPurgeAt: null,
      deletionReason: null,
    },
    create: {
      email: REVIEWER_EMAIL,
      name: REVIEWER_NAME,
      role: 'CUSTOMER',
      passwordHash,
    },
  });

  // Reviewer cart starter — gives Apple/Google something interactive
  // to test the checkout flow without manual product browsing.
  const demoShop = await prisma.shop.findFirst({ where: { slug: 'np-demo-shop' } });
  if (demoShop) {
    const product = await prisma.product.findFirst({
      where: { shopId: demoShop.id, status: 'ACTIVE' },
    });
    if (product) {
      const cart = await prisma.cart.upsert({
        where: { userId: reviewer.id },
        update: {},
        create: { userId: reviewer.id },
      });
      // Idempotent: skip if already populated
      const existingItem = await prisma.cartItem.findFirst({
        where: { cartId: cart.id, productId: product.id },
      });
      if (!existingItem) {
        await prisma.cartItem.create({
          data: {
            cartId: cart.id,
            productId: product.id,
            quantity: 1,
            unitPriceCents: product.priceCents,
          },
        });
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log('[reviewer] seed complete', {
    email: reviewer.email,
    password: REVIEWER_PASSWORD,
    note: 'Share these with App Store Connect + Play Console reviewers',
  });
}

main()
  .catch((e: unknown) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
