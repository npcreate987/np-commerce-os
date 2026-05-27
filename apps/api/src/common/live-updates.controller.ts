import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { ZodValidationPipe } from './zod/zod-validation.pipe';
import { LiveUpdatesCacheService } from './live-updates-cache.service';

/**
 * Phase 18 — Capacitor Live Updates manifest.
 *
 * เป้าหมาย: ส่ง JS/CSS bundle ใหม่ให้ native shell ดาวน์โหลด+สลับ
 * โดยไม่ต้องเข้า App Store / Play Store review (ภายในขอบเขตที่ Apple
 * อนุญาต = ไม่เปลี่ยน "primary purpose" และไม่เพิ่ม native code).
 *
 * Native shell เรียก endpoint นี้ตอน app cold-start และทุก 6 ชั่วโมง
 * ตอบกลับ:
 *   - 200 + `{ updateAvailable: false }`  ถ้า client มี bundle ล่าสุด
 *   - 200 + `{ updateAvailable: true, version, url, checksum, ... }`
 *
 * เราจัดทำเป็น **server-rendered** ไม่ใช่ static JSON เพราะ:
 *   1) ต้องรู้ minSupportedNativeVersion (เผื่อ bundle ใหม่ใช้ plugin
 *      ที่ shell เก่าไม่มี → ต้อง gate ด้วย native version)
 *   2) ต้องรู้ channel ของ user (production / beta / staff) → A/B + canary
 *   3) Roll-back ได้เร็วโดยเปลี่ยน env var (อย่ารอ CDN cache invalidate)
 *
 * Phase 19 — เพิ่ม `POST /webhook` ให้ CI อัปเดต manifest โดยไม่ต้อง
 * redeploy API. Webhook สร้าง override ใน `LiveUpdatesCacheService`
 * (in-memory) แล้ว `GET /manifest` จะอ่านจาก cache ก่อน, ตกไป env var
 * ถ้า cache ว่าง.
 *
 * Env vars (fallback เมื่อ cache ว่าง):
 *   LIVE_UPDATES_VERSION              — semver ของ bundle ล่าสุด เช่น "1.0.5"
 *   LIVE_UPDATES_BUILD_ID             — id เฉพาะ build เช่น git SHA short
 *   LIVE_UPDATES_BUNDLE_URL           — https://cdn.np.app/bundles/<sha>.zip
 *   LIVE_UPDATES_CHECKSUM             — sha256 ของไฟล์ bundle
 *   LIVE_UPDATES_MIN_NATIVE_VERSION   — native shell ต่ำสุดที่ใช้ bundle นี้ได้
 *   LIVE_UPDATES_ROLLOUT_PCT          — เปอร์เซ็นต์ของ production ที่ rollout (0-100)
 *   LIVE_UPDATES_PAUSE                — "1" = หยุดส่ง update (kill-switch)
 *   LIVE_UPDATES_WEBHOOK_SECRET       — HMAC secret สำหรับ POST /webhook
 *
 * Note: เราใช้ self-hosted CDN (ดู `docs/phase-18-mobile-ops.md`) ไม่ใช่
 * Ionic Appflow เพื่อ:
 *   - ไม่มี vendor lock-in
 *   - ราคาถูกกว่า (Cloudflare R2 vs $499/mo Appflow)
 *   - control privacy เต็มที่ (Apple/Play ตรวจ bundle download URL ใน review)
 */

interface LiveUpdateManifest {
  updateAvailable: boolean;
  /** semver ของ JS bundle เช่น "1.0.5" (ไม่ใช่ native shell version) */
  version: string;
  /** id แบบ short — git SHA หรือ build number — ใช้เทียบกับ client ที่เก็บไว้ */
  buildId: string;
  /** HTTPS URL ของ zip ของ web bundle (`apps/web/out/*`) */
  url: string;
  /** sha256 ของ zip — client ต้อง verify ก่อน apply */
  checksum: string;
  /** native shell ต่ำสุดที่รัน bundle นี้ได้ — ถ้า client ต่ำกว่า แสดง force-update */
  minNativeVersion: string;
  /** channel ที่ user ถูกจัดอยู่ */
  channel: 'production' | 'beta';
  /** ขนาด zip (byte) — UI โชว์ "ดาวน์โหลด 3.2 MB" */
  size: number;
  /** TTL ก่อน client ต้องถามใหม่ (วินาที) — default 6 ชม. */
  pollIntervalSec: number;
}

function hashUserId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(h) % 100;
}

const liveUpdateWebhookSchema = z.object({
  channel: z.enum(['production', 'beta']),
  version: z.string().regex(/^\d+\.\d+\.\d+/, 'version must be semver'),
  buildId: z.string().min(1).max(64),
  url: z.string().url().startsWith('https://', 'bundle URL must be HTTPS'),
  checksum: z.string().regex(/^[a-f0-9]{64}$/i, 'checksum must be sha256 hex'),
  size: z.number().int().positive(),
  rolloutPct: z.number().int().min(0).max(100),
  minNativeVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+/, 'minNativeVersion must be semver')
    .optional(),
});

type LiveUpdateWebhookPayload = z.infer<typeof liveUpdateWebhookSchema>;

/**
 * Verify HMAC-SHA256 signature against the raw request body.
 *
 * Caller must format signature header as `sha256=<hex>` (matches GitHub
 * webhook convention and what `mobile-live-update.yml` emits via
 * `openssl dgst -sha256 -hmac`).
 *
 * Constant-time comparison via `timingSafeEqual` prevents timing-attack
 * leaks of the expected digest. Returns true iff the secret matches.
 */
function verifyHmacSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;
  const m = /^sha256=([a-f0-9]{64})$/i.exec(signatureHeader.trim());
  if (!m) return false;
  const provided = Buffer.from(m[1], 'hex');
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

@Controller('app/live-updates')
export class LiveUpdatesController {
  private readonly log = new Logger(LiveUpdatesController.name);

  constructor(private readonly cache: LiveUpdatesCacheService) {}

  @Get('manifest')
  manifest(
    @Query('platform') platform?: string,
    @Query('nativeVersion') nativeVersion?: string,
    @Query('currentBuildId') currentBuildId?: string,
    @Query('channel') channelHint?: string,
    @Query('userId') userId?: string,
    @Headers('x-anon-id') anonId?: string,
  ): LiveUpdateManifest {
    const channel: LiveUpdateManifest['channel'] =
      channelHint === 'beta' ? 'beta' : 'production';

    // Phase 19 — prefer in-memory override (CI webhook) over env vars so
    // the latest bundle is served without an API redeploy.
    const override = this.cache.get(channel);

    const version = override?.version ?? process.env.LIVE_UPDATES_VERSION ?? '0.0.0';
    const buildId = override?.buildId ?? process.env.LIVE_UPDATES_BUILD_ID ?? 'none';
    const url = override?.url ?? process.env.LIVE_UPDATES_BUNDLE_URL ?? '';
    const checksum = override?.checksum ?? process.env.LIVE_UPDATES_CHECKSUM ?? '';
    const minNativeVersion =
      override?.minNativeVersion ??
      process.env.LIVE_UPDATES_MIN_NATIVE_VERSION ??
      '1.0.0';
    const sizeBytes =
      override?.size ?? Number(process.env.LIVE_UPDATES_BUNDLE_SIZE_BYTES || '0');
    const paused = process.env.LIVE_UPDATES_PAUSE === '1';
    const productionRollout = Math.min(
      100,
      Math.max(
        0,
        override?.rolloutPct ?? Number(process.env.LIVE_UPDATES_ROLLOUT_PCT || '100'),
      ),
    );

    let updateAvailable = false;

    if (!paused && url && checksum && currentBuildId !== buildId) {
      if (channel === 'beta') {
        updateAvailable = true;
      } else {
        // Deterministic rollout — hash userId/anonId → 0..99 bucket
        const key = userId || anonId || 'anon';
        updateAvailable = hashUserId(key) < productionRollout;
      }
    }

    // Defensive: never advertise an update for a native shell ที่เก่าเกินไป
    if (
      updateAvailable &&
      nativeVersion &&
      semverLt(nativeVersion, minNativeVersion)
    ) {
      updateAvailable = false;
    }

    // Platform isn't used today, but the field is part of the contract — กัน
    // เผื่อในอนาคต iOS/Android ใช้ bundle คนละแบบ
    void platform;

    return {
      updateAvailable,
      version,
      buildId,
      url,
      checksum,
      minNativeVersion,
      channel,
      size: sizeBytes,
      pollIntervalSec: Number(
        process.env.LIVE_UPDATES_POLL_INTERVAL_SEC || `${6 * 3600}`,
      ),
    };
  }

  /**
   * Phase 19 — CI webhook receiver.
   *
   * Called by `.github/workflows/mobile-live-update.yml` AFTER the bundle
   * is uploaded to R2. Stores the new bundle metadata in
   * `LiveUpdatesCacheService` so subsequent manifest reads return it
   * without an API redeploy.
   *
   * Authentication: HMAC-SHA256 over the raw request body, secret is
   * `LIVE_UPDATES_WEBHOOK_SECRET`. CI must send compact canonical JSON
   * (use `jq -cS` to sort keys + strip whitespace) so re-serialization
   * isn't needed and the verification matches byte-for-byte.
   *
   * Returns 401 on bad signature, 400 on invalid payload, 200 with the
   * applied buildId on success.
   */
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: { rawBody?: string | Buffer },
    @Headers('x-np-signature') signature: string | undefined,
    @Body(new ZodValidationPipe(liveUpdateWebhookSchema))
    body: LiveUpdateWebhookPayload,
  ): Promise<{ ok: true; applied: string; channel: string; updatedAt: string }> {
    const secret = process.env.LIVE_UPDATES_WEBHOOK_SECRET;
    if (!secret) {
      this.log.error('LIVE_UPDATES_WEBHOOK_SECRET not configured — refusing webhook');
      throw new UnauthorizedException('Webhook receiver not configured');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      // Fastify content-type parser in main.ts is responsible for setting this.
      // If it's missing we can't safely verify the signature.
      this.log.error('rawBody missing on request — content parser misconfigured');
      throw new BadRequestException('raw body not captured');
    }

    const rawString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    if (!verifyHmacSignature(rawString, signature, secret)) {
      this.log.warn(
        `Rejected webhook: signature mismatch (channel=${body.channel ?? 'unknown'})`,
      );
      throw new UnauthorizedException('Invalid HMAC signature');
    }

    // Phase 19.3 — `update()` is now async (writes to Postgres before
    // memory). Awaiting keeps the webhook semantically "persisted before
    // 200" — if the DB write throws, the caller gets a 500 instead of
    // a false-positive ack.
    const applied = await this.cache.update({
      channel: body.channel,
      version: body.version,
      buildId: body.buildId,
      url: body.url,
      checksum: body.checksum,
      size: body.size,
      rolloutPct: body.rolloutPct,
      minNativeVersion: body.minNativeVersion,
    });

    return {
      ok: true,
      applied: applied.buildId,
      channel: applied.channel,
      updatedAt: applied.updatedAt,
    };
  }
}

function semverLt(a: string, b: string): boolean {
  const x = a.replace(/^v/i, '').split('.').map((n) => Number(n) || 0);
  const y = b.replace(/^v/i, '').split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i++) {
    const xi = x[i] ?? 0;
    const yi = y[i] ?? 0;
    if (xi < yi) return true;
    if (xi > yi) return false;
  }
  return false;
}
