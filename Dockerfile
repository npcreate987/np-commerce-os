# syntax=docker/dockerfile:1.7

# Phase 19.2 — Railway Dockerfile escape hatch.
#
# Railway's Railpack/Nixpacks auto-detection keeps trying to build
# apps/web's Next.js (the largest workspace with a `build` script)
# instead of apps/api, even when Custom Build Command is cleared and
# nixpacks.toml is present. The Dockerfile path is honoured
# unconditionally by every Railway builder, so it ends the back-and-
# forth.
#
# Single-stage on purpose:
#   * Image size for an internal API is not a concern (~600 MB is fine
#     on Railway -- it doesn't charge per MB, it charges per running
#     hour of resource use)
#   * Multi-stage adds ~50 lines of COPY plumbing we do not need yet
#   * We can always tighten later in Phase 19.3 once the API is live

FROM node:20-bookworm-slim

# Phase 19.2 — install OpenSSL + ca-certificates explicitly. Bookworm
# ships with OpenSSL 3.0 libraries but the `openssl` CLI is not in
# the slim image, which prevents Prisma from detecting the host's
# OpenSSL version during `prisma generate` (it then falls back to
# the OpenSSL 1.1 query-engine binary and crashes at runtime looking
# for libssl.so.1.1). Pinning ca-certificates also keeps HTTPS
# connections from npm/GitHub/Prisma's CDN working during the build.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      openssl \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Corepack ships with Node 20 but pnpm is not active by default. We
# pin to 9.0.0 to match the root package.json's packageManager field
# byte-for-byte; any drift would invalidate pnpm-lock.yaml hashes.
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copy everything; .dockerignore (added in the same commit) drops
# the noise -- node_modules, .git, dist, web's .next, ios/, android/
# -- so the build context stays small and the cache layer stays
# valid across iterations.
COPY . .

# Install the entire monorepo. apps/api uses `workspace:*` for
# @np/types and @np/config; those references only resolve when the
# whole workspace graph is installed. apps/web's deps are installed
# but its build step is never invoked, so its pre-existing ESLint
# errors don't block us.
RUN pnpm install --frozen-lockfile

# Build the API and only the API. prisma:generate writes the typed
# client into apps/api/node_modules/.prisma. nest build emits
# apps/api/dist/main.js which the start script invokes.
RUN pnpm --filter api prisma:generate
RUN pnpm --filter api build

# Railway injects PORT and the bootstrap reads it via the patch in
# commit 4347458. EXPOSE is documentation only -- Railway uses its
# own networking layer.
EXPOSE 8080

# `pnpm --filter api start` runs the api package's `start` script,
# which is `node dist/main` (production) -- not `nest start --watch`
# (development). The bootstrap then runs runPhase2..13 migrations
# before listen() returns.
CMD ["pnpm", "--filter", "api", "start"]
