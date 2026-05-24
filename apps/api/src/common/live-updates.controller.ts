import { Controller, Get, Headers, Query } from '@nestjs/common';

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
 * Env vars:
 *   LIVE_UPDATES_VERSION              — semver ของ bundle ล่าสุด เช่น "1.0.5"
 *   LIVE_UPDATES_BUILD_ID             — id เฉพาะ build เช่น git SHA short
 *   LIVE_UPDATES_BUNDLE_URL           — https://cdn.np.app/bundles/<sha>.zip
 *   LIVE_UPDATES_CHECKSUM             — sha256 ของไฟล์ bundle
 *   LIVE_UPDATES_MIN_NATIVE_VERSION   — native shell ต่ำสุดที่ใช้ bundle นี้ได้
 *   LIVE_UPDATES_CHANNEL_BETA_PCT     — เปอร์เซ็นต์ของ beta channel ที่ได้ bundle
 *   LIVE_UPDATES_ROLLOUT_PCT          — เปอร์เซ็นต์ของ production ที่ rollout (0-100)
 *   LIVE_UPDATES_PAUSE                — "1" = หยุดส่ง update (kill-switch)
 *
 * Note: เราใช้ self-hosted CDN (ดู `docs/phase-18-mobile-ops.md`) ไม่ใช่
 * Ionic Appflow เพื่อ:
 *   - ไม่มี vendor lock-in
 *   - ราคาถูกกว่า (S3+CloudFront vs $499/mo)
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

@Controller('app/live-updates')
export class LiveUpdatesController {
  @Get('manifest')
  manifest(
    @Query('platform') platform?: string,
    @Query('nativeVersion') nativeVersion?: string,
    @Query('currentBuildId') currentBuildId?: string,
    @Query('channel') channelHint?: string,
    @Query('userId') userId?: string,
    @Headers('x-anon-id') anonId?: string,
  ): LiveUpdateManifest {
    const version = process.env.LIVE_UPDATES_VERSION || '0.0.0';
    const buildId = process.env.LIVE_UPDATES_BUILD_ID || 'none';
    const url = process.env.LIVE_UPDATES_BUNDLE_URL || '';
    const checksum = process.env.LIVE_UPDATES_CHECKSUM || '';
    const minNativeVersion =
      process.env.LIVE_UPDATES_MIN_NATIVE_VERSION || '1.0.0';
    const sizeBytes = Number(process.env.LIVE_UPDATES_BUNDLE_SIZE_BYTES || '0');
    const paused = process.env.LIVE_UPDATES_PAUSE === '1';
    const productionRollout = Math.min(
      100,
      Math.max(0, Number(process.env.LIVE_UPDATES_ROLLOUT_PCT || '100')),
    );
    const channel: LiveUpdateManifest['channel'] =
      channelHint === 'beta' ? 'beta' : 'production';

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
