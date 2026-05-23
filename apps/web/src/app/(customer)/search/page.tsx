'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { RatingPill } from '@/components/rating';
import { formatTHB } from '@/lib/format';
import {
  ChevronLeftIcon,
  SearchIcon,
  SparklesIcon,
  StoreIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';
import {
  clearRecentSearches,
  getRecentSearches,
  pushRecentSearch,
} from '@/lib/recent-searches';
import { tracker } from '@/lib/track';
import type { SearchSort } from '@np/types';

const SORTS: Array<{ value: SearchSort; label: string }> = [
  { value: 'RELEVANCE', label: 'แนะนำ' },
  { value: 'PRICE_ASC', label: 'ราคาน้อย→มาก' },
  { value: 'PRICE_DESC', label: 'ราคามาก→น้อย' },
  { value: 'RATING', label: 'รีวิวสูง' },
  { value: 'POPULAR', label: 'ขายดี' },
];

function SearchPageInner(): JSX.Element {
  const params = useSearchParams();
  const router = useRouter();
  const token = useAuthStore((s) => s.token);

  const initialQ = params.get('q') ?? '';
  const [q, setQ] = useState(initialQ);
  const [committedQ, setCommittedQ] = useState(initialQ);
  const [minRating, setMinRating] = useState(0);
  const [priceMax, setPriceMax] = useState<number | null>(null);
  const [sort, setSort] = useState<SearchSort>('RELEVANCE');
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    setRecent(getRecentSearches());
  }, []);

  const commit = useCallback(
    (next: string) => {
      const v = next.trim();
      setCommittedQ(v);
      if (v.length > 0) {
        pushRecentSearch(v);
        setRecent(getRecentSearches());
        tracker.track('search_query', {
          entityType: 'search',
          entityId: v,
          surface: 'search',
          meta: { query: v },
        });
      }
      const url = v ? `/search?q=${encodeURIComponent(v)}` : '/search';
      router.replace(url);
    },
    [router],
  );

  // Suggestions (autocomplete) — only fires when user is typing & query differs
  const sugQ = useQuery({
    queryKey: ['search', 'sug', q],
    queryFn: () => api.search.suggestions(q, 8),
    enabled: q.length >= 1 && q !== committedQ,
    staleTime: 30_000,
    retry: false,
  });

  const filters = useMemo(
    () => ({
      query: committedQ,
      minRating: minRating > 0 ? minRating : undefined,
      maxPriceCents: priceMax ?? undefined,
      sort,
      limit: 36,
    }),
    [committedQ, minRating, priceMax, sort],
  );

  const resultsQ = useQuery({
    queryKey: ['search', 'products', filters],
    queryFn: () => api.search.products(filters, token ?? undefined),
    retry: false,
  });

  const shopsQ = useQuery({
    queryKey: ['search', 'shops', committedQ],
    queryFn: () => api.search.shops(committedQ, 5),
    enabled: committedQ.length > 0,
    retry: false,
  });

  return (
    <main className="container-mobile pb-20">
      <header
        className="sticky top-0 z-20 -mx-4 border-b border-white/40 bg-white/85 px-4 backdrop-blur"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex h-14 items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-ink-700 ring-1 ring-ink-100 active:scale-95"
            aria-label="ย้อนกลับ"
          >
            <ChevronLeftIcon />
          </button>
          <form
            className="flex flex-1 items-center gap-2 rounded-2xl bg-ink-50 px-3"
            onSubmit={(e) => {
              e.preventDefault();
              commit(q);
            }}
          >
            <SearchIcon className="h-4 w-4 text-ink-400" />
            <input
              value={q}
              autoFocus
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาสินค้าหรือร้าน..."
              className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-400"
            />
            {q ? (
              <button
                type="button"
                onClick={() => {
                  setQ('');
                  commit('');
                }}
                className="text-xs font-semibold text-ink-400"
                aria-label="ลบ"
              >
                ×
              </button>
            ) : null}
          </form>
        </div>

        {/* Suggestions dropdown */}
        {q.length >= 1 && q !== committedQ && (sugQ.data?.length ?? 0) > 0 ? (
          <div className="hide-scrollbar mb-2 flex max-h-44 flex-col overflow-y-auto rounded-2xl bg-white p-1 ring-1 ring-ink-100">
            {(sugQ.data ?? []).map((s) => (
              <button
                key={`${s.kind}:${s.text}`}
                type="button"
                onClick={() => {
                  setQ(s.text);
                  commit(s.text);
                }}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-ink-800 hover:bg-ink-50"
              >
                <SearchIcon className="h-3.5 w-3.5 text-ink-400" />
                <span className="flex-1 truncate">{s.text}</span>
                {s.kind === 'TRENDING' ? (
                  <span className="text-[10px] text-rose-500">🔥</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      {/* No query yet → recents + trending */}
      {!committedQ ? (
        <EmptyHero
          recent={recent}
          onPick={(x) => {
            setQ(x);
            commit(x);
          }}
          onClearRecents={() => {
            clearRecentSearches();
            setRecent([]);
          }}
        />
      ) : (
        <>
          {/* Sort + filter chips */}
          <div className="hide-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
            {SORTS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSort(s.value)}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
                  sort === s.value
                    ? 'bg-brand-gradient text-white shadow-glow'
                    : 'bg-white text-ink-700 ring-1 ring-ink-200',
                )}
              >
                {s.label}
              </button>
            ))}
            <span className="shrink-0 self-center text-ink-200">·</span>
            {[0, 3, 4, 4.5].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setMinRating(r)}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
                  minRating === r
                    ? 'bg-amber-500 text-white'
                    : 'bg-white text-ink-700 ring-1 ring-ink-200',
                )}
              >
                {r === 0 ? 'ทุกคะแนน' : `★ ≥ ${r}`}
              </button>
            ))}
            <span className="shrink-0 self-center text-ink-200">·</span>
            {[null, 50000, 200000, 500000].map((p) => (
              <button
                key={String(p)}
                type="button"
                onClick={() => setPriceMax(p)}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
                  priceMax === p
                    ? 'bg-emerald-500 text-white'
                    : 'bg-white text-ink-700 ring-1 ring-ink-200',
                )}
              >
                {p === null ? 'ทุกราคา' : `≤ ${formatTHB(p)}`}
              </button>
            ))}
          </div>

          {/* Shop hits */}
          {(shopsQ.data ?? []).length > 0 ? (
            <section className="mt-4 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                ร้านที่เกี่ยวข้อง
              </p>
              <ul className="hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
                {(shopsQ.data ?? []).map((s) => (
                  <Link
                    key={s.shopId}
                    href={`/shop/${s.shopId}`}
                    className="flex w-44 shrink-0 items-start gap-2 rounded-2xl border border-ink-100 bg-white p-3"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-fuchsia-500 text-white">
                      <StoreIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-sm font-bold text-ink-900">
                        {s.name}
                      </p>
                      <p className="text-[10px] text-ink-500">
                        {s.productCount} สินค้า · ขาย {s.unitsSold30d} ใน 30 วัน
                      </p>
                      {s.reviewCount > 0 ? (
                        <RatingPill
                          avg={s.avgRating}
                          count={s.reviewCount}
                          className="mt-1"
                        />
                      ) : null}
                    </div>
                  </Link>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Product results */}
          <section className="mt-4">
            {resultsQ.isLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="aspect-square w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                ))}
              </div>
            ) : resultsQ.error ? (
              <p className="rounded-2xl bg-rose-50 px-3 py-3 text-xs text-rose-700">
                ค้นไม่ได้:{' '}
                {resultsQ.error instanceof ApiError
                  ? resultsQ.error.message
                  : 'unknown'}
              </p>
            ) : (resultsQ.data?.hits ?? []).length === 0 ? (
              <ZeroResults query={committedQ} />
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] text-ink-500">
                    เจอ {resultsQ.data!.total.toLocaleString()} รายการ · ใช้เวลา{' '}
                    {resultsQ.data!.tookMs}ms
                  </p>
                  <span className="text-[10px] text-ink-400">
                    {resultsQ.data!.explanation}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {resultsQ.data!.hits.map((h) => (
                    <Link
                      key={h.productId}
                      href={`/product/${h.productId}`}
                      className="group block overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-card active:scale-[0.98]"
                    >
                      <div className="aspect-square w-full bg-gradient-to-br from-brand-100/40 to-fuchsia-100/40">
                        {h.thumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={h.thumbUrl}
                            alt={h.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-brand/40">
                            <SparklesIcon className="h-6 w-6" />
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="line-clamp-2 min-h-[2.4rem] text-[12.5px] font-medium leading-tight text-ink-900">
                          <Highlight
                            text={h.name}
                            terms={h.matchedTerms}
                          />
                        </p>
                        <p className="mt-1 text-sm font-bold text-brand">
                          {formatTHB(h.priceCents)}
                        </p>
                        <div className="mt-1 flex items-center gap-1.5">
                          {h.reviewCount > 0 ? (
                            <RatingPill
                              avg={h.avgRating}
                              count={h.reviewCount}
                            />
                          ) : null}
                          {h.stock === 0 ? (
                            <Badge tone="danger">หมด</Badge>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function Highlight({
  text,
  terms,
}: {
  text: string;
  terms: string[];
}): JSX.Element {
  if (terms.length === 0) return <>{text}</>;
  // Build a regex that captures any of the matched terms (case-insensitive)
  const pattern = terms
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .filter(Boolean)
    .join('|');
  if (!pattern) return <>{text}</>;
  const re = new RegExp(`(${pattern})`, 'gi');
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) =>
        re.test(p) ? (
          <mark
            key={i}
            className="rounded bg-amber-100 px-0.5 text-amber-900"
          >
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function EmptyHero({
  recent,
  onPick,
  onClearRecents,
}: {
  recent: string[];
  onPick: (q: string) => void;
  onClearRecents: () => void;
}): JSX.Element {
  // Public trending — call analytics endpoint if admin, else just suggestions
  const trendingQ = useQuery({
    queryKey: ['search', 'trending', 'public'],
    queryFn: () => api.search.suggestions('', 0).catch(() => []),
    retry: false,
    enabled: false, // we'll show curated chips instead
  });
  void trendingQ;

  return (
    <div className="space-y-5 pt-5">
      {recent.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
              ค้นล่าสุด
            </p>
            <button
              type="button"
              onClick={onClearRecents}
              className="text-[11px] font-semibold text-ink-400"
            >
              ล้าง
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {recent.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onPick(r)}
                className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 ring-1 ring-ink-200 active:scale-95"
              >
                {r}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
          เริ่มจากนี้
        </p>
        <p className="text-xs text-ink-500">
          ค้นได้ทั้งชื่อสินค้า ชื่อร้าน หรือคำที่อยู่ใน description
        </p>
        <div className="flex flex-wrap gap-2">
          {['Flash Sale', 'อาหาร', 'กาแฟ', 'ของฝาก', 'ใหม่', 'ลด 50%'].map(
            (s) => (
              <button
                key={s}
                type="button"
                onClick={() => onPick(s)}
                className="rounded-full bg-brand-gradient px-3 py-1.5 text-xs font-bold text-white shadow-glow active:scale-95"
              >
                {s}
              </button>
            ),
          )}
        </div>
      </section>
    </div>
  );
}

function ZeroResults({ query }: { query: string }): JSX.Element {
  // For zero-result queries: show featured by querying with no minRating/sort
  const fallbackQ = useQuery({
    queryKey: ['search', 'fallback'],
    queryFn: () =>
      api.search.products({
        query: '',
        sort: 'POPULAR',
        limit: 12,
      }),
    retry: false,
  });

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-dashed border-ink-200 bg-ink-50/40 p-6 text-center">
        <p className="font-display text-base font-bold text-ink-900">
          ไม่พบ &ldquo;{query}&rdquo;
        </p>
        <p className="mt-1 text-xs text-ink-500">
          ลองใช้คำที่สั้นกว่า · สะกดใหม่ · หรือดูสินค้าขายดีด้านล่าง
        </p>
      </div>

      {(fallbackQ.data?.hits ?? []).length > 0 ? (
        <section className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
            สินค้าขายดี
          </p>
          <div className="grid grid-cols-2 gap-3">
            {(fallbackQ.data?.hits ?? []).slice(0, 6).map((h) => (
              <Link
                key={h.productId}
                href={`/product/${h.productId}`}
                className="block overflow-hidden rounded-3xl border border-ink-100 bg-white p-3 shadow-card"
              >
                <div className="mb-2 aspect-square w-full rounded-2xl bg-gradient-to-br from-brand-100 to-fuchsia-100" />
                <p className="line-clamp-2 min-h-[2.4rem] text-[12px] font-medium text-ink-900">
                  {h.name}
                </p>
                <p className="mt-1 text-sm font-bold text-brand">
                  {formatTHB(h.priceCents)}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default function SearchPage(): JSX.Element {
  return (
    <Suspense fallback={<div className="container-mobile py-8" />}>
      <SearchPageInner />
    </Suspense>
  );
}
