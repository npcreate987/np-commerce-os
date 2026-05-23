import { Controller, Get, Header } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Phase 13.1d — `/v1/metrics` exposes a tiny Prometheus-compatible scrape
 * endpoint. We hand-roll the exposition format (instead of pulling in
 * `prom-client`) because:
 *
 *   1. Our entire job inventory fits in a few counters/gauges.
 *   2. We don't want a second registry to keep in sync with Nest DI.
 *   3. Most hosted scrapers (Grafana Cloud, Uptime Kuma "JSON Query", etc.)
 *      can either parse Prometheus text *or* hit a simple HTTP endpoint —
 *      so this dual-format approach (`Accept: application/json` returns JSON)
 *      covers both worlds.
 *
 * No auth — metrics endpoints are typically scraped from inside the VPC. If
 * this ever needs locking down we can add `AdminGuard` or a path-prefix +
 * Cloudflare WAF rule.
 */

const STARTED_AT = Date.now();

@Controller('metrics')
export class MetricsController {
  constructor(private readonly prisma: PrismaService) {}

  // Prometheus exposition format (text/plain; version=0.0.4)
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async metrics(): Promise<string> {
    const snap = await this.snapshot();
    const lines: string[] = [];
    const m = (
      name: string,
      help: string,
      kind: 'counter' | 'gauge',
      value: number,
      labels?: Record<string, string>,
    ): void => {
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} ${kind}`);
      if (labels && Object.keys(labels).length) {
        const ls = Object.entries(labels)
          .map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`)
          .join(',');
        lines.push(`${name}{${ls}} ${value}`);
      } else {
        lines.push(`${name} ${value}`);
      }
    };

    m('np_process_uptime_seconds', 'API process uptime in seconds', 'gauge', snap.uptimeSec);
    m('np_process_memory_rss_bytes', 'Resident set size in bytes', 'gauge', snap.memRss);
    m('np_process_memory_heap_used_bytes', 'V8 heap used in bytes', 'gauge', snap.memHeap);

    m('np_db_table_rows', 'Approximate row count per audit table', 'gauge', snap.users, { table: 'users' });
    m('np_db_table_rows', 'Approximate row count per audit table', 'gauge', snap.orders, { table: 'orders' });
    m('np_db_table_rows', 'Approximate row count per audit table', 'gauge', snap.products, { table: 'products' });
    m('np_db_table_rows', 'Approximate row count per audit table', 'gauge', snap.videos, { table: 'video_posts' });
    m('np_db_table_rows', 'Approximate row count per audit table', 'gauge', snap.events, { table: 'user_events' });
    m('np_db_table_rows', 'Approximate row count per audit table', 'gauge', snap.uploads, { table: 'storage_uploads' });
    m('np_db_table_rows', 'Approximate row count per audit table', 'gauge', snap.notifLogs, { table: 'notification_logs' });
    m('np_db_table_rows', 'Approximate row count per audit table', 'gauge', snap.nudges, { table: 'proactive_nudges' });

    m('np_notifications_24h', 'Notifications dispatched in the last 24h by status', 'counter', snap.notifSent24h, { status: 'SENT' });
    m('np_notifications_24h', 'Notifications dispatched in the last 24h by status', 'counter', snap.notifFail24h, { status: 'FAIL' });
    m('np_notifications_24h', 'Notifications dispatched in the last 24h by status', 'counter', snap.notifSkip24h, { status: 'SKIPPED' });

    m('np_model_runs_24h', 'AI/ML calls in the last 24h by outcome', 'counter', snap.modelOk24h, { outcome: 'ok' });
    m('np_model_runs_24h', 'AI/ML calls in the last 24h by outcome', 'counter', snap.modelFail24h, { outcome: 'fail' });

    m('np_user_events_24h', 'Behavioural events ingested in the last 24h', 'counter', snap.events24h);
    m('np_proactive_nudges_24h', 'Proactive nudges fired in the last 24h', 'counter', snap.nudges24h);

    return lines.join('\n') + '\n';
  }

  // Same data, JSON shape. Used by simple healthcheck dashboards.
  @Get('json')
  async metricsJson(): Promise<Record<string, number>> {
    return this.snapshot();
  }

  // Centralised query bag so the two endpoints can't drift.
  private async snapshot(): Promise<{
    uptimeSec: number;
    memRss: number;
    memHeap: number;
    users: number;
    orders: number;
    products: number;
    videos: number;
    events: number;
    uploads: number;
    notifLogs: number;
    nudges: number;
    notifSent24h: number;
    notifFail24h: number;
    notifSkip24h: number;
    modelOk24h: number;
    modelFail24h: number;
    events24h: number;
    nudges24h: number;
  }> {
    const mem = process.memoryUsage();
    const num = (rows: unknown): number => {
      const v = (rows as Array<{ n: bigint | number | string }>)?.[0]?.n ?? 0;
      return typeof v === 'bigint' ? Number(v) : Number(v);
    };
    // Each count is wrapped in try/catch — a missing table (e.g. before its
    // bootstrap-phase has run) must NOT take down the metrics endpoint.
    const safeCount = async (sql: string): Promise<number> => {
      try {
        return num(await this.prisma.$queryRawUnsafe(sql));
      } catch {
        return 0;
      }
    };
    const [
      users,
      orders,
      products,
      videos,
      events,
      uploads,
      notifLogs,
      nudges,
      notifSent24h,
      notifFail24h,
      notifSkip24h,
      modelOk24h,
      modelFail24h,
      events24h,
      nudges24h,
    ] = await Promise.all([
      safeCount(`SELECT COUNT(*) AS n FROM users`),
      safeCount(`SELECT COUNT(*) AS n FROM orders`),
      safeCount(`SELECT COUNT(*) AS n FROM products`),
      safeCount(`SELECT COUNT(*) AS n FROM video_posts WHERE status='ACTIVE'`),
      safeCount(`SELECT COUNT(*) AS n FROM user_events`),
      safeCount(`SELECT COUNT(*) AS n FROM storage_uploads`),
      safeCount(`SELECT COUNT(*) AS n FROM notification_logs`),
      safeCount(`SELECT COUNT(*) AS n FROM proactive_nudges`),
      safeCount(
        `SELECT COUNT(*) AS n FROM notification_logs WHERE status='SENT' AND createdAt > datetime('now','-1 day')`,
      ),
      safeCount(
        `SELECT COUNT(*) AS n FROM notification_logs WHERE status='FAIL' AND createdAt > datetime('now','-1 day')`,
      ),
      safeCount(
        `SELECT COUNT(*) AS n FROM notification_logs WHERE status='SKIPPED' AND createdAt > datetime('now','-1 day')`,
      ),
      safeCount(
        `SELECT COUNT(*) AS n FROM model_runs WHERE status='ok' AND createdAt > datetime('now','-1 day')`,
      ),
      safeCount(
        `SELECT COUNT(*) AS n FROM model_runs WHERE status='fail' AND createdAt > datetime('now','-1 day')`,
      ),
      safeCount(
        `SELECT COUNT(*) AS n FROM user_events WHERE ts > datetime('now','-1 day')`,
      ),
      safeCount(
        `SELECT COUNT(*) AS n FROM proactive_nudges WHERE createdAt > datetime('now','-1 day')`,
      ),
    ]);

    return {
      uptimeSec: Math.floor((Date.now() - STARTED_AT) / 1000),
      memRss: mem.rss,
      memHeap: mem.heapUsed,
      users,
      orders,
      products,
      videos,
      events,
      uploads,
      notifLogs,
      nudges,
      notifSent24h,
      notifFail24h,
      notifSkip24h,
      modelOk24h,
      modelFail24h,
      events24h,
      nudges24h,
    };
  }
}
