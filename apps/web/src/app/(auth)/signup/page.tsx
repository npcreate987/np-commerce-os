'use client';

import { FormEvent, useEffect, useState, Suspense } from 'react';
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

function SignupPageInner(): JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'CUSTOMER' | 'MERCHANT'>('CUSTOMER');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refFromQuery = params.get('ref');
  useEffect(() => {
    if (refFromQuery) {
      try {
        localStorage.setItem('np-referral-code', refFromQuery.toUpperCase());
      } catch {
        // ignore
      }
    }
  }, [refFromQuery]);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.auth.signup({ email, password, name, role });
      setAuth({ user: res.user, token: res.accessToken });
      void tracker.identify(res.user.id, res.accessToken);

      // Auto-claim referral if code present
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
        >
          <ChevronLeftIcon />
        </Link>

        <section className="mt-8 animate-slide-up">
          <h1 className="font-display text-3xl font-bold tracking-tightest text-ink-900">
            สร้างบัญชีของคุณ
          </h1>
          <p className="mt-1.5 text-sm text-ink-500">
            เริ่มซื้อหรือขายของได้ในไม่กี่นาที
          </p>
        </section>

        <div className="mt-6">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            ฉันต้องการ
          </p>
          <div className="grid grid-cols-2 gap-3">
            <RoleCard
              icon={<BagIcon className="h-5 w-5" />}
              title="ซื้อของ"
              desc="ช้อปปิ้ง · ติดตามคำสั่งซื้อ"
              active={role === 'CUSTOMER'}
              onClick={() => setRole('CUSTOMER')}
            />
            <RoleCard
              icon={<StoreIcon className="h-5 w-5" />}
              title="ขายของ"
              desc="เปิดร้าน · ลงสินค้า · รับออเดอร์"
              active={role === 'MERCHANT'}
              onClick={() => setRole('MERCHANT')}
            />
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="glass-strong mt-6 space-y-4 rounded-4xl p-5 shadow-soft"
        >
          <Input
            label="ชื่อ"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={role === 'MERCHANT' ? 'ชื่อร้าน / ชื่อคุณ' : 'ชื่อของคุณ'}
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
            hint="ผสมตัวเลข + ตัวอักษร เพื่อความปลอดภัย"
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
          <Link href="/login" className="font-semibold text-brand hover:text-brand-700">
            เข้าสู่ระบบ
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function SignupPage(): JSX.Element {
  return (
    <Suspense fallback={null}>
      <SignupPageInner />
    </Suspense>
  );
}

function RoleCard({
  icon,
  title,
  desc,
  active,
  onClick,
}: {
  icon: JSX.Element;
  title: string;
  desc: string;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative overflow-hidden rounded-3xl border p-4 text-left transition active:scale-[0.985]',
        active
          ? 'border-transparent bg-gradient-to-br from-brand to-brand-400 text-white shadow-glow'
          : 'border-ink-100 bg-white/85 backdrop-blur hover:border-ink-200',
      )}
    >
      {active ? (
        <span className="absolute inset-0 bg-noise opacity-25 mix-blend-overlay" aria-hidden />
      ) : null}
      <div className="relative flex items-center justify-between">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-2xl',
            active ? 'bg-white/20 ring-1 ring-white/30 backdrop-blur' : 'bg-ink-50 text-ink-700',
          )}
        >
          {icon}
        </div>
        {active ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-brand">
            <CheckIcon className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </div>
      <p className={cn('relative mt-3 font-display text-base font-bold tracking-tight', active ? 'text-white' : 'text-ink-900')}>{title}</p>
      <p className={cn('relative mt-0.5 text-[11px] leading-snug', active ? 'text-white/85' : 'text-ink-500')}>{desc}</p>
    </button>
  );
}
