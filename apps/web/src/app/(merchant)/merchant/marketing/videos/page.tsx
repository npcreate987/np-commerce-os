'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import type { CreateVideoInput } from '@np/types';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  ChevronLeftIcon,
  HeartIcon,
  PlayIcon,
  PlusIcon,
  VideoIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';

function VideosPageInner(): JSX.Element {
  const params = useSearchParams();
  const shopId = params.get('shopId') ?? '';
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  // Use generic feed list filtered by shopId on client
  const feedQ = useQuery({
    queryKey: ['feed', 'all'],
    queryFn: () => api.feed.list(token ?? null, 0, 50),
    enabled: !!token,
  });

  const mine = (feedQ.data ?? []).filter((v) => v.shopId === shopId);

  return (
    <main className="container-mobile space-y-4 pb-20 pt-4">
      <header className="flex items-center gap-2">
        <Link
          href="/merchant/marketing"
          className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white ring-1 ring-ink-200"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-ink-900">Short Video</h1>
          <p className="text-[11px] text-ink-500">ลงคลิปสินค้าให้ขึ้น Feed</p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="ml-auto inline-flex items-center gap-1 rounded-full bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-white shadow-glow"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          ลงคลิป
        </button>
      </header>

      {creating ? (
        <CreateVideoForm
          shopId={shopId}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ['feed', 'all'] });
          }}
        />
      ) : null}

      {feedQ.isLoading ? (
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-[9/16] rounded-2xl" />
          ))}
        </div>
      ) : mine.length === 0 ? (
        <EmptyState
          title="ยังไม่มีคลิป"
          description="แปะ URL คลิป mp4 ก็ดันขึ้น Feed ได้ทันที"
          icon={<VideoIcon className="h-8 w-8 text-ink-300" />}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {mine.map((v) => (
            <div
              key={v.id}
              className="relative aspect-[9/16] overflow-hidden rounded-2xl bg-black shadow-pop"
            >
              {v.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={v.thumbUrl}
                  alt={v.caption}
                  className="h-full w-full object-cover"
                />
              ) : (
                <video
                  src={v.videoUrl}
                  className="h-full w-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-white">
                <p className="line-clamp-2 text-[10px] font-semibold">{v.caption}</p>
                <div className="mt-1 flex items-center gap-2 text-[10px]">
                  <span className="flex items-center gap-0.5">
                    <HeartIcon className="h-3 w-3" />
                    {v.likes}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <PlayIcon className="h-3 w-3" />
                    {v.views}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function CreateVideoForm({
  shopId,
  onClose,
  onCreated,
}: {
  shopId: string;
  onClose: () => void;
  onCreated: () => void;
}): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const productsQ = useQuery({
    queryKey: ['products', 'shop', shopId],
    queryFn: () => api.products.listByShop(token!, shopId),
  });

  const [form, setForm] = useState<CreateVideoInput>({
    videoUrl: '',
    caption: '',
    shopId,
  });
  const [tagsInput, setTagsInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createM = useMutation({
    mutationFn: (input: CreateVideoInput) => api.feed.create(token!, input),
    onSuccess: onCreated,
    onError: (e) => setError(e instanceof ApiError ? e.message : 'อัปโหลดไม่สำเร็จ'),
  });

  return (
    <div className="space-y-3 rounded-3xl border border-violet-200 bg-violet-50/30 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-ink-900">ลงคลิปสั้น</p>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] font-semibold text-ink-500"
        >
          ปิด
        </button>
      </div>

      <input
        value={form.videoUrl}
        onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
        placeholder="URL คลิป (mp4 / hls)"
        className="w-full rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
      />
      <input
        value={form.thumbUrl ?? ''}
        onChange={(e) => setForm({ ...form, thumbUrl: e.target.value })}
        placeholder="URL ภาพปก (ไม่บังคับ)"
        className="w-full rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
      />
      <textarea
        value={form.caption}
        onChange={(e) => setForm({ ...form, caption: e.target.value })}
        rows={2}
        placeholder="แคปชั่น"
        className="w-full rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
      />

      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold text-ink-700">ผูกสินค้า</span>
        <select
          value={form.productId ?? ''}
          onChange={(e) =>
            setForm({ ...form, productId: e.target.value || undefined })
          }
          className="w-full rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        >
          <option value="">— ไม่ผูก —</option>
          {productsQ.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <input
        value={tagsInput}
        onChange={(e) => setTagsInput(e.target.value)}
        placeholder="แท็ก คั่นด้วย ,  (food, flash)"
        className="w-full rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
      />

      {error ? <p className="text-[11px] text-rose-500">{error}</p> : null}

      <button
        type="button"
        disabled={createM.isPending || !form.videoUrl}
        onClick={() => {
          const tags = tagsInput
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
          createM.mutate({ ...form, tags: tags.length ? tags : undefined });
        }}
        className="w-full rounded-2xl bg-brand-gradient py-2.5 text-sm font-semibold text-white shadow-glow disabled:opacity-50"
      >
        เผยแพร่
      </button>
    </div>
  );
}

export default function Page(): JSX.Element {
  return (
    <Suspense fallback={null}>
      <VideosPageInner />
    </Suspense>
  );
}
