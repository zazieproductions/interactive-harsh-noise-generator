import { Sheet } from './Sheet';
import type { DeviceProfile } from '../hooks/useDeviceProfile';

export interface MoreSheetProps {
  open: boolean;
  onClose: () => void;
  device: DeviceProfile;
  canInstall: boolean;
  onInstall: () => void;
  onRandomizeSeed: () => void;
  onResetDefaults: () => void;
  onCopyLink: () => void;
  onShareLink: () => void;
  repoUrl: string;
}

export function MoreSheet({
  open,
  onClose,
  device,
  canInstall,
  onInstall,
  onRandomizeSeed,
  onResetDefaults,
  onCopyLink,
  onShareLink,
  repoUrl,
}: MoreSheetProps) {
  const rowClass =
    'w-full min-h-[48px] rounded-xl border border-gray-800 bg-gray-900/60 px-4 text-left text-xs font-bold uppercase tracking-widest text-gray-300 active:scale-[0.99]';

  return (
    <Sheet open={open} onClose={onClose} title="More" subtitle={device.label}>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onRandomizeSeed} className={rowClass}>
          🎲 New seed
        </button>
        <button type="button" onClick={onResetDefaults} className={rowClass}>
          ↺ Reset all
        </button>
        <button type="button" onClick={onCopyLink} className={rowClass}>
          🔗 Copy link
        </button>
        <button type="button" onClick={onShareLink} className={rowClass}>
          📤 Share link
        </button>
      </div>

      {canInstall && (
        <button
          type="button"
          onClick={onInstall}
          className="w-full min-h-[52px] rounded-xl border border-red-800/70 bg-red-950/40 px-4 text-xs font-black uppercase tracking-widest text-red-300 active:scale-[0.99]"
        >
          📲 Install NOISE WALL on this device
        </button>
      )}

      <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-3 text-[11px] text-gray-500 space-y-1.5">
        <p className="text-gray-400 font-mono uppercase tracking-wider text-[10px]">This device</p>
        <p>
          {device.label} · {device.cores} cores
          {device.memoryGb !== null ? ` · ${device.memoryGb} GB RAM` : ''}
        </p>
        <p>
          Comfortable wall length up to{' '}
          <span className="text-gray-300 font-mono">{Math.round(device.safeMaxSeconds / 60)} min</span> at
          44.1 kHz mono. Longer walls still render — the bar just turns amber.
        </p>
        <p>Everything runs locally: no uploads, no accounts, no telemetry.</p>
      </div>

      <a
        href={repoUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="block w-full min-h-[44px] rounded-xl border border-gray-800 bg-gray-900/40 px-4 pt-3.5 text-center text-[11px] font-mono uppercase tracking-widest text-gray-500"
      >
        Source &amp; docs on GitHub ↗
      </a>
    </Sheet>
  );
}
