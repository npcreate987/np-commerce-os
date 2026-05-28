'use client';

/**
 * Phase 21 — /signup is now a thin entry point. Customer onboarding flows
 * through LINE Login (the backend find-or-creates the account on first
 * sign-in), so /signup just redirects to /login + preserves `?ref=` and
 * any other query params. Staff/merchant self-signup still has its
 * dedicated email/password form via `/signup?staff=1`.
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
import {
  ArrowRightIcon,
  BagIcon,
  CheckIcon,
  ChevronLeftIcon,
  StoreIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';
import { isLiffConfigured } from '@/lib/liff-client';

export default function SignupPage(): JSX.Element {
  return (
    <Suspense fallback={null}>
      <SignupInner />
    </Suspense>
  );
}

function SignupInner(): JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const staffMode = params.get('staff') === '1';
  const refFromQuery = params.get('ref');

  // Persist referral code so the LINE-login completion step (in /login)
  // can claim it after sign-in.
  useEffect(() => {
    if (!refFromQuery) return;
    try {
      localStorage.setItem('np-referral-code', refFromQuery.toUpperCase());
    } catch {
      // ignore — Safari private mode etc.
    }
  }, [refFromQuery]);

  // Customer signup → bounce to /login (the LINE hero will provision
  // the account on first sign-in). We preserve `?ref=` so the URL still
  // tells the story; localStorage above is what actually drives the
  // claim after the LIFF round-trip.
  useEffect(() => {
    if (staffMode || !isLiffConfigured()) return;
    const qs = new URLSearchParams();
    if (refFromQuery) qs.set('ref', refFromQuery);
    const dest = qs.toString() ? `/login?${qs.toString()}` : '/login';
    router.replace(dest);
  }, [staffMode, refFromQuery, router]);

  if (!staffMode && isLiffConfigured()) {
    // Render nothing while the redirect above flushes — avoids a flash
    // of the email form on the customer path.
    return <></>;
  }

  return <StaffSignupForm refFromQuery={refFromQuery} />;
}

// =============================================================================
// Staff / merchant self-signup form — unchanged from Phase 20 behaviour.
// =============================================================================
function StaffSignupForm({
  refFromQuery,
}: {
  refFromQuery: string | null;
}): JSX.Element {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'CUSTOMER' | 'MERCHANT'>('MERCHANT');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.auth.signup({ email, password, name, role });
      setAuth({ user: res.user, token: res.accessToken });
      void tracker.identify(res.user.id, res.accessToken);

      try {
        const code =
          refFromQuery?.toUpperCase() ?? localStorage.getItem('np-referral-code');
        if (code) {
          await api.referrals.claim(res.accessToken, { code }).catch(() => null);
          localStorage.removeItem('np-referral-code');
        }
      } catch {
        // ignore
      }

      router.push(role === 'MERCHANT' ? '/merchant/dashboard' : '/feed');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'สมัครสมาชิกไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-mesh-soft pb-12">
      <Orb className="right-[-50px] top-[-40px] h-72 w-72 bg-accent-violet/40" />
      <Orb
        className="left-[-50px] top-40 h-72 w-72 bg-brand/40"
        style={{ animationDelay: '-3s' }}
      />
      <div className="pointer-events-none absolute inset-0 bg-noise opacity-[0.15] mix-blend-overlay" />

      <div className="container-mobile relative pt-6">
        <Link
          href="/"
          className="glass inline-flex h-10 w-10 items-center justify-center rounded-2xl text-ink-700 active:scale-95"
          aria-label="กลับ"
        >
          <ChevronLeftIcon />
        </Link>

        <div className="mt-8 flex flex-col items-center text-center">
          <h1 className="font-display text-3xl font-bold tracking-tightest text-ink-900">
            สมัครบัญชีพนักงาน
          </h1>
          <p className="mt-1.5 text-sm text-ink-500">สำหรับร้านค้า / พนักงาน / ไรเดอร์</p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <RoleCard
            active={role === 'CUSTOMER'}
            onClick={() => setRole('CUSTOMER')}
            title="ลูกค้า"
            icon={<BagIcon className="h-5 w-5" />}
          />
          <RoleCard
            active={role === 'MERCHANT'}
            onClick={() => setRole('MERCHANT')}
            title="ร้านค้า"
            icon={<StoreIcon className="h-5 w-5" />}
          />
        </div>

        <form
          onSubmit={onSubmit}
          className="glass-strong animate-slide-up mt-6 space-y-4 rounded-4xl p-5 shadow-soft"
        >
          <Input
            label="ชื่อ"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="John Doe"
            required
          />
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
            placeholder="อย่างน้อย 8 ตัวอักษร"
            minLength={8}
            autoComplete="new-password"
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
            สมัครสมาชิก
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-600">
          มีบัญชีอยู่แล้ว?{' '}
          <Link href="/login?staff=1" className="font-semibold text-brand hover:text-brand-700">
            เข้าสู่ระบบ
          </Link>
        </p>
      </div>
    </main>
  );
}

function RoleCard({
  active,
  onClick,
  title,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-start gap-2 rounded-3xl border p-4 text-left transition active:scale-[0.985]',
        active
          ? 'border-brand bg-brand/5 shadow-soft'
          : 'border-ink-100 bg-white/70 backdrop-blur',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-2xl',
          active ? 'bg-brand text-white' : 'bg-ink-100 text-ink-700',
        )}
      >
        {icon}
      </span>
      <span className="font-semibold text-ink-900">{title}</span>
      {active ? (
        <span className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white">
          <CheckIcon className="h-3 w-3" />
        </span>
      ) : null}
    </button>
  );
}
