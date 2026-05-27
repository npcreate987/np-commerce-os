'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlayIcon } from '@/components/icons';
import { isNative } from '@/lib/native';

/**
 * Phase 19.7 — `NativeHomeRedirect`
 *
 * When the Capacitor APK / IPA loads `index.html` (root route) the user
 * sees the marketing landing — but in the native shell they explicitly
 * opened "the app" and expect the video feed first.
 *
 * This client component runs *only* in Capacitor (the `isNative()` helper
 * checks `window.Capacitor?.isNativePlatform()`). On the public web it
 * mounts as a no-op, so the marketing landing keeps working unchanged.
 *
 * UX: while the router is replacing we render a black splash that matches
 * the immersive feed background — prevents the marketing hero flashing on
 * cold start.
 */
export function NativeHomeRedirect(): JSX.Element | null {
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isNative()) return;
    setRedirecting(true);
    // `replace` (not `push`) so the back gesture from /feed doesn't bounce
    // the user into the marketing landing and right back to /feed.
    router.replace('/feed');
  }, [router]);

  if (!redirecting) return null;

  return (
    <div className="fixed inset-0 z-[9999] grid place-items-center bg-black text-white">
      <PlayIcon className="h-10 w-10 animate-pulse opacity-50" />
    </div>
  );
}
