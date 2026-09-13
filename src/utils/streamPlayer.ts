// Streaming preview player.
//
// NOISE WALL renders up to 26.5 M samples (10 minutes mono @ 44.1 kHz ≈ 106 MB
// as Float32). The naive playback path — copy the whole render into one
// AudioBuffer — doubles that peak, which is exactly the kind of allocation
// that makes mobile Safari reload a tab mid-listen.
//
// This player instead schedules small AudioBufferSourceNodes (2 s of audio
// each) a few seconds ahead of the playhead, then throws each one away. Peak
// playback memory is a handful of chunks (a few hundred KB) regardless of wall
// length, playback starts instantly, and seeking is just "restart scheduling
// from sample N".
//
// Determinism is untouched: the player only ever reads the render.

import { SAMPLE_RATE } from './noiseSynth';

/** Seconds of audio per scheduled node. */
const DEFAULT_CHUNK_SECONDS = 2;
/** How far ahead of the playhead nodes are queued. */
const SCHEDULE_AHEAD_SECONDS = 5;
/** How often the scheduler wakes up (ms). */
const TICK_MS = 200;
/** Short gain ramp so play/stop never clicks. */
const FADE_SECONDS = 0.02;

export type PlayerState = 'stopped' | 'playing' | 'ended';

export interface StreamingPlayerOptions {
  context: AudioContext;
  samples: Float32Array;
  sampleRate?: number;
  volume?: number;
  chunkSeconds?: number;
  /** Insert the speaker-protection compressor (default `true`). */
  protect?: boolean;
}

export class StreamingPlayer {
  private readonly ctx: AudioContext;
  private readonly samples: Float32Array;
  private readonly sampleRate: number;
  private readonly chunkFrames: number;
  private readonly totalSamples: number;
  private readonly gain: GainNode;
  private readonly compressor: DynamicsCompressorNode | null;

  private nodes = new Map<number, AudioBufferSourceNode>();
  private timer: number | null = null;
  private state_: PlayerState = 'stopped';
  private startCtxTime = 0;
  private offsetSamples = 0;
  private pausedPosition = 0;
  private nextChunk = 0;
  private volume: number;
  private disposed = false;

  onStateChange: ((state: PlayerState) => void) | null = null;

  constructor(options: StreamingPlayerOptions) {
    this.ctx = options.context;
    this.samples = options.samples;
    this.sampleRate = options.sampleRate ?? SAMPLE_RATE;
    this.totalSamples = options.samples.length;
    this.volume = options.volume ?? 0.5;
    this.chunkFrames = Math.max(
      1,
      Math.floor((options.chunkSeconds ?? DEFAULT_CHUNK_SECONDS) * this.sampleRate),
    );

    this.gain = this.ctx.createGain();
    this.gain.gain.value = this.volume;

    const protect = options.protect ?? true;
    if (protect) {
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -20;
      this.compressor.ratio.value = 12;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;
      this.gain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);
    } else {
      this.compressor = null;
      this.gain.connect(this.ctx.destination);
    }
  }

  get duration(): number {
    return this.totalSamples / this.sampleRate;
  }

  get state(): PlayerState {
    return this.state_;
  }

  /** Playhead position in seconds. */
  get position(): number {
    if (this.state_ !== 'playing') return Math.min(this.duration, this.pausedPosition);
    const elapsed = this.ctx.currentTime - this.startCtxTime;
    const seconds = this.offsetSamples / this.sampleRate + elapsed;
    return Math.min(this.duration, Math.max(0, seconds));
  }

  play(fromSeconds?: number): void {
    if (this.disposed || this.totalSamples === 0) return;
    if (this.state_ === 'playing') return;

    const from = fromSeconds ?? (this.pausedPosition >= this.duration - 0.05 ? 0 : this.pausedPosition);
    this.offsetSamples = Math.min(this.totalSamples - 1, Math.max(0, Math.floor(from * this.sampleRate)));
    this.startCtxTime = this.ctx.currentTime;
    this.pausedPosition = this.offsetSamples / this.sampleRate;
    this.nextChunk = Math.floor(this.offsetSamples / this.chunkFrames);

    this.state_ = 'playing';
    this.onStateChange?.(this.state_);
    this.applyGain(this.volume, FADE_SECONDS);
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), TICK_MS);
  }

  /** Stop playback. `reset` rewinds to the start (used by the Stop button). */
  stop(reset = true): void {
    if (this.state_ === 'playing') {
      this.pausedPosition = this.position;
    }
    this.clearScheduled();
    this.state_ = 'stopped';
    if (reset) this.pausedPosition = 0;
    this.onStateChange?.(this.state_);
  }

  seek(seconds: number): void {
    const clamped = Math.min(this.duration, Math.max(0, seconds));
    this.pausedPosition = clamped;
    if (this.state_ === 'playing') {
      this.clearScheduled();
      this.offsetSamples = Math.min(this.totalSamples - 1, Math.max(0, Math.floor(clamped * this.sampleRate)));
      this.startCtxTime = this.ctx.currentTime;
      this.nextChunk = Math.floor(this.offsetSamples / this.chunkFrames);
      this.schedule();
    }
  }

  setVolume(value: number): void {
    this.volume = Math.min(1, Math.max(0, value));
    if (this.state_ === 'playing') {
      this.applyGain(this.volume, 0.05);
    } else {
      this.gain.gain.value = this.volume;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.stop(true);
    try {
      this.gain.disconnect();
      this.compressor?.disconnect();
    } catch {
      /* already detached */
    }
  }

  // ─── Internals ───

  private applyGain(target: number, rampSeconds: number): void {
    const now = this.ctx.currentTime;
    const param = this.gain.gain;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(target, now + rampSeconds);
  }

  private clearScheduled(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    const nodes = [...this.nodes.values()];
    this.nodes.clear();
    this.applyGain(0, FADE_SECONDS);
    // Let the fade finish before tearing the sources down.
    window.setTimeout(() => {
      for (const node of nodes) {
        try {
          node.onended = null;
          node.stop();
          node.disconnect();
        } catch {
          /* already stopped */
        }
      }
      if (this.state_ !== 'playing') {
        // Restore a non-zero gain for the next play() without a ramp from 0.
        this.gain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.gain.gain.value = this.volume;
      }
    }, FADE_SECONDS * 1000 + 5);
  }

  private schedule(): void {
    if (this.state_ !== 'playing' || this.disposed) return;

    const now = this.ctx.currentTime;
    const horizon = now + SCHEDULE_AHEAD_SECONDS;
    const chunkCount = Math.ceil(this.totalSamples / this.chunkFrames);

    while (this.nextChunk < chunkCount) {
      const chunkStart = this.nextChunk * this.chunkFrames;
      const chunkEnd = Math.min(this.totalSamples, chunkStart + this.chunkFrames);
      const when = this.startCtxTime + (chunkStart - this.offsetSamples) / this.sampleRate;

      if (when > horizon) break;

      const index = this.nextChunk;
      this.nextChunk += 1;

      if (chunkEnd <= this.offsetSamples) continue; // fully before the playhead

      const bufferStart = Math.max(chunkStart, this.offsetSamples);
      const buffer = this.ctx.createBuffer(1, chunkEnd - bufferStart, this.sampleRate);
      buffer.getChannelData(0).set(this.samples.subarray(bufferStart, chunkEnd));

      const node = this.ctx.createBufferSource();
      node.buffer = buffer;
      node.connect(this.gain);

      let startAt = when;
      let offset = 0;
      if (when < now) {
        // We are late (tab throttled, context resumed): jump into the chunk.
        offset = now - when;
        startAt = now;
      }

      node.onended = () => {
        this.nodes.delete(index);
      };
      node.start(startAt, offset);
      this.nodes.set(index, node);
    }

    if (this.position >= this.duration - 1e-3) {
      this.pausedPosition = this.duration;
      this.clearScheduled();
      this.state_ = 'ended';
      this.onStateChange?.(this.state_);
    }
  }
}
