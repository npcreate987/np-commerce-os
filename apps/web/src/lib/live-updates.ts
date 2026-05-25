/**
 * Phase 18 — Capacitor Live Updates client (Capgo plugin).
 *
 * รูปแบบการใช้:
 *
 *   // 1) ใน NativeBridge หลัง splash hide:
 *   await checkAndApplyLiveUpdate();
 *
 *   // 2) Settings → "ดาวน์โหลดอัปเดต" ปุ่มกดเอง:
 *   const r = await checkLiveUpdate({ force: true });
 *   if (r?.updateAvailable) {
 *     await downloadLiveUpdate(r);
 *     await applyLiveUpdate(); // optional — ปกติให้รอ next cold-start
 *   }
 *
 * Architecture:
 *
 *   ใช้ `@capgo/capacitor-updater` (open source, MIT) คู่กับ manifest
 *   endpoint ที่เราเขียนเอง (`/v1/app/live-updates/manifest`).
 *   Capgo plugin จัดการ:
 *     - HTTPS download + sha256 verify
 *     - Atomic swap ตอน next background หรือ immediate
 *     - Auto rollback ถ้า boot fail (notifyAppReady watchdog)
 *
 *   เราไม่ใช้ Capgo Cloud — แค่ใช้ plugin เป็น download/swap runtime ที่
 *   self-host friendly. ทุก policy (channel, rollout %) อยู่ที่ manifest
 *   endpoint ของเรา
 *
 * Lifecycle ที่สำคัญ:
 *   1) Cold-start → `notifyAppReady()` ต้องถูกเรียกภายใน 10 วินาที
 *      ไม่งั้น Capgo จะ rollback ไปบันเดิลก่อนหน้าอัตโนมัติ
 *   2) `download()` คืน `BundleInfo.id` — เก็บไว้สำหรับ `next({id})`
 *   3) `next({id})` แค่ flag — bundle จะ active ตอน app เข้า background
 *      (UX-safe, ไม่กระตุก)
 *   4) `reset()` กลับไปบันเดิลที่มากับ binary store (rollback ฉุกเฉิน)
 */

import { env } from './env';
import { getAppInfo, getPlatform, isNative } from './native';
import { nativeBreadcrumb } from './native-observability';

const STORAGE_KEY_CHANNEL = 'np_live_update_channel';
const STORAGE_KEY_CURRENT_BUILD = 'np_live_update_build_id';
const STORAGE_KEY_PENDING_ID = 'np_live_update_pending_id';
const STORAGE_KEY_LAST_CHECK = 'np_live_update_last_check';

export interface LiveUpdateManifest {
  updateAvailable: boolean;
  version: string;
  buildId: string;
  url: string;
  checksum: string;
  minNativeVersion: string;
  channel: 'production' | 'beta';
  size: number;
  pollIntervalSec: number;
}

type UpdaterModule = typeof import('@capgo/capacitor-updater');

let cachedModule: UpdaterModule | null | undefined = undefined;

async function loadPlugin(): Promise<UpdaterModule | null> {
  if (cachedModule !== undefined) return cachedModule;
  if (!isNative()) {
    cachedModule = null;
    return null;
  }
  try {
    cachedModule = await import('@capgo/capacitor-updater');
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

export async function getCurrentChannel(): Promise<'production' | 'beta'> {
  // First boot → fall back to NEXT_PUBLIC_LIVE_UPDATES_DEFAULT_CHANNEL (build-time)
  // ช่วยให้ dry-run / pre-release ship APK ที่ default ไป beta ได้ ส่วน prod GA
  // จะตั้งใน .env.production = 'production'. หลังจาก first launch localStorage
  // จะ override env เสมอ
  const envDefault =
    process.env.NEXT_PUBLIC_LIVE_UPDATES_DEFAULT_CHANNEL === 'beta' ? 'beta' : 'production';
  try {
    const v =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(STORAGE_KEY_CHANNEL)
        : null;
    if (v === 'beta') return 'beta';
    if (v === 'production') return 'production';
    return envDefault;
  } catch {
    return envDefault;
  }
}

export function setCurrentChannel(channel: 'production' | 'beta'): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY_CHANNEL, channel);
    }
  } catch {
    /* noop */
  }
}

function getStoredBuildId(): string | null {
  try {
    return typeof window !== 'undefined'
      ? window.localStorage.getItem(STORAGE_KEY_CURRENT_BUILD)
      : null;
  } catch {
    return null;
  }
}

function setStoredBuildId(id: string): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY_CURRENT_BUILD, id);
    }
  } catch {
    /* noop */
  }
}

/**
 * ⚠️ MUST be called early from app boot (เราเรียกใน NativeBridge after splash).
 *
 * บอก Capgo ว่า app boot สำเร็จ — Capgo มี 10-sec watchdog ถ้าไม่ได้รับ
 * signal นี้ จะ rollback ไปบันเดิลเก่าทันที. ผูกกับ first paint ใน
 * NativeBridge useEffect
 */
export async function notifyAppReady(): Promise<void> {
  const mod = await loadPlugin();
  if (!mod) return;
  try {
    await mod.CapacitorUpdater.notifyAppReady();
    await nativeBreadcrumb('live_updates.app_ready', undefined, 'live-updates');
  } catch {
    /* plugin may not be active when running with cap server.url=dev */
  }
}

/**
 * เรียก `/v1/app/live-updates/manifest` เพื่อดูว่ามี bundle ใหม่ไหม
 *
 * `opts.force=true` ข้าม TTL throttle (default poll ทุก `pollIntervalSec`)
 */
export async function checkLiveUpdate(
  opts?: { force?: boolean },
): Promise<LiveUpdateManifest | null> {
  if (!isNative()) return null;
  const force = opts?.force ?? false;

  if (!force && typeof window !== 'undefined') {
    try {
      const last = Number(
        window.localStorage.getItem(STORAGE_KEY_LAST_CHECK) || '0',
      );
      const lastTtl = Number(
        window.localStorage.getItem(`${STORAGE_KEY_LAST_CHECK}_ttl`) ||
          `${6 * 3600}`,
      );
      if (Date.now() - last < lastTtl * 1000) {
        return null;
      }
    } catch {
      /* noop */
    }
  }

  const appInfo = await getAppInfo();
  const channel = await getCurrentChannel();
  const params = new URLSearchParams();
  params.set('platform', getPlatform());
  if (appInfo) {
    params.set('nativeVersion', appInfo.appVersion);
  }
  const currentBuild = getStoredBuildId();
  if (currentBuild) params.set('currentBuildId', currentBuild);
  params.set('channel', channel);

  try {
    const res = await fetch(
      `${env.apiUrl}${env.apiPrefix}/app/live-updates/manifest?${params.toString()}`,
      { method: 'GET', headers: { accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const manifest = (await res.json()) as LiveUpdateManifest;

    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          STORAGE_KEY_LAST_CHECK,
          String(Date.now()),
        );
        window.localStorage.setItem(
          `${STORAGE_KEY_LAST_CHECK}_ttl`,
          String(manifest.pollIntervalSec),
        );
      }
    } catch {
      /* noop */
    }

    await nativeBreadcrumb(
      'live_updates.manifest',
      {
        updateAvailable: manifest.updateAvailable,
        currentBuildId: currentBuild,
        nextBuildId: manifest.buildId,
        channel: manifest.channel,
      },
      'live-updates',
    );
    return manifest;
  } catch {
    return null;
  }
}

/**
 * ดาวน์โหลด bundle แล้ว stage ผ่าน `next()` (apply ตอน app เข้า
 * background ครั้งถัดไป → UX-safe ไม่กระตุก webview)
 *
 * คืน true เมื่อ download สำเร็จ + flagged เป็น next bundle
 */
export async function downloadLiveUpdate(
  manifest: LiveUpdateManifest,
): Promise<boolean> {
  const mod = await loadPlugin();
  if (!mod) {
    await nativeBreadcrumb(
      'live_updates.skip',
      { reason: 'plugin_missing' },
      'live-updates',
    );
    return false;
  }
  try {
    const bundle = await mod.CapacitorUpdater.download({
      url: manifest.url,
      version: manifest.buildId,
      checksum: manifest.checksum || undefined,
    });
    await mod.CapacitorUpdater.next({ id: bundle.id });
    setStoredBuildId(manifest.buildId);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY_PENDING_ID, bundle.id);
      }
    } catch {
      /* noop */
    }
    await nativeBreadcrumb(
      'live_updates.downloaded',
      { bundleId: bundle.id, buildId: manifest.buildId },
      'live-updates',
    );
    return true;
  } catch (err) {
    await nativeBreadcrumb(
      'live_updates.error',
      {
        phase: 'download',
        buildId: manifest.buildId,
        message: err instanceof Error ? err.message : String(err),
      },
      'live-updates',
    );
    return false;
  }
}

/**
 * Apply pending bundle ทันที — webview จะ reload + JS context ถูก destroy
 * เรียกเมื่อ user กดปุ่ม "Restart to apply" ใน settings เท่านั้น
 * (ไม่ใช่ auto on every check)
 */
export async function applyLiveUpdate(): Promise<void> {
  const mod = await loadPlugin();
  if (!mod) return;
  try {
    const pendingId =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(STORAGE_KEY_PENDING_ID)
        : null;
    if (!pendingId) return;
    await mod.CapacitorUpdater.set({ id: pendingId });
    try {
      window.localStorage.removeItem(STORAGE_KEY_PENDING_ID);
    } catch {
      /* noop */
    }
    await nativeBreadcrumb(
      'live_updates.applied',
      { bundleId: pendingId },
      'live-updates',
    );
  } catch {
    /* noop */
  }
}

/**
 * Rollback ฉุกเฉิน — กลับไปบันเดิลที่มากับ binary จากสโตร์
 * ใช้เมื่อ:
 *   - User รายงาน bug จาก bundle ใหม่
 *   - เรา push bundle ผิด แล้วต้องการ kill switch ฝั่ง client
 */
export async function resetLiveUpdate(): Promise<void> {
  const mod = await loadPlugin();
  if (!mod) return;
  try {
    await mod.CapacitorUpdater.reset();
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(STORAGE_KEY_CURRENT_BUILD);
        window.localStorage.removeItem(STORAGE_KEY_PENDING_ID);
      }
    } catch {
      /* noop */
    }
    await nativeBreadcrumb('live_updates.reset', undefined, 'live-updates');
  } catch {
    /* noop */
  }
}

/**
 * Convenience: cold-start auto check + silent download.
 *
 * - ถ้ามี update + อยู่ใน rollout bucket → download + flag `next()`
 * - Bundle จะ active ตอน app เข้า background ครั้งถัดไป (UX-safe)
 *
 * คืน true เมื่อมี bundle ใหม่ pending → caller ใช้ตัดสินใจว่าจะแสดง
 * "Restart to apply" toast หรือไม่ (Phase 18.x — soft banner)
 */
export async function checkAndApplyLiveUpdate(): Promise<boolean> {
  const manifest = await checkLiveUpdate();
  if (!manifest || !manifest.updateAvailable) return false;
  return await downloadLiveUpdate(manifest);
}
