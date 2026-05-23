/**
 * apiUrl resolution:
 * - SSR / build time: ใช้ NEXT_PUBLIC_API_URL (set ใน .env.local) หรือ localhost:3001
 * - Browser runtime: ถ้า NEXT_PUBLIC_API_URL ไม่ใช่ localhost ใช้ตามนั้น;
 *   ไม่งั้น auto-derive จาก window.location.hostname เพื่อให้ใช้งานข้ามอุปกรณ์ได้
 *   (เปิด http://192.168.1.5:3010 จากมือถือ → จะเรียก http://192.168.1.5:3001)
 */
function resolveApiUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const apiPort = process.env.NEXT_PUBLIC_API_PORT ?? '3001';
    // ถ้า env ระบุ host เป็น localhost/127 แต่ user เปิดจาก LAN/IP อื่น → ใช้ host ของ browser แทน
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
