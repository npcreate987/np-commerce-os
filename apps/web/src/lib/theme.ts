export type ThemeMode = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'np_theme';

/**
 * Script ที่ inject ลง `<head>` ก่อน hydrate เพื่อตั้ง class `dark` บน <html>
 * ตามค่าที่เคยบันทึก/ตาม system preference — กัน flash of wrong theme (FOWT)
 *
 * IMPORTANT: ห้าม import อะไรใน string นี้ — จะ run ตอน HTML parse
 */
export const THEME_NO_FLASH_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var mode = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var resolved = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
    var root = document.documentElement;
    if (resolved === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.dataset.themeMode = mode;
  } catch (e) {
    /* no-op */
  }
})();
`;

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const resolved = resolveTheme(mode);
  const root = document.documentElement;
  if (resolved === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  root.dataset.themeMode = mode;
}

export function getStoredTheme(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'system';
  const v = localStorage.getItem(THEME_STORAGE_KEY);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

export function setStoredTheme(mode: ThemeMode): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(THEME_STORAGE_KEY, mode);
}
