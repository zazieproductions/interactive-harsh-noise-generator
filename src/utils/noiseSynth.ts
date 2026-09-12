// Noise synthesis engine for harsh noise wall generation
// Focused on dense, mid-heavy static walls — not screechy high-frequency stuff
//
// ─── Sliceable pipeline ─────────────────────────────────────────────────────
// Every DSP stage is a primitive that can process a [start, end) sub-range of
// the buffer, carrying its internal state in a small state object:
//
//   - `generateNoiseWall` (sync) runs each primitive once over [0, length)
//   - `generateNoiseWallAsync` runs the same primitives in ~5–12 s slices,
//     yielding to the event loop between slices so the UI stays responsive
//     while a long wall renders, and reports live per-stage progress
//
// Both drivers share the exact same loop bodies, so a given seed + params
// produces bit-identical audio on either path.

export type NoiseType = 'white' | 'pink' | 'brown' | 'grey' | 'crackling' | 'digital' | 'saturated';

export interface NoiseParams {
  duration: number;           // seconds (2-600)
  noiseType: NoiseType;
  distortionAmount: number;   // 0-100
  density: number;            // 0-100, layer stacking thickness
  feedback: number;           // 0-100, feedback saturation
  lfoRate: number;            // 0-10, Hz of slow modulation
  lfoDepth: number;           // 0-100
  filterFreq: number;         // 20-20000 Hz cutoff
  filterQ: number;            // 0-30, resonance
  bitcrush: number;           // 0-100 (bit reduction)
  subBass: number;            // 0-100, low-end rumble
  grit: number;               // 0-100, textural grit/static harshness
  seed: number;               // random seed for reproducibility
}

export const DEFAULT_PARAMS: NoiseParams = {
  duration: 10,
  noiseType: 'white',
  distortionAmount: 80,
  density: 85,
  feedback: 60,
  lfoRate: 0.3,
  lfoDepth: 20,
  filterFreq: 3000,
  filterQ: 4,
  bitcrush: 15,
  subBass: 50,
  grit: 70,
  seed: 42,
};

const SAMPLE_RATE = 44100;

// ─── Seeded PRNG (mulberry32) ───

function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Cooperative scheduling ───

export interface GenerationProgress {
  /** Overall progress, 0–100. */
  percent: number;
  /** Human-readable name of the pipeline stage currently running. */
  stage: string;
}

export type ProgressCallback = (progress: GenerationProgress) => void;

/** One work slice is ~5.9 s of audio at 44.1 kHz. */
const BASE_SLICE = 1 << 18;

/** Yield to the event loop so the UI can paint between work slices. */
function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Run `processSlice(start, end)` over [0, length) in slices, yielding to the
 * event loop after any slice that blocked long enough to risk dropping a
 * paint. `onSlice` is called with the completed fraction (0–1) after every
 * slice. Slices never change what gets computed — only when the event loop
 * gets a chance to run in between.
 */
async function runSlices(
  length: number,
  processSlice: (start: number, end: number) => void,
  onSlice: (fraction: number) => void,
): Promise<void> {
  const slice = Math.max(BASE_SLICE, Math.ceil(length / 32));
  for (let start = 0; start < length; start += slice) {
    const end = Math.min(length, start + slice);
    const t0 = performance.now();
    processSlice(start, end);
    onSlice(end / length);
    if (performance.now() - t0 > 6) {
      await nextTick();
    }
  }
}

// ─── Base noise generators (sliceable) ───

interface PinkState {
  b0: number; b1: number; b2: number; b3: number; b4: number; b5: number; b6: number;
}
interface OnePoleState {
  last: number;
}
interface CracklingState {
  last: number;
  /** Absolute buffer index of the next sample whose body should run. */
  skipUntil: number;
}
interface DigitalState {
  hold: number;
  holdCounter: number;
}

type GenState =
  | { kind: 'white' }
  | { kind: 'pink' | 'grey'; state: PinkState }
  | { kind: 'brown'; state: OnePoleState }
  | { kind: 'crackling'; state: CracklingState }
  | { kind: 'digital'; state: DigitalState };

function freshPinkState(): PinkState {
  return { b0: 0, b1: 0, b2: 0, b3: 0, b4: 0, b5: 0, b6: 0 };
}

function createGenState(type: NoiseType): GenState {
  switch (type) {
    case 'white': return { kind: 'white' };
    case 'pink': return { kind: 'pink', state: freshPinkState() };
    case 'grey': return { kind: 'grey', state: freshPinkState() };
    case 'brown': return { kind: 'brown', state: { last: 0 } };
    case 'crackling': return { kind: 'crackling', state: { last: 0, skipUntil: 0 } };
    case 'digital': return { kind: 'digital', state: { hold: 0, holdCounter: 0 } };
    // 'saturated' is handled by the layer driver as three sequential passes
    // (white, pink, brown) plus a mix pass, preserving the original PRNG
    // consumption order (all white samples, then all pink, then all brown).
    case 'saturated': throw new Error('saturated is handled by the layer driver');
  }
}

function genSlice(
  gen: GenState,
  buf: Float32Array,
  length: number,
  start: number,
  end: number,
  rng: () => number,
): void {
  switch (gen.kind) {
    case 'white': {
      for (let i = start; i < end; i++) buf[i] = rng() * 2 - 1;
      return;
    }
    case 'pink':
    case 'grey': {
      const st = gen.state;
      let b0 = st.b0, b1 = st.b1, b2 = st.b2, b3 = st.b3, b4 = st.b4, b5 = st.b5, b6 = st.b6;
      for (let i = start; i < end; i++) {
        const w = rng() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
        buf[i] = gen.kind === 'grey' ? pink * 1.2 + w * 0.4 : pink;
      }
      st.b0 = b0; st.b1 = b1; st.b2 = b2; st.b3 = b3; st.b4 = b4; st.b5 = b5; st.b6 = b6;
      return;
    }
    case 'brown': {
      const st = gen.state;
      let last = st.last;
      for (let i = start; i < end; i++) {
        const w = rng() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        buf[i] = last * 3.5;
      }
      st.last = last;
      return;
    }
    case 'crackling': {
      const st = gen.state;
      let last = st.last;
      let i = Math.max(start, st.skipUntil);
      for (; i < end; i++) {
        const r = rng();
        if (r < 0.015) {
          // Harsh crackle burst (may extend past this slice — writes are
          // absolute, so they land in the shared buffer either way)
          const burstLen = Math.min(length - i, 20 + Math.floor(rng() * 80));
          for (let j = 0; j < burstLen && i + j < length; j++) {
            buf[i + j] = (rng() * 2 - 1) * (2.0 - j / burstLen * 1.5);
          }
          i += 30;
          st.skipUntil = i + 1;
        } else {
          // Dense underlying static
          last = last * 0.7 + (rng() * 2 - 1) * 0.3;
          buf[i] = last * 0.8;
          st.skipUntil = i + 1;
        }
      }
      st.last = last;
      return;
    }
    case 'digital': {
      const st = gen.state;
      let hold = st.hold;
      let holdCounter = st.holdCounter;
      for (let i = start; i < end; i++) {
        if (holdCounter <= 0) {
          hold = rng() > 0.5 ? 1 : -1;
          // Randomize hold length for aliased texture
          holdCounter = 1 + Math.floor(rng() * 6);
          // Occasionally add intermediate values for "warble"
          if (rng() < 0.3) {
            hold *= rng() * 0.5 + 0.5;
          }
        }
        buf[i] = hold;
        holdCounter--;
      }
      st.hold = hold;
      st.holdCounter = holdCounter;
      return;
    }
  }
}

// ─── DSP building blocks (sliceable) ───

interface BiquadState {
  nb0: number; nb1: number; nb2: number; na1: number; na2: number;
  x1: number; x2: number; y1: number; y2: number;
}

function createBiquadState(kind: 'lowpass' | 'highpass', freq: number, q: number): BiquadState {
  const f = Math.max(20, Math.min(freq, SAMPLE_RATE * 0.48));
  const rQ = Math.max(0.1, q);

  const w0 = (2 * Math.PI * f) / SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * rQ);
  const cosW0 = Math.cos(w0);

  let b0: number, b1: number, b2: number;
  if (kind === 'lowpass') {
    b0 = (1 - cosW0) / 2;
    b1 = 1 - cosW0;
    b2 = (1 - cosW0) / 2;
  } else {
    b0 = (1 + cosW0) / 2;
    b1 = -(1 + cosW0);
    b2 = (1 + cosW0) / 2;
  }
  const a0 = 1 + alpha;

  return {
    nb0: b0 / a0,
    nb1: b1 / a0,
    nb2: b2 / a0,
    na1: -2 * cosW0 / a0,
    na2: (1 - alpha) / a0,
    x1: 0, x2: 0, y1: 0, y2: 0,
  };
}

// Stable 2-pole Biquad (lowpass or highpass, from createBiquadState)
function biquadSlice(st: BiquadState, buf: Float32Array, start: number, end: number): void {
  const { nb0, nb1, nb2, na1, na2 } = st;
  let x1 = st.x1, x2 = st.x2, y1 = st.y1, y2 = st.y2;
  for (let i = start; i < end; i++) {
    const x = buf[i];
    const y = nb0 * x + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    buf[i] = y;
  }
  st.x1 = x1; st.x2 = x2; st.y1 = y1; st.y2 = y2;
}

interface Lp1State {
  a: number;
  prev: number;
}

// 1-pole lowpass coefficient set for smoothing
function createLp1State(freq: number): Lp1State {
  const rc = 1 / (2 * Math.PI * freq);
  return { a: (1 / SAMPLE_RATE) / (rc + 1 / SAMPLE_RATE), prev: 0 };
}

function lp1Slice(st: Lp1State, buf: Float32Array, start: number, end: number): void {
  let prev = st.prev;
  for (let i = start; i < end; i++) {
    prev += st.a * (buf[i] - prev);
    buf[i] = prev;
  }
  st.prev = prev;
}

interface DistortState {
  drive: number;
  mix: number;
  deep: boolean;
}

// Waveshaper distortion coefficient set — multiple stages for HNW character
function createDistortState(amount: number): DistortState {
  const drive = 1 + (amount / 100) * 40; // 1 to 41
  return { drive, mix: Math.min(amount / 100, 1), deep: drive > 10 };
}

function distortSlice(st: DistortState, buf: Float32Array, start: number, end: number): void {
  for (let i = start; i < end; i++) {
    const dry = buf[i];
    let wet = dry * st.drive;

    // Stage 1: asymmetric soft clip (pedal-like)
    wet = Math.tanh(wet * 1.5) * 0.7 + Math.tanh(wet * 0.8 + 0.3) * 0.3;

    // Stage 2: hard clip with fold-back for gnarl
    if (Math.abs(wet) > 0.8) {
      const excess = Math.abs(wet) - 0.8;
      wet = Math.sign(wet) * (0.8 + Math.sin(excess * 8) * 0.2);
    }

    // Stage 3: extra tanh saturation at high drive
    if (st.deep) {
      wet = Math.tanh(wet * 2);
    }

    buf[i] = dry * (1 - st.mix) + wet * st.mix;
  }
}

interface BitcrushState {
  steps: number;
  holdSamples: number;
}

// Bit-crush & sample-rate reduction coefficient set
function createBitcrushState(amount: number): BitcrushState {
  const t = amount / 100;
  const bits = Math.max(2, Math.round(16 - t * 13)); // 16 down to 3
  const steps = Math.pow(2, bits);
  const holdSamples = 1 + Math.floor(t * 8); // 1 to 9 sample hold
  return { steps, holdSamples };
}

function bitcrushSlice(st: BitcrushState, buf: Float32Array, start: number, end: number): void {
  // `held` carries across slices: at any slice start it equals the last
  // quantized value that was written, which is exactly buf[start - 1].
  let held = start > 0 ? buf[start - 1] : 0;
  for (let i = start; i < end; i++) {
    if (i % st.holdSamples === 0) {
      held = Math.round(buf[i] * st.steps) / st.steps;
    }
    buf[i] = held;
  }
}

interface LfoState {
  d: number;
  rate: number;
}

// Slow amplitude LFO coefficient set — keeps things "wall"-like with subtle movement
function createLfoState(rate: number, depth: number): LfoState {
  return { d: (depth / 100) * 0.4, rate }; // max 40% modulation so it stays wall-like
}

function lfoSlice(st: LfoState, buf: Float32Array, start: number, end: number): void {
  const { d, rate } = st;
  for (let i = start; i < end; i++) {
    const t = i / SAMPLE_RATE;
    // Slow complex LFO
    const lfo =
      Math.sin(2 * Math.PI * rate * t) * 0.5 +
      Math.sin(2 * Math.PI * rate * 0.37 * t + 1.2) * 0.3 +
      Math.sin(2 * Math.PI * rate * 1.73 * t + 0.5) * 0.2;
    buf[i] *= 1 - d + lfo * d;
  }
}

interface FeedbackState {
  fb: number;
  prev: number;
}

// Feedback saturation coefficient set — creates self-reinforcing density
function createFeedbackState(amount: number): FeedbackState {
  return { fb: (amount / 100) * 0.85, prev: 0 }; // Max 0.85 to avoid instability
}

function feedbackSlice(st: FeedbackState, buf: Float32Array, start: number, end: number): void {
  let prev = st.prev;
  for (let i = start; i < end; i++) {
    buf[i] = Math.tanh(buf[i] + prev * st.fb);
    prev = buf[i];
  }
  st.prev = prev;
}

interface SubBassState {
  phase1: number;
  phase2: number;
  inc1: number;
  inc2: number;
  d: number;
}

// Low-end rumble layer coefficient set. The 4 PRNG draws (phases +
// frequencies) happen at creation, matching the original call order.
function createSubBassState(amount: number, rng: () => number): SubBassState {
  const phase1 = rng() * Math.PI * 2;
  const phase2 = rng() * Math.PI * 2;
  const freq1 = 25 + rng() * 15; // 25-40 Hz
  const freq2 = 40 + rng() * 30; // 40-70 Hz
  return {
    phase1,
    phase2,
    inc1: (2 * Math.PI * freq1) / SAMPLE_RATE,
    inc2: (2 * Math.PI * freq2) / SAMPLE_RATE,
    d: amount / 100,
  };
}

function subBassSlice(st: SubBassState, buf: Float32Array, start: number, end: number, rng: () => number): void {
  let phase1 = st.phase1;
  let phase2 = st.phase2;
  for (let i = start; i < end; i++) {
    phase1 += st.inc1;
    phase2 += st.inc2;
    // Noise-modulated sub bass
    const noiseMod = 1 + (rng() * 2 - 1) * 0.05;
    const sub =
      Math.sin(phase1 * noiseMod) * 0.6 +
      Math.sin(phase2 * noiseMod * 1.01) * 0.4;
    buf[i] += sub * st.d * 0.5;
  }
  st.phase1 = phase1;
  st.phase2 = phase2;
}

interface GritState {
  d: number;
  hp: BiquadState;
  lp: BiquadState;
}

// Grit layer coefficient set — band-limited (200 Hz–6 kHz) crunch
function createGritState(amount: number): GritState {
  return {
    d: amount / 100,
    hp: createBiquadState('highpass', 200, 0.7),
    lp: createBiquadState('lowpass', 6000, 0.7),
  };
}

// ─── Layer stacking ───

function layerCount(density: number): number {
  return 1 + Math.floor((density / 100) * 5); // 1 to 6 layers
}

interface SaturatedScratch {
  white: Float32Array;
  pink: Float32Array;
  brown: Float32Array;
}

function mixSaturated(sat: SaturatedScratch, scratch: Float32Array, start: number, end: number): void {
  for (let i = start; i < end; i++) {
    const mixed = sat.white[i] * 0.5 + sat.pink[i] * 0.8 + sat.brown[i] * 0.4;
    scratch[i] = Math.tanh(mixed * 3);
  }
}

function tanhDrive(scratch: Float32Array, start: number, end: number, layerDrive: number): void {
  for (let i = start; i < end; i++) {
    scratch[i] = Math.tanh(scratch[i] * layerDrive);
  }
}

function accumulateInto(buf: Float32Array, scratch: Float32Array, start: number, end: number, layerGain: number): void {
  for (let i = start; i < end; i++) {
    buf[i] += scratch[i] * layerGain;
  }
}

/**
 * Generate the stacked noise layers (density controls how many). One scratch
 * buffer is reused across layers — each layer fully overwrites it before use,
 * so the output is identical to allocating a fresh buffer per layer.
 */
function stackLayersSync(length: number, density: number, type: NoiseType, rng: () => number): Float32Array {
  const numLayers = layerCount(density);
  const buf = new Float32Array(length);
  const scratch = new Float32Array(length);
  const sat: SaturatedScratch | null = type === 'saturated'
    ? { white: new Float32Array(length), pink: new Float32Array(length), brown: new Float32Array(length) }
    : null;

  for (let layer = 0; layer < numLayers; layer++) {
    if (sat) {
      // 'saturated' mixes three pre-saturated noise sources; the PRNG must be
      // consumed all-white, then all-pink, then all-brown, so the passes stay
      // sequential (as in the original genSaturated).
      genSlice(createGenState('white'), sat.white, length, 0, length, rng);
      genSlice(createGenState('pink'), sat.pink, length, 0, length, rng);
      genSlice(createGenState('brown'), sat.brown, length, 0, length, rng);
      mixSaturated(sat, scratch, 0, length);
    } else {
      // crackling's burst logic skips index ranges without writing them; the
      // original allocated a fresh zeroed buffer per layer, so zero the reused
      // scratch to keep those gaps silent.
      if (type === 'crackling') scratch.fill(0);
      genSlice(createGenState(type), scratch, length, 0, length, rng);
    }

    // Slightly different filtering per layer for width
    const filterOffset = (rng() - 0.5) * 2000;
    const freq = Math.max(100, 2000 + filterOffset);
    biquadSlice(createBiquadState('lowpass', freq, 0.5 + rng() * 2), scratch, 0, length);

    // Each layer gets independent saturation
    const layerDrive = 2 + rng() * 6;
    tanhDrive(scratch, 0, length, layerDrive);

    const layerGain = 1 / numLayers;
    accumulateInto(buf, scratch, 0, length, layerGain);
  }

  return buf;
}

async function stackLayersAsync(
  length: number,
  density: number,
  type: NoiseType,
  rng: () => number,
  report: (fraction: number) => void,
): Promise<Float32Array> {
  const numLayers = layerCount(density);
  const buf = new Float32Array(length);
  const scratch = new Float32Array(length);
  const sat: SaturatedScratch | null = type === 'saturated'
    ? { white: new Float32Array(length), pink: new Float32Array(length), brown: new Float32Array(length) }
    : null;

  for (let layer = 0; layer < numLayers; layer++) {
    const base = layer / numLayers;

    if (sat) {
      const gw = createGenState('white');
      await runSlices(length, (s, e) => genSlice(gw, sat.white, length, s, e, rng), (f) => report(base + (f * 0.2) / numLayers));
      const gp = createGenState('pink');
      await runSlices(length, (s, e) => genSlice(gp, sat.pink, length, s, e, rng), (f) => report(base + (0.2 + f * 0.2) / numLayers));
      const gb = createGenState('brown');
      await runSlices(length, (s, e) => genSlice(gb, sat.brown, length, s, e, rng), (f) => report(base + (0.4 + f * 0.2) / numLayers));
      await runSlices(length, (s, e) => mixSaturated(sat, scratch, s, e), (f) => report(base + (0.6 + f * 0.2) / numLayers));
    } else {
      const gen = createGenState(type);
      // crackling's burst logic skips index ranges without writing them; the
      // original allocated a fresh zeroed buffer per layer, so zero the reused
      // scratch to keep those gaps silent.
      if (type === 'crackling') scratch.fill(0);
      await runSlices(length, (s, e) => genSlice(gen, scratch, length, s, e, rng), (f) => report(base + (f * 0.25) / numLayers));
    }

    // Slightly different filtering per layer for width
    const filterOffset = (rng() - 0.5) * 2000;
    const freq = Math.max(100, 2000 + filterOffset);
    const layerLp = createBiquadState('lowpass', freq, 0.5 + rng() * 2);
    // Each layer gets independent saturation
    const layerDrive = 2 + rng() * 6;
    const layerGain = 1 / numLayers;

    await runSlices(length, (s, e) => biquadSlice(layerLp, scratch, s, e), (f) => report(base + (0.25 + f * 0.25) / numLayers));
    await runSlices(length, (s, e) => tanhDrive(scratch, s, e, layerDrive), (f) => report(base + (0.5 + f * 0.25) / numLayers));
    await runSlices(length, (s, e) => accumulateInto(buf, scratch, s, e, layerGain), (f) => report(base + (0.75 + f * 0.25) / numLayers));
  }

  return buf;
}

// ─── Small single-shot stages ───

// Fade in/out envelope
function applyEnvelope(buf: Float32Array): void {
  const fadeLen = Math.min(Math.floor(SAMPLE_RATE * 0.08), Math.floor(buf.length * 0.02));
  for (let i = 0; i < fadeLen; i++) {
    const g = i / fadeLen;
    buf[i] *= g * g; // quadratic fade for smoother onset
    buf[buf.length - 1 - i] *= g * g;
  }
}

function normalizeSync(buf: Float32Array, target: number): void {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const abs = Math.abs(buf[i]);
    if (abs > peak) peak = abs;
  }
  if (peak > 0) {
    const scale = target / peak;
    for (let i = 0; i < buf.length; i++) {
      buf[i] *= scale;
    }
  }
}

// ─── Main generation pipeline ───

/**
 * Runs the full 12-stage DSP pipeline synchronously and returns a new
 * `Float32Array` of length `floor(params.duration * SAMPLE_RATE)`.
 *
 * Prefer `generateNoiseWallAsync` from the UI: it produces bit-identical
 * output while keeping the event loop responsive on long walls.
 */
export function generateNoiseWall(params: NoiseParams): Float32Array {
  const length = Math.floor(params.duration * SAMPLE_RATE);
  const rng = seededRandom(params.seed);

  // 1. Generate stacked noise layers (density controls how many)
  const buf = stackLayersSync(length, params.density, params.noiseType, rng);

  // 2. Apply main filter shaping (lowpass to focus on mid/low)
  if (params.filterFreq < 19900) {
    biquadSlice(createBiquadState('lowpass', params.filterFreq, Math.max(0.3, params.filterQ * 0.15)), buf, 0, length);
  }
  // Remove sub-20Hz DC offset
  biquadSlice(createBiquadState('highpass', 20, 0.5), buf, 0, length);

  // 3. Apply LFO modulation (slow movement)
  if (params.lfoRate > 0 && params.lfoDepth > 0) {
    lfoSlice(createLfoState(params.lfoRate, params.lfoDepth), buf, 0, length);
  }

  // 4. Main distortion pass
  if (params.distortionAmount > 0) {
    distortSlice(createDistortState(params.distortionAmount), buf, 0, length);
  }

  // 5. Feedback saturation
  if (params.feedback > 0) {
    feedbackSlice(createFeedbackState(params.feedback), buf, 0, length);
  }

  // 6. Add sub-bass rumble layer
  if (params.subBass >= 1) {
    subBassSlice(createSubBassState(params.subBass, rng), buf, 0, length, rng);
  }

  // 7. Add grit/static texture layer
  if (params.grit >= 1) {
    const st = createGritState(params.grit);
    const gritBuf = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const w = rng() * 2 - 1;
      // Squared noise for harsher character
      gritBuf[i] = w * Math.abs(w);
    }
    biquadSlice(st.hp, gritBuf, 0, length);
    biquadSlice(st.lp, gritBuf, 0, length);
    for (let i = 0; i < length; i++) {
      gritBuf[i] = Math.tanh(gritBuf[i] * 4) * st.d * 0.6;
    }
    for (let i = 0; i < length; i++) {
      buf[i] += gritBuf[i];
    }
  }

  // 8. Bitcrush (sample rate + bit reduction)
  if (params.bitcrush >= 1) {
    bitcrushSlice(createBitcrushState(params.bitcrush), buf, 0, length);
  }

  // 9. Final saturation pass — glue everything into a wall
  for (let i = 0; i < buf.length; i++) {
    buf[i] = Math.tanh(buf[i] * 1.8);
  }

  // 10. Tame harsh highs with gentle rolloff above 12kHz
  lp1Slice(createLp1State(12000), buf, 0, length);

  // 11. Envelope (short fades)
  applyEnvelope(buf);

  // 12. Normalize
  normalizeSync(buf, 0.97);

  return buf;
}

/**
 * Runs the full 12-stage DSP pipeline without blocking the event loop.
 *
 * The pipeline is processed in ~5–12 s slices of audio; after any slice that
 * takes long enough to risk dropping a paint, the engine yields to the event
 * loop. `onProgress` (optional) receives overall percent + current stage
 * label after every slice, so the UI can show a live progress bar.
 *
 * Produces bit-identical output to `generateNoiseWall` for the same params.
 */
export async function generateNoiseWallAsync(
  params: NoiseParams,
  onProgress?: ProgressCallback,
): Promise<Float32Array> {
  const length = Math.floor(params.duration * SAMPLE_RATE);
  const rng = seededRandom(params.seed);

  // Let the UI paint the "generating" state before the first work slice runs.
  await nextTick();

  // Relative cost weights per stage (only used for the progress bar).
  const stageWeights = {
    layers: layerCount(params.density) * 3.2,
    filter: (params.filterFreq < 19900 ? 0.6 : 0) + 0.6,
    lfo: params.lfoRate > 0 && params.lfoDepth > 0 ? 0.8 : 0,
    distort: params.distortionAmount > 0 ? 1.1 : 0,
    feedback: params.feedback > 0 ? 0.8 : 0,
    subBass: params.subBass >= 1 ? 1.2 : 0,
    grit: params.grit >= 1 ? 4.2 : 0,
    crush: params.bitcrush >= 1 ? 0.5 : 0,
    polish: 2.3,
  };
  const totalWeight =
    stageWeights.layers + stageWeights.filter + stageWeights.lfo + stageWeights.distort +
    stageWeights.feedback + stageWeights.subBass + stageWeights.grit + stageWeights.crush +
    stageWeights.polish;

  let completed = 0;
  const makeReport = (label: string, base: number, weight: number): (f: number) => void => (f) => {
    onProgress?.({
      percent: Math.min(100, ((base + weight * f) / totalWeight) * 100),
      stage: label,
    });
  };

  // 1. Generate stacked noise layers (density controls how many)
  const buf = await stackLayersAsync(length, params.density, params.noiseType, rng, makeReport('Stacking noise layers', 0, stageWeights.layers));
  completed += stageWeights.layers;

  // 2. Apply main filter shaping + DC removal
  {
    const base = completed;
    const weight = stageWeights.filter;
    const doLowpass = params.filterFreq < 19900;
    if (doLowpass) {
      const lp = createBiquadState('lowpass', params.filterFreq, Math.max(0.3, params.filterQ * 0.15));
      await runSlices(length, (s, e) => biquadSlice(lp, buf, s, e), (f) => makeReport('Filtering', base, weight)(f * 0.5));
    }
    const hp = createBiquadState('highpass', 20, 0.5);
    await runSlices(length, (s, e) => biquadSlice(hp, buf, s, e), (f) => makeReport('Filtering', base, weight)(doLowpass ? 0.5 + f * 0.5 : f));
    completed += weight;
  }

  // 3. Apply LFO modulation (slow movement)
  if (stageWeights.lfo > 0) {
    const st = createLfoState(params.lfoRate, params.lfoDepth);
    await runSlices(length, (s, e) => lfoSlice(st, buf, s, e), makeReport('Modulating', completed, stageWeights.lfo));
    completed += stageWeights.lfo;
  }

  // 4. Main distortion pass
  if (stageWeights.distort > 0) {
    const st = createDistortState(params.distortionAmount);
    await runSlices(length, (s, e) => distortSlice(st, buf, s, e), makeReport('Distorting', completed, stageWeights.distort));
    completed += stageWeights.distort;
  }

  // 5. Feedback saturation
  if (stageWeights.feedback > 0) {
    const st = createFeedbackState(params.feedback);
    await runSlices(length, (s, e) => feedbackSlice(st, buf, s, e), makeReport('Feedback saturation', completed, stageWeights.feedback));
    completed += stageWeights.feedback;
  }

  // 6. Add sub-bass rumble layer
  if (stageWeights.subBass > 0) {
    const st = createSubBassState(params.subBass, rng);
    await runSlices(length, (s, e) => subBassSlice(st, buf, s, e, rng), makeReport('Sub-bass layer', completed, stageWeights.subBass));
    completed += stageWeights.subBass;
  }

  // 7. Add grit/static texture layer
  if (stageWeights.grit > 0) {
    const st = createGritState(params.grit);
    const gritBuf = new Float32Array(length);
    const rep = makeReport('Grit texture', completed, stageWeights.grit);
    await runSlices(length, (s, e) => {
      for (let i = s; i < e; i++) {
        const w = rng() * 2 - 1;
        // Squared noise for harsher character
        gritBuf[i] = w * Math.abs(w);
      }
    }, (f) => rep(f * 0.2));
    await runSlices(length, (s, e) => biquadSlice(st.hp, gritBuf, s, e), (f) => rep(0.2 + f * 0.2));
    await runSlices(length, (s, e) => biquadSlice(st.lp, gritBuf, s, e), (f) => rep(0.4 + f * 0.2));
    await runSlices(length, (s, e) => {
      // Saturate the grit layer independently
      for (let i = s; i < e; i++) {
        gritBuf[i] = Math.tanh(gritBuf[i] * 4) * st.d * 0.6;
      }
    }, (f) => rep(0.6 + f * 0.1));
    await runSlices(length, (s, e) => {
      for (let i = s; i < e; i++) {
        buf[i] += gritBuf[i];
      }
    }, (f) => rep(0.7 + f * 0.3));
    completed += stageWeights.grit;
  }

  // 8. Bitcrush (sample rate + bit reduction)
  if (stageWeights.crush > 0) {
    const st = createBitcrushState(params.bitcrush);
    await runSlices(length, (s, e) => bitcrushSlice(st, buf, s, e), makeReport('Bitcrushing', completed, stageWeights.crush));
    completed += stageWeights.crush;
  }

  // 9–12. Glue saturation, high rolloff, envelope, normalize
  {
    const base = completed;
    const weight = stageWeights.polish;
    const rep = makeReport('Polishing', base, weight);
    await runSlices(length, (s, e) => {
      for (let i = s; i < e; i++) {
        buf[i] = Math.tanh(buf[i] * 1.8);
      }
    }, (f) => rep(f * 0.35));
    const lp1 = createLp1State(12000);
    await runSlices(length, (s, e) => lp1Slice(lp1, buf, s, e), (f) => rep(0.35 + f * 0.2));
    applyEnvelope(buf);
    let peak = 0;
    await runSlices(length, (s, e) => {
      for (let i = s; i < e; i++) {
        const abs = Math.abs(buf[i]);
        if (abs > peak) peak = abs;
      }
    }, (f) => rep(0.55 + f * 0.2));
    if (peak > 0) {
      const scale = 0.97 / peak;
      await runSlices(length, (s, e) => {
        for (let i = s; i < e; i++) {
          buf[i] *= scale;
        }
      }, (f) => rep(0.75 + f * 0.25));
    }
    completed += weight;
  }

  onProgress?.({ percent: 100, stage: 'Done' });
  return buf;
}

// ─── Waveform preview ───

export interface WaveformPreview {
  /** Per-column minimum, length = columns. */
  min: Float32Array;
  /** Per-column maximum, length = columns. */
  max: Float32Array;
}

/**
 * Precomputes per-column min/max values for the waveform visualizer.
 *
 * The windowing matches the visualizer's per-pixel scan exactly, so drawing
 * becomes O(columns) instead of O(buffer length) — every playhead frame stays
 * cheap even for 10-minute walls.
 */
export async function buildWaveformPreview(buffer: Float32Array, columns: number): Promise<WaveformPreview> {
  await nextTick();
  const min = new Float32Array(columns);
  const max = new Float32Array(columns);
  if (buffer.length === 0 || columns <= 0) return { min, max };

  const samplesPerPixel = Math.max(1, Math.floor(buffer.length / columns));
  await runSlices(columns, (start, end) => {
    for (let x = start; x < end; x++) {
      const startIdx = Math.floor((x / columns) * buffer.length);
      let mn = buffer[startIdx];
      let mx = buffer[startIdx];
      for (let j = 1; j < samplesPerPixel && startIdx + j < buffer.length; j++) {
        const s = buffer[startIdx + j];
        if (s < mn) mn = s;
        if (s > mx) mx = s;
      }
      min[x] = mn;
      max[x] = mx;
    }
  }, () => {});

  return { min, max };
}

export { SAMPLE_RATE };
