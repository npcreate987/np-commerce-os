import Link from 'next/link';
import type { Product } from '@np/types';
import { formatTHB } from '@/lib/format';

export function ProductCard({ product }: { product: Product }): JSX.Element {
  const cover = product.media[0]?.url ?? null;
  const isVideo = product.media[0]?.kind === 'VIDEO';
  const lowStock = product.stock > 0 && product.stock < 10;
  const oos = product.stock === 0;

  return (
    <Link
      href={`/product/${product.id}`}
      className="shine-on-hover group block overflow-hidden rounded-3xl border border-ink-100 bg-white/95 shadow-card transition active:scale-[0.985]"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-ink-100">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={product.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.06]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink-300">
            No image
          </div>
        )}
        {/* Bottom fade gradient */}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/45 via-black/0 to-transparent" />

        {/* Top-left video badge */}
        <div className="absolute left-2 top-2 flex items-center gap-1.5">
          {isVideo ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-ink-900 backdrop-blur">
              ▶ Video
            </span>
          ) : null}
        </div>

        {/* Top-right stock badge */}
        <div className="absolute right-2 top-2">
          {oos ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-ink-900/85 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
              หมด
            </span>
          ) : lowStock ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/95 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
              เหลือ {product.stock}
            </span>
          ) : null}
        </div>

        {/* Bottom-left price overlay */}
        <div className="absolute bottom-2 left-2">
          <span className="inline-flex items-center rounded-full bg-white/95 px-2.5 py-1 text-[12px] font-bold tracking-tight text-brand-700 shadow-soft backdrop-blur">
            {formatTHB(product.priceCents)}
          </span>
        </div>
      </div>
      <div className="p-3">
        <p className="line-clamp-2 min-h-[2.4rem] text-[12.5px] font-medium leading-tight text-ink-900">
          {product.name}
        </p>
      </div>
    </Link>
  );
}
