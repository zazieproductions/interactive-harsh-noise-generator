import { haptic } from '../utils/haptic';

export type StatusKind = 'idle' | 'info' | 'busy' | 'success' | 'error';

export interface TransportBarProps {
  isGenerating: boolean;
  /** 0–100 while something is in flight, otherwise null. */
  progress: number | null;
  stage: string | null;
  statusKind: StatusKind;
  statusText: string;
  hasBuffer: boolean;
  isPlaying: boolean;
  onGenerate: () => void;
  onTogglePlay: () => void;
  onOpenSave: () => void;
  onOpenMore: () => void;
}

const STATUS_COLOR: Record<StatusKind, string> = {
  idle: 'text-gray-500',
  info: 'text-gray-400',
  busy: 'text-amber-400',
  success: 'text-emerald-400',
  error: 'text-red-400',
};

/**
 * The always-reachable control strip.
 *
 * On a phone the generate button used to live at the bottom of a long scroll —
 * you had to hunt for it after every tweak. This bar is pinned to the bottom
 * edge (above the safe area), so Generate / Play / Save are one thumb-tap away
 * no matter where the page happens to be scrolled.
 */
export function TransportBar({
  isGenerating,
  progress,
  stage,
  statusKind,
  statusText,
  hasBuffer,
  isPlaying,
  onGenerate,
  onTogglePlay,
  onOpenSave,
  onOpenMore,
}: TransportBarProps) {
  const busy = isGenerating || (progress !== null && progress < 100);

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 border-t border-gray-800/70 bg-[#08080e]/95 backdrop-blur-md">
      {/* Progress rail */}
      <div className="h-1 w-full bg-gray-900 overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r from-red-900 via-red-600 to-red-400 transition-[width] duration-200 ease-linear ${
            busy ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ width: `${busy ? Math.max(2, progress ?? 0) : 0}%` }}
        />
      </div>

      <div className="px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] max-w-7xl mx-auto">
        <div
          className="flex items-center gap-2 h-4 mb-1.5 text-[11px] font-mono truncate"
          role="status"
          aria-live="polite"
        >
          {busy && stage ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse motion-reduce:animate-none shrink-0" />
              <span className="text-amber-400/90 truncate">
                {stage} · {Math.round(progress ?? 0)}%
              </span>
            </>
          ) : (
            <>
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  statusKind === 'success'
                    ? 'bg-emerald-500'
                    : statusKind === 'error'
                      ? 'bg-red-500'
                      : statusKind === 'busy'
                        ? 'bg-amber-400 animate-pulse motion-reduce:animate-none'
                        : 'bg-gray-700'
                }`}
              />
              <span className={`truncate ${STATUS_COLOR[statusKind]}`}>{statusText || 'Ready'}</span>
            </>
          )}
        </div>

        <div className="flex items-stretch gap-2">
          <button
            type="button"
            onClick={() => {
              haptic(12);
              onGenerate();
            }}
            disabled={isGenerating}
            className={`flex-1 min-h-[52px] rounded-xl font-black text-sm tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${
              isGenerating
                ? 'bg-gray-800 text-gray-600 cursor-wait'
                : 'bg-gradient-to-r from-red-800 via-red-700 to-red-800 text-white shadow-lg shadow-red-900/40 active:scale-[0.98]'
            }`}
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin h-4 w-4 motion-reduce:animate-none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Rendering
              </>
            ) : (
              '⚡ Generate'
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              haptic(10);
              onTogglePlay();
            }}
            disabled={!hasBuffer}
            aria-label={isPlaying ? 'Stop playback' : 'Play preview'}
            className={`min-w-[68px] min-h-[52px] px-3 rounded-xl border font-bold text-xs tracking-wider uppercase transition-all grid place-items-center gap-0.5 ${
              !hasBuffer
                ? 'border-gray-800 text-gray-700 cursor-not-allowed'
                : isPlaying
                  ? 'border-amber-600/70 bg-amber-900/20 text-amber-400 active:scale-[0.98]'
                  : 'border-emerald-600/70 bg-emerald-900/20 text-emerald-400 active:scale-[0.98]'
            }`}
          >
            <span className="text-base leading-none">{isPlaying ? '⏹' : '▶'}</span>
            <span>{isPlaying ? 'Stop' : 'Play'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              haptic(10);
              onOpenSave();
            }}
            disabled={!hasBuffer}
            aria-label="Save or share"
            className={`min-w-[68px] min-h-[52px] px-3 rounded-xl border font-bold text-xs tracking-wider uppercase transition-all grid place-items-center gap-0.5 ${
              !hasBuffer
                ? 'border-gray-800 text-gray-700 cursor-not-allowed'
                : 'border-blue-700/60 bg-blue-900/15 text-blue-300 active:scale-[0.98]'
            }`}
          >
            <span className="text-base leading-none">⬇</span>
            <span>Save</span>
          </button>

          <button
            type="button"
            onClick={() => {
              haptic(8);
              onOpenMore();
            }}
            aria-label="More actions"
            className="min-w-[52px] min-h-[52px] rounded-xl border border-gray-800 bg-gray-900/60 text-gray-400 text-lg font-bold active:scale-[0.98]"
          >
            ⋯
          </button>
        </div>
      </div>
    </div>
  );
}
