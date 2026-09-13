import { Sheet } from './Sheet';
import { formatBytes, estimateRender, formatDuration } from '../utils/format';
import type { NoiseParams } from '../utils/noiseSynth';

export interface SaveSheetProps {
  open: boolean;
  onClose: () => void;
  params: NoiseParams;
  mp3Bitrate: number;
  onBitrateChange: (kbps: number) => void;
  encoding: { kind: 'wav' | 'mp3'; percent: number } | null;
  onSaveWAV: (preferShare: boolean) => void;
  onSaveMP3: (preferShare: boolean) => void;
  onCopyLink: () => void;
  onShareLink: () => void;
  canShareFile: boolean;
  canStreamToDisk: boolean;
}

const MP3_BITRATES = [128, 192, 256, 320];

export function SaveSheet({
  open,
  onClose,
  params,
  mp3Bitrate,
  onBitrateChange,
  encoding,
  onSaveWAV,
  onSaveMP3,
  onCopyLink,
  onShareLink,
  canShareFile,
  canStreamToDisk,
}: SaveSheetProps) {
  const estimate = estimateRender(params.duration);
  const mp3Bytes = Math.round((mp3Bitrate * 1000 * params.duration) / 8);
  const busy = encoding !== null;
  const baseName = `hnw-${params.noiseType}-${params.duration}s-${params.seed}`;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Save the wall"
      subtitle={`${formatDuration(params.duration)} · 44.1 kHz mono · ${estimate.samplesLabel} samples`}
    >
      <button
        type="button"
        disabled={busy}
        onClick={() => onSaveWAV(false)}
        className={`w-full min-h-[56px] rounded-xl border border-blue-700/60 bg-blue-900/20 text-blue-200 px-4 flex items-center justify-between transition-all active:scale-[0.99] ${
          busy ? 'opacity-50 cursor-wait' : ''
        }`}
      >
        <span className="text-left">
          <span className="block text-sm font-black uppercase tracking-widest">
            {encoding?.kind === 'wav' ? `Encoding… ${Math.round(encoding.percent)}%` : 'Save .WAV'}
          </span>
          <span className="block text-[11px] text-blue-300/70 mt-0.5">
            16-bit PCM, lossless · {formatBytes(estimate.wavBytes)}
          </span>
        </span>
        <span className="text-lg">⬇</span>
      </button>

      <div className="rounded-xl border border-purple-700/50 bg-purple-900/15 p-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => onSaveMP3(false)}
          className={`w-full min-h-[48px] rounded-lg bg-purple-900/30 px-4 flex items-center justify-between transition-all active:scale-[0.99] ${
            busy ? 'opacity-50 cursor-wait' : ''
          }`}
        >
          <span className="text-left">
            <span className="block text-sm font-black uppercase tracking-widest text-purple-200">
              {encoding?.kind === 'mp3' ? `Encoding… ${Math.round(encoding.percent)}%` : 'Save .MP3'}
            </span>
            <span className="block text-[11px] text-purple-300/70 mt-0.5">
              {mp3Bitrate} kbps · ≈ {formatBytes(mp3Bytes)}
            </span>
          </span>
          <span className="text-lg text-purple-200">⬇</span>
        </button>
        <div className="flex items-center gap-2 mt-3">
          <span className="text-[10px] font-mono uppercase tracking-wider text-purple-300/70">Bitrate</span>
          <div className="flex gap-1.5 flex-1">
            {MP3_BITRATES.map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => onBitrateChange(rate)}
                aria-pressed={mp3Bitrate === rate}
                className={`flex-1 min-h-[36px] rounded-lg text-[11px] font-mono transition-colors ${
                  mp3Bitrate === rate
                    ? 'bg-purple-800/60 text-purple-100 border border-purple-600/60'
                    : 'bg-gray-800/50 text-gray-400 border border-gray-800'
                }`}
              >
                {rate}k
              </button>
            ))}
          </div>
        </div>
      </div>

      {canShareFile && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onSaveMP3(true)}
          className={`w-full min-h-[48px] rounded-xl border border-gray-700 bg-gray-800/40 text-gray-300 text-xs font-bold uppercase tracking-widest ${
            busy ? 'opacity-50' : 'active:scale-[0.99]'
          }`}
        >
          Share a file… (Files, AirDrop, DAW)
        </button>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          onClick={onCopyLink}
          className="min-h-[48px] rounded-xl border border-gray-800 bg-gray-900/60 text-gray-400 text-[11px] font-bold uppercase tracking-wider active:scale-[0.99]"
        >
          🔗 Copy patch link
        </button>
        <button
          type="button"
          onClick={onShareLink}
          className="min-h-[48px] rounded-xl border border-gray-800 bg-gray-900/60 text-gray-400 text-[11px] font-bold uppercase tracking-wider active:scale-[0.99]"
        >
          📤 Share patch
        </button>
      </div>

      <p className="text-[10px] text-gray-600 leading-relaxed pt-1">
        {canStreamToDisk
          ? 'This browser streams the export straight to the file you pick — memory use stays flat even for 10-minute walls.'
          : 'The export is encoded in slices and handed to your browser, so nothing is uploaded and the UI stays responsive.'}{' '}
        Patch link: <span className="text-gray-500 break-all">{baseName}</span> rides along with
        seed and every control.
      </p>
    </Sheet>
  );
}
