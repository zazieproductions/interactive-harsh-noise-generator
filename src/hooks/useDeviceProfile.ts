import { useEffect, useState } from 'react';

/**
 * A conservative read on what the current browser/device can reasonably
 * render. NOISE WALL never hard-blocks a length — long walls are a legitimate
 * artistic choice — but the UI uses this to (a) preselect a sane default, (b)
 * flag render sizes that risk a mobile tab reload, and (c) size the visualizer
 * and touch targets appropriately.
 */
export interface DeviceProfile {
  /** Primary pointer is coarse (finger/stylus) — drives the mobile layout. */
  isTouch: boolean;
  /** Viewport is phone/tablet sized or the UA is a mobile UA. */
  isMobile: boolean;
  isIOS: boolean;
  /** Running as an installed home-screen app rather than a browser tab. */
  isStandalone: boolean;
  /** `navigator.hardwareConcurrency`, or 4 when unavailable. */
  cores: number;
  /** `navigator.deviceMemory` in GB (Chromium only) — `null` elsewhere. */
  memoryGb: number | null;
  /** Lengths at or below this render comfortably on this device. */
  safeMaxSeconds: number;
  /** Short human label, e.g. `iPhone · Safari` — shown in the header. */
  label: string;
}

function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPadOS 13+ reports a desktop UA; the touch-point check catches it.
  const iPadDesktopUA = /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadDesktopUA;
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const displayStandalone =
    typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  return iosStandalone || displayStandalone;
}

function detectBrowserName(): string {
  if (typeof navigator === 'undefined') return 'Browser';
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/CriOS\//.test(ua)) return 'Chrome';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Browser';
}

export function getDeviceProfile(): DeviceProfile {
  if (typeof navigator === 'undefined') {
    return {
      isTouch: false,
      isMobile: false,
      isIOS: false,
      isStandalone: false,
      cores: 4,
      memoryGb: null,
      safeMaxSeconds: 600,
      label: 'Browser',
    };
  }

  const isIOS = detectIOS();
  const isTouch = (navigator.maxTouchPoints ?? 0) > 0 || (typeof window !== 'undefined' && 'ontouchstart' in window);
  const narrowViewport = typeof window !== 'undefined' && window.innerWidth < 1024;
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(navigator.userAgent);
  const isMobile = mobileUA || (isTouch && narrowViewport);

  const cores = navigator.hardwareConcurrency || 4;
  const memoryGb =
    typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory === 'number'
      ? ((navigator as Navigator & { deviceMemory?: number }).deviceMemory as number)
      : null;

  // Safari (iOS) does not expose deviceMemory and reloads tabs long before a
  // desktop browser would, so it gets the most conservative budget.
  let safeMaxSeconds: number;
  if (isIOS) {
    safeMaxSeconds = 360;
  } else if (memoryGb !== null) {
    safeMaxSeconds = memoryGb <= 2 ? 120 : memoryGb <= 4 ? 300 : 600;
  } else if (isMobile) {
    safeMaxSeconds = 240;
  } else {
    safeMaxSeconds = 600;
  }
  if (cores <= 2 && safeMaxSeconds > 180) safeMaxSeconds = 180;

  const deviceWord = isIOS ? (window.innerWidth < 900 ? 'iPhone' : 'iPad') : isMobile ? 'Mobile' : 'Desktop';
  return {
    isTouch,
    isMobile,
    isIOS,
    isStandalone: detectStandalone(),
    cores,
    memoryGb,
    safeMaxSeconds,
    label: `${deviceWord} · ${detectBrowserName()}`,
  };
}

/** Tracks orientation/viewport changes so the layout can re-evaluate. */
export function useDeviceProfile(): DeviceProfile {
  const [profile, setProfile] = useState<DeviceProfile>(() => getDeviceProfile());

  useEffect(() => {
    const update = () => setProfile(getDeviceProfile());
    update();
    const mq = window.matchMedia('(pointer: coarse)');
    mq.addEventListener?.('change', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      mq.removeEventListener?.('change', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return profile;
}
