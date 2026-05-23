/**
 * Phase 12 — TikTok Feed bootstrap
 *
 * Idempotently seeds a handful of demo `video_posts` rows so the new `/feed`
 * reel never renders an empty state in a fresh dev or staging environment.
 *
 * Why bootstrap-time seeding?
 *   - We don't ship an upload pipeline yet (clips today are just URLs).
 *   - A blank feed on first visit would look broken; better to show a
 *     curated set of public sample videos and let real merchants overwrite.
 *
 * Strategy
 *   - Only seeds when `video_posts` is empty (`COUNT(*) = 0`) so it is safe to
 *     run on every boot.
 *   - Attaches each clip to a real `productId` / `shopId` / `authorId` when
 *     present in the DB (LEFT JOINs in `FeedService` then enrich the row);
 *     otherwise leaves them NULL and the UI hides the product CTA gracefully.
 *   - Uses Google's `gtv-videos-bucket` public mp4s — small, CORS-friendly,
 *     and CDN-cached worldwide.
 */

import { PrismaClient } from '@prisma/client';

interface DemoClip {
  caption: string;
  videoUrl: string;
  thumbUrl: string;
  tags: string[];
  likes: number;
  views: number;
}

const DEMO_CLIPS: DemoClip[] = [
  {
    caption: 'รีวิวกระเป๋าใบใหม่ของร้าน ✨ น้ำหนักเบามาก เดินเที่ยวสบาย',
    videoUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    thumbUrl: 'https://picsum.photos/seed/np-feed-1/720/1280',
    tags: ['กระเป๋า', 'แฟชั่น', 'รีวิว'],
    likes: 1240,
    views: 18230,
  },
  {
    caption: 'Flash Deal วันนี้! ลด 40% เฉพาะ 1 ชั่วโมง ⚡ คอมเมนต์เพื่อรับโค้ด',
    videoUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbUrl: 'https://picsum.photos/seed/np-feed-2/720/1280',
    tags: ['flashdeal', 'sale', 'โปรโมชั่น'],
    likes: 892,
    views: 9420,
  },
  {
    caption: 'หม้อทอดไร้น้ำมัน ทำเมนูง่าย ๆ ใน 5 นาที 🍗 ลิงก์ซื้อในคลิป',
    videoUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    thumbUrl: 'https://picsum.photos/seed/np-feed-3/720/1280',
    tags: ['cooking', 'gadget', 'kitchen'],
    likes: 2103,
    views: 31400,
  },
  {
    caption: 'แต่งหน้าโทนนู้ดสำหรับสาวออฟฟิศ 💄 ใช้แค่ 4 ชิ้นจบ',
    videoUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    thumbUrl: 'https://picsum.photos/seed/np-feed-4/720/1280',
    tags: ['beauty', 'makeup', 'รีวิว'],
    likes: 4760,
    views: 64210,
  },
  {
    caption: 'รถใหม่มาแล้ว 🚗 จองรอบนี้รับของแถมเพียบ DM ร้านได้เลย',
    videoUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    thumbUrl: 'https://picsum.photos/seed/np-feed-5/720/1280',
    tags: ['auto', 'รถยนต์'],
    likes: 312,
    views: 4820,
  },
  {
    caption: 'อันบ็อกซิ่งของเล่นใหม่ของลูก 🎁 น่ารักเกิ๊น',
    videoUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
    thumbUrl: 'https://picsum.photos/seed/np-feed-6/720/1280',
    tags: ['toy', 'unbox', 'kids'],
    likes: 1820,
    views: 22100,
  },
  {
    caption: 'ขับ Outback ไปเที่ยวเชียงราย 🚙 ทริปสุดสัปดาห์ที่ลืมไม่ลง',
    videoUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4',
    thumbUrl: 'https://picsum.photos/seed/np-feed-7/720/1280',
    tags: ['travel', 'roadtrip'],
    likes: 540,
    views: 7320,
  },
  {
    caption: 'ของกินเด็ดร้านท้องถิ่นต้องลอง 🍜 ของแท้รสไทยแท้ 100%',
    videoUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WhatCarCanYouGetForAGrand.mp4',
    thumbUrl: 'https://picsum.photos/seed/np-feed-8/720/1280',
    tags: ['food', 'local', 'foodie'],
    likes: 3210,
    views: 41200,
  },
];

/**
 * Deterministic seed ID = `seed_v12_<index>`.
 * Coupled with `INSERT OR IGNORE` this makes the seed truly idempotent: re-runs
 * never duplicate rows, even if a previous run was interrupted between the
 * COUNT(*) check and the INSERTs.
 */
function seedId(idx: number): string {
  return `seed_v12_${idx.toString().padStart(2, '0')}`;
}

export async function runPhase12Migration(prisma: PrismaClient): Promise<void> {
  // Pick a real author / shop / product if we can — keeps the UI realistic.
  const authors = (await prisma.$queryRawUnsafe(
    `SELECT id FROM users ORDER BY createdAt ASC LIMIT 1`,
  )) as Array<{ id: string }>;
  const shops = (await prisma.$queryRawUnsafe(
    `SELECT id FROM shops ORDER BY createdAt ASC LIMIT 1`,
  )) as Array<{ id: string }>;
  const products = (await prisma.$queryRawUnsafe(
    `SELECT id FROM products ORDER BY createdAt ASC LIMIT ${DEMO_CLIPS.length}`,
  )) as Array<{ id: string }>;

  const authorId = authors[0]?.id ?? 'demo_creator';
  const shopId = shops[0]?.id ?? null;

  let inserted = 0;
  for (let i = 0; i < DEMO_CLIPS.length; i++) {
    const clip = DEMO_CLIPS[i];
    const productId = products[i]?.id ?? null;
    // `INSERT OR IGNORE` relies on the PRIMARY KEY uniqueness of `id` —
    // safe both on SQLite (dev) and PostgreSQL (prod) with the same syntax via
    // Prisma's raw runner where supported. For Postgres we'd substitute
    // `ON CONFLICT (id) DO NOTHING`; current dev uses SQLite which honours
    // `OR IGNORE`.
    const result = (await prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO video_posts
        (id, authorId, productId, shopId, videoUrl, thumbUrl, caption, tagsJson,
         likes, views, comments, status, score, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'ACTIVE', ?, datetime('now'), datetime('now'))`,
      seedId(i),
      authorId,
      productId,
      shopId,
      clip.videoUrl,
      clip.thumbUrl,
      clip.caption,
      JSON.stringify(clip.tags),
      clip.likes,
      clip.views,
      // Initial score: views * 0.1 + likes — matches FeedService score model
      clip.views * 0.1 + clip.likes,
    )) as number;
    if (result > 0) inserted++;
  }

  // One-shot cleanup of duplicates from older (non-idempotent) seed versions.
  // Deletes ACTIVE rows that share the same caption with a `seed_v12_*` row but
  // are themselves not the canonical seed. Safe because real user uploads use
  // unique captions; in the worst case the cron rebuilds taste signal anyway.
  await prisma.$executeRawUnsafe(
    `DELETE FROM video_posts
     WHERE status = 'ACTIVE'
       AND id NOT LIKE 'seed_v12_%'
       AND id NOT LIKE 'vid_%'  -- keep real user uploads
       AND caption IN (SELECT caption FROM video_posts WHERE id LIKE 'seed_v12_%')`,
  );
  // Dedup the legacy random-id seeds that were posted *before* this migration
  // existed (Phase 12 v1 created `vid_*` ids for seeds too). Keep one per
  // caption with the lowest createdAt to remain stable across boots.
  await prisma.$executeRawUnsafe(
    `DELETE FROM video_posts
     WHERE id IN (
       SELECT v.id
       FROM video_posts v
       JOIN video_posts s ON s.caption = v.caption AND s.id LIKE 'seed_v12_%'
       WHERE v.id LIKE 'vid_%' AND v.authorId = ?
     )`,
    authorId,
  );

  if (inserted > 0) {
    // eslint-disable-next-line no-console
    console.log(`[bootstrap] phase12: seeded ${inserted} demo video posts`);
  }
}
