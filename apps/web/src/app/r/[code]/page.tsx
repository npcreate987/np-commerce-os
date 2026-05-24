/**
 * Phase 18 — Static-export shim for OTA bundle.
 *
 * Next.js `output: 'export'` requires every dynamic leaf segment to
 * enumerate its params at build time via `generateStaticParams()`.
 * For an OTA bundle that ships in a Capacitor WebView and uses
 * client-side routing exclusively, the static HTML at "`/_`" is never
 * actually loaded — the placeholder exists only to satisfy the
 * exporter. Real navigation happens via React/Next.js Link components
 * and the underlying `page.client.tsx` reads the param at runtime
 * via `useParams()`.
 *
 * Adding new IDs at runtime works because Capacitor never round-trips
 * to a static file — the WebView keeps the initial JS context and
 * reroutes in-memory.
 */
import ClientPage from './page.client';

export function generateStaticParams() {
  return [{ code: '_' }];
}

export default function Page() {
  return <ClientPage />;
}
