'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  ActivityIcon,
  ChevronRightIcon,
  ShieldAlertIcon,
  TruckIcon,
  SparklesIcon,
} from '@/components/icons';

export default function AdminDashboardPage(): JSX.Element {
  const token = useAuthStore((s) => s.token);

  const shopsQ = useQuery({
    queryKey: ['admin', 'risk', 'shops'],
    queryFn: () => api.risk.shops(token!, 100),
    enabled: !!token,
    retry: false,
  });
  const ordersQ = useQuery({
    queryKey: ['admin', 'risk', 'orders'],
    queryFn: () => api.risk.suspiciousOrders(token!, 50),
    enabled: !!token,
    retry: false,
  });
  const carriersQ = useQuery({
    queryKey: ['admin', 'risk', 'logistics'],
    queryFn: () => api.risk.logisticsIssues(token!),
    enabled: !!token,
    retry: false,
  });

  const shops = shopsQ.data ?? [];
  const orders = ordersQ.data ?? [];
  const carriers = carriersQ.data ?? [];
  const highShops = shops.filter((s) => s.level === 'HIGH').length;
  const medShops = shops.filter((s) => s.level === 'MEDIUM').length;
  const highOrders = orders.filter((o) => o.level === 'HIGH').length;
  const highCarriers = carriers.filter((c) => c.level === 'HIGH').length;

  return (
    <main className="mx-auto w-full max-w-screen-xl space-y-5 px-4 pb-20 pt-4 lg:px-8 lg:pt-6">
      <header className="space-y-1">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-brand">
          <SparklesIcon className="h-3 w-3" />
          AI Engine
        </p>
        <h1 className="text-xl font-bold text-ink-900 lg:text-2xl">NP Risk Center</h1>
        <p className="text-xs text-ink-500 lg:text-sm">
          ระบบ AI ตรวจร้านเสี่ยง · ออเดอร์ผิดปกติ · ขนส่งมีปัญหา
        </p>
      </header>

      {/* Top KPIs */}
      <section className="grid grid-cols-3 gap-3 lg:max-w-3xl">
        <KpiTile
          label="ร้านเสี่ยงสูง"
          value={highShops}
          sub={`${medShops} เฝ้าระวัง`}
          tone="rose"
          loading={shopsQ.isLoading}
        />
        <KpiTile
          label="ออเดอร์น่าสงสัย"
          value={highOrders}
          sub={`${orders.length} flag total`}
          tone="amber"
          loading={ordersQ.isLoading}
        />
        <KpiTile
          label="ขนส่งมีปัญหา"
          value={highCarriers}
          sub={`${carriers.length} carriers`}
          tone="violet"
          loading={carriersQ.isLoading}
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <NavTile
          href="/admin/risk/shops"
          icon={<ShieldAlertIcon className="h-5 w-5" />}
          title="ร้านเสี่ยง"
          desc="ดู risk score, factor breakdown, แนวโน้ม"
          gradient="from-rose-500 to-pink-500"
          right={
            highShops > 0 ? <Badge tone="danger">{highShops} HIGH</Badge> : null
          }
        />
        <NavTile
          href="/admin/risk/orders"
          icon={<ActivityIcon className="h-5 w-5" />}
          title="ออเดอร์ผิดปกติ"
          desc="velocity, บัญชีใหม่ + ยอดสูง, account linking"
          gradient="from-amber-500 to-orange-500"
          right={
            highOrders > 0 ? <Badge tone="warning">{highOrders} HIGH</Badge> : null
          }
        />
        <NavTile
          href="/admin/risk/logistics"
          icon={<TruckIcon className="h-5 w-5" />}
          title="ขนส่งมีปัญหา"
          desc="late rate, lead time, claim rate ของแต่ละขนส่ง"
          gradient="from-violet-500 to-indigo-500"
          right={
            highCarriers > 0 ? (
              <Badge tone="warning">{highCarriers} HIGH</Badge>
            ) : null
          }
        />
        <NavTile
          href="/admin/reviews"
          icon={<span className="text-lg">★</span>}
          title="Moderation รีวิว"
          desc="heuristic flags: short body, new account, duplicate text"
          gradient="from-amber-400 to-orange-500"
        />
        <NavTile
          href="/admin/chat"
          icon={<span className="text-lg">💬</span>}
          title="แชทลูกค้า (CS Chatbot)"
          desc="ดู conversation, รับเรื่อง handoff, ตอบเองโดยตรง"
          gradient="from-pink-500 to-rose-500"
        />
        <NavTile
          href="/admin/events"
          icon={<span className="text-lg">📡</span>}
          title="Behavioural Firehose"
          desc="event stream 24 ชม. · KPI per kind/surface · ฐานของ ranker (10.2)"
          gradient="from-teal-500 to-emerald-500"
        />
        <NavTile
          href="/admin/search"
          icon={<span className="text-lg">🔎</span>}
          title="Search Analytics"
          desc="trending queries + zero-result terms → ใส่ catalog เพิ่ม"
          gradient="from-sky-500 to-cyan-500"
        />
        <NavTile
          href="/admin/ai-ops"
          icon={<SparklesIcon className="h-5 w-5" />}
          title="AI Ops"
          desc="latency, fail rate, runs/day ของทุก AI call"
          gradient="from-brand to-fuchsia-500"
        />
      </section>
    </main>
  );
}

function KpiTile({
  label,
  value,
  sub,
  tone,
  loading,
}: {
  label: string;
  value: number;
  sub: string;
  tone: 'rose' | 'amber' | 'violet';
  loading?: boolean;
}): JSX.Element {
  const styles: Record<string, string> = {
    rose: 'bg-rose-50 text-rose-900 ring-rose-200',
    amber: 'bg-amber-50 text-amber-900 ring-amber-200',
    violet: 'bg-violet-50 text-violet-900 ring-violet-200',
  };
  if (loading) return <Skeleton className="h-20 rounded-2xl" />;
  return (
    <div className={`rounded-2xl p-3 ring-1 ${styles[tone]}`}>
      <p className="text-[9px] font-semibold uppercase tracking-widest opacity-80">
        {label}
      </p>
      <p className="font-display text-2xl font-bold leading-tight">{value}</p>
      <p className="text-[10px] opacity-70">{sub}</p>
    </div>
  );
}

function NavTile({
  href,
  icon,
  title,
  desc,
  gradient,
  right,
}: {
  href: string;
  icon: JSX.Element;
  title: string;
  desc: string;
  gradient: string;
  right?: React.ReactNode;
}): JSX.Element {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-3xl bg-white p-4 shadow-card ring-1 ring-ink-100 active:scale-[0.99]"
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-glow ${gradient}`}
      >
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm font-bold text-ink-900">{title}</p>
        <p className="mt-0.5 text-[11px] text-ink-500">{desc}</p>
      </div>
      {right}
      <ChevronRightIcon className="ml-2 h-4 w-4 text-ink-300" />
    </Link>
  );
}
