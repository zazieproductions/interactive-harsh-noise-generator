import { useEffect, useState } from 'react';
import type { DeviceProfile } from '../hooks/useDeviceProfile';

const DISMISS_KEY = 'nw-install-hint-dismissed';

export interface InstallHintProps {
  device: DeviceProfile;
  canInstall: boolean;
  onInstall: () => void;
}

/**
 * One-time nudge toward a home-screen install.
 *
 * Installed, the app launches fullscreen with no browser chrome, keeps working
 * offline, and — on iOS — stops competing with the Safari tab that the OS is
 * most eager to reclaim during a long render.
 */
export function InstallHint({ device, canInstall, onInstall }: InstallHintProps) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode — the hint just reappears next session */
    }
  };

  if (dismissed || device.isStandalone || !device.isMobile) return null;

  return (
    <div className="mb-3 rounded-xl border border-red-900/40 bg-red-950/20 p-3 flex items-start gap-3">
      <span className="text-lg leading-none mt-0.5">📲</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-red-300">
          Install it on your phone for the full-screen, offline version
        </p>
        <p className="text-[11px] text-red-200/60 mt-1 leading-snug">
          {canInstall
            ? 'One tap adds NOISE WALL to your home screen — no browser bars, works with no signal.'
            : device.isIOS
              ? 'In Safari: tap Share ⬆, then “Add to Home Screen”.'
              : 'Open your browser menu and choose “Add to Home screen”.'}
        </p>
        {canInstall && (
          <button
            type="button"
            onClick={() => {
              onInstall();
              dismiss();
            }}
            className="mt-2 min-h-[40px] px-4 rounded-lg bg-red-800 text-white text-[11px] font-black uppercase tracking-widest active:scale-[0.98]"
          >
            Install app
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 w-8 h-8 -mr-1 -mt-1 grid place-items-center rounded-lg text-red-300/60 text-lg leading-none"
      >
        ✕
      </button>
    </div>
  );
}
