#!/usr/bin/env bash
# Phase 6 — รีเซ็ตทั้ง API และ Web ให้ขึ้นใหม่หมดด้วยโค้ดล่าสุด (AI Engine)
#
# ใช้ทับ restart-phase5.sh ได้เลย — เปลี่ยน .next dir เป็น .next-phase6
# ฟีเจอร์เพิ่ม Phase 6:
#   - admin@np.dev / password123  (seed อัตโนมัติ)
#   - /merchant/insights          (KPI / trend / anomalies / price suggest / creator)
#   - /admin/risk/{shops,orders,logistics}
#   - For You / Similar / Buy Again ใน customer pages
#
# วิธีใช้:
#   bash scripts/restart-phase6.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$ROOT/apps/api"
WEB_DIR="$ROOT/apps/web"
WEB_PORT="${WEB_PORT:-8090}"
API_PORT="${API_PORT:-3001}"
WEB_DIST=".next-phase6"

# ---- PATH ----
if ! command -v node >/dev/null 2>&1; then
  for CAND in \
    /Users/ii/.local/node/bin \
    /opt/homebrew/bin \
    /usr/local/bin
  do
    if [ -x "$CAND/node" ]; then
      export PATH="$CAND:$PATH"
      break
    fi
  done
fi
if ! command -v node >/dev/null 2>&1; then
  echo "❌ หา node ไม่เจอใน PATH"
  exit 1
fi

NEXT_BIN="$ROOT/node_modules/.bin/next"
NEST_BIN="$ROOT/node_modules/.bin/nest"
if [ ! -x "$NEXT_BIN" ] || [ ! -x "$NEST_BIN" ]; then
  echo "❌ ไม่เจอ next/nest binary — รัน pnpm install ก่อน"
  exit 1
fi

echo "==> Node: $(node -v)"
echo "==> API port: $API_PORT"
echo "==> Web port: $WEB_PORT"
echo ""

# ---- 1) Kill stale processes ----
echo "==> Killing stale node processes..."
pkill -f "nest start --watch" 2>/dev/null || true
pkill -f "node .*apps/api/dist" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
pkill -f "next start" 2>/dev/null || true
for STALE_PORT in $API_PORT $WEB_PORT 3000 3010 3020 3030 8080 8085; do
  PIDS="$(lsof -ti :$STALE_PORT 2>/dev/null || true)"
  for pid in $PIDS; do
    kill -9 "$pid" 2>/dev/null || true
  done
done
sleep 1

# ---- 2) Clean api dist + tsc incremental cache ----
echo "==> Cleaning $API_DIR/dist + tsbuildinfo ..."
rm -rf "$API_DIR/dist" || true
rm -f "$API_DIR/tsconfig.tsbuildinfo" "$API_DIR/tsconfig.build.tsbuildinfo" 2>/dev/null || true
find "$API_DIR" -maxdepth 3 -name "*.tsbuildinfo" -delete 2>/dev/null || true

# ---- 3) Clean web .next ----
echo "==> Cleaning $WEB_DIR/.next $WEB_DIR/$WEB_DIST ..."
rm -rf "$WEB_DIR/.next" "$WEB_DIR/$WEB_DIST" || true

# ---- 4) Initial build of api ----
echo "==> Building api (initial)…"
(
  cd "$API_DIR"
  "$NEST_BIN" build
)
if [ ! -f "$API_DIR/dist/main.js" ]; then
  echo "❌ build api ไม่สำเร็จ — ไม่เจอ dist/main.js"
  echo "   ลองลบ cache: find $API_DIR -name '*.tsbuildinfo' -delete"
  exit 1
fi
echo "    ✓ dist/main.js พร้อมแล้ว ($(du -h "$API_DIR/dist" | cut -f1) total)"

# ---- 5) Start api (background) ----
echo "==> Starting api at http://127.0.0.1:$API_PORT (background)"
mkdir -p "$ROOT/.tmp"
(
  cd "$API_DIR"
  API_PORT=$API_PORT nohup node dist/main.js > "$ROOT/.tmp/api.log" 2>&1 &
  echo $! > "$ROOT/.tmp/api.pid"
)
sleep 6
echo "    api PID: $(cat "$ROOT/.tmp/api.pid" 2>/dev/null || echo unknown)"
echo "    log:    tail -f $ROOT/.tmp/api.log"

# Health check
echo "==> Verifying api health…"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf -m 2 "http://127.0.0.1:$API_PORT/v1/health" >/dev/null 2>&1; then
    echo "    ✓ api ตอบ /v1/health แล้ว"
    break
  fi
  sleep 1
  if [ "$i" = "10" ]; then
    echo "❌ api ไม่ตอบหลัง 10 วินาที — เปิด $ROOT/.tmp/api.log เช็ค error"
    tail -n 30 "$ROOT/.tmp/api.log"
    exit 1
  fi
done

# ---- 6) Build + start web ----
echo ""
echo "==> Building web → $WEB_DIST/ ..."
(
  cd "$WEB_DIR"
  NEXT_DIST_DIR="$WEB_DIST" \
  NODE_OPTIONS=--max-old-space-size=4096 \
  NEXT_TELEMETRY_DISABLED=1 \
  DISABLE_PWA=true \
    "$NEXT_BIN" build --no-lint
)

echo ""
echo "==> Starting web at http://127.0.0.1:$WEB_PORT"
echo ""
echo "    Login ทดสอบ:"
echo "      customer: user@np.dev   / password123"
echo "      merchant: shop@np.dev   / password123"
echo "      ★ admin:  admin@np.dev  / password123  (NEW in Phase 6)"
echo ""
echo "    หน้าใหม่ใน Phase 6:"
echo "      /merchant/insights              — AI insights (KPI/trend/anomaly/price/creator)"
echo "      /admin                           — Risk Center dashboard (ADMIN only)"
echo "      /admin/risk/shops                — ร้านเสี่ยง + factor breakdown"
echo "      /admin/risk/orders               — ออเดอร์ผิดปกติ + flags"
echo "      /admin/risk/logistics            — ขนส่งที่มีปัญหา"
echo ""
echo "    Customer surfaces (เพิ่ม strip):"
echo "      /feed                  → \"AI เลือกให้\" (For You)"
echo "      /product/[id]          → \"สินค้าที่คล้ายกัน\" (Similar)"
echo "      /orders                → \"ซื้อซ้ำ\" (Buy Again)"
echo ""
echo "    Ctrl+C เพื่อหยุด web (api ยังรัน background:"
echo "      kill \$(cat $ROOT/.tmp/api.pid))"
echo ""

cd "$WEB_DIR"
NEXT_DIST_DIR="$WEB_DIST" \
  "$NEXT_BIN" start -p "$WEB_PORT"
