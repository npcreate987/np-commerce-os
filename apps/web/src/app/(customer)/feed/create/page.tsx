'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import {
  extractVideoPoster,
  probeVideo,
  uploadVideoFile,
  uploadVideoPoster,
} from '@/lib/upload-video';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  SparklesIcon,
  TrashIcon,
  VideoIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';
import { STORAGE_LIMITS } from '@np/types';

/**
 * Phase 12.1 — Short-video composer.
 *
 * Pipeline (client-side)
 * ----------------------
 * 1. Pick file (`<input type=file accept=video/* capture=environment>`).
 * 2. `probeVideo()` → reject if duration > 90s or size > 100 MB. Render the
 *    file via a blob URL preview.
 * 3. Capture caption / tags / optional productId / shopId.
 * 4. On submit:
 *    a. `extractVideoPoster()` → 720×1280 JPEG @ 0.82
 *    b. `uploadVideoFile()` with onProgress (XHR upload events)
 *    c. `uploadVideoPoster()` (parallel-safe, but we serialise for clarity)
 *    d. `api.feed.create({ videoUrl, thumbUrl, caption, tags, productId, shopId })`
 *    e. Invalidate the `['feed','videos']` infinite query
 *    f. `router.push('/feed?v=<new-id>')`
 *
 * Auth: login required (redirect to `/login?next=/feed/create`).
 *
 * Shop / product: optional. We auto-suggest the user's first shop (if any) so
 * MERCHANT users don't have to pick every time; CUSTOMER users see no shop
 * picker.
 */

const MAX_VIDEO_BYTES = STORAGE_LIMITS.video; // 100 MB
const MAX_VIDEO_DURATION_SEC = 90; // TikTok-mode
const MAX_TAGS = 10;
const MAX_CAPTION = 500;

export default function FeedCreatePage(): JSX.Element {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const qc = useQueryClient();

  // ----- Auth gate (wait for zustand-persist to finish loading first) ------
  useEffect(() => {
    if (hasHydrated && token === null) {
      router.replace('/login?next=%2Ffeed%2Fcreate');
    }
  }, [hasHydrated, token, router]);

  // ----- Load user's shops (optional shop selector) -------------------------
  const myShopsQ = useQuery({
    queryKey: ['shops', 'mine'],
    queryFn: () => api.shops.mine(token!),
    enabled: Boolean(token),
    retry: false,
  });
  const shops = myShopsQ.data ?? [];

  // ----- Form state ---------------------------------------------------------
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [probe, setProbe] = useState<{
    durationSec: number;
    width: number;
    height: number;
  } | null>(null);
  const [caption, setCaption] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [shopId, setShopId] = useState<string>('');
  const [productId, setProductId] = useState<string>('');
  const [stage, setStage] = useState<
    'idle' | 'poster' | 'uploading' | 'thumb' | 'creating' | 'done'
  >('idle');
  const [progress, setProgress] = useState(0); // 0..1

  // Auto-pick the first shop for merchants the first time we see one
  useEffect(() => {
    if (!shopId && shops.length > 0 && shops[0]) setShopId(shops[0].id);
  }, [shops, shopId]);

  // Load products for the selected shop (for the optional product CTA pill)
  const productsQ = useQuery({
    queryKey: ['products', 'by-shop', shopId],
    queryFn: () => api.products.listByShop(token!, shopId),
    enabled: Boolean(token && shopId),
    retry: false,
  });

  // Revoke blob URL when component unmounts or file swap
  useEffect(() => {
    return (): void => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // ----- Handlers -----------------------------------------------------------
  const onPickFile = useCallback(
    async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
      setFileError(null);
      const f = e.target.files?.[0] ?? null;
      if (!f) return;

      // Size check first (cheaper than probe)
      if (f.size > MAX_VIDEO_BYTES) {
        setFileError(
          `ไฟล์ใหญ่กว่า ${Math.floor(MAX_VIDEO_BYTES / 1024 / 1024)} MB — ลองคลิปสั้นลงหรือบีบอัดก่อน`,
        );
        return;
      }
      // MIME check (browsers do honour `accept` but only as a hint)
      if (!/^video\/(mp4|webm|quicktime)$/i.test(f.type)) {
        setFileError(
          `ไม่รองรับฟอร์แมต ${f.type || 'unknown'} — ใช้ .mp4, .webm หรือ .mov`,
        );
        return;
      }
      try {
        const p = await probeVideo(f);
        if (p.durationSec > MAX_VIDEO_DURATION_SEC + 0.5) {
          setFileError(
            `คลิปยาว ${Math.round(p.durationSec)}s — สูงสุดได้ ${MAX_VIDEO_DURATION_SEC}s`,
          );
          return;
        }
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setFile(f);
        setPreviewUrl(URL.createObjectURL(f));
        setProbe({
          durationSec: p.durationSec,
          width: p.width,
          height: p.height,
        });
      } catch (err) {
        setFileError(err instanceof Error ? err.message : 'อ่านคลิปไม่สำเร็จ');
      }
    },
    [previewUrl],
  );

  const addTag = (raw: string): void => {
    const t = raw.trim().replace(/^#+/, '').replace(/\s+/g, '');
    if (!t) return;
    if (tags.includes(t)) return;
    if (tags.length >= MAX_TAGS) return;
    if (t.length > 30) return;
    setTags([...tags, t]);
    setTagInput('');
  };

  const removeTag = (t: string): void => {
    setTags(tags.filter((x) => x !== t));
  };

  // ----- Submit -------------------------------------------------------------
  const createM = useMutation({
    mutationFn: async (): Promise<{ id: string }> => {
      if (!token || !file) throw new Error('ขาดข้อมูล');

      // (a) Extract poster ฝั่ง client
      setStage('poster');
      setProgress(0);
      let posterBlob: Blob | null = null;
      try {
        posterBlob = await extractVideoPoster(file, { atSec: 0.5 });
      } catch {
        // Poster is nice-to-have; reel will fall back to the video's first
        // frame if `thumbUrl` is null.
        posterBlob = null;
      }

      // (b) Upload video with progress
      setStage('uploading');
      const videoUp = await uploadVideoFile(token, file, {
        onProgress: (pct) => setProgress(pct),
      });

      // (c) Upload poster (if extracted)
      let thumbUrl: string | undefined;
      if (posterBlob) {
        setStage('thumb');
        try {
          const thumbUp = await uploadVideoPoster(token, posterBlob);
          thumbUrl = thumbUp.publicUrl;
        } catch {
          // ignore — feed page handles null thumb
        }
      }

      // (d) Create the post
      setStage('creating');
      const post = await api.feed.create(token, {
        videoUrl: videoUp.publicUrl,
        thumbUrl,
        caption: caption.trim(),
        productId: productId || undefined,
        shopId: shopId || undefined,
        tags: tags.length > 0 ? tags : undefined,
      });
      setStage('done');
      return { id: post.id };
    },
    onSuccess: async ({ id }) => {
      // Invalidate so the new clip appears at the top
      await qc.invalidateQueries({ queryKey: ['feed', 'videos'] });
      router.push(`/feed?v=${encodeURIComponent(id)}`);
    },
    onError: () => {
      setStage('idle');
      setProgress(0);
    },
  });

  const canSubmit =
    !!file &&
    !fileError &&
    !createM.isPending &&
    stage === 'idle';

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!canSubmit) return;
    createM.mutate();
  };

  // ----- Render -------------------------------------------------------------
  // Loading state while we're still figuring out the token from localStorage.
  if (!hasHydrated) {
    return (
      <main className="container-app py-16">
        <div className="mx-auto h-40 max-w-sm animate-pulse rounded-2xl bg-ink-100" />
      </main>
    );
  }

  if (token === null) {
    return (
      <main className="container-app py-16">
        <EmptyState
          icon={<VideoIcon />}
          title="ต้องเข้าสู่ระบบ"
          description="โพสต์คลิปได้เฉพาะสมาชิกเท่านั้น"
          action={
            <Link
              href="/login?next=%2Ffeed%2Fcreate"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-4 text-xs font-semibold text-white shadow-glow"
            >
              เข้าสู่ระบบ <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          }
        />
      </main>
    );
  }

  const previewAspect =
    probe && probe.width && probe.height ? probe.width / probe.height : 9 / 16;

  return (
    <main className="container-app pb-24 pt-4 lg:pt-8">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold text-surface-strong/80 hover:bg-surface-raised active:scale-95"
          aria-label="ย้อนกลับ"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          กลับ
        </button>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">
            สร้างคลิปใหม่
          </p>
          <h1 className="font-display text-lg font-bold tracking-tight text-surface-strong lg:text-2xl">
            โพสต์คลิป
          </h1>
        </div>
      </div>

      <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[480px_1fr] lg:gap-8">
        {/* === Left: video picker + preview =================================== */}
        <section className="space-y-4">
          {/* Picker */}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            capture="environment"
            onChange={onPickFile}
            className="hidden"
          />

          {!file ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="grid aspect-[9/16] w-full place-items-center rounded-3xl border-2 border-dashed border-surface bg-surface-raised text-center text-surface-muted transition hover:border-brand hover:bg-brand-50/50 active:scale-[0.99] dark:hover:bg-brand-900/20"
            >
              <div className="flex flex-col items-center gap-3 px-6">
                <span className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-gradient text-white shadow-glow">
                  <VideoIcon className="h-7 w-7" />
                </span>
                <div>
                  <p className="font-display text-base font-bold text-surface-strong">
                    เลือกคลิป หรือถ่ายเลย
                  </p>
                  <p className="mt-1 text-xs text-surface-muted">
                    .mp4 / .webm / .mov · ไม่เกิน {MAX_VIDEO_DURATION_SEC}s · ไม่เกิน{' '}
                    {Math.floor(MAX_VIDEO_BYTES / 1024 / 1024)} MB
                  </p>
                  <p className="mt-1 text-[11px] text-surface-faint">
                    แนะนำ 9:16 แนวตั้ง · ลำโพงเปิดเพื่อตรวจเสียง
                  </p>
                </div>
              </div>
            </button>
          ) : (
            <div className="space-y-3">
              <div
                className="relative mx-auto overflow-hidden rounded-3xl bg-black shadow-pop"
                style={{
                  aspectRatio: previewAspect.toFixed(3),
                  maxWidth: previewAspect < 1 ? 360 : '100%',
                }}
              >
                {previewUrl ? (
                  <video
                    src={previewUrl}
                    className="h-full w-full object-cover"
                    controls
                    playsInline
                    muted
                  />
                ) : null}
                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => {
                    if (previewUrl) URL.revokeObjectURL(previewUrl);
                    setFile(null);
                    setPreviewUrl(null);
                    setProbe(null);
                    setFileError(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur active:scale-95"
                  aria-label="ลบคลิป"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
              {probe ? (
                <div className="flex items-center justify-between text-[11px] text-surface-muted">
                  <span>
                    {probe.width}×{probe.height} · {probe.durationSec.toFixed(1)}s
                  </span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="font-semibold text-brand"
                  >
                    เปลี่ยนคลิป
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {fileError ? (
            <p className="rounded-2xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-700/40 dark:bg-rose-900/20 dark:text-rose-200">
              {fileError}
            </p>
          ) : null}
        </section>

        {/* === Right: metadata =============================================== */}
        <section className="space-y-5">
          {/* Caption */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-surface-faint">
              แคปชั่น
            </label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, MAX_CAPTION))}
              rows={3}
              placeholder="บอกเล่าเกี่ยวกับคลิปนี้สั้น ๆ ... ใส่ #แฮชแท็ก ในแคปชั่นได้"
              className="mt-1 w-full resize-none rounded-2xl border border-surface bg-surface-raised px-4 py-3 text-sm text-surface-strong placeholder:text-surface-faint focus:border-brand focus:outline-none"
            />
            <p className="mt-1 text-right text-[10px] text-surface-faint">
              {caption.length}/{MAX_CAPTION}
            </p>
          </div>

          {/* Tags */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-surface-faint">
              แฮชแท็ก · สูงสุด {MAX_TAGS}
            </label>
            <div className="mt-1 flex flex-wrap gap-2 rounded-2xl border border-surface bg-surface-raised px-3 py-2.5">
              {tags.map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => removeTag(t)}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-200"
                  aria-label={`ลบ #${t}`}
                >
                  #{t}
                  <span className="text-[11px] opacity-70">×</span>
                </button>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                    e.preventDefault();
                    addTag(tagInput);
                  } else if (
                    e.key === 'Backspace' &&
                    tagInput === '' &&
                    tags.length > 0
                  ) {
                    setTags(tags.slice(0, -1));
                  }
                }}
                onBlur={() => addTag(tagInput)}
                placeholder={tags.length === 0 ? 'เพิ่มแฮชแท็ก แล้วกด Enter' : ''}
                className="min-w-[120px] flex-1 bg-transparent text-sm text-surface-strong placeholder:text-surface-faint focus:outline-none"
                disabled={tags.length >= MAX_TAGS}
              />
            </div>
          </div>

          {/* Shop + product (optional, for merchants linking commerce) */}
          {shops.length > 0 ? (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-surface-faint">
                  ผูกกับร้านค้า · ไม่บังคับ
                </label>
                <select
                  value={shopId}
                  onChange={(e) => {
                    setShopId(e.target.value);
                    setProductId('');
                  }}
                  className="mt-1 w-full rounded-2xl border border-surface bg-surface-raised px-4 py-3 text-sm text-surface-strong focus:border-brand focus:outline-none"
                >
                  <option value="">— ไม่ผูกร้าน —</option>
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {shopId && productsQ.data && productsQ.data.length > 0 ? (
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-surface-faint">
                    ติด CTA "ซื้อเลย" สู่สินค้า · ไม่บังคับ
                  </label>
                  <select
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-surface bg-surface-raised px-4 py-3 text-sm text-surface-strong focus:border-brand focus:outline-none"
                  >
                    <option value="">— ไม่ผูกสินค้า —</option>
                    {productsQ.data.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · ฿
                        {(p.priceCents / 100).toLocaleString('th-TH')}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Progress + submit */}
          {stage !== 'idle' && stage !== 'done' ? (
            <div className="rounded-2xl border border-surface bg-surface-raised px-4 py-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-semibold text-surface-strong">
                  {stage === 'poster' && 'กำลังสร้างภาพปก…'}
                  {stage === 'uploading' && 'กำลังอัปคลิป…'}
                  {stage === 'thumb' && 'กำลังอัปภาพปก…'}
                  {stage === 'creating' && 'กำลังโพสต์…'}
                </span>
                <span className="font-mono tabular-num text-surface-muted">
                  {stage === 'uploading' ? `${Math.round(progress * 100)}%` : '—'}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface">
                <div
                  className={cn(
                    'h-full rounded-full bg-brand-gradient transition-all',
                    stage !== 'uploading' && 'animate-pulse',
                  )}
                  style={{
                    width:
                      stage === 'uploading'
                        ? `${Math.max(2, Math.round(progress * 100))}%`
                        : '100%',
                  }}
                />
              </div>
            </div>
          ) : null}

          {createM.error ? (
            <p className="rounded-2xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-700/40 dark:bg-rose-900/20 dark:text-rose-200">
              {createM.error instanceof Error
                ? createM.error.message
                : 'โพสต์ไม่สำเร็จ — ลองใหม่อีกครั้ง'}
            </p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={createM.isPending}
            disabled={!canSubmit}
            leftIcon={<SparklesIcon className="h-4 w-4" />}
            rightIcon={<ArrowRightIcon className="h-4 w-4" />}
          >
            โพสต์เลย
          </Button>

          <p className="text-center text-[10px] text-surface-faint">
            โพสต์โดย <span className="font-semibold">{user?.name ?? user?.email}</span>{' '}
            · ระบบจะตรวจสอบเนื้อหาตามแนวทางชุมชน
          </p>
        </section>
      </form>
    </main>
  );
}
