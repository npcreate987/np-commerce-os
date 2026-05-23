'use client';

/**
 * Phase 14.5 — `/orders` DESKTOP variant (Gmail master-detail).
 *
 *   ┌──────────────────────┬───────────────────────────────────────┐
 *   │ คำสั่งซื้อของฉัน      │                                       │
 *   │ ────────────         │         (no order selected)           │
 *   │ #abc123  รอชำระ      │                                       │
 *   │  iPhone Case          │       ← เลือกคำสั่งซื้อจากรายการ      │
 *   │  ฿1,290               │                                       │
 *   │ ────────────         │                                       │
 *   │ #def456  สำเร็จ       │                                       │
 *   │  AirPods Pro          │                                       │
 *   │  ฿8,490               │                                       │
 *   │ ────────────         │                                       │
 *   └──────────────────────┴───────────────────────────────────────┘
 *
 *   On `/orders` (this page) the right side shows the "pick one" empty
 *   state. On `/orders/[id]` the right side shows the actual detail
 *   (see `[id]/_desktop.tsx`). The left list is identical in both,
 *   highlighting the active row when one is selected.
 */

import { PackageIcon } from '@/components/icons';
import { EmptyState } from '@/components/ui/empty-state';
import { OrdersListPanel } from './_list-panel';

export function DesktopOrders(): JSX.Element {
  return (
    <main className="grid h-[calc(100dvh-4rem)] grid-cols-[380px_1fr]">
      <aside className="overflow-y-auto border-r bg-white">
        <div className="sticky top-0 z-10 border-b bg-white px-4 py-3">
          <h1 className="text-base font-bold text-ink-900">คำสั่งซื้อของฉัน</h1>
          <p className="text-[11px] text-ink-500">เลือกคำสั่งซื้อเพื่อดูรายละเอียด</p>
        </div>
        <OrdersListPanel variant="compact" />
      </aside>

      <section className="bg-ink-50">
        <div className="flex h-full items-center justify-center p-10">
          <EmptyState
            icon={<PackageIcon />}
            title="เลือกคำสั่งซื้อจากด้านซ้าย"
            description="คลิกที่คำสั่งซื้อใดก็ได้ในรายการเพื่อดูสถานะ ขนส่ง และตัวเลือกในการจัดการ"
          />
        </div>
      </section>
    </main>
  );
}
