'use client';

/**
 * Phase 14.2 — `/profile` MOBILE variant (TikTok-style).
 *
 * This is the existing Phase 12.2.1 layout, moved verbatim from `page.tsx`
 * with the only change being that data fetching now lives inside this
 * component rather than the route. Both the mobile and desktop variants
 * issue the same `['feed', 'mine']` / `['shops', 'mine']` query keys, so
 * React Query dedupes the network calls — swapping form factors costs zero
 * extra HTTP traffic.
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
  ChevronDownIcon,
  HeartIcon,
  LockIcon,
  LogoutIcon,
  MenuIcon,
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

export function MobileProfile(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const sp = useSearchParams();
  const router = useRouter();

  const initialTab = (sp?.get('tab') as TabKey) ?? 'videos';
  const [tab, setTab] = useState<TabKey>(
    TABS.some((t) => t.key === initialTab) ? initialTab : 'videos',
  );

  // Page-level auth gate already handled in page.tsx; we still belt-and-brace
  // in case this component is ever rendered outside that gate.
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
    <main className="container-mobile pb-28">
      <TopBar onShare={() => shareProfile(user?.name ?? 'NP User')} />

      <Header user={user} />

      <StatsRow stats={stats} loading={videosQ.isLoading} />

      <CTARow user={user} />

      <Shortcuts hasShop={(shopsQ.data?.length ?? 0) > 0} firstShop={shopsQ.data?.[0]} />

      <TabBar active={tab} onChange={setTab} />

      <section className="mt-3 min-h-[40vh]">
        {tab === 'videos' && (
          <VideosTab data={videosQ.data} loading={videosQ.isLoading} filter="public" />
        )}
        {tab === 'private' && (
          <VideosTab data={videosQ.data} loading={videosQ.isLoading} filter="private" />
        )}
        {tab === 'shop' && (
          <ShopsTab data={shopsQ.data} loading={shopsQ.isLoading} />
        )}
        {tab === 'liked' && <LikedTab />}
      </section>
    </main>
  );
}

// ----------------------------------------------------------------------------
// Sub-components (moved from page.tsx; behaviour unchanged)
// ----------------------------------------------------------------------------

function TopBar({ onShare }: { onShare: () => void }): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="sticky top-0 z-30 -mx-4 flex items-center justify-between bg-white/80 px-4 py-2 backdrop-blur sm:rounded-t-2xl">
      <span className="text-xs font-semibold text-ink-500">โปรไฟล์ของฉัน</span>
      <div className="flex items-center gap-1">
        <IconBtn aria-label="แชร์โปรไฟล์" onClick={onShare}>
          <ShareIcon className="h-5 w-5" />
        </IconBtn>
        <div className="relative">
          <IconBtn aria-label="เมนู" onClick={() => setMenuOpen((v) => !v)}>
            <MenuIcon className="h-5 w-5" />
          </IconBtn>
          {menuOpen && <MenuDropdown onClose={() => setMenuOpen(false)} />}
        </div>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  return (
    <button
      type="button"
      className="grid h-9 w-9 place-items-center rounded-full text-ink-700 transition hover:bg-ink-100 active:scale-90"
      {...rest}
    >
      {children}
    </button>
  );
}

function MenuDropdown({ onClose }: { onClose: () => void }): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const router = useRouter();
  const qc = useQueryClient();
  const logoutM = useMutation({
    mutationFn: async () => {
      clear();
      qc.clear();
    },
    onSuccess: () => router.replace('/login'),
  });

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <div
        role="menu"
        className="absolute right-0 top-10 z-50 w-56 overflow-hidden rounded-2xl border bg-white shadow-pop"
      >
        <MenuItem href="/profile/notifications" icon={<BellIcon className="h-4 w-4" />} onClick={onClose}>
          การแจ้งเตือน
        </MenuItem>
        <MenuItem href="/profile/privacy" icon={<ShieldCheckIcon className="h-4 w-4" />} onClick={onClose}>
          ความเป็นส่วนตัว
        </MenuItem>
        <MenuItem href="/profile/videos" icon={<VideoIcon className="h-4 w-4" />} onClick={onClose}>
          คลิปของฉัน (เต็มหน้า)
        </MenuItem>
        {user?.role === 'ADMIN' && (
          <MenuItem href="/admin" icon={<SettingsIcon className="h-4 w-4" />} onClick={onClose}>
            เปิดหลังบ้าน (Admin)
          </MenuItem>
        )}
        <div className="border-t" />
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            logoutM.mutate();
            onClose();
          }}
          className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-rose-600 hover:bg-rose-50"
        >
          <LogoutIcon className="h-4 w-4" /> ออกจากระบบ
        </button>
      </div>
    </>
  );
}

function MenuItem({
  href,
  icon,
  children,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}): JSX.Element {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 text-sm text-ink-800 hover:bg-ink-50"
    >
      <span className="text-ink-500">{icon}</span>
      {children}
    </Link>
  );
}

function Header({ user }: { user: ReturnType<typeof useAuthStore.getState>['user'] }): JSX.Element {
  if (!user) {
    return (
      <div className="flex flex-col items-center gap-2 py-5">
        <Skeleton className="h-24 w-24 rounded-full" />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    );
  }
  const handle = '@' + (user.email?.split('@')[0] ?? user.id.slice(0, 8));
  const initial = (user.name?.trim()?.[0] || user.email?.[0] || '?').toUpperCase();

  return (
    <div className="flex flex-col items-center gap-1 py-5">
      <div className="relative">
        <div className="grid h-24 w-24 place-items-center rounded-full bg-brand-gradient text-3xl font-bold text-white ring-4 ring-white shadow-pop">
          {initial}
        </div>
        <Link
          href="/profile/edit"
          aria-label="แก้ไขรูปโปรไฟล์"
          className="absolute bottom-0 right-0 grid h-7 w-7 place-items-center rounded-full bg-white text-ink-700 ring-2 ring-white shadow-md hover:bg-ink-50"
        >
          <PencilIcon className="h-3.5 w-3.5" />
        </Link>
      </div>
      <h1 className="mt-2 flex items-center gap-1 text-xl font-bold text-ink-900">
        {user.name || user.email?.split('@')[0]}
        <ChevronDownIcon className="h-4 w-4 text-ink-400" />
      </h1>
      <p className="text-sm text-ink-500">{handle}</p>
    </div>
  );
}

function StatsRow({
  stats,
  loading,
}: {
  stats: { videoCount: number; likes: number; views: number };
  loading: boolean;
}): JSX.Element {
  return (
    <div className="flex items-center justify-center gap-0 rounded-2xl bg-white py-3">
      <Stat label="คลิป" value={stats.videoCount} loading={loading} />
      <Divider />
      <Stat label="ถูกใจ" value={stats.likes} loading={loading} />
      <Divider />
      <Stat label="การดู" value={stats.views} loading={loading} />
    </div>
  );
}

function Stat({
  value,
  label,
  loading,
}: {
  value: number;
  label: string;
  loading: boolean;
}): JSX.Element {
  return (
    <div className="flex min-w-[80px] flex-col items-center px-3">
      {loading ? (
        <Skeleton className="h-5 w-10" />
      ) : (
        <span className="text-lg font-bold text-ink-900">{formatStat(value)}</span>
      )}
      <span className="text-[11px] text-ink-500">{label}</span>
    </div>
  );
}

function Divider(): JSX.Element {
  return <span className="h-7 w-px bg-ink-200" aria-hidden />;
}

function CTARow({ user }: { user: ReturnType<typeof useAuthStore.getState>['user'] }): JSX.Element {
  return (
    <div className="mt-3 flex gap-2">
      <Link
        href="/profile/edit"
        className="flex-1 rounded-2xl border border-ink-200 bg-white px-4 py-2.5 text-center text-sm font-semibold text-ink-800 hover:bg-ink-50"
      >
        <PencilIcon className="mr-1 inline h-3.5 w-3.5" /> แก้ไขโปรไฟล์
      </Link>
      <button
        type="button"
        onClick={() => shareProfile(user?.name ?? 'NP User')}
        className="flex-1 rounded-2xl border border-ink-200 bg-white px-4 py-2.5 text-center text-sm font-semibold text-ink-800 hover:bg-ink-50"
      >
        <ShareIcon className="mr-1 inline h-3.5 w-3.5" /> แชร์โปรไฟล์
      </button>
    </div>
  );
}

function Shortcuts({
  hasShop,
  firstShop,
}: {
  hasShop: boolean;
  firstShop: Shop | undefined;
}): JSX.Element {
  return (
    <ul className="mt-3 grid grid-cols-3 gap-2">
      <ShortcutCard
        href="/orders"
        icon={<PackageIcon className="h-5 w-5" />}
        label="คำสั่งซื้อ"
        tone="bg-rose-50 text-rose-700"
      />
      {hasShop && firstShop ? (
        <ShortcutCard
          href={`/shop/${firstShop.slug}`}
          icon={<StoreIcon className="h-5 w-5" />}
          label={firstShop.name.length > 8 ? 'ร้านของฉัน' : firstShop.name}
          tone="bg-amber-50 text-amber-700"
        />
      ) : (
        <ShortcutCard
          href="/feed/shop"
          icon={<StoreIcon className="h-5 w-5" />}
          label="โชว์เคส"
          tone="bg-amber-50 text-amber-700"
        />
      )}
      <ShortcutCard
        href="/profile/notifications"
        icon={<BellIcon className="h-5 w-5" />}
        label="ติดตาม"
        tone="bg-brand-50 text-brand-700"
      />
    </ul>
  );
}

function ShortcutCard({
  href,
  icon,
  label,
  tone,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  tone: string;
}): JSX.Element {
  return (
    <li>
      <Link
        href={href}
        className={cn(
          'flex h-12 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold transition active:scale-[0.97]',
          tone,
        )}
      >
        {icon}
        <span className="truncate">{label}</span>
      </Link>
    </li>
  );
}

function TabBar({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
}): JSX.Element {
  return (
    <nav className="mt-5 border-y bg-white">
      <ul className="grid grid-cols-4">
        {TABS.map((t) => (
          <li key={t.key}>
            <button
              type="button"
              onClick={() => onChange(t.key)}
              className={cn(
                'relative flex w-full flex-col items-center justify-center gap-1 py-3 text-xs font-semibold transition',
                active === t.key ? 'text-ink-900' : 'text-ink-400',
              )}
            >
              <t.Icon className="h-5 w-5" />
              <span className="text-[10px]">{t.label}</span>
              {active === t.key && (
                <span
                  aria-hidden
                  className="absolute bottom-0 h-0.5 w-8 rounded-full bg-ink-900"
                />
              )}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function VideosTab({
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
      <div className="grid grid-cols-3 gap-1">
        <Skeleton className="aspect-[9/16]" />
        <Skeleton className="aspect-[9/16]" />
        <Skeleton className="aspect-[9/16]" />
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
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-5 text-sm font-semibold text-white shadow-glow active:scale-95"
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
    <ul className="grid grid-cols-3 gap-1">
      {rows.map((v) => (
        <ProfileVideoCell
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

function ProfileVideoCell({
  v,
  onDelete,
  deleting,
}: {
  v: VideoFeedItem;
  onDelete: () => void;
  deleting: boolean;
}): JSX.Element {
  return (
    <li className="group relative overflow-hidden bg-ink-900">
      <Link href={`/feed?v=${v.id}`} className="block aspect-[9/16]">
        {v.thumbUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={v.thumbUrl}
            alt={v.caption || 'video'}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/40">
            <VideoIcon className="h-8 w-8" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-white">
            <HeartIcon className="h-3 w-3" />
            <span>{formatStat(v.likes)}</span>
            <span className="ml-auto text-[10px] opacity-80">{formatStat(v.views)} ดู</span>
          </div>
        </div>
        {v.status === 'REPORTED' && (
          <span className="absolute left-1 top-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
            ตรวจสอบอยู่
          </span>
        )}
        {v.status === 'HIDDEN' && (
          <span className="absolute left-1 top-1 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
            ซ่อน
          </span>
        )}
      </Link>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        aria-label="ลบคลิป"
        className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/40 text-white opacity-0 transition group-hover:opacity-100 active:scale-90 disabled:opacity-30"
      >
        ✕
      </button>
    </li>
  );
}

function ShopsTab({
  data,
  loading,
}: {
  data: Shop[] | undefined;
  loading: boolean;
}): JSX.Element {
  if (loading) return <Skeleton className="h-32 rounded-2xl" />;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<StoreIcon />}
        title="ยังไม่มีร้าน"
        description="เปิดร้านในไม่กี่ขั้นตอน — ขายสินค้าผ่านคลิปของคุณได้เลย"
        action={
          <Link
            href="/shop/new"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-5 text-sm font-semibold text-white shadow-glow active:scale-95"
          >
            + เปิดร้าน
          </Link>
        }
      />
    );
  }
  return (
    <ul className="space-y-2">
      {data.map((s) => (
        <li key={s.id}>
          <Link
            href={`/shop/${s.slug}`}
            className="flex items-center gap-3 rounded-2xl border bg-white p-3 hover:border-brand-300"
          >
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-100 text-brand-700">
              <StoreIcon className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink-900">{s.name}</p>
              <p className="truncate text-xs text-ink-500">@{s.slug} · เปิด {formatDate(s.createdAt)}</p>
            </div>
            <ArrowRightIcon className="h-4 w-4 text-ink-400" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function LikedTab(): JSX.Element {
  return (
    <EmptyState
      icon={<HeartIcon />}
      title="ถูกใจ — เร็ว ๆ นี้"
      description="หน้ารวมคลิปที่คุณกดถูกใจกำลังจะมา ขอเวลาทีมงานนิด ๆ"
      action={
        <Link
          href="/feed"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-4 text-sm font-semibold text-white shadow-glow active:scale-95"
        >
          <SparklesIcon className="h-4 w-4" /> ไปฟีดเลย
        </Link>
      }
    />
  );
}
