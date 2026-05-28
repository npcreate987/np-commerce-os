/**
 * Phase 21.2 — Google Sign-In wrapper.
 *
 * Two flows under one interface:
 *
 *  1. Web / PWA (browser, including Cloudflare Pages)
 *     → Loads Google Identity Services (GIS) JavaScript SDK from
 *       `https://accounts.google.com/gsi/client` and shows the One Tap /
 *       popup credential prompt. Returns the GIS `credential` (an
 *       id_token) which we POST to `/auth/google`.
 *
 *  2. Capacitor (Android / iOS native shell)
 *     → Uses `@codetrix-studio/capacitor-google-auth` which delegates to
 *       Google Play Services on Android (Sign-In with Google) and the
 *       Sign in with Google SDK on iOS. The native picker is far better
 *       UX than a Chrome Custom Tab — and avoids the LIFF-style
 *       bounce-back deep-link altogether.
 *
 *       The plugin's `clientId` is configured to the **Web** OAuth client
 *       ID (the same value as `NEXT_PUBLIC_GOOGLE_CLIENT_ID`). This is the
 *       canonical pattern: native picker authenticates against the
 *       Android Client ID (registered against our APK's SHA-1
 *       fingerprint) but returns an id_token whose `aud` claim is the
 *       Web Client ID — which our backend's `GoogleAuthService` already
 *       expects.
 *
 * Public surface:
 *   isGoogleConfigured()    → truthy if NEXT_PUBLIC_GOOGLE_CLIENT_ID set
 *   loadGoogleScript()      → (web only) idempotent GIS script loader
 *   googleSignIn()          → resolves with id_token on either platform
 *   googleSignOut()         → (native only) clears the Google session
 *   renderGoogleButton()    → (web only) renders the official GIS button
 */
import { env } from './env';
import { isNative } from './native';

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const GIS_SCRIPT_ID = 'google-identity-services';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleInitializeConfig) => void;
          prompt: (cb?: (notification: GooglePromptNotification) => void) => void;
          renderButton: (
            parent: HTMLElement,
            options: GoogleButtonOptions,
          ) => void;
          disableAutoSelect: () => void;
          cancel: () => void;
        };
      };
    };
  }
}

interface GoogleInitializeConfig {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  use_fedcm_for_prompt?: boolean;
  nonce?: string;
  context?: 'signin' | 'signup' | 'use';
  ux_mode?: 'popup' | 'redirect';
}

interface GoogleCredentialResponse {
  credential: string;
  select_by: string;
  clientId?: string;
}

interface GoogleButtonOptions {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: number;
  locale?: string;
}

interface GooglePromptNotification {
  isNotDisplayed: () => boolean;
  isSkippedMoment: () => boolean;
  isDismissedMoment: () => boolean;
  getNotDisplayedReason: () => string;
  getSkippedReason: () => string;
  getDismissedReason: () => string;
}

export class GoogleAuthError extends Error {
  public readonly code:
    | 'NOT_CONFIGURED'
    | 'SCRIPT_LOAD_FAILED'
    | 'PROMPT_DISMISSED'
    | 'NO_CREDENTIAL'
    | 'NATIVE_PLUGIN_FAILED'
    | 'UNKNOWN';
  public readonly gisCause?: unknown;

  constructor(
    code:
      | 'NOT_CONFIGURED'
      | 'SCRIPT_LOAD_FAILED'
      | 'PROMPT_DISMISSED'
      | 'NO_CREDENTIAL'
      | 'NATIVE_PLUGIN_FAILED'
      | 'UNKNOWN',
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'GoogleAuthError';
    this.code = code;
    this.gisCause = cause;
  }
}

export function isGoogleConfigured(): boolean {
  return Boolean(env.googleClientId);
}

// ═══════════════════════════════════════════════════════════════════════════
// Web path — Google Identity Services
// ═══════════════════════════════════════════════════════════════════════════

let scriptPromise: Promise<void> | null = null;

export async function loadGoogleScript(): Promise<void> {
  if (typeof window === 'undefined') {
    throw new GoogleAuthError(
      'SCRIPT_LOAD_FAILED',
      'GIS is browser-only',
    );
  }
  if (!env.googleClientId) {
    throw new GoogleAuthError(
      'NOT_CONFIGURED',
      'NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set',
    );
  }

  if (window.google?.accounts?.id) return;
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GIS_SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () =>
          reject(
            new GoogleAuthError(
              'SCRIPT_LOAD_FAILED',
              'GIS script failed to load',
            ),
          ),
        { once: true },
      );
      return;
    }
    const script = document.createElement('script');
    script.id = GIS_SCRIPT_ID;
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(
        new GoogleAuthError(
          'SCRIPT_LOAD_FAILED',
          'GIS script failed to load',
        ),
      );
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

async function googleSignInWeb(opts: { nonce?: string }): Promise<string> {
  await loadGoogleScript();
  const gis = window.google?.accounts?.id;
  if (!gis) {
    throw new GoogleAuthError(
      'SCRIPT_LOAD_FAILED',
      'GIS loaded but window.google.accounts.id is missing',
    );
  }

  return new Promise<string>((resolve, reject) => {
    gis.initialize({
      client_id: env.googleClientId,
      callback: (resp: GoogleCredentialResponse) => {
        if (!resp.credential) {
          reject(
            new GoogleAuthError(
              'NO_CREDENTIAL',
              'GIS returned no credential',
            ),
          );
          return;
        }
        resolve(resp.credential);
      },
      auto_select: false,
      cancel_on_tap_outside: true,
      use_fedcm_for_prompt: true,
      nonce: opts.nonce,
      context: 'signin',
      ux_mode: 'popup',
    });
    gis.prompt((notification: GooglePromptNotification) => {
      if (
        (notification.isNotDisplayed && notification.isNotDisplayed()) ||
        (notification.isSkippedMoment && notification.isSkippedMoment()) ||
        (notification.isDismissedMoment && notification.isDismissedMoment())
      ) {
        const reason =
          (notification.getDismissedReason &&
            notification.getDismissedReason()) ||
          (notification.getSkippedReason && notification.getSkippedReason()) ||
          (notification.getNotDisplayedReason &&
            notification.getNotDisplayedReason()) ||
          'unknown';
        reject(
          new GoogleAuthError(
            'PROMPT_DISMISSED',
            `Google prompt was dismissed (${reason})`,
          ),
        );
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Native path — @codetrix-studio/capacitor-google-auth
// ═══════════════════════════════════════════════════════════════════════════

let nativeInitialized = false;

async function googleSignInNative(): Promise<string> {
  if (!env.googleClientId) {
    throw new GoogleAuthError(
      'NOT_CONFIGURED',
      'NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set',
    );
  }

  try {
    // Lazy-load so the static export bundle for the web build doesn't
    // pull in the plugin's web shim (which is small but unnecessary).
    const { GoogleAuth } = await import(
      '@codetrix-studio/capacitor-google-auth'
    );

    if (!nativeInitialized) {
      // The Capacitor config baked GoogleAuth.clientId at build time, so
      // initialize() with no args picks that up. We pass it explicitly
      // here as belt-and-braces — covers the edge case where the
      // capacitor.config.ts value was empty (e.g. preview build) and the
      // user set NEXT_PUBLIC_GOOGLE_CLIENT_ID after the fact.
      await GoogleAuth.initialize({
        clientId: env.googleClientId,
        scopes: ['profile', 'email', 'openid'],
        grantOfflineAccess: false,
      });
      nativeInitialized = true;
    }

    const user = await GoogleAuth.signIn();
    const idToken = user?.authentication?.idToken;
    if (!idToken) {
      throw new GoogleAuthError(
        'NO_CREDENTIAL',
        'Native sign-in returned no idToken',
      );
    }
    return idToken;
  } catch (err) {
    if (err instanceof GoogleAuthError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    // Common cancellation messages from the Android plugin: "popup_closed_by_user",
    // "User cancelled", error code 12501. Surface as PROMPT_DISMISSED so the UI
    // can return to idle without an alarming error.
    if (
      /cancel|cancell|dismiss|12501|closed/i.test(msg) ||
      /sign.in.was.cancelled/i.test(msg)
    ) {
      throw new GoogleAuthError(
        'PROMPT_DISMISSED',
        'User cancelled Google sign-in',
        err,
      );
    }
    throw new GoogleAuthError(
      'NATIVE_PLUGIN_FAILED',
      `Native Google sign-in failed: ${msg}`,
      err,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Public surface
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Returns an id_token issued by Google. Inside Capacitor uses the native
 * picker (no Chrome Custom Tab, no deep-link bounce); on the web uses GIS.
 */
export async function googleSignIn(opts: {
  nonce?: string;
} = {}): Promise<string> {
  if (isNative()) return googleSignInNative();
  return googleSignInWeb(opts);
}

/**
 * Clears the native Google session. No-op on web (GIS popup leaves no
 * persistent state in our origin). Best-effort — never throws.
 */
export async function googleSignOut(): Promise<void> {
  if (!isNative()) return;
  try {
    const { GoogleAuth } = await import(
      '@codetrix-studio/capacitor-google-auth'
    );
    await GoogleAuth.signOut();
  } catch {
    /* nothing to do if signOut failed — the caller will retry next time */
  }
}

/**
 * Render the official "Sign in with Google" button into a container.
 * Used as a fallback when One Tap is blocked (e.g. third-party cookies
 * disabled). Web-only.
 */
export async function renderGoogleButton(
  el: HTMLElement,
  onCredential: (idToken: string) => void,
  opts: { width?: number } = {},
): Promise<void> {
  if (isNative()) return;
  if (!env.googleClientId) {
    throw new GoogleAuthError(
      'NOT_CONFIGURED',
      'NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set',
    );
  }

  await loadGoogleScript();
  const gis = window.google?.accounts?.id;
  if (!gis) throw new GoogleAuthError('SCRIPT_LOAD_FAILED', 'GIS not ready');

  gis.initialize({
    client_id: env.googleClientId,
    callback: (resp: GoogleCredentialResponse) => {
      if (resp.credential) onCredential(resp.credential);
    },
    auto_select: false,
    cancel_on_tap_outside: true,
  });
  gis.renderButton(el, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'continue_with',
    shape: 'pill',
    logo_alignment: 'left',
    width: opts.width ?? 320,
  });
}
