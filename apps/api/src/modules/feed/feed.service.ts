import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  AdminVideoRow,
  CreateVideoInput,
  ModerateVideoInput,
  ReportVideoInput,
  VideoFeedItem,
  VideoPost,
  VideoReportReason,
  VideoReportRow,
  VideoStatus,
} from '../../shared/types';

interface DbVideo {
  id: string;
  authorId: string;
  productId: string | null;
  shopId: string | null;
  videoUrl: string;
  thumbUrl: string | null;
  caption: string;
  tagsJson: string;
  likes: number;
  views: number;
  comments: number;
  status: string;
  score: number;
  createdAt: string;
  updatedAt: string;
}

interface DbFeedRow extends DbVideo {
  authorName: string | null;
  productName: string | null;
  productPriceCents: number | null;
  shopName: string | null;
  liked: number | null;
}

interface DbAdminRow extends DbFeedRow {
  pendingReports: number | null;
  lastReportReason: string | null;
  lastReportAt: string | null;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

function toVideoPost(d: DbVideo): VideoPost {
  return {
    id: d.id,
    authorId: d.authorId,
    productId: d.productId,
    shopId: d.shopId,
    videoUrl: d.videoUrl,
    thumbUrl: d.thumbUrl,
    caption: d.caption,
    tagsJson: d.tagsJson,
    likes: d.likes,
    views: d.views,
    comments: d.comments,
    // Cast: SQLite stores arbitrary TEXT; the runtime-allowed values are
    // constrained by Zod everywhere we serialise upward.
    status: (d.status as VideoStatus),
    score: d.score,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function toFeedItem(r: DbFeedRow): VideoFeedItem {
  return {
    ...toVideoPost(r),
    authorName: r.authorName ?? 'NP User',
    productName: r.productName,
    productPriceCents: r.productPriceCents,
    shopName: r.shopName,
    liked: r.liked === 1,
  };
}

@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // =============================================================================
  // Public reads — only show ACTIVE videos
  // =============================================================================

  /**
   * Phase 19.5 — ported from raw `$queryRawUnsafe` (SQLite-only `?` placeholders +
   * `LIMIT ? OFFSET ?` syntax) to Prisma client. The previous version 500'd on
   * Postgres on every /feed request because Prisma's `$queryRawUnsafe` requires
   * `$1, $2, ...` placeholders on Postgres while we passed `?` everywhere.
   */
  async feed(
    userId: string | null,
    cursor: number = 0,
    limit: number = 20,
  ): Promise<VideoFeedItem[]> {
    const lim = Math.min(Math.max(limit, 1), 50);
    const videos = await this.prisma.videoPost.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      skip: cursor,
      take: lim,
    });
    return this.hydrateFeed(videos, userId);
  }

  async byId(id: string, userId: string | null): Promise<VideoFeedItem | null> {
    const video = await this.prisma.videoPost.findFirst({
      where: { id, status: 'ACTIVE' },
    });
    if (!video) return null;
    const [item] = await this.hydrateFeed([video], userId);
    return item ?? null;
  }

  /**
   * Shared post-fetch step: turn the bare videos into FeedItems by looking up
   * the author/product/shop names and the viewer's like state in a single
   * round-trip each. Kept here so feed() and byId() stay tiny.
   */
  private async hydrateFeed(
    videos: Array<{
      id: string;
      authorId: string;
      productId: string | null;
      shopId: string | null;
      videoUrl: string;
      thumbUrl: string | null;
      caption: string;
      tagsJson: string;
      likes: number;
      views: number;
      comments: number;
      status: string;
      score: number;
      createdAt: Date;
      updatedAt: Date;
    }>,
    userId: string | null,
  ): Promise<VideoFeedItem[]> {
    if (videos.length === 0) return [];

    const authorIds = Array.from(new Set(videos.map((v) => v.authorId)));
    const productIds = Array.from(
      new Set(videos.map((v) => v.productId).filter((x): x is string => !!x)),
    );
    const shopIds = Array.from(
      new Set(videos.map((v) => v.shopId).filter((x): x is string => !!x)),
    );

    const [authors, products, shops, likedRows] = await Promise.all([
      authorIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: authorIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as Array<{ id: string; name: string | null }>),
      productIds.length
        ? this.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true, priceCents: true },
          })
        : Promise.resolve([] as Array<{ id: string; name: string; priceCents: number }>),
      shopIds.length
        ? this.prisma.shop.findMany({
            where: { id: { in: shopIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as Array<{ id: string; name: string }>),
      userId
        ? this.prisma.videoReaction.findMany({
            where: {
              userId,
              kind: 'LIKE',
              videoId: { in: videos.map((v) => v.id) },
            },
            select: { videoId: true },
          })
        : Promise.resolve([] as Array<{ videoId: string }>),
    ]);

    const authorMap = new Map(authors.map((a) => [a.id, a.name]));
    const productMap = new Map(products.map((p) => [p.id, p]));
    const shopMap = new Map(shops.map((s) => [s.id, s.name]));
    const likedSet = new Set(likedRows.map((r) => r.videoId));

    return videos.map((v): VideoFeedItem => {
      const product = v.productId ? productMap.get(v.productId) : undefined;
      return toFeedItem({
        ...v,
        createdAt:
          v.createdAt instanceof Date ? v.createdAt.toISOString() : v.createdAt,
        updatedAt:
          v.updatedAt instanceof Date ? v.updatedAt.toISOString() : v.updatedAt,
        authorName: authorMap.get(v.authorId) ?? null,
        productName: product?.name ?? null,
        productPriceCents: product?.priceCents ?? null,
        shopName: v.shopId ? shopMap.get(v.shopId) ?? null : null,
        liked: likedSet.has(v.id) ? 1 : null,
      });
    });
  }

  // =============================================================================
  // "My videos" — owner sees their full inventory regardless of status
  // (Phase 12.2). Author needs to see HIDDEN/REPORTED rows so they understand
  // what's happening and don't get a silent moderation experience.
  // =============================================================================

  /** Phase 19.5 — ported from raw SQL (SQLite `?` + `LIMIT ?`) to Prisma client. */
  async listMine(
    userId: string,
    limit: number = 50,
  ): Promise<VideoFeedItem[]> {
    const lim = Math.min(Math.max(limit, 1), 100);
    const videos = await this.prisma.videoPost.findMany({
      where: { authorId: userId, status: { not: 'DELETED' } },
      orderBy: { createdAt: 'desc' },
      take: lim,
    });
    // listMine is the author's own dashboard — there's no "liked by me"
    // notion for your own video, so we don't pass userId to hydrateFeed.
    return this.hydrateFeed(videos, null);
  }

  // =============================================================================
  // Writes — create / like / view / author-remove
  // =============================================================================

  /** Phase 19.5 — Prisma client. The old raw INSERT + SELECT round-trip is
   *  replaced by a single `create()` which returns the inserted row. */
  async create(userId: string, input: CreateVideoInput): Promise<VideoPost> {
    const created = await this.prisma.videoPost.create({
      data: {
        id: newId('vid'),
        authorId: userId,
        productId: input.productId ?? null,
        shopId: input.shopId ?? null,
        videoUrl: input.videoUrl,
        thumbUrl: input.thumbUrl ?? null,
        caption: input.caption,
        tagsJson: JSON.stringify(input.tags ?? []),
        likes: 0,
        views: 0,
        comments: 0,
        status: 'ACTIVE',
        score: 0,
      },
    });
    return toVideoPost({
      ...created,
      createdAt:
        created.createdAt instanceof Date
          ? created.createdAt.toISOString()
          : created.createdAt,
      updatedAt:
        created.updatedAt instanceof Date
          ? created.updatedAt.toISOString()
          : created.updatedAt,
    });
  }

  /** Phase 19.5 — Prisma client with atomic increment/decrement. */
  async like(userId: string, videoId: string): Promise<{ liked: boolean; likes: number }> {
    const video = await this.prisma.videoPost.findFirst({
      where: { id: videoId, status: 'ACTIVE' },
      select: { id: true, likes: true },
    });
    if (!video) throw new NotFoundException('ไม่พบคลิป');

    const existing = await this.prisma.videoReaction.findFirst({
      where: { videoId, userId },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.videoReaction.delete({ where: { id: existing.id } });
      const updated = await this.prisma.videoPost.update({
        where: { id: videoId },
        data: {
          // Prisma doesn't have a native MAX(0, ...) — clamp ourselves so we
          // never store a negative likes counter even if the row drifted.
          likes: Math.max(0, video.likes - 1),
          score: { decrement: 1 },
        },
        select: { likes: true },
      });
      return { liked: false, likes: updated.likes };
    }
    await this.prisma.videoReaction.create({
      data: {
        id: newId('vre'),
        videoId,
        userId,
        kind: 'LIKE',
      },
    });
    const updated = await this.prisma.videoPost.update({
      where: { id: videoId },
      data: { likes: { increment: 1 }, score: { increment: 1 } },
      select: { likes: true },
    });
    return { liked: true, likes: updated.likes };
  }

  /** Phase 19.5 — Prisma client with atomic increment. `updateMany` so a
   *  view on a DELETED/HIDDEN video is a no-op instead of throwing. */
  async view(videoId: string): Promise<{ ok: true }> {
    await this.prisma.videoPost.updateMany({
      where: { id: videoId, status: 'ACTIVE' },
      data: {
        views: { increment: 1 },
        score: { increment: 0.1 },
      },
    });
    return { ok: true };
  }

  /**
   * Phase 12.2 — author removes their own video.
   *
   * Soft-delete (status='DELETED') THEN best-effort bucket cleanup of both
   * the video file and its thumbnail. Bucket failures don't roll back the
   * soft-delete — the row is the source of truth and the orphan can be
   * swept by a future janitor cron.
   */
  async remove(userId: string, videoId: string): Promise<{ ok: true }> {
    const row = await this.prisma.videoPost.findUnique({
      where: { id: videoId },
      select: { authorId: true, videoUrl: true, thumbUrl: true },
    });
    if (!row) throw new NotFoundException('ไม่พบคลิป');
    if (row.authorId !== userId) {
      throw new BadRequestException('ลบได้เฉพาะคลิปของตัวเอง');
    }
    await this.prisma.videoPost.update({
      where: { id: videoId },
      data: { status: 'DELETED' },
    });
    await this.cleanupBucketObjects(row.videoUrl, row.thumbUrl);
    // Author removes their own video → auto-resolve any open reports against
    // it ("DELETE" disposition) so it disappears from the admin queue cleanly.
    await this.prisma.videoReport.updateMany({
      where: { videoId, status: 'PENDING' },
      data: {
        status: 'RESOLVED',
        resolvedBy: userId,
        resolvedAt: new Date(),
        resolution: 'DELETE',
      },
    });
    return { ok: true };
  }

  // =============================================================================
  // Phase 12.2 — User report
  // =============================================================================

  /**
   * Any logged-in user can report a video. Constraints:
   *   • Can't report your own video (no self-flagging spam).
   *   • A user can have at most one PENDING report per video (UNIQUE index).
   *   • First report flips video status ACTIVE → REPORTED so the admin
   *     queue immediately picks it up. Subsequent reports just stack.
   */
  async report(
    reporterId: string,
    videoId: string,
    input: ReportVideoInput,
  ): Promise<{ ok: true; pendingReports: number }> {
    const v = await this.prisma.videoPost.findUnique({
      where: { id: videoId },
      select: { authorId: true, status: true },
    });
    if (!v) throw new NotFoundException('ไม่พบคลิป');
    if (v.authorId === reporterId) {
      throw new BadRequestException('รายงานคลิปของตัวเองไม่ได้');
    }

    // Duplicate-report guard. We rely on Prisma's P2002 unique-violation as
    // the source-of-truth for the race; the pre-check just shortens the
    // happy-path error message.
    const dupe = await this.prisma.videoReport.findFirst({
      where: { videoId, reporterId, status: 'PENDING' },
      select: { id: true },
    });
    if (dupe) {
      throw new ConflictException('คุณรายงานคลิปนี้ไปแล้ว');
    }

    try {
      await this.prisma.videoReport.create({
        data: {
          id: newId('vrep'),
          videoId,
          reporterId,
          reason: input.reason,
          note: input.note?.trim() || null,
          status: 'PENDING',
        },
      });
    } catch (e) {
      const msg = String((e as Error).message);
      // Prisma's Postgres adapter surfaces unique violations as code P2002
      // (and includes the word "Unique" in the message), while raw SQLite
      // surfaced "UNIQUE constraint failed". Catch both shapes.
      if (msg.includes('Unique') || msg.includes('UNIQUE') || msg.includes('P2002')) {
        throw new ConflictException('คุณรายงานคลิปนี้ไปแล้ว');
      }
      throw e;
    }

    // Promote ACTIVE → REPORTED. We deliberately don't touch HIDDEN/DELETED
    // because those states are already terminal for the user-facing feed.
    if (v.status === 'ACTIVE') {
      await this.prisma.videoPost.update({
        where: { id: videoId },
        data: { status: 'REPORTED' },
      });
    }

    const pendingReports = await this.prisma.videoReport.count({
      where: { videoId, status: 'PENDING' },
    });
    return { ok: true, pendingReports };
  }

  // =============================================================================
  // Phase 12.2 — Admin moderation
  // =============================================================================

  /**
   * Admin: list videos with optional status filter + "with-reports-only"
   * toggle. We always include moderation context (pendingReports +
   * lastReportReason) so the table can show why a row was flagged.
   */
  async adminList(filter: {
    status?: VideoStatus | 'ALL';
    onlyReported?: boolean;
    limit?: number;
  }): Promise<AdminVideoRow[]> {
    const lim = Math.min(Math.max(filter.limit ?? 50, 1), 200);

    const whereParts: string[] = [`v.status != 'DELETED'`];
    const args: unknown[] = [];
    if (filter.status && filter.status !== 'ALL') {
      whereParts.length = 0;
      whereParts.push(`v.status = ?`);
      args.push(filter.status);
    }
    if (filter.onlyReported) {
      whereParts.push(
        `EXISTS (SELECT 1 FROM video_reports r WHERE r.videoId = v.id AND r.status = 'PENDING')`,
      );
    }

    args.push(lim);

    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT v.*,
              u.name AS authorName,
              p.name AS productName,
              p.priceCents AS productPriceCents,
              s.name AS shopName,
              NULL AS liked,
              (SELECT COUNT(*) FROM video_reports r WHERE r.videoId=v.id AND r.status='PENDING') AS pendingReports,
              (SELECT r.reason FROM video_reports r WHERE r.videoId=v.id ORDER BY r.createdAt DESC LIMIT 1) AS lastReportReason,
              (SELECT r.createdAt FROM video_reports r WHERE r.videoId=v.id ORDER BY r.createdAt DESC LIMIT 1) AS lastReportAt
       FROM video_posts v
       LEFT JOIN users u ON u.id = v.authorId
       LEFT JOIN products p ON p.id = v.productId
       LEFT JOIN shops s ON s.id = v.shopId
       WHERE ${whereParts.join(' AND ')}
       ORDER BY pendingReports DESC, v.createdAt DESC
       LIMIT ?`,
      ...args,
    )) as DbAdminRow[];

    return rows.map((r) => ({
      ...toFeedItem(r),
      pendingReports: Number(r.pendingReports ?? 0),
      lastReportReason: (r.lastReportReason as VideoReportReason | null) ?? null,
      lastReportAt: r.lastReportAt,
    }));
  }

  async adminListReports(filter: {
    status?: 'PENDING' | 'RESOLVED' | 'ALL';
    limit?: number;
  }): Promise<VideoReportRow[]> {
    const lim = Math.min(Math.max(filter.limit ?? 100, 1), 500);
    const where = filter.status && filter.status !== 'ALL' ? `WHERE r.status = ?` : '';
    const args: unknown[] = [];
    if (filter.status && filter.status !== 'ALL') args.push(filter.status);
    args.push(lim);

    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT r.*,
              v.caption AS videoCaption,
              v.thumbUrl AS videoThumbUrl,
              v.status   AS videoStatus,
              v.authorId AS authorId,
              au.name    AS authorName,
              ru.name    AS reporterName
       FROM video_reports r
       LEFT JOIN video_posts v ON v.id = r.videoId
       LEFT JOIN users au ON au.id = v.authorId
       LEFT JOIN users ru ON ru.id = r.reporterId
       ${where}
       ORDER BY r.createdAt DESC
       LIMIT ?`,
      ...args,
    )) as Array<{
      id: string;
      videoId: string;
      reporterId: string;
      reason: string;
      note: string | null;
      status: string;
      resolvedBy: string | null;
      resolvedAt: string | null;
      resolution: string | null;
      createdAt: string;
      videoCaption: string | null;
      videoThumbUrl: string | null;
      videoStatus: string | null;
      authorId: string | null;
      authorName: string | null;
      reporterName: string | null;
    }>;

    return rows.map((r) => ({
      id: r.id,
      videoId: r.videoId,
      reporterId: r.reporterId,
      reason: r.reason as VideoReportReason,
      note: r.note,
      status: (r.status as 'PENDING' | 'RESOLVED'),
      resolvedBy: r.resolvedBy,
      resolvedAt: r.resolvedAt,
      resolution: (r.resolution as 'HIDE' | 'KEEP' | 'DELETE' | null),
      createdAt: r.createdAt,
      videoCaption: r.videoCaption ?? '',
      videoThumbUrl: r.videoThumbUrl,
      videoStatus: (r.videoStatus as VideoStatus) ?? 'DELETED',
      authorId: r.authorId ?? '',
      authorName: r.authorName,
      reporterName: r.reporterName,
    }));
  }

  /**
   * Admin moderation action.
   *   • HIDE    — set status='HIDDEN'. Author still sees the row in
   *               `/profile/videos`. Public feed/byId hide it.
   *   • RESTORE — clear flag back to ACTIVE. Open reports auto-resolve KEEP.
   *   • DELETE  — set status='DELETED' AND clean up bucket objects. Final.
   * Every action resolves all PENDING reports against the video.
   */
  async adminModerate(
    adminUserId: string,
    videoId: string,
    input: ModerateVideoInput,
  ): Promise<{ ok: true; status: VideoStatus }> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT videoUrl, thumbUrl, status FROM video_posts WHERE id = ?`,
      videoId,
    )) as Array<{ videoUrl: string; thumbUrl: string | null; status: string }>;
    if (rows.length === 0) throw new NotFoundException('ไม่พบคลิป');

    const targetStatus: VideoStatus =
      input.action === 'HIDE' ? 'HIDDEN' : input.action === 'RESTORE' ? 'ACTIVE' : 'DELETED';
    const resolution =
      input.action === 'HIDE' ? 'HIDE' : input.action === 'RESTORE' ? 'KEEP' : 'DELETE';

    await this.prisma.videoPost.update({
      where: { id: videoId },
      data: { status: targetStatus },
    });
    await this.prisma.videoReport.updateMany({
      where: { videoId, status: 'PENDING' },
      data: {
        status: 'RESOLVED',
        resolvedBy: adminUserId,
        resolvedAt: new Date(),
        resolution,
      },
    });

    if (input.action === 'DELETE') {
      await this.cleanupBucketObjects(rows[0].videoUrl, rows[0].thumbUrl);
    }

    this.logger.log(
      `moderate video=${videoId} action=${input.action} by=${adminUserId}`,
    );
    return { ok: true, status: targetStatus };
  }

  // =============================================================================
  // Helpers
  // =============================================================================

  /**
   * Fire-and-forget bucket cleanup for both video + thumbnail URLs.
   * Failures are warned (StorageService already handles that) but never
   * propagate — DB state is authoritative.
   */
  private async cleanupBucketObjects(
    videoUrl: string | null,
    thumbUrl: string | null,
  ): Promise<void> {
    await Promise.all([
      this.storage.deleteByUrl(videoUrl),
      this.storage.deleteByUrl(thumbUrl),
    ]);
  }
}
