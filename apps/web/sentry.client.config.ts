/**
 * Phase 13.1b — Browser-side Sentry init.
 *
 * Auto-loaded by `@sentry/nextjs` at app bootstrap. Conditional on
 * `NEXT_PUBLIC_SENTRY_DSN`; safely no-ops in dev/CI without the env var.
 *
 * We keep `tracesSampleRate=0` by default — performance traces from real users
 * are billable per-event and the marginal insight isn't worth the cost yet.
 * Bump via `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` when investigating perf.
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
      process.env.NODE_ENV ??
      'development',
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    tracesSampleRate: Number(
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0',
    ),
    // Browser-only: capture replays only for events that actually error.
    // Disabled for now (replays require @sentry/replay and bandwidth budget).
    replaysOnErrorSampleRate: 0,
    replaysSessionSampleRate: 0,
  });
}
