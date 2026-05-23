import { PrismaService } from '../prisma/prisma.service';

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Log an AI/ML "run" for visibility (admin dashboard, latency tracking).
 * Failures are swallowed — logging must never break the calling request.
 */
export async function logModelRun(
  prisma: PrismaService,
  kind: string,
  durationMs: number,
  opts: { status?: 'OK' | 'FAIL'; note?: string } = {},
): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO model_runs (id, kind, status, durationMs, note, createdAt)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      newId('run'),
      kind,
      opts.status ?? 'OK',
      Math.max(0, Math.round(durationMs)),
      opts.note ?? null,
    );
  } catch {
    // swallow: telemetry should never break the request
  }
}

/** Wrap any promise to time + log it (returns the original result/throws). */
export async function measured<T>(
  prisma: PrismaService,
  kind: string,
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  try {
    const r = await fn();
    void logModelRun(prisma, kind, Date.now() - t0);
    return r;
  } catch (e) {
    void logModelRun(prisma, kind, Date.now() - t0, {
      status: 'FAIL',
      note: e instanceof Error ? e.message.slice(0, 200) : 'unknown',
    });
    throw e;
  }
}
