import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ModelRunRecent, ModelRunSummary } from '../../shared/types';

@Injectable()
export class AiOpsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Per-kind summary over last 7 days + 24h counts + p95 + fail rate.
   * SQLite has no percentile_cont, so we compute p95 in JS from the rows.
   */
  async summary(): Promise<ModelRunSummary[]> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT kind, status, durationMs, createdAt
       FROM model_runs
       WHERE createdAt >= datetime('now', '-7 days')
       ORDER BY kind, createdAt DESC
       LIMIT 50000`,
    )) as Array<{
      kind: string;
      status: 'OK' | 'FAIL';
      durationMs: number;
      createdAt: string;
    }>;

    const dayCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const grouped = new Map<string, typeof rows>();
    for (const r of rows) {
      let list = grouped.get(r.kind);
      if (!list) {
        list = [];
        grouped.set(r.kind, list);
      }
      list.push(r);
    }

    const out: ModelRunSummary[] = [];
    for (const [kind, list] of grouped) {
      const durations = list.map((r) => r.durationMs).sort((a, b) => a - b);
      const fails = list.filter((r) => r.status === 'FAIL').length;
      const sum = durations.reduce((s, x) => s + x, 0);
      const avg = durations.length ? sum / durations.length : 0;
      const p95Idx = Math.min(
        durations.length - 1,
        Math.floor(durations.length * 0.95),
      );
      const p95 = durations.length ? durations[p95Idx] : 0;
      const runs24h = list.filter((r) => r.createdAt >= dayCutoff).length;
      const lastRunAt = list[0]?.createdAt ?? null;
      out.push({
        kind,
        runs24h,
        runs7d: list.length,
        avgMs: Math.round(avg * 10) / 10,
        p95Ms: p95,
        failRate: list.length ? fails / list.length : 0,
        lastRunAt,
      });
    }

    // Sort by activity (most runs first)
    out.sort((a, b) => b.runs7d - a.runs7d);
    return out;
  }

  async recent(limit = 50): Promise<ModelRunRecent[]> {
    const safe = Math.max(1, Math.min(limit, 200));
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, kind, status, durationMs, note, createdAt
       FROM model_runs
       ORDER BY createdAt DESC
       LIMIT ?`,
      safe,
    )) as Array<{
      id: string;
      kind: string;
      status: 'OK' | 'FAIL';
      durationMs: number;
      note: string | null;
      createdAt: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      status: r.status,
      durationMs: r.durationMs,
      note: r.note,
      createdAt: r.createdAt,
    }));
  }
}
