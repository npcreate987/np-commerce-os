/**
 * Lightweight client-side affiliate tracking.
 *
 * เก็บ ref code ไว้ใน localStorage + cookie (30 วัน) เพื่อให้ Creator ได้คอมแม้ user
 * จะออกจากหน้า /r/[code] ไปแล้วและกลับมา checkout ภายหลัง
 */

const KEY = 'np-ref';
const COOKIE_DAYS = 30;

interface RefRecord {
  code: string;
  savedAt: number;
}

export function setRefCode(code: string): void {
  if (typeof window === 'undefined') return;
  const record: RefRecord = { code, savedAt: Date.now() };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    /* storage disabled */
  }
  const expires = new Date(Date.now() + COOKIE_DAYS * 86_400_000).toUTCString();
  document.cookie = `${KEY}=${encodeURIComponent(code)}; expires=${expires}; path=/; SameSite=Lax`;
}

export function getRefCode(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const rec = JSON.parse(raw) as RefRecord;
      const age = Date.now() - rec.savedAt;
      if (age <= COOKIE_DAYS * 86_400_000) return rec.code;
    }
  } catch {
    /* ignore */
  }
  // Fallback to cookie
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${KEY}=([^;]+)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

export function clearRefCode(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  document.cookie = `${KEY}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
}
