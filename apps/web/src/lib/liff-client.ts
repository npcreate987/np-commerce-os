/**
 * Phase 21 — LIFF (LINE Front-end Framework) wrapper.
 *
 * Why a wrapper around `@line/liff`?
 *  1. The SDK *must* be initialized before any other call. Multiple call
 *     sites would race the init unless we centralise it behind a Promise.
 *  2. The SDK throws synchronously on SSR (it touches `window` during
 *     module evaluation). We lazy-import to keep Next.js prerender + the
 *     static export (Capacitor APK) build clean.
 *  3. We need consistent error semantics — every consumer should get
 *     `LiffError` with a stable `.code` instead of opaque library errors.
 *
 * Public surface — keep this small:
 *   getLiff()         → ensures SDK is loaded + initialised, returns the
 *                       Liff instance ready to use.
 *   liffLogin()       → idempotent "make sure user is signed in"; resolves
 *                       with an idToken on success or rejects with a typed
 *                       LiffError on failure.
 *   liffLogout()      → revoke local LIFF session (does NOT log out our
 *                       backend session — caller handles that separately).
 *   isLiffConfigured()→ truthy if NEXT_PUBLIC_LINE_LIFF_ID is set; lets the
 *                       /login page hide the LINE button on misconfigured
 *                       previews.
 */
import { env } from './env';
import { isNative, openExternalUrl } from './native';

import type { Liff } from '@line/liff';

/**
 * Phase 21.1 — Capacitor LIFF bounce URL.
 *
 * In a Capacitor WebView the current origin is `https://localhost` (Android
 * scheme) or `capacitor://localhost` (iOS). LINE rejects both as
 * `redirect_uri` so the LIFF SDK can't run end-to-end inside the WebView.
 *
 * Workaround:
 *   1. We open the production web /login URL in an external Chrome Custom
 *      Tab (`@capacitor/browser`) with `?source=capacitor`.
 *   2. That page runs the standard LIFF flow (its origin matches the LIFF
 *      Endpoint URL so LINE accepts it).
 *   3. After getting our JWT, the page detects `?source=capacitor` and
 *      navigates to `npcommerce://login-success?token=…&refresh=…&user=…`.
 *   4. Android's intent filter routes that custom scheme back to the
 *      Capacitor MainActivity, which `appUrlOpen` listener picks up and
 *      writes the tokens into the auth store.
 *
 * Keep this constant in sync with the production web deployment.
 */
const CAPACITOR_BOUNCE_URL = 'https://np-commerce.pages.dev/login?source=capacitor';

/**
 * Custom error class so consumers don't depend on SDK-internal error
 * shapes. Codes mirror the human-readable reasons surfaced by LIFF docs;
 * `cause` retains the original error for Sentry breadcrumbs.
 */
export class LiffError extends Error {
  public readonly code:
    | 'NOT_CONFIGURED'
    | 'INIT_FAILED'
    | 'LOGIN_REQUIRED'
    | 'NO_ID_TOKEN'
    | 'UNKNOWN';
  public readonly liffCause?: unknown;

  constructor(
    code:
      | 'NOT_CONFIGURED'
      | 'INIT_FAILED'
      | 'LOGIN_REQUIRED'
      | 'NO_ID_TOKEN'
      | 'UNKNOWN',
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'LiffError';
    this.code = code;
    this.liffCause = cause;
  }
}

export function isLiffConfigured(): boolean {
  return Boolean(env.lineLiffId);
}

let initPromise: Promise<Liff> | null = null;

/**
 * Loads the SDK on demand (so the ~80 KB bundle doesn't sit in our
 * initial chunk) and runs `liff.init` exactly once. Subsequent callers
 * await the same Promise.
 */
export async function getLiff(): Promise<Liff> {
  if (typeof window === 'undefined') {
    throw new LiffError('INIT_FAILED', 'LIFF is browser-only');
  }
  if (!env.lineLiffId) {
    throw new LiffError(
      'NOT_CONFIGURED',
      'NEXT_PUBLIC_LINE_LIFF_ID is not set',
    );
  }

  if (!initPromise) {
    initPromise = (async () => {
      const liffModule = await import('@line/liff');
      const liff = liffModule.default;
      try {
        await liff.init({ liffId: env.lineLiffId });
      } catch (err) {
        initPromise = null;
        throw new LiffError(
          'INIT_FAILED',
          `liff.init failed: ${(err as Error).message ?? 'unknown'}`,
          err,
        );
      }
      return liff;
    })();
  }
  return initPromise;
}

/**
 * Ensures the user is signed in with LINE and returns a fresh id_token.
 *
 *  • If already logged in → returns the cached id_token (LIFF refreshes
 *    it automatically as long as the session is valid).
 *  • If NOT logged in → calls `liff.login({ redirectUri })`. The browser
 *    is redirected away to access.line.me; the calling code should treat
 *    this as a one-way ticket (the Promise will never resolve in the
 *    same page lifecycle — the user comes back to `redirectUri` with the
 *    LIFF session ready).
 *
 * `redirectUri` defaults to the current URL so the user lands back on
 * /login and the page can immediately re-call this helper to retrieve
 * the id_token.
 */
export async function liffLogin(opts: {
  redirectUri?: string;
} = {}): Promise<string> {
  // Capacitor escape hatch — see CAPACITOR_BOUNCE_URL doc comment above.
  // We avoid `liff.init` entirely because the LIFF SDK sets `redirect_uri`
  // to the current origin (`https://localhost`) which LINE rejects.
  if (isNative()) {
    if (!env.lineLiffId) {
      throw new LiffError(
        'NOT_CONFIGURED',
        'NEXT_PUBLIC_LINE_LIFF_ID is not set',
      );
    }
    await openExternalUrl(CAPACITOR_BOUNCE_URL);
    // The Custom Tab now owns the auth flow; the rest of the journey
    // happens via the `npcommerce://login-success` deep link handled by
    // `NativeBridge`. We throw the same code as the web "redirect kicked
    // off" branch so the caller's spinner stays up.
    throw new LiffError(
      'LOGIN_REQUIRED',
      'Redirecting to LINE login via in-app browser…',
    );
  }

  const liff = await getLiff();

  if (!liff.isLoggedIn()) {
    liff.login({
      redirectUri: opts.redirectUri ?? window.location.href,
    });
    // liff.login() triggers a top-level redirect — the next line never
    // actually runs, but we throw to satisfy TypeScript's return type
    // and to surface a useful error if the redirect was blocked.
    throw new LiffError('LOGIN_REQUIRED', 'Redirecting to LINE login…');
  }

  const idToken = liff.getIDToken();
  if (!idToken) {
    throw new LiffError(
      'NO_ID_TOKEN',
      'LIFF session is active but getIDToken() returned null',
    );
  }
  return idToken;
}

/**
 * Clears the LIFF session locally. The backend session lives separately
 * — call `useAuth.clear()` from the caller to wipe our JWT too.
 */
export async function liffLogout(): Promise<void> {
  if (!env.lineLiffId) return;
  try {
    const liff = await getLiff();
    if (liff.isLoggedIn()) liff.logout();
  } catch {
    // Best-effort: if init fails we still want the caller's local
    // session cleanup to proceed.
  }
}
