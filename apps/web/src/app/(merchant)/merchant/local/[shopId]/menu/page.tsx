'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  ChevronLeftIcon,
  ListIcon,
  PlusIcon,
  TrashIcon,
} from '@/components/icons';

export default function MerchantMenuPage(): JSX.Element {
  const params = useParams<{ shopId: string }>();
  const shopId = params.shopId;
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [newCat, setNewCat] = useState('');
  const [pickingFor, setPickingFor] = useState<string | null>(null);

  const { data: cats, isLoading } = useQuery({
    queryKey: ['local', 'cats', shopId],
    queryFn: () => api.local.listCategories(token!, shopId),
    enabled: Boolean(token),
  });
  const { data: menu } = useQuery({
    queryKey: ['local', 'menu', shopId],
    queryFn: () => api.local.menu(shopId),
  });
  const { data: products } = useQuery({
    queryKey: ['products', 'byShop', shopId],
    queryFn: () => api.products.listByShop(token!, shopId),
    enabled: Boolean(token),
  });

  const createCat = useMutation({
    mutationFn: (name: string) =>
      api.local.createCategory(token!, shopId, { name, sort: (cats?.length ?? 0) * 10 }),
    onSuccess: () => {
      setNewCat('');
      qc.invalidateQueries({ queryKey: ['local', 'cats', shopId] });
      qc.invalidateQueries({ queryKey: ['local', 'menu', shopId] });
    },
  });

  const deleteCat = useMutation({
    mutationFn: (catId: string) => api.local.deleteCategory(token!, shopId, catId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['local', 'cats', shopId] });
      qc.invalidateQueries({ queryKey: ['local', 'menu', shopId] });
    },
  });

  const assignItem = useMutation({
    mutationFn: (vars: { catId: string; productId: string }) =>
      api.local.assignItem(token!, shopId, vars.catId, {
        productId: vars.productId,
        sort: 0,
      }),
    onSuccess: () => {
      setPickingFor(null);
      qc.invalidateQueries({ queryKey: ['local', 'menu', shopId] });
    },
  });

  const removeItem = useMutation({
    mutationFn: (vars: { catId: string; productId: string }) =>
      api.local.removeItem(token!, shopId, vars.catId, vars.productId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['local', 'menu', shopId] }),
  });

  function submit(e: FormEvent): void {
    e.preventDefault();
    if (newCat.trim()) createCat.mutate(newCat.trim());
  }

  return (
    <main className="container-mobile space-y-4 pb-32 pt-2">
      <Link
        href={`/merchant/local/${shopId}`}
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-600"
      >
        <ChevronLeftIcon className="h-3 w-3" />
        กลับ
      </Link>

      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">
          หมวดเมนู
        </h1>
        <p className="text-[12px] text-ink-600">
          จัดสินค้าให้เป็นกลุ่ม เช่น "อาหารจานหลัก", "เครื่องดื่ม"
        </p>
      </header>

      {/* New cat form */}
      <form
        onSubmit={submit}
        className="flex gap-2 rounded-3xl bg-white/95 p-3 ring-1 ring-ink-100 shadow-card backdrop-blur"
      >
        <Input
          value={newCat}
          onChange={(e) => setNewCat(e.target.value)}
          placeholder="ชื่อหมวดใหม่"
          className="flex-1"
        />
        <Button type="submit" disabled={createCat.isPending || !newCat.trim()}>
          เพิ่ม
        </Button>
      </form>

      {isLoading ? <Skeleton className="h-24 w-full rounded-3xl" /> : null}

      {cats && cats.length === 0 ? (
        <EmptyState
          icon={<ListIcon />}
          title="ยังไม่มีหมวด"
          description="สร้างหมวดแรกได้เลย"
        />
      ) : null}

      <div className="space-y-3">
        {cats?.map((cat) => {
          const group = menu?.find((g) => g.category?.id === cat.id);
          const assignedIds = new Set(group?.items.map((i) => i.id) ?? []);
          const available =
            products?.filter((p) => p.status === 'ACTIVE' && !assignedIds.has(p.id)) ??
            [];
          return (
            <div
              key={cat.id}
              className="rounded-3xl bg-white/95 p-4 ring-1 ring-ink-100 shadow-card backdrop-blur"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-bold tracking-tight text-ink-900">
                  {cat.name}
                </h2>
                <button
                  type="button"
                  onClick={() => deleteCat.mutate(cat.id)}
                  className="rounded-full bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-600 ring-1 ring-rose-200"
                  disabled={deleteCat.isPending}
                >
                  ลบ
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {group?.items.length === 0 ? (
                  <p className="text-[12px] text-ink-500">ยังไม่มีสินค้าในหมวดนี้</p>
                ) : null}
                {group?.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-2xl bg-ink-50 p-2 ring-1 ring-ink-100"
                  >
                    <div className="h-10 w-10 overflow-hidden rounded-xl bg-white">
                      {item.mediaUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.mediaUrl}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="flex-1">
                      <p className="font-display text-sm font-semibold tracking-tight text-ink-900">
                        {item.name}
                      </p>
                      <p className="text-[11px] text-ink-500">
                        ฿{(item.priceCents / 100).toLocaleString('th-TH')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        removeItem.mutate({ catId: cat.id, productId: item.id })
                      }
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-rose-600 ring-1 ring-rose-200"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {pickingFor === cat.id ? (
                <div className="mt-3 space-y-1 rounded-2xl bg-ink-50 p-2 ring-1 ring-ink-100">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                    เลือกสินค้า
                  </p>
                  {available.length === 0 ? (
                    <p className="px-1 py-2 text-[12px] text-ink-500">
                      ไม่เหลือสินค้าที่ยังไม่ได้จัด
                    </p>
                  ) : (
                    <div className="max-h-72 space-y-1 overflow-y-auto">
                      {available.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() =>
                            assignItem.mutate({ catId: cat.id, productId: p.id })
                          }
                          className="flex w-full items-center justify-between rounded-xl bg-white px-3 py-2 ring-1 ring-ink-100"
                        >
                          <span className="text-[12px] font-semibold text-ink-800">
                            {p.name}
                          </span>
                          <PlusIcon className="h-3.5 w-3.5 text-brand" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPickingFor(cat.id)}
                  className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-brand-50 px-3 py-2 text-[12px] font-semibold text-brand ring-1 ring-brand-100"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  เพิ่มสินค้าเข้าหมวด
                </button>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
