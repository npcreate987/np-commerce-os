import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ConfirmUploadInput,
  PresignUploadInput,
  PresignUploadResult,
  StorageConfig,
  STORAGE_LIMITS,
  StorageUploadPurpose,
} from '../../shared/types';
import { deleteObject as sigv4DeleteObject, presignPutUrl } from './sigv4';

// =====================================================================
// Per-purpose MIME whitelists (Phase 12.1 introduces 'video')
// =====================================================================
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime', // .mov from iPhone camera
];
const ALLOWED_BY_PURPOSE: Record<StorageUploadPurpose, string[]> = {
  review_photo: IMAGE_TYPES,
  product_media: IMAGE_TYPES,
  shop_logo: IMAGE_TYPES,
  video: VIDEO_TYPES,
  video_thumb: IMAGE_TYPES, // JPEG/PNG poster extracted by client
  cs_attachment: IMAGE_TYPES,
};

// Legacy global ceiling — surface in `/v1/storage/config.maxSizeBytes`
// for back-compat with clients that don't read per-purpose limits yet.
const LEGACY_MAX_SIZE = STORAGE_LIMITS.video; // pick the biggest purpose
const URL_TTL_SEC = 60 * 10; // 10 minutes

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

const TYPE_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

function extFromType(ct: string): string {
  return TYPE_TO_EXT[ct] ?? 'bin';
}

interface StorageEnv {
  endpoint: string; // https://...
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  /** Hint of who's behind the endpoint */
  driver: 's3' | 'r2' | 'minio' | 'mock';
  /** Path-style (MinIO + R2 + some self-hosted); virtual-hosted-style otherwise. */
  pathStyle: boolean;
  /** What URL the browser should fetch the saved object at. */
  publicBase: string;
}

/**
 * Phase 9.2 — single facade for S3-compatible presigned uploads.
 *
 * Driver detection (env precedence):
 *   1) S3_ENDPOINT contains '.r2.cloudflarestorage.com'        → r2
 *   2) S3_ENDPOINT looks like MinIO (`minio` or :9000 in url)  → minio
 *   3) AWS S3 (default)
 *   4) No keys at all → 'mock' (returns local /uploads/* URLs that
 *      the Next.js public folder can serve; used in dev w/o S3)
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly env: StorageEnv | null;

  constructor(private readonly prisma: PrismaService) {
    this.env = this.loadEnv();
    if (this.env) {
      this.logger.log(
        `storage driver: ${this.env.driver} → ${this.env.publicBase}`,
      );
    } else {
      this.logger.warn('storage disabled (no S3 keys set)');
    }
  }

  // ---------- Public config (FE checks before showing photo picker) ----------

  getConfig(): StorageConfig {
    // Union of all whitelisted MIME types — handy for clients that don't filter
    // by purpose yet (e.g. legacy review picker).
    const allTypes = Array.from(
      new Set(Object.values(ALLOWED_BY_PURPOSE).flat()),
    );
    return {
      enabled: !!this.env,
      driver: this.env?.driver ?? 'disabled',
      maxSizeBytes: LEGACY_MAX_SIZE,
      allowedContentTypes: allTypes,
      limits: STORAGE_LIMITS,
      allowedByPurpose: ALLOWED_BY_PURPOSE,
    };
  }

  // ---------- Presign (one-shot PUT) ----------

  async presign(
    userId: string,
    input: PresignUploadInput,
  ): Promise<PresignUploadResult> {
    // Per-purpose validation (runs in both real and mock mode so mock devs
    // see the same errors as production)
    const allowedTypes = ALLOWED_BY_PURPOSE[input.purpose] ?? [];
    const maxSize = STORAGE_LIMITS[input.purpose] ?? LEGACY_MAX_SIZE;
    if (!allowedTypes.includes(input.contentType)) {
      throw new BadRequestException(
        `contentType ${input.contentType} ไม่อนุญาตสำหรับ purpose "${input.purpose}"`,
      );
    }
    if (input.sizeBytes > maxSize) {
      throw new BadRequestException(
        `ไฟล์ใหญ่กว่า ${Math.floor(maxSize / 1024 / 1024)}MB (purpose=${input.purpose})`,
      );
    }
    if (!this.env) {
      // Mock: skip presign, hand back a synthetic key + public URL the
      // client will treat as "already uploaded". Useful for dev/CI tests.
      return this.mockPresign(userId, input);
    }
    const objectKey = `${input.purpose}/${userId}/${Date.now()}-${newId('o').slice(2)}.${extFromType(input.contentType)}`;
    const { url, headers } = presignPutUrl({
      method: 'PUT',
      endpoint: this.env.endpoint,
      region: this.env.region,
      bucket: this.env.bucket,
      objectKey,
      accessKeyId: this.env.accessKey,
      secretAccessKey: this.env.secretKey,
      contentType: input.contentType,
      expiresInSec: URL_TTL_SEC,
      pathStyle: this.env.pathStyle,
    });
    const uploadId = await this.recordUpload(
      userId,
      objectKey,
      input.contentType,
      input.sizeBytes,
      input.purpose,
    );
    const publicUrl = this.publicUrl(objectKey);
    return {
      uploadUrl: url,
      method: 'PUT',
      objectKey,
      publicUrl,
      headers,
      expiresInSec: URL_TTL_SEC,
      uploadId,
    };
  }

  // ---------- Confirm (client tells us "I PUT it") ----------

  async confirm(
    userId: string,
    input: ConfirmUploadInput,
  ): Promise<{ ok: true; objectKey: string; publicUrl: string }> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, userId, objectKey, status FROM storage_uploads WHERE id = ?`,
      input.uploadId,
    )) as Array<{
      id: string;
      userId: string;
      objectKey: string;
      status: string;
    }>;
    if (rows.length === 0) throw new Error('ไม่พบ upload');
    if (rows[0].userId !== userId) throw new Error('ไม่ใช่เจ้าของ upload');
    await this.prisma.$executeRawUnsafe(
      `UPDATE storage_uploads
       SET status = 'CONFIRMED',
           sizeBytes = COALESCE(?, sizeBytes),
           sha256 = COALESCE(?, sha256),
           confirmedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      input.sizeBytes ?? null,
      input.sha256 ?? null,
      input.uploadId,
    );
    return {
      ok: true,
      objectKey: rows[0].objectKey,
      publicUrl: this.publicUrl(rows[0].objectKey),
    };
  }

  // ---------- Lookups used by ReviewService when attaching photos ----------

  async getConfirmedUploads(
    userId: string,
    uploadIds: string[],
  ): Promise<
    Array<{
      id: string;
      objectKey: string;
      publicUrl: string;
      sizeBytes: number | null;
      sha256: string | null;
    }>
  > {
    if (uploadIds.length === 0) return [];
    const placeholders = uploadIds.map(() => '?').join(',');
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, objectKey, sizeBytes, sha256
       FROM storage_uploads
       WHERE userId = ? AND id IN (${placeholders})`,
      userId,
      ...uploadIds,
    )) as Array<{
      id: string;
      objectKey: string;
      sizeBytes: number;
      sha256: string | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      objectKey: r.objectKey,
      publicUrl: this.publicUrl(r.objectKey),
      sizeBytes: r.sizeBytes ?? null,
      sha256: r.sha256,
    }));
  }

  publicUrl(objectKey: string): string {
    if (!this.env) {
      return `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/uploads/${objectKey}`;
    }
    return `${this.env.publicBase}/${objectKey}`;
  }

  /**
   * Phase 12.2 — best-effort reverse mapping of `publicUrl` → `objectKey`.
   *
   * Callers (FeedService.remove, AdminVideoService.delete) may have a stored
   * `videoUrl` / `thumbUrl` string but not the original `objectKey`. We
   * strip a trusted prefix (the configured `publicBase` or the local mock
   * prefix) and return whatever remains. Returns `null` for URLs we don't
   * recognise — never throws — so cleanup logic can degrade gracefully when
   * the storage backend was swapped (e.g. dev mock → R2) between upload and
   * delete.
   */
  objectKeyFromUrl(maybeUrl: string | null | undefined): string | null {
    if (!maybeUrl) return null;
    const mockPrefix = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/uploads/`;
    if (maybeUrl.startsWith(mockPrefix)) return decodeURIComponent(maybeUrl.slice(mockPrefix.length));
    if (this.env) {
      const base = `${this.env.publicBase}/`;
      if (maybeUrl.startsWith(base)) return decodeURIComponent(maybeUrl.slice(base.length));
    }
    // Heuristic last-resort: if it looks like one of our purposes,
    // grab the path portion. Avoids leaking absolute strangers' URLs.
    try {
      const u = new URL(maybeUrl);
      const path = u.pathname.replace(/^\//, '');
      if (/^(video|video_thumb|review_photo|product_media|shop_logo|cs_attachment)\//.test(path)) {
        return decodeURIComponent(path);
      }
    } catch {
      // fall through
    }
    return null;
  }

  /**
   * Phase 12.2 — delete an object from the configured S3 bucket.
   * Safe no-op when:
   *   • storage is disabled (mock mode) — there's no real bucket
   *   • `objectKey` is null/empty
   *   • the SigV4 DELETE returns 404 (object already gone)
   *
   * The matching `storage_uploads` row is marked `status='DELETED'`
   * (separate from the bootstrap-phase9-2 schema's `PENDING`/`CONFIRMED` —
   * SQLite TEXT accepts arbitrary strings). We keep the row for audit.
   *
   * Errors are swallowed into a `Logger.warn` and returned as `{ ok: false }`
   * so callers can fan out N deletes without one failure aborting the batch.
   */
  async deleteByObjectKey(
    objectKey: string | null | undefined,
  ): Promise<{ ok: boolean; reason?: string }> {
    if (!objectKey) return { ok: false, reason: 'no-key' };
    if (!this.env) {
      // Mock mode: still mark the audit row so /metrics row counts stay honest.
      await this.markUploadDeleted(objectKey);
      return { ok: true, reason: 'mock' };
    }
    try {
      await sigv4DeleteObject({
        endpoint: this.env.endpoint,
        region: this.env.region,
        bucket: this.env.bucket,
        objectKey,
        accessKeyId: this.env.accessKey,
        secretAccessKey: this.env.secretKey,
        pathStyle: this.env.pathStyle,
      });
      await this.markUploadDeleted(objectKey);
      return { ok: true };
    } catch (e) {
      this.logger.warn(
        `delete failed for objectKey=${objectKey}: ${(e as Error).message}`,
      );
      return { ok: false, reason: (e as Error).message };
    }
  }

  /** Convenience: resolves URL → objectKey then deletes. */
  async deleteByUrl(
    url: string | null | undefined,
  ): Promise<{ ok: boolean; reason?: string }> {
    const key = this.objectKeyFromUrl(url);
    if (!key) return { ok: false, reason: 'unrecognised-url' };
    return this.deleteByObjectKey(key);
  }

  private async markUploadDeleted(objectKey: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE storage_uploads SET status = 'DELETED' WHERE objectKey = ?`,
      objectKey,
    );
  }

  // ---------- Private ----------

  private async recordUpload(
    userId: string,
    objectKey: string,
    contentType: string,
    sizeBytes: number,
    purpose: string,
  ): Promise<string> {
    const id = newId('up');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO storage_uploads
        (id, userId, bucket, objectKey, contentType, sizeBytes, purpose,
         status, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)`,
      id,
      userId,
      this.env?.bucket ?? 'mock',
      objectKey,
      contentType,
      sizeBytes,
      purpose,
    );
    return id;
  }

  private async mockPresign(
    userId: string,
    input: PresignUploadInput,
  ): Promise<PresignUploadResult> {
    const objectKey = `${input.purpose}/${userId}/${Date.now()}-${newId('o').slice(2)}.${extFromType(input.contentType)}`;
    const uploadId = await this.recordUpload(
      userId,
      objectKey,
      input.contentType,
      input.sizeBytes,
      input.purpose,
    );
    // immediately mark CONFIRMED for mock — client doesn't actually upload
    await this.prisma.$executeRawUnsafe(
      `UPDATE storage_uploads SET status = 'CONFIRMED',
                                  confirmedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      uploadId,
    );
    const publicUrl = this.publicUrl(objectKey);
    return {
      uploadUrl: `data:application/x-mock,${encodeURIComponent(objectKey)}`,
      method: 'PUT',
      objectKey,
      publicUrl,
      headers: {},
      expiresInSec: URL_TTL_SEC,
      uploadId,
    };
  }

  private loadEnv(): StorageEnv | null {
    const endpointRaw = process.env.S3_ENDPOINT ?? '';
    const bucket = process.env.S3_BUCKET ?? '';
    const accessKey = process.env.S3_ACCESS_KEY ?? '';
    const secretKey = process.env.S3_SECRET_KEY ?? '';
    if (!bucket || !accessKey || !secretKey) return null;

    let region = process.env.S3_REGION ?? 'auto';
    let driver: StorageEnv['driver'] = 's3';
    let pathStyle = (process.env.S3_PATH_STYLE ?? '').toLowerCase() === 'true';
    let endpoint = endpointRaw;

    if (!endpoint) {
      endpoint = `https://s3.${region}.amazonaws.com`;
      driver = 's3';
    } else if (endpoint.includes('.r2.cloudflarestorage.com')) {
      driver = 'r2';
      pathStyle = true;
      region = 'auto';
    } else if (
      endpoint.includes('minio') ||
      endpoint.includes(':9000') ||
      endpoint.includes('localhost') ||
      endpoint.includes('127.0.0.1')
    ) {
      driver = 'minio';
      pathStyle = true;
    }

    const publicBase =
      process.env.S3_PUBLIC_BASE ??
      (pathStyle
        ? `${endpoint.replace(/\/+$/, '')}/${bucket}`
        : `${endpoint.replace(/\/+$/, '')}`);

    return {
      endpoint: endpoint.replace(/\/+$/, ''),
      region,
      bucket,
      accessKey,
      secretKey,
      driver,
      pathStyle,
      publicBase: publicBase.replace(/\/+$/, ''),
    };
  }
}
