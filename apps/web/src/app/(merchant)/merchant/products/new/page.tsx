'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { ArrowRightIcon, BagIcon, CameraIcon, ChevronLeftIcon } from '@/components/icons';

export default function NewProductPage(): JSX.Element {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceBaht, setPriceBaht] = useState('');
  const [stock, setStock] = useState('1');
  const [mediaUrl, setMediaUrl] = useState('https://picsum.photos/seed/np-new/600/600');
  const [error, setError] = useState<string | null>(null);

  const { data: shops } = useQuery({
    queryKey: ['shops', 'mine'],
    queryFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.shops.mine(token);
    },
    enabled: Boolean(token),
  });
  const shop = shops?.[0];

  const createProduct = useMutation({
    mutationFn: () => {
      if (!token || !shop) throw new Error('NO_SHOP');
      return api.products.create(token, shop.id, {
        name,
        description: description || undefined,
        priceCents: Math.round(Number(priceBaht) * 100),
        stock: Number(stock),
        mediaUrls: mediaUrl ? [mediaUrl] : [],
      });
    },
    onSuccess: () => router.push('/merchant/products'),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'เพิ่มสินค้าไม่สำเร็จ'),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    createProduct.mutate();
  }

  if (!shop) {
    return (
      <main className="container-mobile py-6 pb-28">
        <h1 className="mb-4 text-2xl font-bold text-ink-900">เพิ่มสินค้า</h1>
        <EmptyState
          icon={<BagIcon />}
          title="ต้องมีร้านก่อน"
          description="สร้างร้านของคุณก่อนเพื่อเริ่มลงสินค้า"
          action={
            <Link
              href="/merchant/dashboard"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-5 text-sm font-semibold text-white shadow-glow active:scale-95"
            >
              ไปแดชบอร์ด
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <main className="pb-28">
      <header
        className="sticky top-0 z-20 border-b border-ink-100 bg-white/95 backdrop-blur-xl"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="container-mobile flex h-14 items-center gap-3">
          <Link
            href="/merchant/products"
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ink-50 text-ink-700 active:scale-95"
          >
            <ChevronLeftIcon />
          </Link>
          <h1 className="text-base font-bold text-ink-900">เพิ่มสินค้า</h1>
        </div>
      </header>

      <form onSubmit={onSubmit} className="container-mobile space-y-4 pt-4">
        {/* Image preview */}
        <section className="rounded-3xl border border-ink-100 bg-white p-4 shadow-card">
          <label className="block text-xs font-semibold text-ink-600">รูปสินค้า</label>
          <div className="mt-2 flex gap-3">
            <div className="relative aspect-square w-24 shrink-0 overflow-hidden rounded-2xl bg-ink-100">
              {mediaUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl} alt="preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-ink-300">
                  <CameraIcon className="h-6 w-6" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <Input
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder="https://..."
                hint="ใช้ URL รูป (อนาคต: อัปโหลดจากเครื่องได้)"
              />
            </div>
          </div>
        </section>

        {/* Basic info */}
        <section className="space-y-4 rounded-3xl border border-ink-100 bg-white p-4 shadow-card">
          <Input
            label="ชื่อสินค้า"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น Korean Skincare Set"
            required
          />
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-ink-600">คำอธิบาย</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="รายละเอียดสินค้า"
              className="block w-full rounded-2xl border border-ink-100 bg-white p-3 text-base outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
            />
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 rounded-3xl border border-ink-100 bg-white p-4 shadow-card">
          <Input
            label="ราคา (บาท)"
            inputMode="decimal"
            value={priceBaht}
            onChange={(e) => setPriceBaht(e.target.value)}
            placeholder="0"
            rightAddon={<span className="text-xs">฿</span>}
            required
          />
          <Input
            label="สต็อก"
            inputMode="numeric"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            placeholder="0"
            required
          />
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3">
            <p className="text-xs font-medium text-red-700">{error}</p>
          </div>
        ) : null}

        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={createProduct.isPending}
          rightIcon={!createProduct.isPending ? <ArrowRightIcon className="h-4 w-4" /> : undefined}
        >
          บันทึกสินค้า
        </Button>
      </form>
    </main>
  );
}
