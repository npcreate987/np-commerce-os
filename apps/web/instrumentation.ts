/**
 * Phase 13.1b — Next.js instrumentation hook.
 *
 * Runs once per process (server + edge runtimes), BEFORE any route handler.
 * We use it to wire Sentry conditionally so dev/CI without a DSN are no-ops.
 *
 * Note: Browser-side Sentry is initialised separately in `sentry.client.config.ts`
 * because the Next.js convention auto-loads that file at the root of the app
 * dir during the build.
 */

export async function register(): Promise<void> {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;
  if (!dsn) return;

  const release =
    process.env.SENTRY_RELEASE ??
    process.env.NEXT_PUBLIC_SENTRY_RELEASE ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    undefined;
  const environment =
    process.env.SENTRY_ENVIRONMENT ??
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
    process.env.NODE_ENV ??
    'development';

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({
      dsn,
      environment,
      release,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0'),
      // The web app is a thin BFF — most errors are render bugs or fetch
      // failures. We send those raw without sampling.
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({
      dsn,
      environment,
      release,
      tracesSampleRate: 0,
    });
  }
}
