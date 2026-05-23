#!/usr/bin/env bash
# Start NP Commerce OS web (Phase 3) บนพอร์ตใหม่ 8090
# โดยไม่ต้อง kill server เก่า — build แยกไปอยู่ .next-phase3
#
# วิธีใช้:
#   bash scripts/restart-web.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB_DIR="$ROOT/apps/web"
PORT="${WEB_PORT:-8090}"
DIST=".next-phase3"

# หา binary ของ next/node โดยไม่พึ่ง pnpm ใน PATH
NEXT_BIN="$ROOT/node_modules/.bin/next"
if [ ! -x "$NEXT_BIN" ]; then
  echo "❌ ไม่เจอ $NEXT_BIN — ต้อง pnpm install ก่อน"
  exit 1
fi

# ใส่ node เข้า PATH ถ้ายังไม่มี
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
  echo "❌ หา node ไม่เจอ — ติดตั้ง node ก่อน หรือเปิด terminal ที่มี node อยู่"
  exit 1
fi

echo "==> Node: $(node -v) ($(command -v node))"
echo "==> Next: $NEXT_BIN"
echo ""

cd "$WEB_DIR"

echo "==> Building web → $DIST/ (อันเก่าที่ .next ไม่ถูกแตะ)"
NEXT_DIST_DIR="$DIST" \
NODE_OPTIONS=--max-old-space-size=4096 \
NEXT_TELEMETRY_DISABLED=1 \
DISABLE_PWA=true \
  "$NEXT_BIN" build --no-lint

echo ""
echo "==> Starting web at http://127.0.0.1:$PORT"
echo "    Login ทดสอบ:"
echo "      customer: user@np.dev / password123  (เป็น Creator demo)"
echo "      merchant: shop@np.dev / password123"
echo "    กด Ctrl+C เพื่อหยุดเซิร์ฟเวอร์"
echo ""

NEXT_DIST_DIR="$DIST" \
  "$NEXT_BIN" start -p "$PORT"
