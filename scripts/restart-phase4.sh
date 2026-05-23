#!/usr/bin/env bash
# Phase 4 — รีเซ็ตทั้ง API และ Web ให้ขึ้นใหม่หมดด้วยโค้ดล่าสุด
#
# สิ่งที่สคริปต์ทำ:
#   1) kill nest watcher เก่า (ที่ติด stale dist) + เก่า web servers ที่ยังเหลืออยู่
#   2) ลบ dist ของ api ทั้งก้อน (force clean rebuild)
#   3) ลบ .next ของ web (force clean rebuild)
#   4) เริ่ม api ใหม่ port 3001 (ผ่าน nest start --watch)
#   5) build + start web ใหม่ port 8090 (production mode)
#
# วิธีใช้:
#   bash scripts/restart-phase4.sh
#
# หมายเหตุ:
#   - คุณต้องรันสคริปต์นี้จาก Terminal.app ของ macOS เอง (ไม่ใช่ในแชต)
#     เพราะ Cursor agent ไม่มีสิทธิ์ kill process หรือ rm dist
#   - ถ้า port 3001/8090 ถูกครอบครอง ให้ kill ตัวเก่าก่อน (สคริปต์จัดให้แล้ว)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$ROOT/apps/api"
WEB_DIR="$ROOT/apps/web"
WEB_PORT="${WEB_PORT:-8090}"
API_PORT="${API_PORT:-3001}"
WEB_DIST=".next-phase4"

# ---- ใส่ node เข้า PATH ----
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
  echo "❌ หา node ไม่เจอใน PATH — เปิด Terminal ใหม่ที่มี node แล้วลองอีกครั้ง"
  exit 1
fi

NEXT_BIN="$ROOT/node_modules/.bin/next"
NEST_BIN="$ROOT/node_modules/.bin/nest"
if [ ! -x "$NEXT_BIN" ]; then
  echo "❌ ไม่เจอ $NEXT_BIN — รัน pnpm install ก่อน"
  exit 1
fi
if [ ! -x "$NEST_BIN" ]; then
  echo "❌ ไม่เจอ $NEST_BIN — รัน pnpm install ก่อน"
  exit 1
fi

echo "==> Node: $(node -v)"
echo "==> API port: $API_PORT"
echo "==> Web port: $WEB_PORT"
echo ""

# ---- 1) Kill processes เก่าที่ติด ----
echo "==> Killing stale node processes..."
# kill nest watcher (api)
pkill -f "nest start --watch" 2>/dev/null || true
pkill -f "node .*apps/api/dist" 2>/dev/null || true
# kill any next dev / start
pkill -f "next dev" 2>/dev/null || true
pkill -f "next start" 2>/dev/null || true
# free ports
lsof -ti :$API_PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti :$WEB_PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti :3000 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti :3010 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1

# ---- 2) ลบ dist เก่าของ api ----
echo "==> Cleaning $API_DIR/dist ..."
rm -rf "$API_DIR/dist" || true

# ---- 3) ลบ .next ของ web ----
echo "==> Cleaning $WEB_DIR/.next $WEB_DIR/$WEB_DIST ..."
rm -rf "$WEB_DIR/.next" "$WEB_DIR/$WEB_DIST" || true

# ---- 4) เริ่ม api ใหม่ใน background ----
echo "==> Starting api at http://127.0.0.1:$API_PORT (background)"
mkdir -p "$ROOT/.tmp"
(
  cd "$API_DIR"
  API_PORT=$API_PORT nohup "$NEST_BIN" start --watch > "$ROOT/.tmp/api.log" 2>&1 &
  echo $! > "$ROOT/.tmp/api.pid"
)
sleep 5
echo "    api PID: $(cat "$ROOT/.tmp/api.pid" 2>/dev/null || echo unknown)"
echo "    log: tail -f $ROOT/.tmp/api.log"

# ---- 5) build + start web ----
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
echo "      customer: user@np.dev / password123"
echo "      merchant: shop@np.dev / password123"
echo ""
echo "    หน้าใหม่ใน Phase 4:"
echo "      /local                 — ร้านใกล้ฉัน (lat/lng + รัศมี)"
echo "      /local/{shopId}        — เมนู + จองเวลา + ข้อมูลร้าน"
echo "      /merchant/local        — ตั้งค่าหน้าร้านท้องถิ่น"
echo "      /apply-rider           — สมัครเป็น rider"
echo "      /rider/dashboard       — รับงานส่งของ"
echo ""
echo "    Ctrl+C เพื่อหยุด web (api ยังรันใน background — ใช้:"
echo "      kill \$(cat $ROOT/.tmp/api.pid) เพื่อหยุด api)"
echo ""

cd "$WEB_DIR"
NEXT_DIST_DIR="$WEB_DIST" \
  "$NEXT_BIN" start -p "$WEB_PORT"
