import { NextResponse } from 'next/server';

// Phase 16 — Static-friendly so `BUILD_STATIC=true next build` (for Capacitor)
// can include this route in the export bundle. In SSR mode this still serves
// fresh each request because static routes are revalidated whenever the
// process starts.
export const dynamic = process.env.BUILD_STATIC === 'true' ? 'force-static' : 'force-dynamic';

export function GET(): NextResponse {
  return NextResponse.json({ status: 'ok' });
}
