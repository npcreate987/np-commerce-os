import { Controller, Get, Query } from '@nestjs/common';

/**
 * Phase 16 — Mobile app version probe.
 *
 * The native Capacitor shells (iOS + Android) call this on cold-start to
 * decide whether to:
 *   - show a soft "update available" banner (current < latest),
 *   - HARD block the user (current < minSupported), forcing them to
 *     upgrade before they can continue (e.g. when the server side
 *     introduces a breaking API change).
 *
 * Bumping the thresholds is intentionally cheap (env vars), so a hot-fix
 * does not require a redeploy of the API code.
 *
 * Env vars (`apps/api/.env`):
 *   APP_LATEST_VERSION       — semver, default "1.0.0"
 *   APP_MIN_SUPPORTED        — semver, default "1.0.0"
 *   APP_IOS_STORE_URL        — App Store listing URL
 *   APP_ANDROID_STORE_URL    — Play Store listing URL
 *   APP_UPDATE_MESSAGE_TH    — Thai copy shown to user (optional)
 *   APP_UPDATE_MESSAGE_EN    — English copy shown to user (optional)
 *
 * Public endpoint — no auth required. Cached client-side by React Query.
 */

interface AppVersionResponse {
  latest: string;
  minSupported: string;
  ios: { storeUrl: string };
  android: { storeUrl: string };
  message: { th: string; en: string };
  current: { platform: string; version: string; build: string } | null;
  status: 'OK' | 'UPDATE_AVAILABLE' | 'UPDATE_REQUIRED' | 'UNKNOWN';
}

function parseSemver(v: string): [number, number, number] {
  const parts = v.replace(/^v/i, '').split('.').slice(0, 3);
  return [
    Number(parts[0] ?? 0) || 0,
    Number(parts[1] ?? 0) || 0,
    Number(parts[2] ?? 0) || 0,
  ];
}

function semverLt(a: string, b: string): boolean {
  const x = parseSemver(a);
  const y = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    const xi = x[i] ?? 0;
    const yi = y[i] ?? 0;
    if (xi < yi) return true;
    if (xi > yi) return false;
  }
  return false;
}

@Controller('app')
export class AppVersionController {
  @Get('version')
  version(
    @Query('platform') platform?: string,
    @Query('version') version?: string,
    @Query('build') build?: string,
  ): AppVersionResponse {
    const latest = process.env.APP_LATEST_VERSION || '1.0.0';
    const minSupported = process.env.APP_MIN_SUPPORTED || '1.0.0';
    const iosStoreUrl =
      process.env.APP_IOS_STORE_URL ||
      'https://apps.apple.com/app/np-commerce/id000000000';
    const androidStoreUrl =
      process.env.APP_ANDROID_STORE_URL ||
      'https://play.google.com/store/apps/details?id=app.np.commerce';
    const th =
      process.env.APP_UPDATE_MESSAGE_TH ||
      'แอปเวอร์ชันใหม่พร้อมแล้ว — อัปเดตเพื่อใช้งานต่อ';
    const en =
      process.env.APP_UPDATE_MESSAGE_EN ||
      'A new app version is available — please update to continue.';

    let status: AppVersionResponse['status'] = 'UNKNOWN';
    let current: AppVersionResponse['current'] = null;

    if (platform && version) {
      current = {
        platform,
        version,
        build: build ?? '',
      };
      if (semverLt(version, minSupported)) {
        status = 'UPDATE_REQUIRED';
      } else if (semverLt(version, latest)) {
        status = 'UPDATE_AVAILABLE';
      } else {
        status = 'OK';
      }
    }

    return {
      latest,
      minSupported,
      ios: { storeUrl: iosStoreUrl },
      android: { storeUrl: androidStoreUrl },
      message: { th, en },
      current,
      status,
    };
  }
}
