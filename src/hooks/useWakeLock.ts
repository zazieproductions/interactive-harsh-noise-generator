import { useEffect, useRef } from 'react';

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

/**
 * Keeps the screen awake while a long render/playback/export is in flight.
 *
 * Phones sleep after ~30 s of no input; a 10-minute render on a phone quietly
 * stalls behind a locked screen (and on iOS the tab can be suspended mid
 * render). Screen Wake Lock is supported in Chrome/Edge/Android and iOS
 * Safari 16.4+; everywhere else this is a no-op.
 */
export function useWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    if (!active) return;
    const wakeLock = (
      navigator as Navigator & {
        wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
      }
    ).wakeLock;

    if (!wakeLock?.request) return;

    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible' || sentinelRef.current) return;
      try {
        const sentinel = await wakeLock.request('screen');
        if (cancelled) {
          void sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
        sentinel.addEventListener('release', () => {
          sentinelRef.current = null;
        });
      } catch {
        // Denied (low battery, permission policy) — rendering still works.
      }
    };

    void acquire();

    // The lock is dropped automatically whenever the page is hidden; the
    // browser only lets us re-acquire once it is visible again.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => {});
    };
  }, [active]);
}
