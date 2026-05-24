/**
 * apiUrl resolution:
 * - SSR / build time: ใช้ NEXT_PUBLIC_API_URL (set ใน .env.local) หรือ localhost:3001
 * - Browser runtime: ถ้า NEXT_PUBLIC_API_URL ไม่ใช่ localhost ใช้ตามนั้น;
 *   ไม่งั้น auto-derive จาก window.location.hostname เพื่อให้ใช้งานข้ามอุปกรณ์ได้
 *   (เปิด http://192.168.1.5:3010 จากมือถือ → จะเรียก http://192.168.1.5:3001)
 * - Capacitor native (iOS/Android): ใช้ NEXT_PUBLIC_API_URL ตรง ๆ
 *   (`window.location.hostname` ของ WebView คือ `localhost` หรือ Custom scheme
 *    ที่ไม่มี backend อยู่จริง) → ต้องเป็น absolute https URL ของ prod API
 */

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
    };
  }
}

function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

function resolveApiUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL;

  if (isCapacitorNative()) {
    // ใน native shell บังคับใช้ env. ถ้าไม่ตั้ง ก็ default ไปที่ prod placeholder
    // (จะเปลี่ยนเป็น https://api.np.app ตอน prod build จริง)
    return fromEnv && !/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(fromEnv)
      ? fromEnv
      : 'https://api.np.app';
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const apiPort = process.env.NEXT_PUBLIC_API_PORT ?? '3001';
    const envIsLocal = !fromEnv || /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(fromEnv);
    if (envIsLocal && !['localhost', '127.0.0.1', '0.0.0.0'].includes(host)) {
      return `${window.location.protocol}//${host}:${apiPort}`;
    }
  }
  return fromEnv ?? 'http://localhost:3001';
}

export const env = {
  apiUrl: resolveApiUrl(),
  apiPrefix: '/v1',
};
