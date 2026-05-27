'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'np-pwa-install-dismissed-at';
const DISMISS_DAYS = 14;

export function InstallPrompt(): JSX.Element | null {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt && Date.now() - Number(dismissedAt) < DISMISS_DAYS * 86400_000) return;

    const handler = (e: Event): void => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!show || !deferred) return null;

  const onInstall = async (): Promise<void> => {
    await deferred.prompt();
    await deferred.userChoice;
    setShow(false);
  };

  const onClose = (): void => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 px-4"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 76px)' }}
    >
      <div className="container-mobile flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-card">
        <div className="flex-1">
          <p className="text-sm font-semibold">ติดตั้ง TuKTuK ลงเครื่อง</p>
          <p className="text-xs text-gray-500">เปิดเร็วขึ้น ใช้แบบแอปได้ทันที</p>
        </div>
        <button onClick={onClose} className="px-2 py-1 text-sm text-gray-500">
          ภายหลัง
        </button>
        <button
          onClick={onInstall}
          className="rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white active:scale-95"
        >
          ติดตั้ง
        </button>
      </div>
    </div>
  );
}
