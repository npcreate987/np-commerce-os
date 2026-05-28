'use client';

/**
 * Phase 21 — LINE-first customer login.
 *
 * Layout decisions:
 *   • The default view is a single "เข้าสู่ระบบด้วย LINE" hero button.
 *     This is the only path customers ever see.
 *   • `?staff=1` (or `?next=/admin/...` / `?next=/merchant/...`) reveals
 *     the email/password form so admins + merchants can still sign in.
 *     This stays unindexed (no link from the public UI).
 *   • A tiny "ผมเป็นพนักงาน?" link is shown at the bottom of the LINE
 *     view as the discoverability path for staff accounts.
 *
 * UX choices:
 *   • LIFF login redirects the whole window away to access.line.me. To
 *     avoid losing the `?next=` destination we stash it in sessionStorage
 *     before kicking off `liffLogin()`, and read it back on the callback
 *     page once we get the AuthResponse.
 *   • If LIFF is misconfigured (`NEXT_PUBLIC_LINE_LIFF_ID` empty) we hide
 *     the LINE button entirely and force the staff form — so dev/preview
 *     builds without secrets still work.
 *   • Demo quick-fill chips remain in the staff view; they're the only
 *     thing slowing me down in QA today.
 */
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { tracker } from '@/lib/track';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Orb } from '@/components/ui/glass';
import { ArrowRightIcon, ChevronLeftIcon, SparklesIcon } from '@/components/icons';
import { isLiffConfigured, liffLogin, LiffError } from '@/lib/liff-client';
import {
  GoogleAuthError,
  googleSignIn,
  isGoogleConfigured,
} from '@/lib/google-client';

const NEXT_STORAGE_KEY = 'np-auth.line-login.next';

export default function LoginPage(): JSX.Element {
  // useSearchParams() requires Suspense in app router; the inner component
  // is small so the cost is negligible.
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner(): JSX.Element {
  const sp = useSearchParams();
  const router = useRouter();
  const nextParam = sp.get('next');
  const staffMode = sp.get('staff') === '1' || isStaffNext(nextParam);
  const liffConfigured = isLiffConfigured();
  const googleConfigured = isGoogleConfigured();
  const socialConfigured = liffConfigured || googleConfigured;

  // If no social provider is configured we silently demote to the staff
  // form — preview builds without LIFF/Google secrets need to keep
  // working.
  const showSocialHero = socialConfigured && !staffMode;

  if (showSocialHero) {
    return (
      <SocialHero
        nextParam={nextParam}
        router={router}
        liffConfigured={liffConfigured}
        googleConfigured={googleConfigured}
      />
    );
  }
  return (
    <StaffForm
      nextParam={nextParam}
      router={router}
      liffConfigured={liffConfigured}
      googleConfigured={googleConfigured}
    />
  );
}

function isStaffNext(next: string | null): boolean {
  if (!next) return false;
  return /^\/(admin|merchant|rider|creator)(\/|$)/.test(next);
}

// =============================================================================
// Social hero — the default customer view (LINE + Google)
// =============================================================================
function SocialHero({
  nextParam,
  router,
  liffConfigured,
  googleConfigured,
}: {
  nextParam: string | null;
  router: ReturnType<typeof useRouter>;
  liffConfigured: boolean;
  googleConfigured: boolean;
}): JSX.Element {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [busyProvider, setBusyProvider] = useState<'line' | 'google' | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const sp = useSearchParams();

  // Auto-complete LIFF (LINE) on landing if a session already exists.
  useEffect(() => {
    if (!liffConfigured) return;
    let cancelled = false;
    (async () => {
      try {
        const idToken = await liffLogin({
          redirectUri:
            typeof window !== 'undefined' ? window.location.href : undefined,
        });
        if (cancelled) return;
        await completeLogin('line', idToken);
      } catch (err) {
        if (err instanceof LiffError) {
          if (err.code === 'LOGIN_REQUIRED' || err.code === 'NOT_CONFIGURED') {
            return;
          }
        }
        if (!cancelled) {
          setError(toFriendly(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liffConfigured]);

  // Note: Google sign-in inside Capacitor uses the native plugin
  // (@codetrix-studio/capacitor-google-auth) so the id_token round-trip
  // happens in-process — no bounce-back URL or deep-link needed for
  // Google. LINE still bounces because LIFF rejects `https://localhost`
  // as a redirect_uri.

  async function completeLogin(
    provider: 'line' | 'google',
    idToken: string,
  ): Promise<void> {
    setBusyProvider(provider);
    try {
      const res =
        provider === 'line'
          ? await api.auth.line({ idToken })
          : await api.auth.google({ idToken });
      setAuth({ user: res.user, token: res.accessToken });
      void tracker.identify(res.user.id, res.accessToken);

      // Phase 21 — referral claim. Mirrors the legacy /signup flow: when
      // a referral code is in localStorage (set by /r/[code] or by the
      // /signup?ref= redirect), we claim it best-effort + clear it.
      try {
        const code =
          typeof window !== 'undefined'
            ? window.localStorage.getItem('np-referral-code')
            : null;
        if (code) {
          await api.referrals.claim(res.accessToken, { code }).catch(() => null);
          window.localStorage.removeItem('np-referral-code');
        }
      } catch {
        // Best-effort — never block the login.
      }

      const storedNext =
        typeof window !== 'undefined'
          ? window.sessionStorage.getItem(NEXT_STORAGE_KEY)
          : null;
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(NEXT_STORAGE_KEY);
      }
      const target = nextParam ?? storedNext ?? '/feed';

      // Phase 21.1 — Capacitor bounce-back is ONLY needed for LINE
      // (LIFF rejects `https://localhost` as a redirect_uri so the
      // OAuth flow has to run on the public origin then deep-link back).
      // Google uses the native plugin and never reaches this branch
      // from Capacitor — the in-process plugin call returned an
      // id_token and we routed normally.
      const isFromCapacitor = sp.get('source') === 'capacitor';
      if (isFromCapacitor && provider === 'line' && typeof window !== 'undefined') {
        const params = new URLSearchParams({
          token: res.accessToken,
          userId: res.user.id,
          target,
          provider,
        });
        window.location.href = `npcommerce://login-success?${params.toString()}`;
        return;
      }

      router.push(target);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : toFriendly(err));
    } finally {
      setBusyProvider(null);
    }
  }

  async function onLineTap(): Promise<void> {
    setError(null);
    setBusyProvider('line');
    try {
      if (nextParam && typeof window !== 'undefined') {
        window.sessionStorage.setItem(NEXT_STORAGE_KEY, nextParam);
      }
      const idToken = await liffLogin({
        redirectUri:
          typeof window !== 'undefined' ? window.location.href : undefined,
      });
      await completeLogin('line', idToken);
    } catch (err) {
      if (err instanceof LiffError && err.code === 'LOGIN_REQUIRED') {
        return;
      }
      setError(toFriendly(err));
      setBusyProvider(null);
    }
  }

  async function onGoogleTap(): Promise<void> {
    setError(null);
    setBusyProvider('google');
    try {
      if (nextParam && typeof window !== 'undefined') {
        window.sessionStorage.setItem(NEXT_STORAGE_KEY, nextParam);
      }
      const idToken = await googleSignIn();
      await completeLogin('google', idToken);
    } catch (err) {
      if (err instanceof GoogleAuthError && err.code === 'PROMPT_DISMISSED') {
        // User closed the picker — silently reset, no scary error.
        setBusyProvider(null);
        return;
      }
      setError(toFriendly(err));
      setBusyProvider(null);
    }
  }

  const showLine = liffConfigured;
  const showGoogle = googleConfigured;
  const subtitle = showLine && showGoogle
    ? 'เลือกวิธีที่สะดวก เพื่อช้อปและรับข่าวสารร้านโปรด'
    : showLine
    ? 'เข้าสู่ระบบด้วย LINE เพื่อช้อปและรับข่าวสารร้านโปรด'
    : 'เข้าสู่ระบบด้วย Google เพื่อช้อปและรับข่าวสารร้านโปรด';

  return (
    <LoginShell>
      <h1 className="animate-slide-up mt-6 font-display text-3xl font-bold tracking-tightest text-ink-900">
        ยินดีต้อนรับ
      </h1>
      <p className="mt-1.5 text-center text-sm text-ink-500">{subtitle}</p>

      <div
        className="glass-strong animate-slide-up mt-8 w-full space-y-3 rounded-4xl p-5 shadow-soft"
        style={{ animationDelay: '60ms' }}
      >
        {showLine ? (
          <button
            type="button"
            onClick={onLineTap}
            disabled={busyProvider !== null}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#06C755] px-4 py-3.5 text-base font-semibold text-white shadow-soft transition active:scale-[0.985] disabled:opacity-60"
          >
            <LineGlyph className="h-5 w-5" />
            {busyProvider === 'line'
              ? 'กำลังเชื่อมต่อ LINE…'
              : 'เข้าสู่ระบบด้วย LINE'}
          </button>
        ) : null}

        {showLine && showGoogle ? (
          <div className="flex items-center gap-3 py-1">
            <span className="h-px flex-1 bg-ink-200/60" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
              หรือ
            </span>
            <span className="h-px flex-1 bg-ink-200/60" />
          </div>
        ) : null}

        {showGoogle ? (
          <button
            type="button"
            onClick={onGoogleTap}
            disabled={busyProvider !== null}
            className="flex w-full items-center justify-center gap-3 rounded-2xl border border-ink-200 bg-white px-4 py-3.5 text-base font-semibold text-ink-800 shadow-soft transition active:scale-[0.985] disabled:opacity-60"
          >
            <GoogleGlyph className="h-5 w-5" />
            {busyProvider === 'google'
              ? 'กำลังเชื่อมต่อ Google…'
              : 'เข้าสู่ระบบด้วย Google'}
          </button>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3">
            <p className="text-xs font-medium text-red-700">{error}</p>
          </div>
        ) : null}

        <p className="px-1 text-center text-[11px] leading-relaxed text-ink-500">
          เราจะใช้ชื่อและรูปโปรไฟล์จากบัญชีของคุณเป็น default
          {'\u00A0'}แก้ไขได้ภายหลังที่{' '}
          <span className="font-medium text-ink-700">โปรไฟล์</span>
        </p>
      </div>

      <Link
        href="/login?staff=1"
        prefetch={false}
        className="mt-6 text-xs text-ink-400 underline-offset-2 hover:text-ink-600 hover:underline"
      >
        ผมเป็นพนักงาน / ร้านค้า — เข้าด้วยอีเมล
      </Link>
    </LoginShell>
  );
}


// =============================================================================
// Staff form — fallback for admin / merchant / rider / creator accounts
// =============================================================================
function StaffForm({
  nextParam,
  router,
  liffConfigured,
  googleConfigured,
}: {
  nextParam: string | null;
  router: ReturnType<typeof useRouter>;
  liffConfigured: boolean;
  googleConfigured: boolean;
}): JSX.Element {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState('user@np.dev');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.auth.login({ email, password });
      setAuth({ user: res.user, token: res.accessToken });
      void tracker.identify(res.user.id, res.accessToken);
      const fallback = res.user.role === 'MERCHANT' ? '/merchant/dashboard' : '/feed';
      router.push(nextParam ?? fallback);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  function quickLogin(as: 'customer' | 'merchant'): void {
    setEmail(as === 'customer' ? 'user@np.dev' : 'shop@np.dev');
    setPassword('password123');
  }

  return (
    <LoginShell>
      <h1 className="animate-slide-up mt-6 font-display text-3xl font-bold tracking-tightest text-ink-900">
        ลงชื่อเข้าใช้สำหรับพนักงาน
      </h1>
      <p className="mt-1.5 text-center text-sm text-ink-500">
        บัญชีพนักงาน ร้านค้า หรือผู้ดูแลระบบ
      </p>

      <form
        onSubmit={onSubmit}
        className="glass-strong animate-slide-up mt-8 w-full space-y-4 rounded-4xl p-5 shadow-soft"
        style={{ animationDelay: '60ms' }}
      >
        <Input
          label="อีเมล"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        <Input
          label="รหัสผ่าน"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3">
            <p className="text-xs font-medium text-red-700">{error}</p>
          </div>
        ) : null}

        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={loading}
          rightIcon={!loading ? <ArrowRightIcon className="h-4 w-4" /> : undefined}
        >
          เข้าสู่ระบบ
        </Button>

        <div className="flex items-center gap-3 pt-1">
          <span className="h-px flex-1 bg-ink-200/50" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
            Demo accounts
          </span>
          <span className="h-px flex-1 bg-ink-200/50" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => quickLogin('customer')}
            className="rounded-2xl border border-ink-100 bg-white/70 px-3 py-2.5 text-left text-xs backdrop-blur transition active:scale-[0.985]"
          >
            <span className="block font-semibold text-ink-900">ลูกค้า</span>
            <span className="text-ink-500">user@np.dev</span>
          </button>
          <button
            type="button"
            onClick={() => quickLogin('merchant')}
            className="rounded-2xl border border-ink-100 bg-white/70 px-3 py-2.5 text-left text-xs backdrop-blur transition active:scale-[0.985]"
          >
            <span className="block font-semibold text-ink-900">ร้านค้า</span>
            <span className="text-ink-500">shop@np.dev</span>
          </button>
        </div>
      </form>

      {liffConfigured || googleConfigured ? (
        <Link
          href="/login"
          prefetch={false}
          className="mt-6 text-xs text-ink-400 underline-offset-2 hover:text-ink-600 hover:underline"
        >
          ← กลับไปเข้าสู่ระบบด้วยโซเชียล
        </Link>
      ) : (
        <p className="mt-6 text-center text-sm text-ink-600">
          ยังไม่มีบัญชี?{' '}
          <Link href="/signup" className="font-semibold text-brand hover:text-brand-700">
            สมัครสมาชิก
          </Link>
        </p>
      )}
    </LoginShell>
  );
}

// =============================================================================
// Shared chrome — page background + brand badge
// =============================================================================
function LoginShell({ children }: { children?: React.ReactNode }): JSX.Element {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-mesh-soft">
      <Orb className="left-[-60px] top-[-80px] h-72 w-72 bg-brand/40" />
      <Orb
        className="right-[-50px] top-32 h-72 w-72 bg-accent-violet/40"
        style={{ animationDelay: '-3s' }}
      />
      <div className="pointer-events-none absolute inset-0 bg-noise opacity-[0.15] mix-blend-overlay" />

      <div className="container-mobile relative flex flex-col items-center pt-6">
        <div className="self-start">
          <Link
            href="/"
            className="glass inline-flex h-10 w-10 items-center justify-center rounded-2xl text-ink-700 active:scale-95"
            aria-label="กลับ"
          >
            <ChevronLeftIcon />
          </Link>
        </div>

        <div className="mt-10 flex flex-col items-center text-center">
          <div className="relative">
            <div className="absolute inset-0 -z-10 animate-pulse-glow rounded-3xl" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-gradient text-white shadow-glow">
              <span
                className="absolute inset-0 rounded-3xl bg-noise opacity-30 mix-blend-overlay"
                aria-hidden
              />
              <SparklesIcon className="relative h-7 w-7" />
            </div>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}

// =============================================================================
// LINE brand glyph (inline SVG to avoid pulling another icon package)
// =============================================================================
function LineGlyph({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M19.365 9.89c.41 0 .744.334.744.745 0 .41-.334.744-.744.744h-2.067v1.323h2.067c.41 0 .744.335.744.745 0 .41-.334.744-.744.744h-2.811a.745.745 0 0 1-.744-.744V8.567c0-.41.334-.745.744-.745h2.81c.412 0 .745.335.745.745 0 .411-.333.744-.744.744h-2.067V9.89zm-4.155 3.557a.744.744 0 0 1-.523.71.74.74 0 0 1-.221.034.747.747 0 0 1-.6-.298l-2.879-3.916v3.47a.744.744 0 1 1-1.488 0V8.567a.743.743 0 0 1 .523-.71.66.66 0 0 1 .22-.034c.232 0 .452.109.595.297l2.886 3.92V8.567a.744.744 0 1 1 1.487 0v4.88zM7.475 13.447a.744.744 0 1 1-1.488 0V8.567a.744.744 0 1 1 1.488 0v4.88zM5.13 14.19h-2.81a.747.747 0 0 1-.745-.744V8.567a.744.744 0 1 1 1.488 0v4.136H5.13a.744.744 0 1 1 0 1.488zM24 10.314C24 4.943 18.616.572 12 .572S0 4.943 0 10.314c0 4.81 4.268 8.847 10.035 9.61.39.085.923.258 1.058.59.122.302.08.776.039 1.082l-.171 1.026c-.053.302-.241 1.18 1.034.643 1.276-.535 6.876-4.047 9.379-6.93C23.105 14.42 24 12.473 24 10.314" />
    </svg>
  );
}

// =============================================================================
// Google brand glyph (Google's official "G" mark, inline SVG)
// =============================================================================
function GoogleGlyph({ className }: { className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function toFriendly(err: unknown): string {
  if (err instanceof LiffError) {
    switch (err.code) {
      case 'NOT_CONFIGURED':
        return 'ยังไม่ได้ตั้งค่า LIFF (NEXT_PUBLIC_LINE_LIFF_ID)';
      case 'INIT_FAILED':
        return 'เริ่มต้น LIFF ไม่สำเร็จ — ลองรีเฟรชแอป';
      case 'NO_ID_TOKEN':
        return 'ไม่ได้รับ id_token จาก LINE — ลองใหม่อีกครั้ง';
      default:
        return err.message;
    }
  }
  if (err instanceof GoogleAuthError) {
    switch (err.code) {
      case 'NOT_CONFIGURED':
        return 'ยังไม่ได้ตั้งค่า Google (NEXT_PUBLIC_GOOGLE_CLIENT_ID)';
      case 'SCRIPT_LOAD_FAILED':
        return 'โหลด Google SDK ไม่สำเร็จ — ตรวจสอบสัญญาณเน็ตแล้วลองใหม่';
      case 'PROMPT_DISMISSED':
        return 'หน้าต่าง Google ถูกปิด — ลองอีกครั้ง';
      case 'NO_CREDENTIAL':
        return 'ไม่ได้รับ id_token จาก Google — ลองใหม่อีกครั้ง';
      case 'NATIVE_PLUGIN_FAILED':
        return 'เข้าสู่ระบบ Google ไม่สำเร็จ — โปรดอัปเดต Google Play services แล้วลองใหม่';
      default:
        return err.message;
    }
  }
  if (err instanceof ApiError) return err.message;
  return 'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง';
}
