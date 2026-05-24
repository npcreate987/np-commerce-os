import 'reflect-metadata';
import 'dotenv/config';
// Sentry must be imported FIRST so its OpenTelemetry-style monkey-patching of
// node:http and node:fetch happens before any other module wires those globals.
import { initSentry, setSentryRequestContext } from './common/observability/sentry';
initSentry();
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaClient } from '@prisma/client';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/exceptions/all-exceptions.filter';
import { runPhase2Migration } from './bootstrap-phase2';
import { runPhase3Migration } from './bootstrap-phase3';
import { runPhase4Migration } from './bootstrap-phase4';
import { runPhase5Migration } from './bootstrap-phase5';
import { runPhase6Migration } from './bootstrap-phase6';
import { runPhase7Migration } from './bootstrap-phase7';
import { runPhase8Migration } from './bootstrap-phase8';
import { runPhase9Migration } from './bootstrap-phase9';
import { runPhase9_2Migration } from './bootstrap-phase9-2';
import { runPhase9_3Migration } from './bootstrap-phase9-3';
import { runPhase10Migration } from './bootstrap-phase10';
import { runPhase10_2Migration } from './bootstrap-phase10-2';
import { runPhase10_3Migration } from './bootstrap-phase10-3';
import { runPhase12Migration } from './bootstrap-phase12';
import { runPhase12_2Migration } from './bootstrap-phase12-2';
import { runPhase13Migration } from './bootstrap-phase13';

const LAN_REGEX =
  /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

function isDevOrigin(origin: string): boolean {
  return (
    LAN_REGEX.test(origin) ||
    origin === 'capacitor://localhost' ||
    origin === 'http://localhost' ||
    origin === 'https://localhost' ||
    origin.startsWith('capacitor://') ||
    origin.startsWith('ionic://')
  );
}

async function bootstrap(): Promise<void> {
  // Phase 2..12: runtime DB migration (idempotent).
  // Behaviour on failure depends on `STRICT_MIGRATIONS`:
  //   - true  (default in prod) → process.exit(1) so an orchestrator restarts
  //   - false (dev default)     → log and continue (legacy behaviour)
  // The strict default in production matters because previously a failed
  // migration could leave the API up with missing tables, returning 500s
  // forever without alerting.
  {
    const p = new PrismaClient();
    const strict =
      (process.env.STRICT_MIGRATIONS ?? (process.env.NODE_ENV === 'production' ? 'true' : 'false'))
        .toLowerCase() === 'true';
    // Phase 19.2 -- SKIP_BOOTSTRAP_MIGRATIONS gate.
    //
    // The 16 runPhase*Migration files were authored against a SQLite
    // schema and use SQLite-only constructs (PRAGMA table_info, JSON
    // stored as TEXT with sqlite-flavoured defaults, etc.). When we
    // switched the datasource to Postgres for Railway deployment they
    // started crashing the boot. Until each one is ported individually,
    // an opt-in environment flag (default OFF in production) lets us
    // skip them entirely. Prisma migrate deploy already creates the
    // base schema from the migrations/ folder; the runPhase* files
    // were always meant to be idempotent incremental patches on top.
    //
    // To re-enable: set SKIP_BOOTSTRAP_MIGRATIONS=false on Railway
    // *after* each runPhase file has been ported and tested against a
    // Postgres database.
    const skip =
      (process.env.SKIP_BOOTSTRAP_MIGRATIONS ?? 'true').toLowerCase() === 'true';
    if (skip) {
      // eslint-disable-next-line no-console
      console.log(
        '[bootstrap] SKIP_BOOTSTRAP_MIGRATIONS=true -- ' +
          'skipping runPhase2..13 (legacy SQLite-shaped migrations).',
      );
      await p.$disconnect().catch(() => {});
    } else {
      try {
        await runPhase2Migration(p);
        await runPhase3Migration(p);
        await runPhase4Migration(p);
        await runPhase5Migration(p);
        await runPhase6Migration(p);
        await runPhase7Migration(p);
        await runPhase8Migration(p);
        await runPhase9Migration(p);
        await runPhase9_2Migration(p);
        await runPhase9_3Migration(p);
        await runPhase10Migration(p);
        await runPhase10_2Migration(p);
        await runPhase10_3Migration(p);
        // Phase 12 = demo seed for the TikTok-style /feed reel (idempotent)
        await runPhase12Migration(p);
        // Phase 12.2 = video moderation (reports + admin queue)
        await runPhase12_2Migration(p);
        // Phase 13 = production hardening tables (refresh_tokens, …)
        await runPhase13Migration(p);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[bootstrap] migration failed:', e);
        if (strict) {
          // eslint-disable-next-line no-console
          console.error('[bootstrap] STRICT_MIGRATIONS=true → exiting');
          await p.$disconnect().catch(() => {});
          process.exit(1);
        }
      } finally {
        await p.$disconnect();
      }
    }
  }

  const adapter = new FastifyAdapter({
    logger: true,
    trustProxy: true,
    // Use incoming `x-request-id` if present (set by Vercel/Cloudflare/etc.)
    // so requests can be correlated across proxy layers; otherwise mint a UUID
    // so every line in our access log has a stable, unique handle. This is the
    // *only* place we generate request IDs; everything downstream reads it
    // from `req.id`.
    genReqId: (req: { headers: Record<string, string | string[] | undefined> }): string => {
      const incoming = req.headers['x-request-id'];
      if (typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 200) {
        return incoming;
      }
      return randomUUID();
    },
  });
  const explicitOrigins = process.env.WEB_ORIGIN?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const resolveOrigin = (origin: string | undefined): string | false => {
    if (!origin) return '*';
    if (explicitOrigins?.length) return explicitOrigins.includes(origin) ? origin : false;
    return isDevOrigin(origin) ? origin : false;
  };

  // Short-circuit ALL preflight (OPTIONS) responses at the Fastify level BEFORE
  // Nest's not-found handler ever sees them. Also attaches CORS headers to every
  // response (incl. error responses from Nest).
  const fastify = adapter.getInstance() as unknown as {
    addHook: (name: string, fn: (req: any, reply: any, done?: any) => void) => void;
    addContentTypeParser: (
      type: string,
      opts: Record<string, unknown>,
      parser: (
        req: unknown,
        body: string | Buffer,
        done: (err: Error | null, parsed?: unknown) => void,
      ) => void,
    ) => void;
  };

  // Phase 19 — Capture the raw JSON body so HMAC webhook receivers
  // (live-updates `POST /webhook`) can verify the signature byte-for-byte.
  // Fastify's default JSON parser drops the original bytes after parsing,
  // which makes signature verification impossible without re-serializing
  // (and re-serializing diverges from what the signer hashed when keys
  // get re-ordered or whitespace differs). Override the JSON parser to
  // (a) capture the raw string on `req.rawBody`, (b) JSON.parse normally.
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req: any, body: string | Buffer, done) => {
      const text = typeof body === 'string' ? body : body.toString('utf8');
      try {
        const parsed = text.length > 0 ? JSON.parse(text) : {};
        req.rawBody = text;
        done(null, parsed);
      } catch (err) {
        done(err as Error);
      }
    },
  );

  // 1) Short-circuit OPTIONS preflight before Nest router
  fastify.addHook('onRequest', (req: any, reply: any, done: any) => {
    if (req.method !== 'OPTIONS') return done();
    const origin = req.headers.origin as string | undefined;
    const allow = resolveOrigin(origin);
    if (allow === false) {
      reply.code(403).send();
      return;
    }
    reply
      .header('access-control-allow-origin', allow)
      .header('vary', 'Origin')
      .header('access-control-allow-credentials', 'true')
      .header('access-control-allow-methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS')
      .header(
        'access-control-allow-headers',
        req.headers['access-control-request-headers'] ||
          'Content-Type, Authorization, X-Requested-With',
      )
      .header('access-control-max-age', '86400')
      .code(204)
      .send();
  });

  // 2) Attach CORS headers to every non-OPTIONS response (incl. Nest errors).
  //    Also echo `x-request-id` so the browser/devtools/curl can show the same
  //    handle the server logs use — invaluable when a user pastes a screenshot
  //    of a failure and we need to find the matching log line.
  (fastify as any).addHook('onSend', (req: any, reply: any, _payload: any, done: any) => {
    if (req.id) reply.header('x-request-id', req.id);
    const origin = req.headers.origin as string | undefined;
    if (!origin) return done();
    const allow = resolveOrigin(origin);
    if (allow === false) return done();
    reply.header('access-control-allow-origin', allow);
    reply.header('vary', 'Origin');
    reply.header('access-control-allow-credentials', 'true');
    done();
  });

  // 3) Tag every request scope on Sentry with its request ID so unhandled
  //    errors are searchable by the same handle that appears in our logs and
  //    the response header.
  fastify.addHook('onRequest', (req: any, _reply: any, done: any) => {
    if (req.id) setSentryRequestContext(req.id);
    done();
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter);

  app.setGlobalPrefix('v1');
  app.useGlobalFilters(new AllExceptionsFilter());

  // Phase 13.3a — Global throttler. The guard is a *no-op* on routes that
  // don't carry `@Throttle({...})` metadata, so it costs us a Reflector lookup
  // per request and nothing else. Endpoints opt in by decorator.
  const reflector = app.get('Reflector' as any);
  // Falls back to constructing it manually if DI doesn't expose 'Reflector'
  // under that token (older Nest versions used a different name).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Reflector } = await import('@nestjs/core');
  const { ThrottleGuard } = await import('./common/throttle/throttler');
  app.useGlobalGuards(new ThrottleGuard(reflector ?? new Reflector()));

  // Port resolution priority:
  //   1. PORT             — Railway / Heroku / Fly / Render / Vercel
  //                         platform-injected variable. ALL of them set
  //                         this; the app must honour it or healthchecks
  //                         hitting the platform-allocated port fail.
  //   2. API_PORT         — legacy local-dev variable we used before any
  //                         hosting (kept so existing .env files still
  //                         work without changes).
  //   3. 3001             — last-resort default for `pnpm dev` with no
  //                         env file at all.
  //
  // Number(undefined) is NaN, Number('') is 0, and Number('${{ PORT }}')
  // is also NaN — all three would cause `app.listen(NaN, ...)` to bind a
  // random port. Guard against that explicitly: if the parsed value is
  // not a finite integer, fall through to the next source.
  const parsePort = (raw: string | undefined): number | null => {
    if (!raw) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 && n < 65536 ? n : null;
  };
  const port =
    parsePort(process.env.PORT) ??
    parsePort(process.env.API_PORT) ??
    3001;
  await app.listen(port, '0.0.0.0');

  const url = await app.getUrl();
  // eslint-disable-next-line no-console
  console.log(`[api] ready at ${url}`);
}

void bootstrap();
// touch: 2026-05-22T21:35 — phase10.3-proactive-surfaces

