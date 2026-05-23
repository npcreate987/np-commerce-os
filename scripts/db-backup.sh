#!/usr/bin/env bash
# Phase 13.2a — Database backup script.
#
# Supports the two database flavours np-commerce-os uses:
#   • SQLite (dev / current workspace)  → file copy via .backup
#   • PostgreSQL (production target)    → pg_dump (custom format, compressed)
#
# Flavour is auto-detected from DATABASE_URL. Override with --pg / --sqlite.
#
# Optional R2/S3 upload: set BACKUP_S3_BUCKET (+ existing S3_* env vars used by
# the API) and we'll upload the dump via the AWS CLI if it's on PATH.
#
# Suggested cron entry (production, daily 02:15 UTC, retain 30 days):
#   15 2 * * *  /app/scripts/db-backup.sh >> /var/log/np-backup.log 2>&1
#
# Exit codes
#   0 — backup written successfully
#   1 — config error (missing DATABASE_URL / tools)
#   2 — backup tool failed
#   3 — upload failed (local file is still written)
#
# Idempotent: file name includes ISO8601 timestamp so two runs in the same
# minute won't clobber each other.

set -euo pipefail

if [ -f "${1:-}" ]; then
  # First arg is an env file path → load it. Supports `--env-file path` too.
  # shellcheck disable=SC1090
  set -a; source "$1"; set +a
elif [ "${1:-}" = "--env-file" ] && [ -n "${2:-}" ]; then
  # shellcheck disable=SC1090
  set -a; source "$2"; set +a
fi

DATABASE_URL="${DATABASE_URL:-}"
if [ -z "$DATABASE_URL" ]; then
  echo "[backup] DATABASE_URL not set" >&2
  exit 1
fi

# Auto-detect driver. Allow explicit override via env (`BACKUP_DRIVER=pg|sqlite`)
# so we don't trust the URL alone when callers use weird connection strings.
DRIVER="${BACKUP_DRIVER:-}"
if [ -z "$DRIVER" ]; then
  case "$DATABASE_URL" in
    file:*|sqlite:*)        DRIVER="sqlite" ;;
    postgres://*|postgresql://*) DRIVER="pg" ;;
    *)
      echo "[backup] cannot detect driver from DATABASE_URL — set BACKUP_DRIVER=pg|sqlite" >&2
      exit 1
      ;;
  esac
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$OUT_DIR"

case "$DRIVER" in
  sqlite)
    # `file:./prisma/dev.db` → `./prisma/dev.db`
    SRC="${DATABASE_URL#file:}"
    if [ ! -f "$SRC" ]; then
      echo "[backup] sqlite source not found: $SRC" >&2
      exit 2
    fi
    OUT="$OUT_DIR/np-sqlite-$STAMP.db"
    # Use `.backup` to get a consistent snapshot even if the API is writing.
    sqlite3 "$SRC" ".backup '$OUT'" || { echo "[backup] sqlite3 .backup failed" >&2; exit 2; }
    gzip -f "$OUT"
    OUT="$OUT.gz"
    ;;
  pg)
    if ! command -v pg_dump >/dev/null 2>&1; then
      echo "[backup] pg_dump not found on PATH (install postgresql-client)" >&2
      exit 1
    fi
    OUT="$OUT_DIR/np-pg-$STAMP.dump"
    # Custom format (-Fc) → restorable with `pg_restore`, internally compressed.
    pg_dump --format=custom --no-owner --no-acl --file="$OUT" "$DATABASE_URL" \
      || { echo "[backup] pg_dump failed" >&2; exit 2; }
    ;;
  *)
    echo "[backup] unknown driver: $DRIVER" >&2
    exit 1
    ;;
esac

BYTES=$(wc -c < "$OUT" | tr -d ' ')
echo "[backup] wrote $OUT ($BYTES bytes)"

# Optional R2/S3 upload via AWS CLI (works with R2 — set S3_ENDPOINT &
# AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY env vars, or pre-configure profile).
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  if ! command -v aws >/dev/null 2>&1; then
    echo "[backup] BACKUP_S3_BUCKET set but aws CLI missing — install awscli to enable upload" >&2
    exit 3
  fi
  REMOTE_KEY="${BACKUP_S3_PREFIX:-db-backups}/$(basename "$OUT")"
  ENDPOINT_FLAG=""
  if [ -n "${S3_ENDPOINT:-}" ]; then
    ENDPOINT_FLAG="--endpoint-url $S3_ENDPOINT"
  fi
  # shellcheck disable=SC2086
  aws s3 cp "$OUT" "s3://$BACKUP_S3_BUCKET/$REMOTE_KEY" $ENDPOINT_FLAG \
    || { echo "[backup] upload failed (local copy at $OUT preserved)" >&2; exit 3; }
  echo "[backup] uploaded → s3://$BACKUP_S3_BUCKET/$REMOTE_KEY"
fi

# Best-effort retention: keep last N local copies (default 30).
KEEP="${BACKUP_LOCAL_RETAIN:-30}"
case "$DRIVER" in
  sqlite) PATTERN="np-sqlite-*.db.gz" ;;
  pg)     PATTERN="np-pg-*.dump" ;;
esac
# shellcheck disable=SC2010
ls -1t "$OUT_DIR"/$PATTERN 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -I {} rm -f {} || true

echo "[backup] done"
