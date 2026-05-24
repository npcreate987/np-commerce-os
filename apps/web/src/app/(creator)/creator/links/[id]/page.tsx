'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { nativeShare } from '@/lib/native';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeftIcon,
  CopyIcon,
  LinkIcon,
  QrIcon,
  ShareIcon,
  TrendingUpIcon,
} from '@/components/icons';

function qrUrl(text: string): string {
  // Lightweight free QR via public service (no library needed)
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(text)}`;
}

export default function CreatorLinkDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [copied, setCopied] = useState(false);

  const linkQuery = useQuery({
    queryKey: ['creator', 'link', params.id],
    queryFn: () => api.creators.getMyLink(token!, params.id),
    enabled: Boolean(token) && Boolean(params.id),
  });

  const resolveQuery = useQuery({
    queryKey: ['creator', 'resolve', linkQuery.data?.code],
    queryFn: () => api.creators.resolveLink(linkQuery.data!.code),
    enabled: Boolean(linkQuery.data?.code),
  });

  if (linkQuery.isLoading) {
    return (
      <main className="container-mobile pt-4">
        <Skeleton className="h-72" />
      </main>
    );
  }
  if (!linkQuery.data) return <main />;

  const link = linkQuery.data;
  const resolved = resolveQuery.data;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shortUrl = `${origin}/r/${link.code}`;
  const rate = link.commissionBps ?? 500;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const doShare = async () => {
    const ok = await nativeShare({
      title: resolved?.label ?? resolved?.product?.name ?? 'NP Commerce',
      text: resolved?.product?.name
        ? `ลองสินค้านี้สิ: ${resolved.product.name}`
        : 'แนะนำของจาก NP Commerce',
      url: shortUrl,
      dialogTitle: 'แชร์ลิงก์',
    });
    if (!ok) void copy();
  };

  return (
    <main className="container-mobile pt-4 pb-12">
      <div className="mb-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/80 ring-1 ring-ink-100"
        >
          <ChevronLeftIcon />
        </button>
        <div>
          <p className="text-[11px] text-ink-500">ลิงก์ของฉัน</p>
          <h1 className="text-lg font-bold text-ink-900">
            {link.label ?? `Affiliate ${link.code}`}
          </h1>
        </div>
        <div className="ml-auto">
          <Badge tone={link.active ? 'success' : 'neutral'}>
            {link.active ? 'ใช้งานอยู่' : 'ปิด'}
          </Badge>
        </div>
      </div>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-white p-3 shadow-card">
          <TrendingUpIcon className="h-4 w-4 text-emerald-600" />
          <p className="mt-1 text-[11px] text-ink-500">คลิก</p>
          <p className="text-base font-bold tabular-nums text-ink-900">{link.clickCount}</p>
        </div>
        <div className="rounded-2xl bg-white p-3 shadow-card">
          <LinkIcon className="h-4 w-4 text-brand" />
          <p className="mt-1 text-[11px] text-ink-500">ออเดอร์</p>
          <p className="text-base font-bold tabular-nums text-ink-900">
            {link.conversionCount}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-3 shadow-card">
          <span className="text-[10px] font-bold text-fuchsia-600">%</span>
          <p className="mt-1 text-[11px] text-ink-500">ค่าคอม</p>
          <p className="text-base font-bold tabular-nums text-ink-900">
            {(rate / 100).toFixed(1)}%
          </p>
        </div>
      </section>

      {/* QR + Share card */}
      <section className="mt-4 rounded-3xl bg-mesh-1 p-5 text-white shadow-pop">
        <div className="flex items-center gap-2 text-white/80">
          <QrIcon className="h-4 w-4" />
          <p className="text-xs uppercase tracking-wider">แชร์ลิงก์นี้</p>
        </div>

        <div className="mt-3 flex flex-col items-center rounded-2xl bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrUrl(shortUrl)}
            alt="QR Code"
            className="h-44 w-44"
            width={176}
            height={176}
          />
          <code className="mt-3 break-all text-center text-xs font-mono text-ink-700">
            {shortUrl}
          </code>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            onClick={copy}
            leftIcon={<CopyIcon />}
            className="bg-white/15 text-white hover:bg-white/25"
          >
            {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์'}
          </Button>
          <Button onClick={doShare} leftIcon={<ShareIcon />}>
            แชร์
          </Button>
        </div>
      </section>

      {/* Product context */}
      {resolved?.product && (
        <section className="mt-4 rounded-3xl border border-ink-100 bg-white p-4 shadow-card">
          <p className="text-xs font-bold text-ink-700">สินค้าที่โปรโมท</p>
          <div className="mt-2 flex items-center gap-3">
            {resolved.product.mediaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolved.product.mediaUrl}
                alt={resolved.product.name}
                className="h-16 w-16 rounded-2xl object-cover"
                width={64}
                height={64}
              />
            ) : (
              <div className="h-16 w-16 rounded-2xl bg-ink-100" />
            )}
            <div className="flex-1">
              <p className="line-clamp-2 text-sm font-semibold text-ink-900">
                {resolved.product.name}
              </p>
              <p className="text-sm font-bold text-brand">
                ฿ {(resolved.product.priceCents / 100).toFixed(2)}
              </p>
            </div>
            <Link
              href={`/product/${resolved.product.id}`}
              className="text-xs font-semibold text-brand"
            >
              ดู →
            </Link>
          </div>
        </section>
      )}

      {resolved?.shop && (
        <section className="mt-4 rounded-3xl border border-ink-100 bg-white p-4 shadow-card">
          <p className="text-xs font-bold text-ink-700">ร้านค้า</p>
          <p className="mt-1 text-sm text-ink-900">{resolved.shop.name}</p>
        </section>
      )}
    </main>
  );
}
