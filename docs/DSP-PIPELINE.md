# DSP Pipeline

This document details the 12-stage signal-processing pipeline that turns a `NoiseParams` object
into a mono 44.1 kHz `Float32Array`. It is intended for engineers and sound designers who want to
understand — or modify — the sound of NOISE WALL at the algorithmic level.

All code references point to `src/utils/noiseSynth.ts`. All stages operate at
**SAMPLE_RATE = 44 100 Hz**.

---

## Signal Flow Diagram

```
                  ┌──────────────────────┐
 params.seed ───▶ │ mulberry32 PRNG (rng)│
                  └──────────┬───────────┘
                             │ rng
                             ▼
   ┌──────────────────────────────────────────────────┐
   │ 1. stackLayers(density, noiseType, rng)          │
   │    • N independent base-noise layers (N = 1…6)   │
   │    • Each layer independently lowpassed & tanh-saturated
   │    • Summed with 1/N gain                        │
   └─────────────────────┬────────────────────────────┘
                         ▼
   ┌──────────────────────────────────────────────────┐
   │ 2. biquadLowpass(filterFreq, Q = filterQ·0.15)  │
   │    • RBJ biquad, direct-form II transposed       │
   └─────────────────────┬────────────────────────────┘
                         ▼
   ┌──────────────────────────────────────────────────┐
   │ 3. biquadHighpass(20 Hz, Q = 0.5)               │
   │    • DC offset removal                           │
   └─────────────────────┬────────────────────────────┘
                         ▼
   ┌──────────────────────────────────────────────────┐
   │ 4. applyLFO(lfoRate, lfoDepth)                   │
   │    • Three-sine complex LFO, ≤40% AM depth       │
   └─────────────────────┬────────────────────────────┘
                         ▼
   ┌──────────────────────────────────────────────────┐
   │ 5. distort(distortionAmount)                     │
   │    • Asymmetric soft clip → foldback → tanh      │
   └─────────────────────┬────────────────────────────┘
                         ▼
   ┌──────────────────────────────────────────────────┐
   │ 6. feedbackSaturate(feedback)                    │
   │    • One-sample recursive tanh, fb ≤ 0.85        │
   └─────────────────────┬────────────────────────────┘
                         ▼
   ┌──────────────────────────────────────────────────┐
   │ 7. addSubBassLayer(subBass, rng)                 │
   │    • Dual detuned sines, noise-modulated, 25–70Hz│
   └─────────────────────┬────────────────────────────┘
                         ▼
   ┌──────────────────────────────────────────────────┐
   │ 8. addGritLayer(grit, rng)                       │
   │    • x·|x| white noise, bandpassed 200–6000Hz, tanh
   └─────────────────────┬────────────────────────────┘
                         ▼
   ┌──────────────────────────────────────────────────┐
   │ 9. bitcrush(bitcrush) [if amount > 0]            │
   │    • Joint bit-depth reduction + sample & hold   │
   └─────────────────────┬────────────────────────────┘
                         ▼
   ┌──────────────────────────────────────────────────┐
   │ 10. Final glue: tanh(buf[i] * 1.8)               │
   └─────────────────────┬────────────────────────────┘
                         ▼
   ┌──────────────────────────────────────────────────┐
   │ 11. lp1(12000 Hz)                                │
   │    • One-pole lowpass, gentle air rolloff        │
   └─────────────────────┬────────────────────────────┘
                         ▼
   ┌──────────────────────────────────────────────────┐
   │ 12. applyEnvelope() → normalize(0.97)            │
   │    • 80 ms quadratic fades; peak normalize       │
   └─────────────────────┬────────────────────────────┘
                         ▼
                    Float32Array
                    (mono, 44.1 kHz,
                     peak ≈ −0.27 dBTP)
```

---

## 1. Layer Stacking

```ts
function stackLayers(length, density, type, rng)
```

Density is the single most important control for "wall" character. The knob `0–100` maps to
**1–6 independent layers**:

```
numLayers = 1 + floor((density / 100) * 5)
layerGain  = 1 / numLayers
```

Each layer is generated independently with its **own draw from the PRNG**, then:

1. Lowpass-filtered at `2000 Hz + U(−1000, +1000) Hz`, Q `~U(0.5, 2.5)` — per-layer frequency and
   resonance variation gives the impression of "width" even in mono.
2. Hard-driven through `tanh(x * drive)` where `drive ~ U(2, 8)` — layer-local saturation before
   global distortion.
3. Summed into the master buffer with equal `1/N` gain.

Because the same PRNG sequence is used in order, the per-layer variation is fully deterministic.

### Base Noise Generators

All generators run at `SAMPLE_RATE` and emit nominally `[-1, 1]` floats.

#### White (`genWhite`)

```
buf[i] = rng() * 2 - 1
```

Flat-spectrum uniform white noise. The simplest possible generator; used as the foundation for
several other colors.

#### Pink (`genPink`) — Paul Kellet refined

The standard Voss-McCartney approximation with seven decaying integrators:

```
b0 = 0.99886 * b0 + w * 0.0555179
b1 = 0.99332 * b1 + w * 0.0750759
b2 = 0.96900 * b2 + w * 0.1538520
b3 = 0.86650 * b3 + w * 0.3104856
b4 = 0.55000 * b4 + w * 0.5329522
b5 = -0.7616 * b5 - w * 0.0168980
buf[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
b6 = w * 0.115926
```

Approximates a −3 dB/octave spectrum. Sounds warm, natural, and closer to "air / hiss" than
white noise.

#### Brown (`genBrown`) — Brownian / red

```
last = (last + 0.02 * w) / 1.02
buf[i] = last * 3.5
```

A leaky integrator produces −6 dB/octave (Brownian) spectrum. Scaled up to recover level after
the inherent lowpass. Useful for deep rumble.

#### Grey (`genGrey`)

Pink + a smaller amount of white mixed in:

```
pink = genPink(...)
buf[i] = pink * 1.2 + w * 0.4
```

"Grey" is not a formal spectral shape — it is tuned by ear to sit in a mid-heavy "equal-loudness"
range that sounds full and aggressive on consumer speakers without the shrill top-end of pure
white or the mud of pure brown.

#### Crackling (`genCrackling`)

Two simultaneous processes:

1. **Background static**: `last = last * 0.7 + w * 0.3` (a 1-pole-smoothed white).
2. **Bursts**: when `rng() < 0.015`, inject a burst of 20–100 samples of random ± values with a
   linear decay envelope, then skip ahead 30 samples so bursts don't smear into each other.

Produces vinyl/film-style crackle over a dense static bed.

#### Digital (`genDigital`)

Randomly held ±1 (and occasionally intermediate) values:

```
if (holdCounter <= 0) {
  hold = rng() > 0.5 ? 1 : -1
  holdCounter = 1 + floor(rng() * 6)
  if (rng() < 0.3) hold *= rng() * 0.5 + 0.5
}
buf[i] = hold
holdCounter--
```

The 1–6 sample hold produces aliased square-wave-ish harshness reminiscent of early digital
synths / broken sound cards.

#### Saturated (`genSaturated`)

Pre-mixes white + pink + brown and immediately saturates:

```
mixed = white[i]*0.5 + pink[i]*0.8 + brown[i]*0.4
buf[i] = tanh(mixed * 3)
```

Provides the densest starting point — effectively a "pre-walled" source.

---

## 2–3. Biquad Filter Pair

Two RBJ (Robert Bristow-Johnson) Audio-EQ-Cookbook biquads run in direct-form II transposed
configuration:

```
w0    = 2·π·f / Fs
alpha = sin(w0) / (2·Q)
cosw  = cos(w0)

(lowpass)                               (highpass)
b0 = (1 - cosw)/2                       b0 = (1 + cosw)/2
b1 = 1 - cosw                           b1 = -(1 + cosw)
b2 = (1 - cosw)/2                       b2 = (1 + cosw)/2
a0 = 1 + alpha                          a0 = 1 + alpha
a1 = -2·cosw                            a1 = -2·cosw
a2 = 1 - alpha                          a2 = 1 - alpha
```

Coefficients are normalized (`/a0`) before processing.

- **Stage 2** applies the user's lowpass. Q is derived from the Resonance knob as `max(0.3,
  filterQ * 0.15)` (scaled to avoid self-oscillation).
- **Stage 3** is fixed at 20 Hz, Q 0.5 — DC removal. Without this the accumulated feedback and
  distortion can introduce a slow DC wander that eats headroom.

Clamping protects against unstable parameters: `f ∈ [20, 0.48·Fs]`, `Q ≥ 0.1`.

---

## 4. LFO

```
lfo = sin(2π·f·t)·0.5
    + sin(2π·f·0.37·t + 1.2)·0.3
    + sin(2π·f·1.73·t + 0.5)·0.2
buf[i] *= 1 - d + lfo·d
d     = (lfoDepth / 100) * 0.4
```

Three incommensurate sinusoids produce a complex, non-repeating modulation. Depth is hard-capped
at **40% peak amplitude deviation**; stronger modulation starts to make the wall feel rhythmic
rather than static, which defeats the HNW brief.

The ratios 0.37 and 1.73 are chosen to be near-irrational so the composite waveform doesn't
repeat on any reasonable timescale.

---

## 5. Waveshaper Distortion

A three-stage drive/waveshaper applied wet/dry:

```
drive = 1 + (amount/100) * 40         // [1, 41]
mix   = min(amount / 100, 1)
wet   = dry * drive
// Stage 1 — asymmetric soft clip (tube/transistor hybrid feel)
wet   = tanh(wet * 1.5) * 0.7 + tanh(wet * 0.8 + 0.3) * 0.3
// Stage 2 — foldback beyond 0.8
if |wet| > 0.8:
    excess = |wet| - 0.8
    wet = sign(wet) * (0.8 + sin(excess * 8) * 0.2)
// Stage 3 — extra tanh at high drive (gated by drive > 10)
if drive > 10: wet = tanh(wet * 2)
out = dry·(1 - mix) + wet·mix
```

This gives a smooth saturation at low amounts that builds into gnarled, harmonic-rich grind at
high values without simply sounding like a hard clip.

---

## 6. Feedback Saturation

```
fb = (amount / 100) * 0.85
prev = 0
for each sample:
  buf[i] = tanh(buf[i] + prev * fb)
  prev   = buf[i]
```

A single-sample recursive path re-injects the previous output into the current input before a
final tanh. This produces a density-boosting, glue-like saturation reminiscent of a compressor's
release behavior. The `0.85` cap prevents oscillation (the closed-loop gain must stay below 1).

---

## 7. Sub-Bass Layer

```
freq1 = 25 + rng()*15     // 25–40 Hz
freq2 = 40 + rng()*30     // 40–70 Hz
noiseMod = 1 + (rng()*2 - 1) * 0.05
sub = sin(φ1) * 0.6 + sin(φ2) * 0.4
buf[i] += sub * d * 0.5
```

Two detuned low-frequency sinosoids with 5% random frequency modulation per sample create a
beating, unstable sub rumble rather than a clean tone. Added at up to 50% wet level, this
gives walls physical weight on speakers and subwoofers without dominating the mid-band.

---

## 8. Grit Layer

A dedicated mid-frequency "crunch" texture:

1. Generate white noise.
2. Shape with `w * |w|` (squared-magnitude sign-preserving nonlinearity — harsher than plain
   noise, closer to digital clipping fragments).
3. Band-limit with highpass @ 200 Hz then lowpass @ 6000 Hz (Q 0.7), keeping it in the mid-band.
4. Independent saturation via `tanh(grit * 4)`.
5. Mix into main buffer at `0.6 * d` gain.

Because it's band-limited, the grit layer adds perceived harshness without fatiguing the high
end.

---

## 9. Bitcrush

Combined bit-depth and sample-rate reduction:

```
bits        = max(2, round(16 - t * 13))     // 16 → 3 bits as t: 0→1
steps       = 2^bits
holdSamples = 1 + floor(t * 8)               // 1 → 9 samples
held = round(buf[i] * steps) / steps         // requantize
```

The same control drives both dimensions simultaneously because in practice they feel coupled:
low bitcrush adds subtle aliasing, high bitcrush produces full lo-fi digital collapse.

---

## 10. Glue Saturation

A final `tanh(buf[i] * 1.8)` pass cements the layers into a single cohesive wall and guarantees
that even worst-case summation (from sub + grit + feedback) stays bounded.

---

## 11. Gentle High-End Rolloff

A one-pole lowpass at 12 kHz:

```
rc = 1 / (2·π·f)
a  = (1/Fs) / (rc + 1/Fs)
prev += a * (buf[i] - prev)
buf[i] = prev
```

This tames the shrill digital artifacts that otherwise pile up after heavy distortion/bitcrush,
keeping the wall "dense" rather than "piercing."

---

## 12. Envelope + Normalize

- **Fades**: 80 ms quadratic fades (`g * g` shape) at the start and end of the buffer prevent
  clicks/pops when the user hits play. The quadratic curve is perceptually smoother than linear
  at very short fade lengths.
- **Normalize**: scans for peak `|s|` and scales the entire buffer so that peak = 0.97
  (~−0.27 dBTP), leaving 3% headroom for the MP3 encoder and the playback compressor.

---

## Playback DSP (Not Part of the Rendered Buffer)

After the buffer is rendered, playback inserts two extra nodes **only in the monitoring path**,
so exported WAV/MP3 files are unaffected:

```
GainNode (user volume, default 0.5)
   └─▶ DynamicsCompressorNode
         threshold : −20 dB
         knee      : default (30 dB)
         ratio     : 12:1
         attack    : 3 ms
         release   : 250 ms
```

This compressor exists solely to protect the user's equipment and ears during preview. It is
deliberately **not** baked into exported audio — the exported file is a faithful record of what
the user designed. If users want compression on the master, they can apply it in their DAW.

---

## Coefficient Index (Quick Reference)

| Parameter | Value | Why |
|-----------|-------|-----|
| Sample rate | 44 100 Hz | CD standard; MP3-friendly |
| Bit depth (internal) | 32-bit float | Maximum headroom during processing |
| Bit depth (WAV export) | 16-bit PCM | Universal compatibility |
| HP DC removal | 20 Hz, Q 0.5 | Removes wander without audible effect |
| LP safety rolloff | 12 kHz, 1-pole | Tames post-distortion shrillness |
| Feedback cap | 0.85 | Stability margin for recursive loop |
| LFO depth cap | 40% | Preserves static-wall character |
| Fade length | 80 ms | Eliminates clicks; too short to hear as a fade |
| Normalization target | 0.97 peak (−0.27 dBTP) | Leaves inter-sample headroom |
| Compressor threshold (preview only) | −20 dB | Aggressive speaker safety |
| Compressor ratio (preview only) | 12:1 | Aggressive speaker safety |
| Sub-bass range | 25–70 Hz | Tactile, not tonal |
| Grit bandpass | 200–6000 Hz | Mid-band crunch, no stridency |
| Bitcrush range | 3–16 bits, 1–9 sample hold | Extreme but musical |

---

## Adding New Stages

See the "Adding DSP Stages or Noise Types" section of
[CONTRIBUTING.md](../CONTRIBUTING.md#adding-dsp-stages-or-noise-types) for the process. In
short:

1. Keep stages O(n) and in-place where possible.
2. Use the provided `rng` for any randomness.
3. Clamp every coefficient to a stable range.
4. Update this document.
5. Verify all 8 factory presets still sound intentional.
