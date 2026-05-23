/**
 * Phase 10.1 — Behavioural tracker (client SDK).
 *
 * Public API:
 *   - `tracker.identify(userId, token)`  — call on login. Stitches anon → user.
 *   - `tracker.forget()`                 — call on logout. Rotates anonId.
 *   - `tracker.track(kind, fields)`      — enqueue an event. Cheap; flushes async.
 *   - `tracker.flush()`                  — force a sync flush. Called on pagehide.
 *   - `tracker.setConsent(optedOut)`     — disable all tracking immediately.
 *
 * Storage:
 *   - `np_anon_id`   → localStorage. Stable across visits.
 *   - `np_session_id`→ sessionStorage. Resets when tab closes (or after 30min idle).
 *   - `np_consent`   → localStorage. "off" disables everything; default = on.
 *
 * Transport:
 *   - Batches up to 50 events or 5 seconds, whichever first.
 *   - On `pagehide` / `visibilitychange→hidden`, flushes via
 *     `navigator.sendBeacon` (fire-and-forget; survives navigation).
 *   - Falls back to `fetch` when sendBeacon unavailable.
 *
 * Robustness:
 *   - Server returning HTTP 4xx/5xx is silently ignored (no retries) — telemetry
 *     loss is acceptable, never break the user's session.
 *   - SSR-safe: every browser API is gated on `typeof window`.
 */

import { env } from './env';

// Mirror of the server-side enum. Keeping this hand-written avoids dragging
// the whole @np/types runtime into the bundle (these are string literals only).
export type TrackKind =
  | 'page_view'
  | 'session_start'
  | 'session_end'
  | 'product_view'
  | 'product_dwell'
  | 'product_scroll'
  | 'shop_view'
  | 'category_view'
  | 'search_query'
  | 'search_click'
  | 'add_to_cart'
  | 'remove_from_cart'
  | 'update_cart_quantity'
  | 'checkout_start'
  | 'purchase'
  | 'wishlist_add'
  | 'wishlist_remove'
  | 'follow_shop'
  | 'share'
  | 'video_play'
  | 'video_complete'
  | 'noti_open'
  | 'email_open'
  | 'chat_open'
  | 'reco_impression'
  | 'reco_click';

export interface TrackFields {
  entityType?: string;
  entityId?: string;
  surface?: string;
  meta?: Record<string, unknown>;
  dwellMs?: number;
  scrollPct?: number;
}

interface QueuedEvent extends TrackFields {
  kind: TrackKind;
  sessionId: string;
  anonId: string;
  clientTs: string;
}

const STORAGE_KEYS = {
  anon: 'np_anon_id',
  session: 'np_session_id',
  sessionLastSeen: 'np_session_last_seen',
  consent: 'np_consent',
} as const;

const FLUSH_INTERVAL_MS = 5_000;
const MAX_QUEUE = 50;
const SESSION_IDLE_TIMEOUT_MS = 30 * 60_000;

function randId(prefix: string): string {
  const r =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${r}`;
}

class Tracker {
  private queue: QueuedEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private authToken: string | null = null;
  private listenersAttached = false;
  private cachedAnonId: string | null = null;
  private cachedSessionId: string | null = null;

  /* ────────────────────────────────────────────────────────────────────
   * Identity
   * ──────────────────────────────────────────────────────────────────── */

  getAnonId(): string {
    if (typeof window === 'undefined') return 'ssr_anon';
    if (this.cachedAnonId) return this.cachedAnonId;
    let id = localStorage.getItem(STORAGE_KEYS.anon);
    if (!id) {
      id = randId('anon');
      localStorage.setItem(STORAGE_KEYS.anon, id);
    }
    this.cachedAnonId = id;
    return id;
  }

  getSessionId(): string {
    if (typeof window === 'undefined') return 'ssr_session';
    if (this.cachedSessionId) return this.cachedSessionId;
    const lastSeenRaw = sessionStorage.getItem(STORAGE_KEYS.sessionLastSeen);
    const lastSeen = lastSeenRaw ? Number(lastSeenRaw) : 0;
    const idle = Date.now() - lastSeen > SESSION_IDLE_TIMEOUT_MS;
    let id = sessionStorage.getItem(STORAGE_KEYS.session);
    if (!id || idle) {
      id = randId('ses');
      sessionStorage.setItem(STORAGE_KEYS.session, id);
    }
    sessionStorage.setItem(STORAGE_KEYS.sessionLastSeen, String(Date.now()));
    this.cachedSessionId = id;
    return id;
  }

  /** Call on login. Stitches anonymous history to userId on the server. */
  async identify(userId: string, token: string): Promise<void> {
    this.authToken = token;
    if (typeof window === 'undefined') return;
    if (!this.isAllowed()) return;
    const anonId = this.getAnonId();
    try {
      await fetch(`${env.apiUrl}${env.apiPrefix}/events/link-anon`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ anonId }),
        keepalive: true,
      });
    } catch {
      // best-effort
    }
    // Quietly note this on the firehose too — useful for funnel analysis.
    void this.track('session_start', { surface: 'login', meta: { userId } });
  }

  /** Call on logout. Drops the bearer and rotates anonId so future events
   *  don't get attributed to the previous user. */
  forget(): void {
    this.authToken = null;
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEYS.anon);
    this.cachedAnonId = null;
    // Fire one final session_end before nuking
    void this.track('session_end', { surface: 'logout' });
    void this.flush();
  }

  /* ────────────────────────────────────────────────────────────────────
   * Consent
   * ──────────────────────────────────────────────────────────────────── */

  setConsent(optedOut: boolean): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.consent, optedOut ? 'off' : 'on');
    if (optedOut) this.queue = [];
  }

  isAllowed(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEYS.consent) !== 'off';
  }

  /* ────────────────────────────────────────────────────────────────────
   * Enqueue + flush
   * ──────────────────────────────────────────────────────────────────── */

  track(kind: TrackKind, fields: TrackFields = {}): void {
    if (typeof window === 'undefined') return;
    if (!this.isAllowed()) return;
    this.ensureListeners();
    this.queue.push({
      ...fields,
      kind,
      sessionId: this.getSessionId(),
      anonId: this.getAnonId(),
      clientTs: new Date().toISOString(),
    });
    if (this.queue.length >= MAX_QUEUE) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (typeof window === 'undefined') return;
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.queue.length);
    const url = `${env.apiUrl}${env.apiPrefix}/events/batch`;
    const body = JSON.stringify({ events: batch });

    // Prefer sendBeacon — survives navigation, doesn't block the unload event.
    if (
      'sendBeacon' in navigator &&
      typeof navigator.sendBeacon === 'function'
    ) {
      try {
        // sendBeacon doesn't support custom headers, but the server treats
        // missing Authorization as anonymous tracking — fine for telemetry.
        const blob = new Blob([body], { type: 'application/json' });
        const ok = navigator.sendBeacon(url, blob);
        if (ok) return;
      } catch {
        // fall through to fetch
      }
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (this.authToken) headers.authorization = `Bearer ${this.authToken}`;
    try {
      await fetch(url, { method: 'POST', headers, body, keepalive: true });
    } catch {
      // dropped — telemetry must never break the page
    }
  }

  private ensureListeners(): void {
    if (this.listenersAttached) return;
    if (typeof window === 'undefined') return;
    this.listenersAttached = true;

    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);

    const flushOnExit = (): void => void this.flush();
    window.addEventListener('pagehide', flushOnExit);
    window.addEventListener('beforeunload', flushOnExit);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushOnExit();
    });
  }

  /** Internal — used by hot-reload teardown in dev. */
  __reset(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.queue = [];
    this.cachedAnonId = null;
    this.cachedSessionId = null;
  }
}

export const tracker = new Tracker();
