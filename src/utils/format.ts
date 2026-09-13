// Small pure formatting helpers shared by the UI (and usable from tests).

import { SAMPLE_RATE } from './noiseSynth';

/** `45` → `45s`, `90` → `1m 30s`, `600` → `10m`. */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest > 0 ? `${m}m ${rest}s` : `${m}m`;
}

/** `125.4` → `2:05` (player-style clock). */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** `52428800` → `50.0 MB` (decimal units, matching what hosts report). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export interface RenderEstimate {
  /** Sample count for the given duration. */
  samples: number;
  /** Mono float32 render buffer, in bytes. */
  renderBytes: number;
  /** 16-bit PCM WAV of the same render, in bytes. */
  wavBytes: number;
  /**
   * Rough peak working set for "generate, play, export": the render plus the
   * larger of the export encodings. Deliberately approximate — the point is
   * to warn users before a phone browser decides to reload the tab.
   */
  peakBytes: number;
  /** 44.1 kHz sample count expressed in millions, e.g. `26.5M`. */
  samplesLabel: string;
}

export function estimateRender(seconds: number): RenderEstimate {
  const samples = Math.max(0, Math.floor(seconds * SAMPLE_RATE));
  const renderBytes = samples * 4;
  const wavBytes = samples * 2;
  // Encoders no longer duplicate the render (they stream in slices), so the
  // peak is the render plus the biggest export target it may materialise.
  const peakBytes = renderBytes + wavBytes;
  return {
    samples,
    renderBytes,
    wavBytes,
    peakBytes,
    samplesLabel: `${(samples / 1_000_000).toFixed(1)}M`,
  };
}
