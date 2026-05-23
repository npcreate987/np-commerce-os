'use client';

/**
 * Phase 14.2 — `/profile` DESKTOP variant.
 *
 *   ┌─────────────────────────┬────────────────────────────────────┐
 *   │   ┌──────────────┐      │  [▦ คลิป] [🔒 ที่ซ่อน] [🛍] [❤]  │
 *   │   │  Avatar 144  │      │                                    │
 *   │   └──────────────┘      │  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐         │
 *   │   ชื่อ ▼                │  │  │ │  │ │  │ │  │ │  │ × 5-col │
 *   │   @handle                │  └──┘ └──┘ └──┘ └──┘ └──┘         │
 *   │                          │                                    │
 *   │   ─── stats ───          │  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐         │
 *   │   12 · 868 · 5.1K        │  │  │ │  │ │  │ │  │ │  │         │
 *   │                          │  └──┘ └──┘ └──┘ └──┘ └──┘         │
 *   │   [แก้ไขโปรไฟล์]         │                                    │
 *   │   [แชร์โปรไฟล์]          │                                    │
 *   │                          │                                    │
 *   │   ─── shortcuts ───      │                                    │
 *   │   📦 คำสั่งซื้อ           │                                    │
 *   │   🏪 ร้านของฉัน           │                                    │
 *   │   🔔 การแจ้งเตือน         │                                    │
 *   │   🛡 ความเป็นส่วนตัว      │                                    │
 *   │   🚪 ออกจากระบบ           │                                    │
 *   └─────────────────────────┴────────────────────────────────────┘
 *
 * Why a different tree from mobile?
 *  - Sidebar replaces vertical "profile sheet" — desktop users expect the
 *    primary identity panel to stay visible while scrolling thumbnails.
 *  - 5-column grid replaces 3-column — at 1024 px+ a 3-col grid leaves
 *    huge gaps; 5 cols still hits the 9:16 aspect at a comfortable size.
 *  - Hover-only delete button replaces always-visible icon — desktop affords
 *    hover, so we declutter the default state.
 *  - The "menu dropdown" is flattened into a visible list in the sidebar
 *    (no need for an overlay when there's vertical room to show it inline).
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import {
  ArrowRightIcon,
  BellIcon,
  ChevronRightIcon,
  HeartIcon,
  LockIcon,
  LogoutIcon,
  PackageIcon,
  PencilIcon,
  SettingsIcon,
  ShareIcon,
  ShieldCheckIcon,
  SparklesIcon,
  StoreIcon,
  VideoIcon,
} from '@/components/icons';
import type { Shop, VideoFeedItem } from '@np/types';
import { TABS, type TabKey, formatStat, shareProfile } from './_shared';

export function DesktopProfile(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const sp = useSearchParams();
  const router = useRouter();
  const initialTab = (sp?.get('tab') as TabKey) ?? 'videos';
  const [tab, setTab] = useState<TabKey>(
    TABS.some((t) => t.key === initialTab) ? initialTab : 'videos',
  );

  useEffect(() => {
    if (token === null) router.replace('/login?next=%2Fprofile');
  }, [token, router]);

  const videosQ = useQuery({
    queryKey: ['feed', 'mine'],
    queryFn: () => api.feed.mine(token!, 100),
    enabled: Boolean(token),
    retry: false,
  });

  const shopsQ = useQuery({
    queryKey: ['shops', 'mine'],
    queryFn: () => api.shops.mine(token!),
    enabled: Boolean(token),
    retry: false,
  });

  const stats = useMemo(() => {
    const rows = videosQ.data ?? [];
    const publicVideos = rows.filter(
      (v) => v.status === 'ACTIVE' || v.status === 'REPORTED',
    );
    return {
      videoCount: publicVideos.length,
      likes: rows.reduce((s, v) => s + v.likes, 0),
      views: rows.reduce((s, v) => s + v.views, 0),
    };
  }, [videosQ.data]);

  return (
    <main className="mx-auto grid w-full max-w-screen-xl gap-8 px-6 py-8 lg:grid-cols-[320px_1fr]">
      {/* ============== Sidebar ============== */}
      <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:pr-2">
        <SidebarHeader user={user} />
        <SidebarStats stats={stats} loading={videosQ.isLoading} />
        <SidebarCTAs user={user} />
        <SidebarLinks
          firstShop={shopsQ.data?.[0]}
          isAdmin={user?.role === 'ADMIN'}
        />
      </aside>

      {/* ============== Main column ============== */}
      <section className="min-w-0">
        <DesktopTabBar active={tab} onChange={setTab} />

        <div className="mt-5 min-h-[40vh]">
          {tab === 'videos' && (
            <DesktopVideoGrid data={videosQ.data} loading={videosQ.isLoading} filter="public" />
          )}
          {tab === 'private' && (
            <DesktopVideoGrid data={videosQ.data} loading={videosQ.isLoading} filter="private" />
          )}
          {tab === 'shop' && <DesktopShopsTab data={shopsQ.data} loading={shopsQ.isLoading} />}
          {tab === 'liked' && <DesktopLikedTab />}
        </div>
      </section>
    </main>
  );
}

// ============================================================================
// Sidebar
// ============================================================================

function SidebarHeader({
  user,
}: {
  user: ReturnType<typeof useAuthStore.getState>['user'];
}): JSX.Element {
  if (!user) {
    return (
      <div className="space-y-3 pb-4">
        <Skeleton className="h-36 w-36 rounded-full" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3 w-28" />
      </div>
    );
  }
  const handle = '@' + (user.email?.split('@')[0] ?? user.id.slice(0, 8));
  const initial = (user.name?.trim()?.[0] || user.email?.[0] || '?').toUpperCase();

  return (
    <div className="pb-4">
      <div className="relative inline-block">
        <div className="grid h-36 w-36 place-items-center rounded-full bg-brand-gradient text-5xl font-bold text-white ring-4 ring-white shadow-pop">
          {initial}
        </div>
        <Link
          href="/profile/edit"
          aria-label="แก้ไขรูปโปรไฟล์"
          className="absolute bottom-1 right-1 grid h-9 w-9 place-items-center rounded-full bg-white text-ink-700 ring-2 ring-white shadow-md transition hover:bg-ink-50 hover:scale-105"
        >
          <PencilIcon className="h-4 w-4" />
        </Link>
      </div>
      <h1 className="mt-4 text-2xl font-bold text-ink-900">
        {user.name || user.email?.split('@')[0]}
      </h1>
      <p className="text-sm text-ink-500">{handle}</p>
      {user.email && (
        <p className="mt-1 text-xs text-ink-400">{user.email}</p>
      )}
    </div>
  );
}

function SidebarStats({
  stats,
  loading,
}: {
  stats: { videoCount: number; likes: number; views: number };
  loading: boolean;
}): JSX.Element {
  return (
    <div className="grid grid-cols-3 gap-2 border-y border-ink-100 py-4">
      <SidebarStat label="คลิป" value={stats.videoCount} loading={loading} />
      <SidebarStat label="ถูกใจ" value={stats.likes} loading={loading} />
      <SidebarStat label="การดู" value={stats.views} loading={loading} />
    </div>
  );
}

function SidebarStat({
  value,
  label,
  loading,
}: {
  value: number;
  label: string;
  loading: boolean;
}): JSX.Element {
  return (
    <div className="text-center">
      {loading ? (
        <Skeleton className="mx-auto h-5 w-12" />
      ) : (
        <span className="block text-lg font-bold text-ink-900">
          {formatStat(value)}
        </span>
      )}
      <span className="text-[11px] text-ink-500">{label}</span>
    </div>
  );
}

function SidebarCTAs({
  user,
}: {
  user: ReturnType<typeof useAuthStore.getState>['user'];
}): JSX.Element {
  return (
    <div className="space-y-2 py-4">
      <Link
        href="/profile/edit"
        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand-gradient text-sm font-semibold text-white shadow-glow transition hover:brightness-110"
      >
        <PencilIcon className="h-4 w-4" /> แก้ไขโปรไฟล์
      </Link>
      <button
        type="button"
        onClick={() => shareProfile(user?.name ?? 'NP User')}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white text-sm font-semibold text-ink-800 transition hover:bg-ink-50"
      >
        <ShareIcon className="h-4 w-4" /> แชร์โปรไฟล์
      </button>
    </div>
  );
}

function SidebarLinks({
  firstShop,
  isAdmin,
}: {
  firstShop: Shop | undefined;
  isAdmin: boolean;
}): JSX.Element {
  const router = useRouter();
  const qc = useQueryClient();
  const clear = useAuthStore((s) => s.clear);
  const logoutM = useMutation({
    mutationFn: async () => {
      clear();
      qc.clear();
    },
    onSuccess: () => router.replace('/login'),
  });
  return (
    <nav className="border-t border-ink-100 pt-4">
      <ul className="space-y-0.5">
        <SidebarLink
          href="/orders"
          icon={<PackageIcon className="h-4 w-4" />}
          label="คำสั่งซื้อของฉัน"
        />
        {firstShop ? (
          <SidebarLink
            href={`/shop/${firstShop.slug}`}
            icon={<StoreIcon className="h-4 w-4" />}
            label={firstShop.name}
          />
        ) : (
          <SidebarLink
            href="/shop/new"
            icon={<StoreIcon className="h-4 w-4" />}
            label="เปิดร้านใหม่"
          />
        )}
        <SidebarLink
          href="/profile/notifications"
          icon={<BellIcon className="h-4 w-4" />}
          label="การแจ้งเตือน"
        />
        <SidebarLink
          href="/profile/privacy"
          icon={<ShieldCheckIcon className="h-4 w-4" />}
          label="ความเป็นส่วนตัว"
        />
        {isAdmin && (
          <SidebarLink
            href="/admin"
            icon={<SettingsIcon className="h-4 w-4" />}
            label="เปิดหลังบ้าน (Admin)"
            tone="brand"
          />
        )}
      </ul>
      <button
        type="button"
        onClick={() => logoutM.mutate()}
        className="mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
      >
        <LogoutIcon className="h-4 w-4" /> ออกจากระบบ
      </button>
    </nav>
  );
}

function SidebarLink({
  href,
  icon,
  label,
  tone,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  tone?: 'brand';
}): JSX.Element {
  return (
    <li>
      <Link
        href={href}
        className={cn(
          'flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-medium transition',
          tone === 'brand'
            ? 'text-brand-700 hover:bg-brand-50'
            : 'text-ink-700 hover:bg-ink-50',
        )}
      >
        <span className="flex items-center gap-2.5">
          <span className={tone === 'brand' ? 'text-brand-500' : 'text-ink-400'}>
            {icon}
          </span>
          <span>{label}</span>
        </span>
        <ChevronRightIcon className="h-3.5 w-3.5 text-ink-300" />
      </Link>
    </li>
  );
}

// ============================================================================
// Main column
// ============================================================================

function DesktopTabBar({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
}): JSX.Element {
  return (
    <nav className="border-b border-ink-200">
      <ul className="flex items-center gap-1">
        {TABS.map((t) => {
          const isActive = active === t.key;
          return (
            <li key={t.key}>
              <button
                type="button"
                onClick={() => onChange(t.key)}
                className={cn(
                  'relative flex items-center gap-2 px-5 py-3 text-sm font-semibold transition',
                  isActive
                    ? 'text-ink-900'
                    : 'text-ink-500 hover:text-ink-800',
                )}
              >
                <t.Icon className="h-4 w-4" />
                {t.label}
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute bottom-[-1px] left-2 right-2 h-0.5 rounded-full bg-ink-900"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function DesktopVideoGrid({
  data,
  loading,
  filter,
}: {
  data: VideoFeedItem[] | undefined;
  loading: boolean;
  filter: 'public' | 'private';
}): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const removeM = useMutation({
    mutationFn: (id: string) => api.feed.remove(token!, id),
    onMutate: (id) => setDeletingId(id),
    onSettled: () => setDeletingId(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feed', 'mine'] });
      qc.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[9/16] rounded-xl" />
        ))}
      </div>
    );
  }

  const rows = (data ?? []).filter((v) =>
    filter === 'public'
      ? v.status === 'ACTIVE' || v.status === 'REPORTED'
      : v.status === 'HIDDEN',
  );

  if (rows.length === 0) {
    return filter === 'public' ? (
      <EmptyState
        icon={<VideoIcon />}
        title="ยังไม่มีคลิป"
        description="โพสต์คลิปแรกของคุณเลย"
        action={
          <Link
            href="/feed/create"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-5 text-sm font-semibold text-white shadow-glow transition hover:brightness-110"
          >
            + โพสต์คลิปใหม่
          </Link>
        }
      />
    ) : (
      <EmptyState
        icon={<LockIcon />}
        title="ไม่มีคลิปที่ซ่อน"
        description="คลิปที่ทีมงานซ่อนจะปรากฏที่นี่ — เจอแค่คุณคนเดียว"
      />
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {rows.map((v) => (
        <DesktopVideoCell
          key={v.id}
          v={v}
          onDelete={() => {
            if (
              window.confirm(
                `ลบคลิป "${v.caption.slice(0, 40) || 'ไม่มีคำอธิบาย'}" ?`,
              )
            ) {
              removeM.mutate(v.id);
            }
          }}
          deleting={deletingId === v.id}
        />
      ))}
    </ul>
  );
}

function DesktopVideoCell({
  v,
  onDelete,
  deleting,
}: {
  v: VideoFeedItem;
  onDelete: () => void;
  deleting: boolean;
}): JSX.Element {
  return (
    <li className="group relative overflow-hidden rounded-xl bg-ink-900 ring-1 ring-ink-100 transition hover:shadow-pop">
      <Link href={`/feed?v=${v.id}`} className="block aspect-[9/16]">
        {v.thumbUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={v.thumbUrl}
            alt={v.caption || 'video'}
            className="h-full w-full object-cover transition group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/40">
            <VideoIcon className="h-10 w-10" />
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 py-2">
          <p className="line-clamp-2 text-xs font-medium text-white/95">
            {v.caption || 'ไม่มีคำอธิบาย'}
          </p>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] font-semibold text-white">
            <span className="inline-flex items-center gap-0.5">
              <HeartIcon className="h-3 w-3" />
              {formatStat(v.likes)}
            </span>
            <span className="opacity-70">·</span>
            <span className="opacity-90">{formatStat(v.views)} ดู</span>
          </div>
        </div>

        {v.status === 'REPORTED' && (
          <span className="absolute left-2 top-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
            ตรวจสอบอยู่
          </span>
        )}
        {v.status === 'HIDDEN' && (
          <span className="absolute left-2 top-2 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
            ซ่อน
          </span>
        )}
      </Link>

      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        aria-label="ลบคลิป"
        className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition group-hover:opacity-100 hover:bg-rose-500 disabled:opacity-30"
      >
        ✕
      </button>
    </li>
  );
}

function DesktopShopsTab({
  data,
  loading,
}: {
  data: Shop[] | undefined;
  loading: boolean;
}): JSX.Element {
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<StoreIcon />}
        title="ยังไม่มีร้าน"
        description="เปิดร้านในไม่กี่ขั้นตอน — ขายสินค้าผ่านคลิปของคุณได้เลย"
        action={
          <Link
            href="/shop/new"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-5 text-sm font-semibold text-white shadow-glow transition hover:brightness-110"
          >
            + เปิดร้าน
          </Link>
        }
      />
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((s) => (
        <li key={s.id}>
          <Link
            href={`/shop/${s.slug}`}
            className="group flex items-center gap-3 rounded-2xl border bg-white p-4 transition hover:border-brand-300 hover:shadow-card"
          >
            <div className="grid h-14 w-14 place-items-center rounded-xl bg-brand-100 text-brand-700">
              <StoreIcon className="h-7 w-7" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink-900">{s.name}</p>
              <p className="truncate text-xs text-ink-500">
                @{s.slug} · เปิด {formatDate(s.createdAt)}
              </p>
            </div>
            <ArrowRightIcon className="h-4 w-4 text-ink-400 transition group-hover:translate-x-1 group-hover:text-brand-500" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function DesktopLikedTab(): JSX.Element {
  return (
    <EmptyState
      icon={<HeartIcon />}
      title="ถูกใจ — เร็ว ๆ นี้"
      description="หน้ารวมคลิปที่คุณกดถูกใจกำลังจะมา ขอเวลาทีมงานนิด ๆ"
      action={
        <Link
          href="/feed"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-4 text-sm font-semibold text-white shadow-glow transition hover:brightness-110"
        >
          <SparklesIcon className="h-4 w-4" /> ไปฟีดเลย
        </Link>
      }
    />
  );
}
