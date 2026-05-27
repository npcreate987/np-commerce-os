import { Controller, Get } from '@nestjs/common';

/**
 * Capture process start time at module-load. Stays constant for the
 * lifetime of THIS Node process — invaluable for proving "did the
 * server actually restart?" from outside (e.g. via CI smoke tests
 * after a deploy).
 *
 * If `bootedAt` in the response is BEFORE the time of the last commit
 * push, the new code has NOT taken effect yet (Railway is still
 * building or queued). If it's AFTER, the new code is live and you
 * can compare expected behaviour against it.
 */
const BOOTED_AT = new Date().toISOString();

@Controller('health')
export class HealthController {
  @Get()
  ok(): { status: string; ts: string; bootedAt: string; uptimeSec: number } {
    return {
      status: 'ok',
      ts: new Date().toISOString(),
      bootedAt: BOOTED_AT,
      uptimeSec: Math.round(process.uptime()),
    };
  }
}
