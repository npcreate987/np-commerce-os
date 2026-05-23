/**
 * Browser Web Push helpers — registers a dedicated `sw-push.js` worker on
 * opt-in, then converts the browser-native PushSubscription into the shape
 * the API expects.
 *
 * Capacitor (iOS/Android) does NOT use this path — it uses
 * `@capacitor/push-notifications` to acquire FCM/APNs tokens, then calls
 * `api.notifications.devices.register()` directly. That wiring belongs in
 * the (eventual) native shell, not in here.
 */

/**
 * Decode a base64url-encoded VAPID public key into Uint8Array for the
 * Push API. (PushManager.subscribe requires a Uint8Array, not a string.)
 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    bin += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(bin);
}

export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window))
    return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

async function registerPushWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw-push.js', {
      scope: '/',
    });
    if (reg.installing) {
      await new Promise<void>((resolve) => {
        reg.installing?.addEventListener('statechange', () => {
          if (reg.installing?.state === 'activated') resolve();
        });
      });
    }
    return reg;
  } catch {
    return null;
  }
}

export interface BrowserPushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent: string;
  platform: string;
}

/**
 * Subscribe the current browser to push.
 *   - Asks for Notification permission if needed
 *   - Registers `/sw-push.js`
 *   - Subscribes via PushManager
 *   - Returns the payload ready for `api.notifications.push.subscribe()`
 *
 * Returns `null` if push isn't supported, permission denied, or VAPID
 * public key is empty.
 */
export async function subscribeBrowserPush(
  vapidPublicKey: string,
): Promise<BrowserPushSubscriptionPayload | null> {
  if (!isPushSupported() || !vapidPublicKey) return null;

  const perm = await requestNotificationPermission();
  if (perm !== 'granted') return null;

  const reg = await registerPushWorker();
  if (!reg) return null;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      // Cast through unknown — TS bundles a stricter BufferSource union that
      // doesn't accept Uint8Array<ArrayBufferLike>, but the browser API does.
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          vapidPublicKey,
        ) as unknown as BufferSource,
      });
    } catch {
      return null;
    }
  }

  const p256dh = sub.getKey('p256dh');
  const auth = sub.getKey('auth');
  if (!p256dh || !auth) return null;

  return {
    endpoint: sub.endpoint,
    keys: {
      p256dh: bufToBase64(p256dh),
      auth: bufToBase64(auth),
    },
    userAgent: navigator.userAgent.slice(0, 200),
    platform:
      (navigator as Navigator & { userAgentData?: { platform?: string } })
        .userAgentData?.platform ??
      navigator.platform ??
      'web',
  };
}

/**
 * Unsubscribe locally (caller is responsible for telling the API too).
 */
export async function unsubscribeBrowserPush(): Promise<string | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) {
      const s = await r.pushManager?.getSubscription();
      if (s) {
        const endpoint = s.endpoint;
        await s.unsubscribe();
        return endpoint;
      }
    }
  } catch {
    return null;
  }
  return null;
}
