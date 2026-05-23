/**
 * Phase 13.1 — Sentry initialization for the API process.
 *
 * Design notes
 * ------------
 * • Called from `main.ts` *before* `NestFactory.create` so unhandled errors
 *   during module bootstrap are captured. Importing `@sentry/node` at module
 *   top-level patches Node globals (http, fetch, etc.) so we keep the import
 *   inside this file rather than littering the rest of the codebase.
 *
 * • DSN comes from `SENTRY_DSN`. When absent, `initSentry()` is a no-op so dev
 *   and CI never need to set the env var. `isSentryEnabled()` lets callers gate
 *   manual `captureException` calls.
 *
 * • We intentionally keep `tracesSampleRate=0` by default. Traces are billable
 *   on Sentry and we can opt in per-deploy with `SENTRY_TRACES_SAMPLE_RATE`.
 *
 * • `release` and `environment` are best-effort: pull from common CI env vars
 *   (Vercel, Fly, Railway, GitHub Actions) so dashboard filters work without
 *   extra wiring.
 */

import * as Sentry from '@sentry/node';

let enabled = false;

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    // eslint-disable-next-line no-console
    console.log('[sentry] SENTRY_DSN not set — error reporting disabled');
    return;
  }
  const env =
    process.env.SENTRY_ENVIRONMENT ??
    process.env.NODE_ENV ??
    'development';
  const release =
    process.env.SENTRY_RELEASE ??
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.FLY_GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    undefined;

  Sentry.init({
    dsn,
    environment: env,
    release,
    tracesSampleRate: Number(
      process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0',
    ),
    // Mask common PII from breadcrumbs before they leave the process. Sentry's
    // server-side scrubbing covers more, but local scrubbing prevents the data
    // from ever leaving our perimeter in the first place.
    beforeSend(event) {
      if (event.request?.headers) {
        for (const key of ['authorization', 'cookie', 'set-cookie']) {
          if (key in event.request.headers) {
            (event.request.headers as Record<string, string>)[key] = '[redacted]';
          }
        }
      }
      return event;
    },
  });
  enabled = true;
  // eslint-disable-next-line no-console
  console.log(
    `[sentry] initialised — env=${env}${release ? ` release=${release.slice(0, 7)}` : ''}`,
  );
}

export function isSentryEnabled(): boolean {
  return enabled;
}

export function captureException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!enabled) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

export function setSentryUser(user: {
  id: string;
  email?: string | null;
  role?: string | null;
}): void {
  if (!enabled) return;
  Sentry.setUser({
    id: user.id,
    email: user.email ?? undefined,
    segment: user.role ?? undefined,
  });
}

export function setSentryRequestContext(reqId: string): void {
  if (!enabled) return;
  Sentry.getCurrentScope().setTag('request_id', reqId);
}

export { Sentry };
