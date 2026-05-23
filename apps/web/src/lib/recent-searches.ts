/**
 * Tiny localStorage helper for recent search history.
 * Cap at 8 entries, MRU order, case-insensitive dedupe.
 */

const KEY = 'np.recent-searches';
const MAX = 8;

export function getRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecentSearch(query: string): void {
  if (typeof window === 'undefined') return;
  const q = query.trim();
  if (q.length === 0) return;
  try {
    const cur = getRecentSearches();
    const filtered = cur.filter((x) => x.toLowerCase() !== q.toLowerCase());
    const next = [q, ...filtered].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore quota
  }
}

export function clearRecentSearches(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
