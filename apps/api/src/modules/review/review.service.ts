import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateReviewInput,
  HidePhotoInput,
  HideReviewInput,
  ModerationReview,
  PendingReviewItem,
  RatingSummary,
  Review,
  ReviewListItem,
  ReviewPhoto,
} from '../../shared/types';
import { StorageService } from '../storage/storage.service';

interface DbReview {
  id: string;
  orderId: string;
  productId: string;
  customerId: string;
  shopId: string;
  rating: number;
  body: string;
  isHidden: number;
  flagReason: string | null;
  helpfulCount: number;
  createdAt: string;
  updatedAt: string;
}

interface DbReviewPhoto {
  id: string;
  reviewId: string;
  objectKey: string;
  url: string;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  sha256: string | null;
  isHidden: number;
  sortOrder: number;
  createdAt: string;
}

function toPhoto(d: DbReviewPhoto): ReviewPhoto {
  return {
    id: d.id,
    reviewId: d.reviewId,
    objectKey: d.objectKey,
    url: d.url,
    width: d.width,
    height: d.height,
    sizeBytes: d.sizeBytes,
    isHidden: d.isHidden === 1,
    sortOrder: d.sortOrder,
    createdAt: d.createdAt,
  };
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

function toReview(d: DbReview): Review {
  return {
    id: d.id,
    orderId: d.orderId,
    productId: d.productId,
    customerId: d.customerId,
    shopId: d.shopId,
    rating: d.rating,
    body: d.body,
    isHidden: d.isHidden === 1,
    flagReason: d.flagReason,
    helpfulCount: d.helpfulCount ?? 0,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

/** "som***@gmail.com" — show first 3 chars + asterisks, keep domain */
function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!user) return email;
  const head = user.slice(0, Math.min(3, user.length));
  return `${head}${'*'.repeat(Math.max(2, user.length - 3))}@${domain ?? '?'}`;
}

@Injectable()
export class ReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ===========================================================================
  // Customer: write review
  // ===========================================================================
  async create(userId: string, input: CreateReviewInput): Promise<Review> {
    // 1. Order must exist + be owned by this user + be DELIVERED
    const orderRows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, customerId, shopId, status FROM orders WHERE id = ? LIMIT 1`,
      input.orderId,
    )) as Array<{
      id: string;
      customerId: string;
      shopId: string;
      status: string;
    }>;
    if (orderRows.length === 0) throw new NotFoundException('ไม่พบออเดอร์');
    const order = orderRows[0];
    if (order.customerId !== userId) {
      throw new ForbiddenException('ไม่ใช่เจ้าของออเดอร์');
    }
    if (order.status !== 'DELIVERED') {
      throw new BadRequestException(
        `รีวิวได้หลังออเดอร์อยู่สถานะ DELIVERED เท่านั้น (ตอนนี้: ${order.status})`,
      );
    }

    // 2. Product must be in that order
    const itemRows = (await this.prisma.$queryRawUnsafe(
      `SELECT productId FROM order_items WHERE orderId = ? AND productId = ? LIMIT 1`,
      input.orderId,
      input.productId,
    )) as Array<{ productId: string }>;
    if (itemRows.length === 0) {
      throw new BadRequestException('สินค้านี้ไม่ได้อยู่ในออเดอร์');
    }

    // 3. Not already reviewed
    const existing = (await this.prisma.$queryRawUnsafe(
      `SELECT id FROM reviews
       WHERE orderId = ? AND productId = ? AND customerId = ? LIMIT 1`,
      input.orderId,
      input.productId,
      userId,
    )) as Array<{ id: string }>;
    if (existing.length > 0) {
      throw new ConflictException('คุณรีวิวสินค้านี้ในออเดอร์นี้ไปแล้ว');
    }

    // 4. Pull confirmed photo uploads (if any) so we can co-flag if duplicate-sha256
    const photos = input.photoUploadIds?.length
      ? await this.storage.getConfirmedUploads(userId, input.photoUploadIds)
      : [];

    // 5. Heuristic auto-flag (admin can still unhide). Photo signals fold in:
    //    - PHOTO_DUPLICATE → sha256 ของรูปซ้ำกับรีวิวเก่า (รวมร้านอื่น) ในไหนสักรีวิว
    const baseFlag = await this.evaluateHeuristics(userId, input.body);
    let flagReason = baseFlag.flagReason;
    if (photos.length > 0 && !flagReason) {
      const dupHash = await this.photoSpamCheck(photos.map((p) => p.sha256));
      if (dupHash) flagReason = 'PHOTO_DUPLICATE';
    }

    const id = newId('rv');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO reviews
        (id, orderId, productId, customerId, shopId, rating, body,
         isHidden, flagReason, helpfulCount, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id,
      input.orderId,
      input.productId,
      userId,
      order.shopId,
      input.rating,
      input.body,
      flagReason,
    );

    // 6. Attach photos (best-effort — if any single insert fails, continue)
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      if (!p) continue;
      try {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO review_photos
            (id, reviewId, objectKey, url, sizeBytes, sha256, isHidden,
             sortOrder, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP)`,
          newId('rp'),
          id,
          p.objectKey,
          p.publicUrl,
          p.sizeBytes,
          p.sha256,
          i,
        );
      } catch {
        // ignore — orphan upload row will be reaped by an admin job later
      }
    }

    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM reviews WHERE id = ?`,
      id,
    )) as DbReview[];
    return toReview(rows[0]);
  }

  /**
   * Returns true when any of the supplied sha256 hashes already exists on
   * another review's photo — meaning the same image was reused (cheap copy
   * detection without perceptual hashing).
   */
  private async photoSpamCheck(
    hashes: Array<string | null>,
  ): Promise<boolean> {
    const real = hashes.filter((h): h is string => !!h);
    if (real.length === 0) return false;
    const placeholders = real.map(() => '?').join(',');
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS c FROM review_photos
       WHERE sha256 IN (${placeholders})`,
      ...real,
    )) as Array<{ c: number }>;
    return (rows[0]?.c ?? 0) > 0;
  }

  // ===========================================================================
  // Read: list reviews for a product (public, hides moderated)
  // ===========================================================================
  async listForProduct(
    productId: string,
    limit = 20,
    viewerId: string | null = null,
  ): Promise<ReviewListItem[]> {
    const safe = Math.max(1, Math.min(limit, 100));
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT r.*, u.email AS authorEmail
       FROM reviews r
       JOIN users u ON u.id = r.customerId
       WHERE r.productId = ? AND r.isHidden = 0
       ORDER BY r.helpfulCount DESC, r.createdAt DESC
       LIMIT ?`,
      productId,
      safe,
    )) as Array<DbReview & { authorEmail: string }>;
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const photos = await this.loadPhotosForReviews(ids);
    const helpfulSet = viewerId
      ? await this.loadMyHelpfuls(viewerId, ids)
      : new Set<string>();

    return rows.map((r) => ({
      ...toReview(r),
      authorDisplay: maskEmail(r.authorEmail),
      photos: photos.get(r.id) ?? [],
      helpfulByMe: helpfulSet.has(r.id),
    }));
  }

  private async loadPhotosForReviews(
    reviewIds: string[],
  ): Promise<Map<string, ReviewPhoto[]>> {
    if (reviewIds.length === 0) return new Map();
    const placeholders = reviewIds.map(() => '?').join(',');
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM review_photos
       WHERE reviewId IN (${placeholders}) AND isHidden = 0
       ORDER BY reviewId, sortOrder`,
      ...reviewIds,
    )) as DbReviewPhoto[];
    const map = new Map<string, ReviewPhoto[]>();
    for (const r of rows) {
      const arr = map.get(r.reviewId) ?? [];
      arr.push(toPhoto(r));
      map.set(r.reviewId, arr);
    }
    return map;
  }

  private async loadMyHelpfuls(
    userId: string,
    reviewIds: string[],
  ): Promise<Set<string>> {
    if (reviewIds.length === 0) return new Set();
    const placeholders = reviewIds.map(() => '?').join(',');
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT reviewId FROM review_helpfuls
       WHERE userId = ? AND reviewId IN (${placeholders})`,
      userId,
      ...reviewIds,
    )) as Array<{ reviewId: string }>;
    return new Set(rows.map((r) => r.reviewId));
  }

  // ===========================================================================
  // Aggregate: avg + histogram for product
  // ===========================================================================
  async summaryForProduct(productId: string): Promise<RatingSummary> {
    return this.summaryWhere(`productId = ? AND isHidden = 0`, [productId]);
  }

  async summaryForShop(shopId: string): Promise<RatingSummary> {
    return this.summaryWhere(`shopId = ? AND isHidden = 0`, [shopId]);
  }

  private async summaryWhere(
    where: string,
    args: unknown[],
  ): Promise<RatingSummary> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT rating, COUNT(*) AS c FROM reviews WHERE ${where} GROUP BY rating`,
      ...args,
    )) as Array<{ rating: number; c: number }>;
    const histogram: [number, number, number, number, number] = [0, 0, 0, 0, 0];
    let total = 0;
    let sum = 0;
    for (const r of rows) {
      if (r.rating >= 1 && r.rating <= 5) {
        histogram[r.rating - 1] = r.c;
        total += r.c;
        sum += r.rating * r.c;
      }
    }
    return {
      avg: total > 0 ? Math.round((sum / total) * 10) / 10 : 0,
      count: total,
      histogram,
    };
  }

  // ===========================================================================
  // Customer: list my reviews, find items pending review
  // ===========================================================================
  async listMine(userId: string): Promise<Review[]> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM reviews WHERE customerId = ? ORDER BY createdAt DESC LIMIT 200`,
      userId,
    )) as DbReview[];
    return rows.map(toReview);
  }

  async pending(userId: string): Promise<PendingReviewItem[]> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT o.id AS orderId, oi.productId, p.name AS productName,
              p.shopId AS shopId, s.name AS shopName,
              o.updatedAt AS deliveredAt
       FROM orders o
       JOIN order_items oi ON oi.orderId = o.id
       JOIN products p ON p.id = oi.productId
       LEFT JOIN shops s ON s.id = p.shopId
       WHERE o.customerId = ?
         AND o.status = 'DELIVERED'
         AND NOT EXISTS (
           SELECT 1 FROM reviews r
           WHERE r.orderId = o.id
             AND r.productId = oi.productId
             AND r.customerId = o.customerId
         )
       ORDER BY o.updatedAt DESC
       LIMIT 50`,
      userId,
    )) as Array<{
      orderId: string;
      productId: string;
      productName: string;
      shopId: string;
      shopName: string | null;
      deliveredAt: string;
    }>;
    return rows;
  }

  // ===========================================================================
  // Admin: moderation
  // ===========================================================================
  async moderationList(limit = 50): Promise<ModerationReview[]> {
    const safe = Math.max(1, Math.min(limit, 200));
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT r.*, u.email AS authorEmail, p.name AS productName, s.name AS shopName
       FROM reviews r
       JOIN users u ON u.id = r.customerId
       LEFT JOIN products p ON p.id = r.productId
       LEFT JOIN shops s ON s.id = r.shopId
       ORDER BY (CASE WHEN r.flagReason IS NOT NULL THEN 0 ELSE 1 END),
                r.createdAt DESC
       LIMIT ?`,
      safe,
    )) as Array<
      DbReview & {
        authorEmail: string;
        productName: string | null;
        shopName: string | null;
      }
    >;

    // bring in duplicate-text signal cheaply: in-memory map
    const bodyCounts = new Map<string, number>();
    for (const r of rows) {
      const key = r.body.trim().toLowerCase();
      bodyCounts.set(key, (bodyCounts.get(key) ?? 0) + 1);
    }

    // photos in single batch (incl. hidden — admin can see what was hidden)
    const photoMap = await this.loadAllPhotosForReviews(rows.map((r) => r.id));

    return rows.map((r) => {
      const flags: string[] = [];
      if (r.flagReason) flags.push(r.flagReason);
      const key = r.body.trim().toLowerCase();
      if ((bodyCounts.get(key) ?? 0) > 1) flags.push('DUPLICATE_TEXT');
      if (r.body.trim().length < 20) flags.push('SHORT_BODY');
      if (r.rating === 5 && r.body.trim().length < 30) flags.push('LOW_EFFORT_FIVE_STAR');
      if (r.rating === 1 && r.body.trim().length < 30) flags.push('LOW_EFFORT_ONE_STAR');
      const photos = photoMap.get(r.id) ?? [];
      if (photos.some((p) => p.isHidden)) flags.push('PHOTO_HIDDEN');

      const suspicionScore = Math.min(1, flags.length * 0.25);

      return {
        ...toReview(r),
        authorDisplay: maskEmail(r.authorEmail),
        productName: r.productName ?? '(สินค้าถูกลบ)',
        shopName: r.shopName,
        photos,
        helpfulByMe: false,
        flags,
        suspicionScore,
      };
    });
  }

  /** Like loadPhotosForReviews but includes hidden photos (admin view). */
  private async loadAllPhotosForReviews(
    reviewIds: string[],
  ): Promise<Map<string, ReviewPhoto[]>> {
    if (reviewIds.length === 0) return new Map();
    const placeholders = reviewIds.map(() => '?').join(',');
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM review_photos
       WHERE reviewId IN (${placeholders})
       ORDER BY reviewId, sortOrder`,
      ...reviewIds,
    )) as DbReviewPhoto[];
    const map = new Map<string, ReviewPhoto[]>();
    for (const r of rows) {
      const arr = map.get(r.reviewId) ?? [];
      arr.push(toPhoto(r));
      map.set(r.reviewId, arr);
    }
    return map;
  }

  async hide(
    reviewId: string,
    input: HideReviewInput,
  ): Promise<Review> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM reviews WHERE id = ?`,
      reviewId,
    )) as DbReview[];
    if (rows.length === 0) throw new NotFoundException('ไม่พบรีวิว');

    await this.prisma.$executeRawUnsafe(
      `UPDATE reviews
       SET isHidden = ?,
           flagReason = COALESCE(?, flagReason),
           updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      input.hidden ? 1 : 0,
      input.reason ?? null,
      reviewId,
    );

    const refreshed = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM reviews WHERE id = ?`,
      reviewId,
    )) as DbReview[];
    return toReview(refreshed[0]);
  }

  // ===========================================================================
  // Helpful votes (Phase 9.2)
  // ===========================================================================
  async toggleHelpful(
    userId: string,
    reviewId: string,
  ): Promise<{ helpfulCount: number; helpfulByMe: boolean }> {
    const reviewRows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, customerId FROM reviews WHERE id = ?`,
      reviewId,
    )) as Array<{ id: string; customerId: string }>;
    if (reviewRows.length === 0) throw new NotFoundException('ไม่พบรีวิว');
    if (reviewRows[0].customerId === userId) {
      throw new BadRequestException('โหวตรีวิวตัวเองไม่ได้');
    }

    const existing = (await this.prisma.$queryRawUnsafe(
      `SELECT id FROM review_helpfuls WHERE reviewId = ? AND userId = ?`,
      reviewId,
      userId,
    )) as Array<{ id: string }>;

    let next: boolean;
    if (existing.length > 0) {
      await this.prisma.$executeRawUnsafe(
        `DELETE FROM review_helpfuls WHERE reviewId = ? AND userId = ?`,
        reviewId,
        userId,
      );
      next = false;
    } else {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO review_helpfuls (id, reviewId, userId, createdAt)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        newId('rh'),
        reviewId,
        userId,
      );
      next = true;
    }

    // Re-aggregate from source of truth so we never drift
    const countRows = (await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS c FROM review_helpfuls WHERE reviewId = ?`,
      reviewId,
    )) as Array<{ c: number }>;
    const helpfulCount = countRows[0]?.c ?? 0;
    await this.prisma.$executeRawUnsafe(
      `UPDATE reviews SET helpfulCount = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      helpfulCount,
      reviewId,
    );
    return { helpfulCount, helpfulByMe: next };
  }

  // ===========================================================================
  // Admin: per-photo moderation
  // ===========================================================================
  async hidePhoto(
    photoId: string,
    input: HidePhotoInput,
  ): Promise<ReviewPhoto> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM review_photos WHERE id = ?`,
      photoId,
    )) as DbReviewPhoto[];
    if (rows.length === 0) throw new NotFoundException('ไม่พบรูป');
    await this.prisma.$executeRawUnsafe(
      `UPDATE review_photos SET isHidden = ? WHERE id = ?`,
      input.hidden ? 1 : 0,
      photoId,
    );
    const refreshed = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM review_photos WHERE id = ?`,
      photoId,
    )) as DbReviewPhoto[];
    return toPhoto(refreshed[0]);
  }

  // ===========================================================================
  // Heuristics — cheap fake-review detection (server-side, deterministic)
  // ===========================================================================
  private async evaluateHeuristics(
    userId: string,
    body: string,
  ): Promise<{ flagReason: string | null }> {
    // 1. Very short body
    if (body.trim().length < 8) {
      return { flagReason: 'SHORT_BODY' };
    }
    // 2. Account too new (< 24h)
    const u = (await this.prisma.$queryRawUnsafe(
      `SELECT createdAt FROM users WHERE id = ?`,
      userId,
    )) as Array<{ createdAt: string }>;
    if (u.length > 0) {
      const ageMs = Date.now() - new Date(u[0].createdAt).getTime();
      if (ageMs < 24 * 60 * 60 * 1000) {
        return { flagReason: 'NEW_ACCOUNT' };
      }
    }
    // 3. Repeated body across all reviews
    const dup = (await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS c FROM reviews WHERE lower(trim(body)) = lower(trim(?))`,
      body,
    )) as Array<{ c: number }>;
    if (dup[0] && dup[0].c >= 1) {
      return { flagReason: 'DUPLICATE_TEXT' };
    }
    return { flagReason: null };
  }
}
