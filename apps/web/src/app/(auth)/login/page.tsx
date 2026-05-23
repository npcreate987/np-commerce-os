'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { tracker } from '@/lib/track';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Orb } from '@/components/ui/glass';
import { ArrowRightIcon, ChevronLeftIcon, SparklesIcon } from '@/components/icons';

export default function LoginPage(): JSX.Element {
  const router = useRouter();
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
      router.push(res.user.role === 'MERCHANT' ? '/merchant/dashboard' : '/feed');
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
    <main className="relative min-h-dvh overflow-hidden bg-mesh-soft">
      <Orb className="left-[-60px] top-[-80px] h-72 w-72 bg-brand/40" />
      <Orb
        className="right-[-50px] top-32 h-72 w-72 bg-accent-violet/40"
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

        {/* Brand badge */}
        <div className="mt-10 flex flex-col items-center text-center">
          <div className="relative">
            <div className="absolute inset-0 -z-10 animate-pulse-glow rounded-3xl" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-gradient text-white shadow-glow">
              <span className="absolute inset-0 rounded-3xl bg-noise opacity-30 mix-blend-overlay" aria-hidden />
              <SparklesIcon className="relative h-7 w-7" />
            </div>
          </div>
          <h1 className="animate-slide-up mt-6 font-display text-3xl font-bold tracking-tightest text-ink-900">
            ยินดีต้อนรับกลับ
          </h1>
          <p className="mt-1.5 text-sm text-ink-500">
            เข้าสู่ระบบเพื่อช้อปปิ้งหรือจัดการร้าน
          </p>
        </div>

        {/* Glass form card */}
        <form
          onSubmit={onSubmit}
          className="glass-strong animate-slide-up mt-8 space-y-4 rounded-4xl p-5 shadow-soft"
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

        <p className="mt-6 text-center text-sm text-ink-600">
          ยังไม่มีบัญชี?{' '}
          <Link href="/signup" className="font-semibold text-brand hover:text-brand-700">
            สมัครสมาชิก
          </Link>
        </p>
      </div>
    </main>
  );
}
