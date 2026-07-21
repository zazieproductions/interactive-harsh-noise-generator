// Noise synthesis engine for harsh noise wall generation
// Focused on dense, mid-heavy static walls — not screechy high-frequency stuff

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

// ─── Base noise generators ───

function genWhite(length: number, rng: () => number): Float32Array {
  const buf = new Float32Array(length);
  for (let i = 0; i < length; i++) buf[i] = rng() * 2 - 1;
  return buf;
}

function genPink(length: number, rng: () => number): Float32Array {
  const buf = new Float32Array(length);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i++) {
    const w = rng() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    buf[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return buf;
}

function genBrown(length: number, rng: () => number): Float32Array {
  const buf = new Float32Array(length);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const w = rng() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    buf[i] = last * 3.5;
  }
  return buf;
}

function genGrey(length: number, rng: () => number): Float32Array {
  // Mid-heavy equal-loudness noise
  const buf = new Float32Array(length);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i++) {
    const w = rng() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
    // Blend pink (low-mid) + white (brightness) equally 
    buf[i] = pink * 1.2 + w * 0.4;
  }
  return buf;
}

function genCrackling(length: number, rng: () => number): Float32Array {
  const buf = new Float32Array(length);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const r = rng();
    if (r < 0.015) {
      // Harsh crackle burst
      const burstLen = Math.min(length - i, 20 + Math.floor(rng() * 80));
      for (let j = 0; j < burstLen && i + j < length; j++) {
        buf[i + j] = (rng() * 2 - 1) * (2.0 - j / burstLen * 1.5);
      }
      i += 30;
    } else {
      // Dense underlying static
      last = last * 0.7 + (rng() * 2 - 1) * 0.3;
      buf[i] = last * 0.8;
    }
  }
  return buf;
}

function genDigital(length: number, rng: () => number): Float32Array {
  // Square-ish harsh digital noise
  const buf = new Float32Array(length);
  let hold = 0;
  let holdCounter = 0;
  for (let i = 0; i < length; i++) {
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
  return buf;
}

function genSaturated(length: number, rng: () => number): Float32Array {
  // Mix of multiple noise layers pre-saturated
  const white = genWhite(length, rng);
  const pink = genPink(length, rng);
  const brown = genBrown(length, rng);
  const buf = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const mixed = white[i] * 0.5 + pink[i] * 0.8 + brown[i] * 0.4;
    buf[i] = Math.tanh(mixed * 3);
  }
  return buf;
}

function generateBaseNoise(length: number, type: NoiseType, rng: () => number): Float32Array {
  switch (type) {
    case 'white': return genWhite(length, rng);
    case 'pink': return genPink(length, rng);
    case 'brown': return genBrown(length, rng);
    case 'grey': return genGrey(length, rng);
    case 'crackling': return genCrackling(length, rng);
    case 'digital': return genDigital(length, rng);
    case 'saturated': return genSaturated(length, rng);
  }
}

// ─── DSP building blocks ───

// Stable 2-pole Biquad Lowpass filter
function biquadLowpass(buf: Float32Array, freq: number, q: number): void {
  const f = Math.max(20, Math.min(freq, SAMPLE_RATE * 0.48));
  const rQ = Math.max(0.1, q);

  const w0 = (2 * Math.PI * f) / SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * rQ);
  const cosW0 = Math.cos(w0);

  const b0 = (1 - cosW0) / 2;
  const b1 = 1 - cosW0;
  const b2 = (1 - cosW0) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha;

  const nb0 = b0 / a0;
  const nb1 = b1 / a0;
  const nb2 = b2 / a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = nb0 * x + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    buf[i] = y;
  }
}

// Stable 2-pole Biquad Highpass filter
function biquadHighpass(buf: Float32Array, freq: number, q: number): void {
  const f = Math.max(20, Math.min(freq, SAMPLE_RATE * 0.48));
  const rQ = Math.max(0.1, q);

  const w0 = (2 * Math.PI * f) / SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * rQ);
  const cosW0 = Math.cos(w0);

  const b0 = (1 + cosW0) / 2;
  const b1 = -(1 + cosW0);
  const b2 = (1 + cosW0) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha;

  const nb0 = b0 / a0;
  const nb1 = b1 / a0;
  const nb2 = b2 / a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = nb0 * x + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    buf[i] = y;
  }
}

// Simple 1-pole lowpass for smoothing
function lp1(buf: Float32Array, freq: number): void {
  const rc = 1 / (2 * Math.PI * freq);
  const a = (1 / SAMPLE_RATE) / (rc + 1 / SAMPLE_RATE);
  let prev = 0;
  for (let i = 0; i < buf.length; i++) {
    prev += a * (buf[i] - prev);
    buf[i] = prev;
  }
}

// Waveshaper distortion — multiple stages for HNW character
function distort(buf: Float32Array, amount: number): void {
  if (amount <= 0) return;
  const drive = 1 + (amount / 100) * 40; // 1 to 41
  const mix = Math.min(amount / 100, 1);

  for (let i = 0; i < buf.length; i++) {
    const dry = buf[i];
    let wet = dry * drive;

    // Stage 1: asymmetric soft clip (pedal-like)
    wet = Math.tanh(wet * 1.5) * 0.7 + Math.tanh(wet * 0.8 + 0.3) * 0.3;

    // Stage 2: hard clip with fold-back for gnarl
    if (Math.abs(wet) > 0.8) {
      const excess = Math.abs(wet) - 0.8;
      wet = Math.sign(wet) * (0.8 + Math.sin(excess * 8) * 0.2);
    }

    // Stage 3: extra tanh saturation at high drive
    if (drive > 10) {
      wet = Math.tanh(wet * 2);
    }

    buf[i] = dry * (1 - mix) + wet * mix;
  }
}

// Bit-crush & sample-rate reduction
function bitcrush(buf: Float32Array, amount: number): void {
  if (amount < 1) return;
  const t = amount / 100;
  const bits = Math.max(2, Math.round(16 - t * 13)); // 16 down to 3
  const steps = Math.pow(2, bits);

  // Also do sample rate reduction for aliasing crunch
  const holdSamples = 1 + Math.floor(t * 8); // 1 to 9 sample hold

  let held = 0;
  for (let i = 0; i < buf.length; i++) {
    if (i % holdSamples === 0) {
      held = Math.round(buf[i] * steps) / steps;
    }
    buf[i] = held;
  }
}

// Slow amplitude LFO — keeps things "wall"-like with subtle movement
function applyLFO(buf: Float32Array, rate: number, depth: number): void {
  if (rate <= 0 || depth <= 0) return;
  const d = depth / 100 * 0.4; // max 40% modulation so it stays wall-like
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE;
    // Slow complex LFO
    const lfo =
      Math.sin(2 * Math.PI * rate * t) * 0.5 +
      Math.sin(2 * Math.PI * rate * 0.37 * t + 1.2) * 0.3 +
      Math.sin(2 * Math.PI * rate * 1.73 * t + 0.5) * 0.2;
    buf[i] *= 1 - d + lfo * d;
  }
}

// Feedback saturation — creates self-reinforcing density
function feedbackSaturate(buf: Float32Array, amount: number): void {
  if (amount <= 0) return;
  const fb = (amount / 100) * 0.85; // Max 0.85 to avoid instability
  let prev = 0;
  for (let i = 0; i < buf.length; i++) {
    buf[i] = Math.tanh(buf[i] + prev * fb);
    prev = buf[i];
  }
}

// Generate low-end rumble layer
function addSubBassLayer(buf: Float32Array, amount: number, rng: () => number): void {
  if (amount < 1) return;
  const d = amount / 100;
  let phase1 = rng() * Math.PI * 2;
  let phase2 = rng() * Math.PI * 2;
  const freq1 = 25 + rng() * 15; // 25-40 Hz
  const freq2 = 40 + rng() * 30; // 40-70 Hz

  for (let i = 0; i < buf.length; i++) {
    phase1 += (2 * Math.PI * freq1) / SAMPLE_RATE;
    phase2 += (2 * Math.PI * freq2) / SAMPLE_RATE;
    // Noise-modulated sub bass
    const noiseMod = 1 + (rng() * 2 - 1) * 0.05;
    const sub =
      Math.sin(phase1 * noiseMod) * 0.6 +
      Math.sin(phase2 * noiseMod * 1.01) * 0.4;
    buf[i] += sub * d * 0.5;
  }
}

// Grit layer — textural mid-frequency static/crunch
function addGritLayer(buf: Float32Array, amount: number, rng: () => number): void {
  if (amount < 1) return;
  const d = amount / 100;
  const gritBuf = new Float32Array(buf.length);

  // Multiple short noise bursts layered for crunch texture
  for (let i = 0; i < buf.length; i++) {
    const w = rng() * 2 - 1;
    // Squared noise for harsher character
    gritBuf[i] = w * Math.abs(w);
  }

  // Band-limit the grit to 200-6000 Hz (mid-focused crunch)
  biquadHighpass(gritBuf, 200, 0.7);
  biquadLowpass(gritBuf, 6000, 0.7);

  // Saturate the grit layer independently
  for (let i = 0; i < gritBuf.length; i++) {
    gritBuf[i] = Math.tanh(gritBuf[i] * 4) * d * 0.6;
  }

  for (let i = 0; i < buf.length; i++) {
    buf[i] += gritBuf[i];
  }
}

// Layer stacking for density — HNW is about stacking many noise sources
function stackLayers(length: number, density: number, type: NoiseType, rng: () => number): Float32Array {
  const numLayers = 1 + Math.floor((density / 100) * 5); // 1 to 6 layers
  const buf = new Float32Array(length);

  for (let layer = 0; layer < numLayers; layer++) {
    const layerBuf = generateBaseNoise(length, type, rng);

    // Slightly different filtering per layer for width
    const filterOffset = (rng() - 0.5) * 2000;
    const freq = Math.max(100, 2000 + filterOffset);
    biquadLowpass(layerBuf, freq, 0.5 + rng() * 2);

    // Each layer gets independent saturation
    const layerDrive = 2 + rng() * 6;
    for (let i = 0; i < length; i++) {
      layerBuf[i] = Math.tanh(layerBuf[i] * layerDrive);
    }

    const layerGain = 1 / numLayers;
    for (let i = 0; i < length; i++) {
      buf[i] += layerBuf[i] * layerGain;
    }
  }

  return buf;
}

// Fade in/out envelope
function applyEnvelope(buf: Float32Array): void {
  const fadeLen = Math.min(Math.floor(SAMPLE_RATE * 0.08), Math.floor(buf.length * 0.02));
  for (let i = 0; i < fadeLen; i++) {
    const g = i / fadeLen;
    buf[i] *= g * g; // quadratic fade for smoother onset
    buf[buf.length - 1 - i] *= g * g;
  }
}

// Normalize to target peak
function normalize(buf: Float32Array, target: number = 0.95): void {
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

export function generateNoiseWall(params: NoiseParams): Float32Array {
  const length = Math.floor(params.duration * SAMPLE_RATE);
  const rng = seededRandom(params.seed);

  // 1. Generate stacked noise layers (density controls how many)
  const buf = stackLayers(length, params.density, params.noiseType, rng);

  // 2. Apply main filter shaping (lowpass to focus on mid/low)
  if (params.filterFreq < 19900) {
    biquadLowpass(buf, params.filterFreq, Math.max(0.3, params.filterQ * 0.15));
  }
  // Remove sub-20Hz DC offset
  biquadHighpass(buf, 20, 0.5);

  // 3. Apply LFO modulation (slow movement)
  applyLFO(buf, params.lfoRate, params.lfoDepth);

  // 4. Main distortion pass
  distort(buf, params.distortionAmount);

  // 5. Feedback saturation
  feedbackSaturate(buf, params.feedback);

  // 6. Add sub-bass rumble layer
  addSubBassLayer(buf, params.subBass, rng);

  // 7. Add grit/static texture layer
  addGritLayer(buf, params.grit, rng);

  // 8. Bitcrush (sample rate + bit reduction)
  if (params.bitcrush > 0) {
    bitcrush(buf, params.bitcrush);
  }

  // 9. Final saturation pass — glue everything into a wall
  for (let i = 0; i < buf.length; i++) {
    buf[i] = Math.tanh(buf[i] * 1.8);
  }

  // 10. Tame harsh highs with gentle rolloff above 12kHz
  lp1(buf, 12000);

  // 11. Envelope (short fades)
  applyEnvelope(buf);

  // 12. Normalize
  normalize(buf, 0.97);

  return buf;
}

export { SAMPLE_RATE };
