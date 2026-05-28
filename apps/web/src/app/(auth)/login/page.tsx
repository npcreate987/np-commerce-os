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

  // If LIFF isn't configured we silently demote to the staff form even
  // without the `?staff=1` flag — preview builds need to keep working.
  const showLineHero = liffConfigured && !staffMode;

  if (showLineHero) {
    return <LineHero nextParam={nextParam} router={router} />;
  }
  return <StaffForm nextParam={nextParam} router={router} liffConfigured={liffConfigured} />;
}

function isStaffNext(next: string | null): boolean {
  if (!next) return false;
  return /^\/(admin|merchant|rider|creator)(\/|$)/.test(next);
}

// =============================================================================
// LINE hero — the default customer view
// =============================================================================
function LineHero({
  nextParam,
  router,
}: {
  nextParam: string | null;
  router: ReturnType<typeof useRouter>;
}): JSX.Element {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When LIFF redirects the user back from access.line.me, we land on
  // /login again. Auto-detect the active LIFF session and complete the
  // exchange with our backend without making the user tap the button
  // twice.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Cheap check: if LIFF has stored state we'll find an id_token
        // immediately. Otherwise this throws LOGIN_REQUIRED and we just
        // sit on the hero, waiting for the user to tap the button.
        // We swallow the throw silently — it's the expected first load.
        const idToken = await liffLogin({
          redirectUri:
            typeof window !== 'undefined' ? window.location.href : undefined,
        });
        if (cancelled) return;
        await completeLineLogin(idToken);
      } catch (err) {
        if (err instanceof LiffError) {
          if (err.code === 'LOGIN_REQUIRED' || err.code === 'NOT_CONFIGURED') {
            return; // expected — user hasn't tapped the button yet
          }
        }
        // Any other surprise (init failure, network) is shown so the user
        // can decide to fall back to the staff link.
        if (!cancelled) {
          setError(toFriendly(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function completeLineLogin(idToken: string): Promise<void> {
    setLoading(true);
    try {
      const res = await api.auth.line({ idToken });
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

      // Restore ?next= captured before the LIFF redirect.
      const storedNext =
        typeof window !== 'undefined'
          ? window.sessionStorage.getItem(NEXT_STORAGE_KEY)
          : null;
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(NEXT_STORAGE_KEY);
      }
      const target = nextParam ?? storedNext ?? '/feed';
      router.push(target);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : toFriendly(err));
    } finally {
      setLoading(false);
    }
  }

  async function onTap(): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      // Stash the ?next= so we can read it back after the LIFF redirect
      // brings the user to a fresh /login render (URL params are
      // preserved by LINE's redirect, but adding sessionStorage as a
      // belt-and-suspenders helps if the user opens /login in a new tab
      // first then taps the button later).
      if (nextParam && typeof window !== 'undefined') {
        window.sessionStorage.setItem(NEXT_STORAGE_KEY, nextParam);
      }
      const idToken = await liffLogin({
        redirectUri:
          typeof window !== 'undefined' ? window.location.href : undefined,
      });
      // If we got here LIFF was already logged in — complete immediately.
      await completeLineLogin(idToken);
    } catch (err) {
      if (err instanceof LiffError && err.code === 'LOGIN_REQUIRED') {
        // Expected — page is about to redirect. Keep the spinner up.
        return;
      }
      setError(toFriendly(err));
      setLoading(false);
    }
  }

  return (
    <LoginShell>
      <h1 className="animate-slide-up mt-6 font-display text-3xl font-bold tracking-tightest text-ink-900">
        ยินดีต้อนรับ
      </h1>
      <p className="mt-1.5 text-center text-sm text-ink-500">
        เข้าสู่ระบบด้วย LINE เพื่อช้อปและรับข่าวสารร้านโปรด
      </p>

      <div
        className="glass-strong animate-slide-up mt-8 w-full space-y-3 rounded-4xl p-5 shadow-soft"
        style={{ animationDelay: '60ms' }}
      >
        <button
          type="button"
          onClick={onTap}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#06C755] px-4 py-3.5 text-base font-semibold text-white shadow-soft transition active:scale-[0.985] disabled:opacity-60"
        >
          <LineGlyph className="h-5 w-5" />
          {loading ? 'กำลังเชื่อมต่อ LINE…' : 'เข้าสู่ระบบด้วย LINE'}
        </button>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3">
            <p className="text-xs font-medium text-red-700">{error}</p>
          </div>
        ) : null}

        <p className="px-1 text-center text-[11px] leading-relaxed text-ink-500">
          เราจะใช้ชื่อและรูปโปรไฟล์ LINE ของคุณเป็น default
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
}: {
  nextParam: string | null;
  router: ReturnType<typeof useRouter>;
  liffConfigured: boolean;
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

      {liffConfigured ? (
        <Link
          href="/login"
          prefetch={false}
          className="mt-6 text-xs text-ink-400 underline-offset-2 hover:text-ink-600 hover:underline"
        >
          ← กลับไปเข้าสู่ระบบด้วย LINE
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
  if (err instanceof ApiError) return err.message;
  return 'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง';
}
