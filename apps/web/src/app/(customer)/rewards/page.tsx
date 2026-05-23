'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { GlassCard, MeshBackdrop, Orb } from '@/components/ui/glass';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CopyIcon,
  GiftIcon,
  SparklesIcon,
  StarIcon,
  TicketIcon,
  UsersIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';

type Tab = 'coupons' | 'points' | 'invite';

const TIER_INFO: Record<
  string,
  { label: string; gradient: string; minPoints: number; next?: { label: string; min: number } }
> = {
  BRONZE: {
    label: 'Bronze',
    gradient: 'from-amber-300 to-amber-600',
    minPoints: 0,
    next: { label: 'Silver', min: 2000 },
  },
  SILVER: {
    label: 'Silver',
    gradient: 'from-slate-300 to-slate-500',
    minPoints: 2000,
    next: { label: 'Gold', min: 10000 },
  },
  GOLD: {
    label: 'Gold',
    gradient: 'from-yellow-300 to-yellow-500',
    minPoints: 10000,
    next: { label: 'Platinum', min: 50000 },
  },
  PLATINUM: {
    label: 'Platinum',
    gradient: 'from-violet-400 to-fuchsia-500',
    minPoints: 50000,
  },
};

export default function RewardsPage(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('coupons');

  const couponsQ = useQuery({
    queryKey: ['rewards', 'coupons'],
    queryFn: () => api.coupons.available(),
  });

  const loyaltyQ = useQuery({
    queryKey: ['rewards', 'loyalty'],
    queryFn: () => api.loyalty.me(token!),
    enabled: !!token,
  });

  const entriesQ = useQuery({
    queryKey: ['rewards', 'loyalty', 'entries'],
    queryFn: () => api.loyalty.entries(token!, 20),
    enabled: !!token && tab === 'points',
  });

  const referralQ = useQuery({
    queryKey: ['rewards', 'referral'],
    queryFn: () => api.referrals.me(token!),
    enabled: !!token && tab === 'invite',
  });

  const claimsQ = useQuery({
    queryKey: ['rewards', 'referral', 'claims'],
    queryFn: () => api.referrals.myClaims(token!),
    enabled: !!token && tab === 'invite',
  });

  const claimM = useMutation({
    mutationFn: (code: string) => api.referrals.claim(token!, { code }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rewards', 'loyalty'] });
      qc.invalidateQueries({ queryKey: ['rewards', 'referral'] });
      qc.invalidateQueries({ queryKey: ['rewards', 'referral', 'claims'] });
    },
  });

  const [claimCode, setClaimCode] = useState('');

  if (!token || !user) {
    return (
      <div className="container-app py-10">
        <EmptyState
          title="ล็อกอินก่อนใช้สิทธิ์"
          description="เข้าระบบเพื่อรับคูปอง แต้มสะสม และโค้ดเชิญเพื่อน"
          action={
            <Link
              href="/login"
              className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white shadow-glow"
            >
              เข้าสู่ระบบ
            </Link>
          }
        />
      </div>
    );
  }

  const tier =
    (loyaltyQ.data ? TIER_INFO[loyaltyQ.data.tier] : TIER_INFO.BRONZE) ??
    TIER_INFO.BRONZE!;
  const progress =
    loyaltyQ.data && tier.next
      ? Math.min(
          100,
          Math.round(
            ((loyaltyQ.data.lifetimePoints - tier.minPoints) /
              (tier.next.min - tier.minPoints)) *
              100,
          ),
        )
      : 100;

  return (
    <div className="relative">
      <MeshBackdrop variant="soft" />
      <Orb className="-right-20 -top-10 h-72 w-72 bg-brand/30" />
      <Orb className="-left-16 top-40 h-64 w-64 bg-fuchsia-400/30" style={{ animationDelay: '1.5s' }} />

      <div className="container-app space-y-5 pb-24 pt-6">
        <header className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand">
            NP Rewards
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">
            สิทธิประโยชน์ของคุณ
          </h1>
          <p className="text-xs text-ink-500">
            คูปอง แต้มสะสม และโบนัสจากการชวนเพื่อน
          </p>
        </header>

        {/* Tier card */}
        {loyaltyQ.data ? (
          <div
            className={cn(
              'relative overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-white shadow-pop noise',
              tier.gradient,
            )}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest opacity-80">
                  Tier {tier.label}
                </p>
                <p className="mt-1 text-3xl font-bold">{loyaltyQ.data.points.toLocaleString()} แต้ม</p>
                <p className="mt-0.5 text-[11px] opacity-80">
                  สะสมตลอดชีพ {loyaltyQ.data.lifetimePoints.toLocaleString()} แต้ม
                </p>
              </div>
              <StarIcon className="h-12 w-12 opacity-90" />
            </div>

            {tier.next ? (
              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between text-[10px] font-medium opacity-90">
                  <span>{tier.label}</span>
                  <span>{tier.next.label} ที่ {tier.next.min.toLocaleString()} แต้ม</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/30">
                  <div
                    className="h-full bg-white/90 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs font-medium opacity-90">ระดับสูงสุดแล้ว!</p>
            )}
          </div>
        ) : (
          <Skeleton className="h-32 rounded-3xl" />
        )}

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(
            [
              { id: 'coupons', label: 'คูปอง', Icon: TicketIcon },
              { id: 'points', label: 'แต้ม', Icon: StarIcon },
              { id: 'invite', label: 'ชวนเพื่อน', Icon: UsersIcon },
            ] as Array<{ id: Tab; label: string; Icon: typeof TicketIcon }>
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition',
                tab === t.id
                  ? 'bg-brand-gradient text-white shadow-glow'
                  : 'bg-white text-ink-700 ring-1 ring-ink-200',
              )}
            >
              <t.Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'coupons' ? (
          <CouponsTab data={couponsQ.data} isLoading={couponsQ.isLoading} />
        ) : null}

        {tab === 'points' ? (
          <PointsTab entries={entriesQ.data} isLoading={entriesQ.isLoading} />
        ) : null}

        {tab === 'invite' ? (
          <InviteTab
            referral={referralQ.data}
            claims={claimsQ.data}
            claimCode={claimCode}
            setClaimCode={setClaimCode}
            onClaim={() => claimCode.trim() && claimM.mutate(claimCode.trim().toUpperCase())}
            claimError={(claimM.error as Error | null)?.message}
            claimLoading={claimM.isPending}
          />
        ) : null}
      </div>
    </div>
  );
}

function CouponsTab({
  data,
  isLoading,
}: {
  data: Awaited<ReturnType<typeof api.coupons.available>> | undefined;
  isLoading: boolean;
}): JSX.Element {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 rounded-3xl" />
        ))}
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <EmptyState
        title="ยังไม่มีคูปอง"
        description="กลับมาดูใหม่เร็วๆ นี้"
        icon={<TicketIcon className="h-8 w-8 text-ink-300" />}
      />
    );
  }
  return (
    <div className="space-y-3">
      {data.map((c) => {
        const valueLabel =
          c.kind === 'PERCENT'
            ? `ลด ${(c.value / 100).toFixed(0)}%`
            : c.kind === 'FIXED'
              ? `ลด ${(c.value / 100).toFixed(0)} ฿`
              : 'ส่งฟรี';
        return (
          <GlassCard key={c.id} className="overflow-hidden p-0">
            <div className="flex items-center">
              <div className="flex w-28 shrink-0 flex-col items-center justify-center self-stretch bg-brand-gradient p-4 text-white shadow-glow">
                <GiftIcon className="mb-1 h-5 w-5" />
                <p className="text-center text-xs font-bold leading-tight">{valueLabel}</p>
              </div>
              <div className="flex-1 p-4">
                <p className="text-sm font-bold text-ink-900">{c.title}</p>
                {c.description ? (
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-ink-500">{c.description}</p>
                ) : null}
                <div className="mt-2 flex items-center justify-between">
                  <code className="rounded-md bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand">
                    {c.code}
                  </code>
                  <CopyButton text={c.code} />
                </div>
                {c.minSpendCents > 0 ? (
                  <p className="mt-1 text-[10px] text-ink-400">
                    ขั้นต่ำ {(c.minSpendCents / 100).toFixed(0)} ฿
                  </p>
                ) : null}
              </div>
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}

function PointsTab({
  entries,
  isLoading,
}: {
  entries: Awaited<ReturnType<typeof api.loyalty.entries>> | undefined;
  isLoading: boolean;
}): JSX.Element {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (!entries || entries.length === 0) {
    return (
      <EmptyState
        title="ยังไม่มีรายการแต้ม"
        description="สั่งซื้อสินค้าเพื่อสะสมแต้ม (10 บาท = 1 แต้ม)"
        icon={<StarIcon className="h-8 w-8 text-ink-300" />}
      />
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((e) => (
        <div
          key={e.id}
          className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-ink-100"
        >
          <div>
            <p className="text-xs font-semibold text-ink-900">{e.note ?? e.kind}</p>
            <p className="mt-0.5 text-[10px] text-ink-400">
              {new Date(e.createdAt).toLocaleString('th-TH', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
          <p
            className={cn(
              'text-sm font-bold',
              e.points >= 0 ? 'text-emerald-600' : 'text-rose-500',
            )}
          >
            {e.points >= 0 ? '+' : ''}
            {e.points}
          </p>
        </div>
      ))}
    </div>
  );
}

function InviteTab({
  referral,
  claims,
  claimCode,
  setClaimCode,
  onClaim,
  claimError,
  claimLoading,
}: {
  referral: Awaited<ReturnType<typeof api.referrals.me>> | undefined;
  claims: Awaited<ReturnType<typeof api.referrals.myClaims>> | undefined;
  claimCode: string;
  setClaimCode: (s: string) => void;
  onClaim: () => void;
  claimError: string | undefined;
  claimLoading: boolean;
}): JSX.Element {
  if (!referral) return <Skeleton className="h-40 rounded-3xl" />;

  const inviteUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/signup?ref=${referral.code}`
      : `/signup?ref=${referral.code}`;

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 p-5 text-white shadow-pop noise">
        <p className="text-[11px] font-semibold uppercase tracking-widest opacity-80">
          โค้ดเชิญของคุณ
        </p>
        <p className="mt-1 text-3xl font-bold tracking-widest">{referral.code}</p>
        <p className="mt-2 text-xs opacity-90">
          ชวนเพื่อนได้ {referral.uses} คนแล้ว · รับ {referral.rewardPoints} แต้ม/คน
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (navigator.share) {
                navigator.share({ title: 'NP Commerce', text: 'มาช้อปกับฉันสิ!', url: inviteUrl });
              } else {
                navigator.clipboard?.writeText(inviteUrl);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-4 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm"
          >
            แชร์ลิงก์เชิญ
          </button>
          <CopyButton text={referral.code} className="bg-white/20 text-white" />
        </div>
      </div>

      <GlassCard>
        <p className="text-xs font-semibold text-ink-900">ใช้รหัสจากเพื่อน</p>
        <p className="mt-0.5 text-[10px] text-ink-500">
          ใส่รหัสเชิญที่ได้รับเพื่อรับแต้มฟรี (ครั้งเดียวต่อบัญชี)
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={claimCode}
            onChange={(e) => setClaimCode(e.target.value.toUpperCase())}
            placeholder="NPABC123"
            className="flex-1 rounded-full border border-ink-200 bg-white px-4 py-2 text-sm font-mono uppercase tracking-wider outline-none focus:border-brand"
          />
          <button
            type="button"
            disabled={claimLoading || !claimCode.trim()}
            onClick={onClaim}
            className="rounded-full bg-brand-gradient px-4 py-2 text-xs font-semibold text-white shadow-glow disabled:opacity-50"
          >
            ใช้รหัส
          </button>
        </div>
        {claimError ? (
          <p className="mt-2 text-[11px] text-rose-500">{claimError}</p>
        ) : null}
      </GlassCard>

      <div>
        <p className="mb-2 text-xs font-semibold text-ink-700">ประวัติคนที่ใช้รหัสคุณ</p>
        {!claims || claims.length === 0 ? (
          <EmptyState
            title="ยังไม่มีใครใช้"
            description="ส่งโค้ดให้เพื่อนเพื่อเริ่มสะสมแต้มกันเถอะ"
            icon={<UsersIcon className="h-8 w-8 text-ink-300" />}
          />
        ) : (
          <div className="space-y-2">
            {claims.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-2xl bg-white px-4 py-2.5 ring-1 ring-ink-100"
              >
                <div>
                  <p className="text-xs font-semibold text-ink-900">
                    {c.inviteeId.slice(0, 8)}…
                  </p>
                  <p className="text-[10px] text-ink-400">
                    {new Date(c.createdAt).toLocaleDateString('th-TH')}
                  </p>
                </div>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    c.status === 'REWARDED'
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-amber-50 text-amber-600',
                  )}
                >
                  {c.status === 'REWARDED' ? '+ แต้มแล้ว' : 'รอ'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CopyButton({
  text,
  className,
}: {
  text: string;
  className?: string;
}): JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-[11px] font-semibold text-brand',
        className,
      )}
    >
      <CopyIcon className="h-3 w-3" />
      {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
    </button>
  );
}
