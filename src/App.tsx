import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  DEFAULT_PARAMS,
  SAMPLE_RATE,
  buildWaveformPreview,
  generateNoiseWallAsync,
  type NoiseParams,
  type NoiseType,
  type WaveformPreview,
} from './utils/noiseSynth';
import { PRESETS, type Preset } from './presets';
import { estimateRender, formatBytes, formatDuration } from './utils/format';
import { StreamingPlayer } from './utils/streamPlayer';
import { canShareFiles, canStreamToDisk, copyText, saveMP3, saveWAV, shareLink, type SaveOutcome } from './utils/saveFile';
import { buildShareUrl, paramsFromPatch, patchFromLocation, syncLocationHash } from './utils/patchUrl';
import { haptic } from './utils/haptic';
import { useDeviceProfile } from './hooks/useDeviceProfile';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useWakeLock } from './hooks/useWakeLock';
import { Slider } from './components/Slider';
import { Section } from './components/Section';
import { WaveformVisualizer } from './components/WaveformVisualizer';
import { TransportBar, type StatusKind } from './components/TransportBar';
import { SaveSheet } from './components/SaveSheet';
import { MoreSheet } from './components/MoreSheet';
import { InstallHint } from './components/InstallHint';

const REPO_URL = 'https://github.com/zazieproductions/interactive-harsh-noise-generator';

/** Waveform preview resolution — matches the max canvas backing-store width. */
const WAVE_COLUMNS = 1200;

const DURATION_CHIPS = [2, 5, 10, 30, 60, 120, 300, 600];

const NOISE_TYPES: { value: NoiseType; label: string; desc: string }[] = [
  { value: 'white', label: 'White', desc: 'Full spectrum static' },
  { value: 'pink', label: 'Pink', desc: 'Warm mid-heavy' },
  { value: 'brown', label: 'Brown', desc: 'Deep low rumble' },
  { value: 'grey', label: 'Grey', desc: 'Equal-loudness' },
  { value: 'crackling', label: 'Crackling', desc: 'Burst & static' },
  { value: 'digital', label: 'Digital', desc: 'Aliased harsh' },
  { value: 'saturated', label: 'Saturated', desc: 'Pre-mixed dense' },
];

interface Status {
  kind: StatusKind;
  text: string;
}

const OUTCOME_TEXT: Record<SaveOutcome, string> = {
  saved: '✓ Saved',
  downloaded: '✓ Downloaded',
  shared: '✓ Shared',
  cancelled: 'Cancelled',
};

export default function App() {
  const device = useDeviceProfile();
  const { canInstall, install } = useInstallPrompt();

  const [params, setParams] = useState<NoiseParams>(() => paramsFromPatch(patchFromLocation()));
  const [samples, setSamples] = useState<Float32Array | null>(null);
  const [wavePreview, setWavePreview] = useState<WaveformPreview | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState<{ percent: number; stage: string } | null>(null);
  const [encoding, setEncoding] = useState<{ kind: 'wav' | 'mp3'; percent: number } | null>(null);
  const [positionSeconds, setPositionSeconds] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [mp3Bitrate, setMp3Bitrate] = useState(192);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'save' | 'more' | null>(null);
  const [status, setStatus] = useState<Status>(() =>
    patchFromLocation()
      ? { kind: 'info', text: 'Loaded a shared patch — hit Generate to render it' }
      : { kind: 'idle', text: 'Pick a source, set a length, generate' },
  );

  const samplesRef = useRef<Float32Array | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playerRef = useRef<StreamingPlayer | null>(null);
  const playerSamplesRef = useRef<Float32Array | null>(null);
  const genTokenRef = useRef(0);
  const encTokenRef = useRef(0);
  const volumeRef = useRef(volume);
  const positionRef = useRef(0);

  volumeRef.current = volume;
  positionRef.current = positionSeconds;

  const estimate = useMemo(() => estimateRender(params.duration), [params.duration]);
  const heavyForDevice = params.duration > device.safeMaxSeconds;
  const busy = isGenerating || encoding !== null;

  // ─── Audio context ───

  const ensureAudioContext = useCallback((): AudioContext | null => {
    if (audioCtxRef.current) return audioCtxRef.current;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      audioCtxRef.current = new Ctor();
    } catch {
      return null;
    }
    return audioCtxRef.current;
  }, []);

  // iOS/Android both start a context suspended: the first gesture anywhere in
  // the page unlocks it, so the first Play tap is never swallowed.
  useEffect(() => {
    const unlock = () => {
      const ctx = ensureAudioContext();
      if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {});
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('touchend', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('touchend', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [ensureAudioContext]);

  // Coming back from a locked screen / another app: make sure audio is live.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state === 'suspended' && isPlaying) void ctx.resume().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [isPlaying]);

  // Phones sleep after ~30 s; a 10-minute render or a long listen must not.
  useWakeLock(isGenerating || isPlaying || encoding !== null);

  useEffect(() => {
    return () => {
      playerRef.current?.dispose();
      void audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  // Warn before a refresh/close throws away a render in flight.
  useEffect(() => {
    if (!busy) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [busy]);

  // ─── Parameter plumbing ───

  const updateParam = useCallback(<K extends keyof NoiseParams>(key: K, value: NoiseParams[K]) => {
    setParams((prev) => ({ ...prev, [key]: value }));
    // Changing the length never deselects the active preset — presets shape
    // the sound, the duration is independent. Only other parameter edits
    // invalidate the preset.
    if (key !== 'duration') setActivePreset(null);
  }, []);

  // Keep the address bar in sync so refresh and "share link" both work.
  useEffect(() => {
    const timer = window.setTimeout(() => syncLocationHash(params), 250);
    return () => window.clearTimeout(timer);
  }, [params]);

  // ─── Player ───

  const stopPlayback = useCallback((reset = true) => {
    playerRef.current?.stop(reset);
    setIsPlaying(false);
    if (reset) setPositionSeconds(0);
  }, []);

  const ensurePlayer = useCallback(
    (buffer: Float32Array): StreamingPlayer | null => {
      const ctx = ensureAudioContext();
      if (!ctx) return null;
      if (playerRef.current && playerSamplesRef.current === buffer) {
        playerRef.current.setVolume(volumeRef.current);
        return playerRef.current;
      }
      playerRef.current?.dispose();
      const player = new StreamingPlayer({ context: ctx, samples: buffer, volume: volumeRef.current });
      player.onStateChange = (state) => {
        if (state === 'playing') return;
        setIsPlaying(false);
        if (state === 'ended') setPositionSeconds(player.duration);
      };
      playerRef.current = player;
      playerSamplesRef.current = buffer;
      return player;
    },
    [ensureAudioContext],
  );

  const handleTogglePlay = useCallback(() => {
    const buffer = samplesRef.current;
    if (!buffer) return;

    if (isPlaying) {
      const player = playerRef.current;
      if (player) {
        const at = player.position;
        player.stop(true);
        setPositionSeconds(0);
        void at;
      } else {
        setPositionSeconds(0);
      }
      setIsPlaying(false);
      return;
    }

    const player = ensurePlayer(buffer);
    if (!player) {
      setStatus({ kind: 'error', text: 'Web Audio is unavailable in this browser' });
      return;
    }
    player.setVolume(volumeRef.current);
    const resumeAt = positionRef.current >= player.duration - 0.05 ? 0 : positionRef.current;
    player.play(resumeAt);
    setIsPlaying(true);
  }, [ensurePlayer, isPlaying]);

  const handleSeek = useCallback((fraction: number) => {
    const buffer = samplesRef.current;
    if (!buffer) return;
    const seconds = Math.min(1, Math.max(0, fraction)) * (buffer.length / SAMPLE_RATE);
    const player = playerRef.current;
    if (player) {
      player.seek(seconds);
      if (player.state !== 'playing') setPositionSeconds(seconds);
    } else {
      setPositionSeconds(seconds);
    }
  }, []);

  const handleVolume = useCallback((value: number) => {
    setVolume(value);
    playerRef.current?.setVolume(value);
  }, []);

  // Playhead animation (one state update per frame, O(1) work).
  useEffect(() => {
    if (!isPlaying) return;
    let frame = 0;
    const tick = () => {
      const player = playerRef.current;
      if (!player) {
        setIsPlaying(false);
        return;
      }
      setPositionSeconds(player.position);
      if (player.state === 'playing') {
        frame = requestAnimationFrame(tick);
      } else {
        setIsPlaying(false);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying]);

  // ─── Generate ───

  const handleGenerate = useCallback(() => {
    stopPlayback(true);
    const token = ++genTokenRef.current;
    setIsGenerating(true);
    setGenProgress({ percent: 0, stage: 'Warming up' });
    setStatus({ kind: 'busy', text: 'Rendering the wall…' });
    samplesRef.current = null;
    setSamples(null);
    setWavePreview(null);
    playerRef.current?.dispose();
    playerRef.current = null;
    playerSamplesRef.current = null;

    void (async () => {
      try {
        const buffer = await generateNoiseWallAsync(params, (progress) => {
          if (genTokenRef.current === token) setGenProgress(progress);
        });
        if (genTokenRef.current !== token) return;
        const preview = await buildWaveformPreview(buffer, WAVE_COLUMNS);
        if (genTokenRef.current !== token) return;

        samplesRef.current = buffer;
        setSamples(buffer);
        setWavePreview(preview);
        setGenProgress(null);
        setIsGenerating(false);
        setPositionSeconds(0);
        setStatus({
          kind: 'success',
          text: `✓ ${formatDuration(params.duration)} of ${params.noiseType} wall · ${estimate.samplesLabel} samples · ${formatBytes(estimate.renderBytes)}`,
        });
      } catch (error) {
        if (genTokenRef.current !== token) return;
        setGenProgress(null);
        setIsGenerating(false);
        setStatus({ kind: 'error', text: `Error: ${error instanceof Error ? error.message : String(error)}` });
      }
    })();
  }, [estimate.renderBytes, estimate.samplesLabel, params, stopPlayback]);

  // ─── Save / share ───

  const handleSave = useCallback(
    async (kind: 'wav' | 'mp3', preferShare: boolean) => {
      const buffer = samplesRef.current;
      if (!buffer || encoding) return;

      const token = ++encTokenRef.current;
      const filename = `hnw-${params.noiseType}-${params.duration}s-${params.seed}.${kind}`;
      setEncoding({ kind, percent: 0 });
      setStatus({ kind: 'busy', text: `Encoding ${kind.toUpperCase()}…` });
      haptic(10);

      try {
        const options = {
          preferShare,
          title: filename,
          onProgress: (fraction: number) => {
            if (encTokenRef.current === token) setEncoding({ kind, percent: fraction * 100 });
          },
        };
        const outcome =
          kind === 'wav'
            ? await saveWAV(buffer, filename, options)
            : await saveMP3(buffer, mp3Bitrate, filename, options);
        if (encTokenRef.current !== token) return;
        setStatus(
          outcome === 'cancelled'
            ? { kind: 'info', text: 'Export cancelled' }
            : {
                kind: 'success',
                text: `${OUTCOME_TEXT[outcome]} ${filename} (${formatBytes(kind === 'wav' ? estimate.wavBytes : Math.round((mp3Bitrate * 1000 * params.duration) / 8))})`,
              },
        );
      } catch (error) {
        if (encTokenRef.current === token) {
          setStatus({ kind: 'error', text: `Error: ${error instanceof Error ? error.message : String(error)}` });
        }
      } finally {
        if (encTokenRef.current === token) setEncoding(null);
      }
    },
    [encoding, estimate.wavBytes, mp3Bitrate, params.duration, params.noiseType, params.seed],
  );

  const handleCopyLink = useCallback(async () => {
    haptic(8);
    const ok = await copyText(buildShareUrl(params));
    setStatus(
      ok
        ? { kind: 'success', text: '✓ Patch link copied — open it on any device' }
        : { kind: 'error', text: 'Clipboard blocked — long-press the address bar to copy' },
    );
  }, [params]);

  const handleShareLink = useCallback(async () => {
    haptic(8);
    const result = await shareLink(buildShareUrl(params), 'NOISE WALL patch');
    if (result === 'shared') setStatus({ kind: 'success', text: '✓ Patch shared' });
    else if (result === 'copied') setStatus({ kind: 'success', text: '✓ Patch link copied' });
  }, [params]);

  // ─── Presets & resets ───

  const applyPreset = useCallback(
    (preset: Preset) => {
      // Invalidate any in-flight generation so a stale result can't overwrite
      // the freshly loaded preset state.
      genTokenRef.current++;
      stopPlayback(true);
      samplesRef.current = null;
      setSamples(null);
      setWavePreview(null);
      setGenProgress(null);
      setIsGenerating(false);
      setEncoding(null);
      setParams((prev) => ({ ...preset.params, duration: prev.duration }));
      setActivePreset(preset.name);
      haptic(12);
      setStatus({ kind: 'info', text: `${preset.icon} ${preset.name} loaded — keeps ${formatDuration(params.duration)}, hit Generate` });
    },
    [params.duration, stopPlayback],
  );

  const randomizeSeed = useCallback(() => {
    let next = 0;
    try {
      next = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
    } catch {
      next = Math.floor(Math.random() * 1_000_000);
    }
    updateParam('seed', next);
    haptic(8);
  }, [updateParam]);

  const resetDefaults = useCallback(() => {
    genTokenRef.current++;
    stopPlayback(true);
    setParams((prev) => ({ ...DEFAULT_PARAMS, duration: prev.duration }));
    setActivePreset(null);
    setStatus({ kind: 'info', text: 'All controls back to factory defaults' });
  }, [stopPlayback]);

  // ─── Keyboard shortcuts (desktop) ───

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || sheet) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName))) return;
      if (event.code === 'Space') {
        event.preventDefault();
        handleTogglePlay();
      } else if (event.key === 'g' || event.key === 'G') {
        event.preventDefault();
        if (!isGenerating) handleGenerate();
      } else if (event.key === 'r' || event.key === 'R') {
        randomizeSeed();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleGenerate, handleTogglePlay, isGenerating, randomizeSeed, sheet]);

  // ─── Derived render values ───

  const durationOfBuffer = samples ? samples.length / SAMPLE_RATE : params.duration;
  const progress01 = durationOfBuffer > 0 ? Math.min(1, positionSeconds / durationOfBuffer) : 0;
  const canShareFile = useMemo(() => canShareFiles('hnw.mp3', 'audio/mpeg'), []);
  const streamToDisk = useMemo(() => canStreamToDisk(), []);

  return (
    <div className="min-h-dvh bg-[#08080e] text-gray-100 selection:bg-red-900/50">
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[820px] h-[420px] bg-red-900/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-3 sm:px-4 pt-4 pb-[calc(9.5rem+env(safe-area-inset-bottom))] lg:pb-10">
        <header className="mb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-2.5 h-2.5 mt-2 rounded-full bg-red-600 shadow-lg shadow-red-600/50 animate-pulse motion-reduce:animate-none shrink-0" />
              <div className="min-w-0">
                <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tighter leading-none">
                  <span className="bg-gradient-to-b from-white via-gray-200 to-gray-500 bg-clip-text text-transparent">
                    NOISE
                  </span>
                  <span className="bg-gradient-to-b from-red-500 to-red-800 bg-clip-text text-transparent ml-2">
                    WALL
                  </span>
                </h1>
                <p className="text-[9px] sm:text-[10px] font-mono text-gray-600 uppercase tracking-[0.25em] mt-1.5 truncate">
                  Harsh noise wall generator · runs entirely on this device
                </p>
              </div>
            </div>
            <span className="hidden sm:inline-flex shrink-0 items-center gap-1.5 text-[10px] font-mono text-gray-600 border border-gray-800 rounded-full px-2.5 py-1">
              {device.label}
            </span>
          </div>
        </header>

        <InstallHint device={device} canInstall={canInstall} onInstall={() => void install()} />

        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:gap-5">
          {/* ─── Controls ─── */}
          <div className="order-2 lg:order-1 lg:col-span-4 xl:col-span-3 space-y-3">
            <Section title="Noise source" summary={params.noiseType} defaultOpen>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-1.5">
                {NOISE_TYPES.map((type) => {
                  const active = params.noiseType === type.value;
                  return (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => {
                        updateParam('noiseType', type.value);
                        haptic(6);
                      }}
                      aria-pressed={active}
                      className={`min-h-[56px] p-2.5 rounded-lg border text-left transition-all active:scale-[0.98] ${
                        active
                          ? 'border-red-700 bg-red-950/50 shadow-inner shadow-red-900/20'
                          : 'border-gray-800/60 bg-gray-900/20'
                      }`}
                    >
                      <span
                        className={`block text-xs font-bold font-mono ${active ? 'text-red-400' : 'text-gray-300'}`}
                      >
                        {type.label}
                      </span>
                      <span className="block text-[10px] text-gray-600 mt-0.5">{type.desc}</span>
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section
              title="Length"
              summary={formatDuration(params.duration)}
              defaultOpen
              description="Longer walls need more memory and render time. The estimate below is the working set for generate → play → export."
            >
              <Slider
                label="Duration"
                value={params.duration}
                min={2}
                max={600}
                step={1}
                format={(value) => formatDuration(value)}
                onChange={(value) => updateParam('duration', value)}
              />
              <div className="flex flex-wrap gap-1.5">
                {DURATION_CHIPS.map((seconds) => {
                  const active = params.duration === seconds;
                  const heavy = seconds > device.safeMaxSeconds;
                  return (
                    <button
                      key={seconds}
                      type="button"
                      onClick={() => {
                        updateParam('duration', seconds);
                        haptic(6);
                      }}
                      aria-pressed={active}
                      className={`flex-1 min-w-[52px] min-h-[36px] px-1 rounded-lg text-[11px] font-mono transition-colors ${
                        active
                          ? 'bg-red-900/50 text-red-300 border border-red-800'
                          : heavy
                            ? 'bg-amber-950/30 text-amber-600/80 border border-amber-900/40'
                            : 'bg-gray-800/40 text-gray-500 border border-gray-800/40'
                      }`}
                    >
                      {seconds < 60 ? `${seconds}s` : `${seconds / 60}m`}
                    </button>
                  );
                })}
              </div>
              <p className={`text-[10px] font-mono ${heavyForDevice ? 'text-amber-500' : 'text-gray-600'}`}>
                {heavyForDevice
                  ? `Heavy for ${device.label}: ≈ ${formatBytes(estimate.peakBytes)} working set (comfortable up to ${Math.round(
                      device.safeMaxSeconds / 60,
                    )} min). It will still render — chunked, slice by slice.`
                  : `≈ ${formatBytes(estimate.peakBytes)} working set · ${estimate.samplesLabel} samples`}
              </p>
            </Section>

            <Section title="Distortion & density" summary={`${params.distortionAmount}/${params.density}`}>
              <Slider label="Distortion" value={params.distortionAmount} min={0} max={100} onChange={(v) => updateParam('distortionAmount', v)} />
              <Slider label="Density (layers)" value={params.density} min={0} max={100} onChange={(v) => updateParam('density', v)} />
              <Slider label="Feedback" value={params.feedback} min={0} max={100} onChange={(v) => updateParam('feedback', v)} />
              <Slider label="Grit" value={params.grit} min={0} max={100} onChange={(v) => updateParam('grit', v)} />
            </Section>

            <Section title="Filter & modulation" summary={`${Math.round(params.filterFreq)} Hz`}>
              <Slider label="Filter cutoff" value={params.filterFreq} min={100} max={16000} format={(v) => `${v} Hz`} onChange={(v) => updateParam('filterFreq', v)} />
              <Slider label="Resonance" value={params.filterQ} min={0} max={30} step={0.5} onChange={(v) => updateParam('filterQ', v)} />
              <Slider label="LFO rate" value={params.lfoRate} min={0} max={10} step={0.1} unit=" Hz" onChange={(v) => updateParam('lfoRate', v)} />
              <Slider label="LFO depth" value={params.lfoDepth} min={0} max={100} onChange={(v) => updateParam('lfoDepth', v)} />
            </Section>

            <Section title="Texture" summary={`crush ${params.bitcrush} · sub ${params.subBass}`}>
              <Slider label="Bitcrush" value={params.bitcrush} min={0} max={100} onChange={(v) => updateParam('bitcrush', v)} />
              <Slider label="Sub bass" value={params.subBass} min={0} max={100} onChange={(v) => updateParam('subBass', v)} />
            </Section>

            <Section title="Seed" summary={String(params.seed)}>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={params.seed}
                  aria-label="Seed"
                  onChange={(event) => updateParam('seed', parseInt(event.target.value, 10) || 0)}
                  className="flex-1 min-h-[48px] bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 text-base font-mono text-gray-300 focus:outline-none focus:border-red-700 transition-colors"
                />
                <button
                  type="button"
                  onClick={randomizeSeed}
                  className="min-h-[48px] px-4 rounded-lg border border-gray-700/60 bg-gray-800/40 text-xs font-mono text-red-400 uppercase tracking-wider active:scale-[0.98]"
                >
                  🎲 Random
                </button>
              </div>
              <p className="text-[10px] text-gray-600 leading-snug">
                Same seed + same controls = bit-identical wall, on any device.
              </p>
            </Section>
          </div>

          {/* ─── Visualiser, presets, reference ─── */}
          <div className="order-1 lg:order-2 lg:col-span-8 xl:col-span-9 space-y-4">
            <section className="bg-gray-900/40 border border-gray-800/60 rounded-xl p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <h2 className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em]">Waveform</h2>
                <span className="text-[10px] font-mono text-gray-600 truncate">
                  {samples
                    ? `${(samples.length / 1000).toFixed(0)}k samples · 44.1 kHz · 16-bit`
                    : '44.1 kHz mono · not rendered yet'}
                </span>
              </div>

              <WaveformVisualizer
                preview={wavePreview}
                progress={progress01}
                durationSeconds={durationOfBuffer}
                onSeek={samples ? handleSeek : undefined}
                busy={isGenerating}
              />

              <div className="mt-3 flex items-center gap-3">
                <span className="text-gray-500 text-sm shrink-0" aria-hidden="true">
                  🔊
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  aria-label="Playback volume"
                  onChange={(event) => handleVolume(parseFloat(event.target.value))}
                  className="nw-range nw-range-compact flex-1"
                  style={{ '--nw-fill': `${volume * 100}%` } as CSSProperties}
                />
                <span className="text-[10px] font-mono text-gray-500 w-9 text-right tabular-nums">
                  {Math.round(volume * 100)}%
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] font-mono text-gray-600">
                <span>{estimate.samplesLabel} samples</span>
                <span className="text-gray-700">·</span>
                <span>WAV {formatBytes(estimate.wavBytes)}</span>
                <span className="text-gray-700">·</span>
                <span>MP3 ≈ {formatBytes(Math.round((mp3Bitrate * 1000 * params.duration) / 8))}</span>
                <span className="text-gray-700">·</span>
                <span className={heavyForDevice ? 'text-amber-500' : ''}>
                  peak ≈ {formatBytes(estimate.peakBytes)}
                  {heavyForDevice ? ' (heavy)' : ''}
                </span>
              </div>
            </section>

            <section className="bg-gray-900/40 border border-gray-800/60 rounded-xl p-3 sm:p-4">
              <div className="flex items-baseline justify-between gap-2 mb-3">
                <h2 className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em]">Presets</h2>
                <span className="text-[9px] font-mono text-gray-700 text-right">
                  presets set the sound — your length is kept
                </span>
              </div>
              <div className="-mx-3 px-3 flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:snap-none">
                {PRESETS.map((preset) => {
                  const active = activePreset === preset.name;
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      aria-pressed={active}
                      className={`snap-start shrink-0 w-[9.5rem] sm:w-auto min-h-[92px] p-3 rounded-lg border text-left transition-all active:scale-[0.98] ${
                        active ? 'border-red-700 bg-red-950/40' : 'border-gray-800/50 bg-gray-800/20'
                      }`}
                    >
                      <span className="block text-xl mb-1">{preset.icon}</span>
                      <span
                        className={`flex items-center gap-1.5 text-xs font-mono font-bold ${
                          active ? 'text-red-400' : 'text-gray-300'
                        }`}
                      >
                        <span className="truncate">{preset.name}</span>
                      </span>
                      <span className="block text-[10px] text-gray-600 mt-0.5 leading-tight">{preset.desc}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="bg-amber-950/20 border border-amber-900/30 rounded-xl p-3.5 flex items-start gap-3">
              <span className="text-amber-500 text-lg mt-0.5" aria-hidden="true">
                ⚠️
              </span>
              <div>
                <h3 className="text-xs font-bold text-amber-500 mb-1">Volume warning</h3>
                <p className="text-[11px] text-amber-500/60 leading-relaxed">
                  Harsh noise walls contain extreme, sustained dynamic content. Start with the volume low —
                  especially on headphones. A dynamics compressor protects the speakers, not your ears.
                </p>
              </div>
            </div>
          </div>
        </div>

        <footer className="mt-8 text-center text-[10px] text-gray-700 font-mono space-y-1">
          <p>44.1 kHz mono · 16-bit WAV & MP3 export · seeded PRNG for reproducible walls</p>
          <p>Space = play/stop · G = generate · R = new seed</p>
        </footer>
      </div>

      <TransportBar
        isGenerating={isGenerating}
        progress={isGenerating ? (genProgress?.percent ?? 0) : encoding ? encoding.percent : null}
        stage={isGenerating ? (genProgress?.stage ?? 'Rendering') : encoding ? `Encoding ${encoding.kind.toUpperCase()}` : null}
        statusKind={status.kind}
        statusText={status.text}
        hasBuffer={samples !== null}
        isPlaying={isPlaying}
        onGenerate={handleGenerate}
        onTogglePlay={handleTogglePlay}
        onOpenSave={() => setSheet('save')}
        onOpenMore={() => setSheet('more')}
      />

      <SaveSheet
        open={sheet === 'save'}
        onClose={() => setSheet(null)}
        params={params}
        mp3Bitrate={mp3Bitrate}
        onBitrateChange={setMp3Bitrate}
        encoding={encoding}
        onSaveWAV={(preferShare) => void handleSave('wav', preferShare)}
        onSaveMP3={(preferShare) => void handleSave('mp3', preferShare)}
        onCopyLink={() => void handleCopyLink()}
        onShareLink={() => void handleShareLink()}
        canShareFile={canShareFile}
        canStreamToDisk={streamToDisk}
      />

      <MoreSheet
        open={sheet === 'more'}
        onClose={() => setSheet(null)}
        device={device}
        canInstall={canInstall}
        onInstall={() => void install()}
        onRandomizeSeed={randomizeSeed}
        onResetDefaults={resetDefaults}
        onCopyLink={() => void handleCopyLink()}
        onShareLink={() => void handleShareLink()}
        repoUrl={REPO_URL}
      />
    </div>
  );
}
