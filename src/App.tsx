import { useState, useRef, useCallback, useEffect } from 'react';
import {
  generateNoiseWall,
  type NoiseParams,
  type NoiseType,
  SAMPLE_RATE,
  DEFAULT_PARAMS,
} from './utils/noiseSynth';
import { encodeWAV, encodeMP3, downloadBuffer } from './utils/audioEncoder';

// ─── Constants ───

const NOISE_TYPES: { value: NoiseType; label: string; desc: string }[] = [
  { value: 'white', label: 'White', desc: 'Full spectrum static' },
  { value: 'pink', label: 'Pink', desc: 'Warm mid-heavy' },
  { value: 'brown', label: 'Brown', desc: 'Deep low rumble' },
  { value: 'grey', label: 'Grey', desc: 'Equal-loudness' },
  { value: 'crackling', label: 'Crackling', desc: 'Burst & static' },
  { value: 'digital', label: 'Digital', desc: 'Aliased harsh' },
  { value: 'saturated', label: 'Saturated', desc: 'Pre-mixed dense' },
];

interface Preset {
  name: string;
  icon: string;
  desc: string;
  params: NoiseParams;
}

const PRESETS: Preset[] = [
  {
    name: 'Classic HNW',
    icon: '🧱',
    desc: 'Dense white noise wall, Merzbow-style',
    params: {
      duration: 30,
      noiseType: 'white',
      distortionAmount: 85,
      density: 90,
      feedback: 65,
      lfoRate: 0.2,
      lfoDepth: 15,
      filterFreq: 4000,
      filterQ: 3,
      bitcrush: 8,
      subBass: 45,
      grit: 75,
      seed: 42,
    },
  },
  {
    name: 'Static Crush',
    icon: '📺',
    desc: 'TV static through broken amp',
    params: {
      duration: 20,
      noiseType: 'digital',
      distortionAmount: 90,
      density: 80,
      feedback: 70,
      lfoRate: 0.5,
      lfoDepth: 25,
      filterFreq: 5000,
      filterQ: 5,
      bitcrush: 35,
      subBass: 30,
      grit: 85,
      seed: 137,
    },
  },
  {
    name: 'Deep Rumble',
    icon: '🕳️',
    desc: 'Low-frequency grinding wall',
    params: {
      duration: 30,
      noiseType: 'brown',
      distortionAmount: 75,
      density: 95,
      feedback: 80,
      lfoRate: 0.1,
      lfoDepth: 40,
      filterFreq: 800,
      filterQ: 8,
      bitcrush: 0,
      subBass: 90,
      grit: 50,
      seed: 999,
    },
  },
  {
    name: 'Concrete Mixer',
    icon: '🏗️',
    desc: 'Thick mid-range industrial grind',
    params: {
      duration: 20,
      noiseType: 'saturated',
      distortionAmount: 92,
      density: 100,
      feedback: 55,
      lfoRate: 0.3,
      lfoDepth: 10,
      filterFreq: 2500,
      filterQ: 4,
      bitcrush: 12,
      subBass: 60,
      grit: 90,
      seed: 666,
    },
  },
  {
    name: 'Warm Hiss',
    icon: '🔥',
    desc: 'Pink noise driven into saturation',
    params: {
      duration: 30,
      noiseType: 'pink',
      distortionAmount: 70,
      density: 85,
      feedback: 50,
      lfoRate: 0.4,
      lfoDepth: 30,
      filterFreq: 3500,
      filterQ: 2,
      bitcrush: 5,
      subBass: 55,
      grit: 60,
      seed: 777,
    },
  },
  {
    name: 'Bit Rot',
    icon: '👾',
    desc: 'Heavily crushed digital decay',
    params: {
      duration: 15,
      noiseType: 'grey',
      distortionAmount: 80,
      density: 75,
      feedback: 45,
      lfoRate: 1.5,
      lfoDepth: 50,
      filterFreq: 3000,
      filterQ: 6,
      bitcrush: 65,
      subBass: 25,
      grit: 80,
      seed: 404,
    },
  },
  {
    name: 'Crackle Storm',
    icon: '⚡',
    desc: 'Bursting crackle through distortion',
    params: {
      duration: 20,
      noiseType: 'crackling',
      distortionAmount: 88,
      density: 70,
      feedback: 75,
      lfoRate: 0.7,
      lfoDepth: 35,
      filterFreq: 4500,
      filterQ: 3,
      bitcrush: 20,
      subBass: 40,
      grit: 70,
      seed: 321,
    },
  },
  {
    name: 'Total Wall',
    icon: '☢️',
    desc: 'Maximum density, maximum everything',
    params: {
      duration: 30,
      noiseType: 'saturated',
      distortionAmount: 100,
      density: 100,
      feedback: 85,
      lfoRate: 0.15,
      lfoDepth: 8,
      filterFreq: 6000,
      filterQ: 2,
      bitcrush: 25,
      subBass: 80,
      grit: 100,
      seed: 0,
    },
  },
];

// ─── Components ───

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, step = 1, unit = '', onChange }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center">
        <label className="text-xs font-mono text-gray-400 uppercase tracking-wider">{label}</label>
        <span className="text-xs font-mono text-red-400 tabular-nums bg-red-950/40 px-2 py-0.5 rounded">
          {value.toFixed(step < 1 ? 1 : 0)}{unit}
        </span>
      </div>
      <div className="relative h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-900 to-red-600 rounded-full"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
}

function WaveformVisualizer({
  buffer,
  playProgress,
}: {
  buffer: Float32Array | null;
  playProgress: number; // 0 to 1
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#06060c';
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = '#111122';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 8; i++) {
      const y = (h / 8) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Center line
    ctx.strokeStyle = '#1a1a3a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    if (!buffer || buffer.length === 0) {
      // Empty state
      ctx.fillStyle = '#222';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Generate noise to see waveform', w / 2, h / 2);
      return;
    }

    // Draw waveform as min/max density bars
    const samplesPerPixel = Math.max(1, Math.floor(buffer.length / w));

    for (let x = 0; x < w; x++) {
      const startIdx = Math.floor((x / w) * buffer.length);
      let mn = buffer[startIdx];
      let mx = buffer[startIdx];
      for (let j = 1; j < samplesPerPixel && startIdx + j < buffer.length; j++) {
        const s = buffer[startIdx + j];
        if (s < mn) mn = s;
        if (s > mx) mx = s;
      }

      const yMin = h - ((mn + 1) / 2) * h;
      const yMax = h - ((mx + 1) / 2) * h;
      const barHeight = Math.max(1, yMin - yMax);

      // Color based on play position
      const played = x / w < playProgress;
      if (played) {
        ctx.fillStyle = 'rgba(220, 38, 38, 0.7)';
      } else {
        ctx.fillStyle = 'rgba(220, 38, 38, 0.25)';
      }
      ctx.fillRect(x, yMax, 1, barHeight);
    }

    // Playhead
    if (playProgress > 0 && playProgress < 1) {
      const px = Math.floor(playProgress * w);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#ff0000';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let y = 0; y < h; y += 2) {
      ctx.fillRect(0, y, w, 1);
    }
  }, [buffer, playProgress]);

  return (
    <canvas
      ref={canvasRef}
      width={1200}
      height={280}
      className="w-full h-44 md:h-56 rounded-lg border border-gray-800/60"
    />
  );
}

// ─── Main App ───

export default function App() {
  const [params, setParams] = useState<NoiseParams>({ ...DEFAULT_PARAMS });
  const [generatedBuffer, setGeneratedBuffer] = useState<Float32Array | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [playProgress, setPlayProgress] = useState(0);
  const [mp3Bitrate, setMp3Bitrate] = useState(192);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.5);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const playStartRef = useRef(0);
  const animFrameRef = useRef(0);

  const updateParam = useCallback(<K extends keyof NoiseParams>(key: K, value: NoiseParams[K]) => {
    setParams((prev) => ({ ...prev, [key]: value }));
    setActivePreset(null);
  }, []);

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

  // ─── Playback Stop Utility ───

  const stopPlayback = useCallback(() => {
    if (sourceRef.current) {
      const source = sourceRef.current;
      sourceRef.current = null;
      try {
        source.stop();
      } catch {}
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    setIsPlaying(false);
    setPlayProgress(0);
  }, []);

  // ─── Generate ───

  const handleGenerate = useCallback(() => {
    // Stop playback first
    stopPlayback();
    setIsGenerating(true);
    setGeneratedBuffer(null);
    setStatusMsg('Generating noise layers...');

    // Offload to next tick so UI updates
    setTimeout(() => {
      try {
        const buffer = generateNoiseWall(params);
        setGeneratedBuffer(buffer);
        setStatusMsg(
          `✓ ${formatDuration(params.duration)} of ${params.noiseType} noise wall (${(buffer.length / 1000).toFixed(0)}k samples)`
        );
      } catch (err) {
        setStatusMsg(`Error: ${err}`);
      }
      setIsGenerating(false);
    }, 60);
  }, [params, stopPlayback]);

  const handlePlay = useCallback(async () => {
    if (!generatedBuffer) return;
    if (isPlaying) {
      stopPlayback();
      return;
    }

    // AudioContext initialization
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = audioCtxRef.current || new AudioContextClass();
    audioCtxRef.current = ctx;

    // Handle autoplay restrictions - resume context if suspended
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    try {
      const audioBuf = ctx.createBuffer(1, generatedBuffer.length, SAMPLE_RATE);
      audioBuf.getChannelData(0).set(generatedBuffer);

      const source = ctx.createBufferSource();
      source.buffer = audioBuf;

      const gain = ctx.createGain();
      gain.gain.value = volume;
      gainRef.current = gain;

      // Compressor for speaker safety
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.ratio.value = 12;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;

      source.connect(gain);
      gain.connect(comp);
      comp.connect(ctx.destination);

      source.onended = () => {
        // Only mark finished if we didn't stop it manually
        if (sourceRef.current === source) {
          setIsPlaying(false);
          setPlayProgress(1);
          if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
          sourceRef.current = null;
        }
      };

      source.start();
      sourceRef.current = source;
      playStartRef.current = ctx.currentTime;
      setIsPlaying(true);

      // Animate progress
      const totalDuration = generatedBuffer.length / SAMPLE_RATE;
      const tick = () => {
        const elapsed = ctx.currentTime - playStartRef.current;
        setPlayProgress(Math.min(elapsed / totalDuration, 1));
        if (elapsed < totalDuration && sourceRef.current === source) {
          animFrameRef.current = requestAnimationFrame(tick);
        }
      };
      animFrameRef.current = requestAnimationFrame(tick);
    } catch (e) {
      console.error('Playback failed:', e);
      setStatusMsg(`Playback error: ${e instanceof Error ? e.message : String(e)}`);
      setIsPlaying(false);
    }
  }, [generatedBuffer, isPlaying, volume, stopPlayback]);

  // Volume changes during playback
  useEffect(() => {
    if (gainRef.current) {
      gainRef.current.gain.value = volume;
    }
  }, [volume]);

  // Cleanup
  useEffect(() => {
    return () => {
      stopPlayback();
      audioCtxRef.current?.close();
    };
  }, [stopPlayback]);

  // ─── Downloads ───

  const handleDownloadWAV = useCallback(() => {
    if (!generatedBuffer) return;
    setStatusMsg('Encoding WAV...');
    setTimeout(() => {
      const wav = encodeWAV(generatedBuffer);
      downloadBuffer(wav, `hnw-${params.noiseType}-${params.duration}s-${params.seed}.wav`, 'audio/wav');
      setStatusMsg(`✓ WAV downloaded (${(wav.byteLength / 1024 / 1024).toFixed(1)} MB)`);
    }, 30);
  }, [generatedBuffer, params]);

  const handleDownloadMP3 = useCallback(() => {
    if (!generatedBuffer) return;
    setStatusMsg('Encoding MP3...');
    setTimeout(() => {
      const mp3 = encodeMP3(generatedBuffer, mp3Bitrate);
      downloadBuffer(mp3, `hnw-${params.noiseType}-${params.duration}s-${params.seed}.mp3`, 'audio/mpeg');
      setStatusMsg(`✓ MP3 downloaded (${(mp3.byteLength / 1024 / 1024).toFixed(1)} MB)`);
    }, 30);
  }, [generatedBuffer, params, mp3Bitrate]);

  // ─── Apply preset ───

  const applyPreset = useCallback((preset: Preset) => {
    stopPlayback();
    setGeneratedBuffer(null);
    setParams({ ...preset.params });
    setActivePreset(preset.name);
    setStatusMsg(`Loaded preset: ${preset.name}`);
  }, [stopPlayback]);

  // ─── Render ───

  return (
    <div className="min-h-screen bg-[#08080e] text-gray-100 selection:bg-red-900/50">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-red-900/8 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 py-6 md:py-10">
        {/* Header */}
        <header className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-full bg-red-600 animate-pulse shadow-lg shadow-red-600/50" />
            <span className="text-[10px] font-mono text-gray-600 uppercase tracking-[0.3em]">
              Harsh Noise Wall Generator
            </span>
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-none">
            <span className="bg-gradient-to-b from-white via-gray-200 to-gray-500 bg-clip-text text-transparent">
              NOISE
            </span>
            <span className="bg-gradient-to-b from-red-500 to-red-800 bg-clip-text text-transparent ml-3">
              WALL
            </span>
          </h1>
        </header>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* ─── Left: Controls ─── */}
          <div className="lg:col-span-4 xl:col-span-3 space-y-4">
            {/* Noise Type Selector */}
            <section className="bg-gray-900/40 border border-gray-800/60 rounded-xl p-4">
              <h3 className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em] mb-3">
                Noise Source
              </h3>
              <div className="grid grid-cols-2 gap-1.5">
                {NOISE_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => updateParam('noiseType', t.value)}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      params.noiseType === t.value
                        ? 'border-red-700 bg-red-950/50 shadow-inner shadow-red-900/20'
                        : 'border-gray-800/60 bg-gray-900/20 hover:border-gray-700 hover:bg-gray-800/30'
                    }`}
                  >
                    <div className={`text-xs font-bold font-mono ${
                      params.noiseType === t.value ? 'text-red-400' : 'text-gray-300'
                    }`}>
                      {t.label}
                    </div>
                    <div className="text-[10px] text-gray-600 mt-0.5">{t.desc}</div>
                  </button>
                ))}
              </div>
            </section>

            {/* Duration */}
            <section className="bg-gray-900/40 border border-gray-800/60 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em]">
                  Duration
                </h3>
                <span className="text-sm font-mono font-bold text-white">
                  {formatDuration(params.duration)}
                </span>
              </div>
              <Slider
                label=""
                value={params.duration}
                min={2}
                max={600}
                step={1}
                unit="s"
                onChange={(v) => updateParam('duration', v)}
              />
              <div className="flex gap-1.5 mt-2">
                {[2, 5, 10, 30, 60, 120, 300, 600].map((d) => (
                  <button
                    key={d}
                    onClick={() => updateParam('duration', d)}
                    className={`flex-1 py-1 text-[10px] font-mono rounded transition-colors ${
                      params.duration === d
                        ? 'bg-red-900/50 text-red-400 border border-red-800'
                        : 'bg-gray-800/40 text-gray-500 border border-gray-800/40 hover:text-gray-400'
                    }`}
                  >
                    {d < 60 ? `${d}s` : `${d / 60}m`}
                  </button>
                ))}
              </div>
            </section>

            {/* Core */}
            <section className="bg-gray-900/40 border border-gray-800/60 rounded-xl p-4 space-y-3">
              <h3 className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em]">
                Distortion & Density
              </h3>
              <Slider label="Distortion" value={params.distortionAmount} min={0} max={100} onChange={(v) => updateParam('distortionAmount', v)} />
              <Slider label="Density (layers)" value={params.density} min={0} max={100} onChange={(v) => updateParam('density', v)} />
              <Slider label="Feedback" value={params.feedback} min={0} max={100} onChange={(v) => updateParam('feedback', v)} />
              <Slider label="Grit" value={params.grit} min={0} max={100} onChange={(v) => updateParam('grit', v)} />
            </section>

            {/* Filter & Modulation */}
            <section className="bg-gray-900/40 border border-gray-800/60 rounded-xl p-4 space-y-3">
              <h3 className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em]">
                Filter & Modulation
              </h3>
              <Slider label="Filter Cutoff" value={params.filterFreq} min={100} max={16000} unit=" Hz" onChange={(v) => updateParam('filterFreq', v)} />
              <Slider label="Resonance" value={params.filterQ} min={0} max={30} step={0.5} onChange={(v) => updateParam('filterQ', v)} />
              <Slider label="LFO Rate" value={params.lfoRate} min={0} max={10} step={0.1} unit=" Hz" onChange={(v) => updateParam('lfoRate', v)} />
              <Slider label="LFO Depth" value={params.lfoDepth} min={0} max={100} onChange={(v) => updateParam('lfoDepth', v)} />
            </section>

            {/* Texture */}
            <section className="bg-gray-900/40 border border-gray-800/60 rounded-xl p-4 space-y-3">
              <h3 className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em]">
                Texture
              </h3>
              <Slider label="Bitcrush" value={params.bitcrush} min={0} max={100} onChange={(v) => updateParam('bitcrush', v)} />
              <Slider label="Sub Bass" value={params.subBass} min={0} max={100} onChange={(v) => updateParam('subBass', v)} />
            </section>

            {/* Seed */}
            <section className="bg-gray-900/40 border border-gray-800/60 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em]">
                  Seed
                </h3>
                <button
                  onClick={() => updateParam('seed', Math.floor(Math.random() * 999999))}
                  className="text-[10px] text-red-500/70 hover:text-red-400 font-mono transition-colors uppercase tracking-wider"
                >
                  🎲 Random
                </button>
              </div>
              <input
                type="number"
                value={params.seed}
                onChange={(e) => updateParam('seed', parseInt(e.target.value) || 0)}
                className="w-full bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm font-mono text-gray-300 focus:outline-none focus:border-red-700 transition-colors"
              />
            </section>
          </div>

          {/* ─── Right: Visualizer + Actions ─── */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-4">
            {/* Waveform */}
            <section className="bg-gray-900/40 border border-gray-800/60 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em]">
                  Waveform
                </h3>
                {generatedBuffer && (
                  <span className="text-[10px] font-mono text-gray-600">
                    {(generatedBuffer.length / 1000).toFixed(0)}k samples &bull; {SAMPLE_RATE}Hz &bull; 16-bit
                  </span>
                )}
              </div>
              <WaveformVisualizer buffer={generatedBuffer} playProgress={playProgress} />
            </section>

            {/* Controls bar */}
            <section className="bg-gray-900/40 border border-gray-800/60 rounded-xl p-4 space-y-4">
              {/* Status */}
              {statusMsg && (
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    isGenerating ? 'bg-yellow-500 animate-pulse' : statusMsg.startsWith('✓') ? 'bg-green-500' : 'bg-gray-500'
                  }`} />
                  <span className={`text-xs font-mono ${
                    isGenerating ? 'text-yellow-400' : statusMsg.startsWith('✓') ? 'text-green-400' : 'text-gray-400'
                  }`}>
                    {statusMsg}
                  </span>
                </div>
              )}

              {/* Generate */}
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className={`w-full py-4 rounded-xl font-black text-base tracking-widest uppercase transition-all ${
                  isGenerating
                    ? 'bg-gray-800 text-gray-600 cursor-wait'
                    : 'bg-gradient-to-r from-red-800 via-red-700 to-red-800 hover:from-red-700 hover:via-red-600 hover:to-red-700 text-white shadow-lg shadow-red-900/40 active:scale-[0.99]'
                }`}
              >
                {isGenerating ? (
                  <span className="flex items-center justify-center gap-3">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Generating…
                  </span>
                ) : (
                  `⚡ Generate ${formatDuration(params.duration)} Noise Wall`
                )}
              </button>

              {/* Playback + Volume */}
              {generatedBuffer && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={handlePlay}
                    className={`py-3 rounded-xl font-bold text-sm tracking-wider uppercase transition-all border ${
                      isPlaying
                        ? 'bg-amber-900/20 border-amber-600/70 text-amber-400 hover:bg-amber-900/30'
                        : 'bg-emerald-900/20 border-emerald-600/70 text-emerald-400 hover:bg-emerald-900/30'
                    }`}
                  >
                    {isPlaying ? '⏹ Stop Playback' : '▶ Play Preview'}
                  </button>
                  <div className="flex items-center gap-3 bg-gray-800/30 rounded-xl px-4 border border-gray-800/40">
                    <span className="text-gray-500 text-xs shrink-0">🔊</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                    />
                    <span className="text-[10px] font-mono text-gray-500 w-8 text-right tabular-nums">
                      {Math.round(volume * 100)}%
                    </span>
                  </div>
                </div>
              )}

              {/* Download */}
              {generatedBuffer && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={handleDownloadWAV}
                    className="py-3 rounded-xl font-bold text-sm tracking-wider uppercase bg-blue-900/15 border border-blue-700/50 text-blue-400 hover:bg-blue-900/25 transition-all"
                  >
                    ⬇ Download .WAV
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDownloadMP3}
                      className="flex-1 py-3 rounded-xl font-bold text-sm tracking-wider uppercase bg-purple-900/15 border border-purple-700/50 text-purple-400 hover:bg-purple-900/25 transition-all"
                    >
                      ⬇ Download .MP3
                    </button>
                    <select
                      value={mp3Bitrate}
                      onChange={(e) => setMp3Bitrate(parseInt(e.target.value))}
                      className="bg-gray-800/60 border border-gray-700/50 rounded-xl text-xs font-mono text-gray-400 px-2 focus:outline-none focus:border-purple-700 cursor-pointer"
                    >
                      <option value={128}>128k</option>
                      <option value={192}>192k</option>
                      <option value={256}>256k</option>
                      <option value={320}>320k</option>
                    </select>
                  </div>
                </div>
              )}
            </section>

            {/* Presets */}
            <section className="bg-gray-900/40 border border-gray-800/60 rounded-xl p-4">
              <h3 className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em] mb-3">
                Presets
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => applyPreset(preset)}
                    className={`p-3 rounded-lg border text-left transition-all group ${
                      activePreset === preset.name
                        ? 'border-red-700 bg-red-950/40'
                        : 'border-gray-800/50 bg-gray-800/20 hover:border-red-900/60 hover:bg-red-950/15'
                    }`}
                  >
                    <div className="text-xl mb-1.5">{preset.icon}</div>
                    <div className={`text-xs font-mono font-bold ${
                      activePreset === preset.name ? 'text-red-400' : 'text-gray-300 group-hover:text-red-400'
                    } transition-colors`}>
                      {preset.name}
                    </div>
                    <div className="text-[10px] text-gray-600 mt-0.5 leading-tight">
                      {preset.desc}
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* Warning */}
            <div className="bg-amber-950/20 border border-amber-900/30 rounded-xl p-4 flex items-start gap-3">
              <span className="text-amber-500 text-lg mt-0.5">⚠️</span>
              <div>
                <h4 className="text-xs font-bold text-amber-500 mb-1">Volume Warning</h4>
                <p className="text-[11px] text-amber-500/60 leading-relaxed">
                  Harsh noise walls contain extreme dynamic content. Lower your volume before playback.
                  A dynamics compressor is applied for speaker protection, but use caution with headphones.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-10 text-center text-[10px] text-gray-700 font-mono space-y-1">
          <p>44.1kHz · 16-bit · WAV & MP3 export · Seeded PRNG for reproducible output</p>
        </footer>
      </div>
    </div>
  );
}
