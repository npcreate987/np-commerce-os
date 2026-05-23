'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LinkIcon, MegaphoneIcon } from '@/components/icons';
import { setRefCode } from '@/lib/affiliate';

export default function AffiliateRedirectPage(): JSX.Element {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const [autoRedirect, setAutoRedirect] = useState(true);

  const resolveQuery = useQuery({
    queryKey: ['link', params.code],
    queryFn: () => api.creators.resolveLink(params.code),
    enabled: Boolean(params.code),
    retry: false,
  });

  // Record click + persist ref code in storage (server still receives a click already via the API)
  useEffect(() => {
    if (!params.code) return;
    setRefCode(params.code);
    void api.creators.trackClick(params.code).catch(() => {
      /* non-blocking */
    });
  }, [params.code]);

  const target = (() => {
    const r = resolveQuery.data;
    if (!r) return null;
    if (r.product) return `/product/${r.product.id}`;
    if (r.shop) return `/shop/${r.shop.slug}`;
    return '/feed';
  })();

  useEffect(() => {
    if (!autoRedirect || !target) return;
    const t = window.setTimeout(() => router.replace(target), 1200);
    return () => window.clearTimeout(t);
  }, [autoRedirect, target, router]);

  return (
    <main className="min-h-dvh bg-gradient-to-b from-brand-50 to-white pb-20">
      <header
        className="relative overflow-hidden bg-mesh-2 px-4 pt-12 pb-8 text-white"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 32px)' }}
      >
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/15 blur-3xl" />
        <div className="absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-fuchsia-400/30 blur-3xl" />
        <div className="relative mx-auto max-w-mobile">
          <Badge tone="brand" className="bg-white/15 text-white">
            <LinkIcon className="mr-1 inline h-3 w-3" />
            แชร์โดย Creator
          </Badge>
          <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight">
            กำลังพาคุณไปที่สินค้า...
          </h1>
        </div>
      </header>

      <div className="container-mobile mt-6 space-y-4">
        {resolveQuery.isLoading ? (
          <Skeleton className="h-40" />
        ) : !resolveQuery.data ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-center">
            <MegaphoneIcon className="mx-auto h-6 w-6 text-red-600" />
            <p className="mt-2 text-sm font-bold text-red-700">ไม่พบลิงก์นี้</p>
            <p className="mt-1 text-xs text-red-700/80">
              ลิงก์อาจถูกปิดการใช้งานหรือพิมพ์ผิด
            </p>
            <Button
              className="mt-3"
              variant="outline"
              size="sm"
              onClick={() => router.replace('/feed')}
            >
              กลับหน้าหลัก
            </Button>
          </div>
        ) : (
          <article className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card">
            <div className="flex items-center gap-2 text-[11px] text-ink-500">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand">
                <MegaphoneIcon className="h-4 w-4" />
              </div>
              <span>
                แนะนำโดย{' '}
                <b className="text-ink-900">{resolveQuery.data.creator.displayName}</b>
              </span>
            </div>

            {resolveQuery.data.product && (
              <div className="mt-3 flex items-center gap-3">
                {resolveQuery.data.product.mediaUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveQuery.data.product.mediaUrl}
                    alt={resolveQuery.data.product.name}
                    className="h-20 w-20 rounded-2xl object-cover"
                    width={80}
                    height={80}
                  />
                ) : (
                  <div className="h-20 w-20 rounded-2xl bg-ink-100" />
                )}
                <div className="flex-1">
                  <p className="line-clamp-2 text-sm font-semibold text-ink-900">
                    {resolveQuery.data.product.name}
                  </p>
                  <p className="mt-0.5 text-lg font-bold text-brand">
                    ฿ {(resolveQuery.data.product.priceCents / 100).toFixed(2)}
                  </p>
                </div>
              </div>
            )}

            {resolveQuery.data.shop && !resolveQuery.data.product && (
              <p className="mt-3 text-sm text-ink-900">
                ดูสินค้าจากร้าน <b>{resolveQuery.data.shop.name}</b>
              </p>
            )}

            <p className="mt-4 text-[11px] text-ink-500">
              ลิงก์นี้ช่วยให้ Creator ได้รับคอมมิชชั่นจากออเดอร์ของคุณ — โดยที่ราคาสินค้าไม่เพิ่ม
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setAutoRedirect(false);
                }}
              >
                อยู่ที่หน้านี้
              </Button>
              <Button
                onClick={() => {
                  if (target) router.replace(target);
                }}
              >
                ไปต่อ →
              </Button>
            </div>
          </article>
        )}
      </div>
    </main>
  );
}
