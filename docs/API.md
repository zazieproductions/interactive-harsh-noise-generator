# API Reference

NOISE WALL exposes two public TypeScript modules: `noiseSynth` (the pure-DSP engine) and
`audioEncoder` (the WAV/MP3 encoders and download helper). This document is the authoritative
reference for their public surface and is kept in sync with the source.

> **Stability note:** as of v1.0.0, the surface below is the public API. The engine is primarily
> consumed by `App.tsx` inside the same repository, but it is intentionally factored to be
> importable from other TS/JS projects (Node, Workers, other front-ends). Breaking changes will
> bump the major version.

---

## `src/utils/noiseSynth.ts`

### Types

#### `NoiseType`

```ts
type NoiseType =
  | 'white'
  | 'pink'
  | 'brown'
  | 'grey'
  | 'crackling'
  | 'digital'
  | 'saturated';
```

Union of supported base noise generators. See [DSP-PIPELINE.md](./DSP-PIPELINE.md#base-noise-generators)
for per-algorithm descriptions.

#### `NoiseParams`

```ts
interface NoiseParams {
  duration: number;           // seconds, clamped by caller to [2, 600]
  noiseType: NoiseType;
  distortionAmount: number;   // [0, 100]
  density: number;            // [0, 100]
  feedback: number;           // [0, 100]
  lfoRate: number;            // Hz, [0, 10]
  lfoDepth: number;           // [0, 100]
  filterFreq: number;         // Hz, [100, 16000]
  filterQ: number;            // [0, 30]
  bitcrush: number;           // [0, 100]
  subBass: number;            // [0, 100]
  grit: number;               // [0, 100]
  seed: number;               // signed 32-bit integer
}
```

All numeric fields are plain `number`. The engine does not currently validate ranges; the UI
enforces them via slider constraints. If you call the engine directly, you are responsible for
passing in-range values. Out-of-range behavior is documented per parameter below:

| Field | Out-of-range behavior |
|-------|-----------------------|
| `duration` | Allocates `floor(duration * 44100)` samples. Negative or zero returns a zero-length (or tiny) buffer; no error thrown. |
| `noiseType` | TypeScript will reject unknown variants at compile time. At runtime, the `switch` falls through and the TypeScript compiler's exhaustiveness check will catch missing cases. |
| `distortionAmount`, `density`, `feedback`, `lfoDepth`, `bitcrush`, `subBass`, `grit` | Values above 100 behave as if clamped (drive scales linearly; >100 produces more extreme distortion). Values below 0 act as 0. |
| `lfoRate` | >10 Hz produces audible tremolo rather than slow movement; no hard cap in the engine. |
| `filterFreq` | Clamped internally to `[20, 0.48 · Fs]` to keep the biquad stable. Frequencies below 20 Hz will still remove DC via the 20 Hz HPF. |
| `filterQ` | Clamped internally to `≥ 0.1`. Values above ~20+ can ring noticeably. |
| `seed` | Coerced via `seed \| 0` inside the PRNG to a signed 32-bit integer. Non-integers truncate toward zero. |

### Constants

#### `DEFAULT_PARAMS`

```ts
const DEFAULT_PARAMS: NoiseParams = {
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
```

These are the parameters loaded on first launch. They are also the implicit baseline before any
preset is applied (presets override all fields).

#### `SAMPLE_RATE`

```ts
const SAMPLE_RATE: 44100;
```

Fixed 44.1 kHz. The current engine is not sample-rate-agnostic; changing this value would
require recomputing all time constants (fade lengths, filter coefficients, sub frequencies,
etc.) and is **not** a supported configuration knob.

### Functions

#### `generateNoiseWall(params): Float32Array`

```ts
function generateNoiseWall(params: NoiseParams): Float32Array;
```

Runs the full 12-stage DSP pipeline (see [DSP-PIPELINE.md](./DSP-PIPELINE.md)) and returns a
**new** `Float32Array` of length `floor(params.duration * SAMPLE_RATE)` containing mono audio
samples in `[-1, 1]`. It does **not** mutate `params` and has no observable side effects.

**Determinism:** given the same `params` and the same engine version, the returned buffer is
bit-identical across V8, SpiderMonkey, and JavaScriptCore.

**Complexity:** O(n) where n = sample count. Memory allocation is O(n) for the primary buffer
plus several temporary buffers of length n during grit/sub/layer stacking (totalling ~4n
`Float32Array` peak allocation). See [PERFORMANCE.md](./PERFORMANCE.md).

**Example (Node / bundler):**

```ts
import { writeFileSync } from 'node:fs';
import { generateNoiseWall, DEFAULT_PARAMS } from './src/utils/noiseSynth';
import { encodeWAV } from './src/utils/audioEncoder';

const buf = generateNoiseWall({ ...DEFAULT_PARAMS, duration: 30, seed: 42 });
const wav = encodeWAV(buf);
writeFileSync('wall.wav', Buffer.from(wav));
```

---

## `src/utils/audioEncoder.ts`

### `encodeWAV(samples): ArrayBuffer`

```ts
function encodeWAV(samples: Float32Array): ArrayBuffer;
```

Encodes a mono `Float32Array` to a **16-bit PCM WAV** file in a freshly allocated
`ArrayBuffer`. The output:

- RIFF/WAVE container
- `fmt ` subchunk: PCM (format 1), mono, 44.1 kHz, 16-bit, byte rate = `44100 * 2`,
  block align = 2
- `data` subchunk containing all samples as little-endian 16-bit signed integers

Sample values are clamped to `[-1, 1]` defensively. Negative values map to `s * 0x8000` and
non-negative values to `s * 0x7FFF` to correctly cover the full signed 16-bit range without
overflow at −1.0.

The returned buffer is owned by the caller; there is no pooling.

### `encodeMP3(samples, kbps?): ArrayBuffer`

```ts
function encodeMP3(samples: Float32Array, kbps?: number): ArrayBuffer;
```

Encodes a mono `Float32Array` to **MP3 (MPEG-1 Layer III)** using `lamejs`.

- `kbps` defaults to `192`. Supported values: `128`, `192`, `256`, `320` (CBR only — VBR is
  not exposed in the current UI but can be added with a `lamejs` configuration upgrade).
- Internally converts to `Int16Array` once, then feeds the encoder in **1152-sample blocks**
  (the MPEG-1 frame size for 44.1 kHz).
- Calls `encoder.flush()` at the end and concatenates all returned `Uint8Array` chunks into a
  single buffer.

The returned buffer is a complete MP3 file with a valid Xing/Info header (as produced by
lamejs). It is playable by any standards-compliant MP3 decoder.

### `downloadBuffer(buffer, filename, mimeType): void`

```ts
function downloadBuffer(
  buffer: ArrayBuffer,
  filename: string,
  mimeType: string,
): void;
```

Browser-only helper that:

1. Wraps `buffer` in a `Blob` with the given MIME type.
2. Creates an object URL via `URL.createObjectURL`.
3. Appends a temporary `<a download="filename" href="url">` to `document.body`.
4. Dispatches a synthetic click.
5. Removes the anchor and **immediately revokes the object URL** to free memory.

Filenames generated by the UI follow the pattern `hnw-${noiseType}-${duration}s-${seed}.{wav|mp3}`.

> This function touches the DOM. It is intentionally separated from the pure encoders so that
> `encodeWAV` / `encodeMP3` can run in Node or a Web Worker.

---

## `src/utils/cn.ts`

### `cn(...inputs): string`

```ts
function cn(...inputs: ClassValue[]): string;
```

Thin wrapper that composes [`clsx`](https://www.npmjs.com/package/clsx) with
[`tailwind-merge`](https://www.npmjs.com/package/tailwind-merge). Use it to combine conditional
Tailwind classes while letting `tailwind-merge` deduplicate conflicting utilities:

```tsx
<button className={cn(
  'px-4 py-2 rounded',
  isActive && 'bg-red-700 text-white',
  isActive && 'bg-red-800',   // tailwind-merge picks the last bg-*
)} />
```

---

## React Components

The React components in `src/App.tsx` are **not currently part of the public API** — they are
application-private. They are documented here for contributors.

### `<App />`

Default export. Root component; owns all state and renders the full interface. Has no props.

### `<Slider />` (internal)

```ts
interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;   // default 1
  unit?: string;   // appended to the readout (e.g. " Hz", "s")
  onChange: (v: number) => void;
}
```

A styled range input with a gradient fill track and a monospaced tabular-numeric value readout.
The native `<input type="range">` handles all keyboard/a11y interactions.

### `<WaveformVisualizer />` (internal)

```ts
interface WaveformVisualizerProps {
  buffer: Float32Array | null;
  playProgress: number;   // 0–1
}
```

1200×280 canvas that draws the waveform as one-pixel-wide min/max density bars. Re-renders when
`buffer` or `playProgress` change. Draw cost is proportional to the canvas's width in pixels,
not to buffer length, so it stays fast even for 10-minute walls.

The played portion (left of `playProgress`) renders in a brighter red with an unplayed tail in
a dimmer red. A glowing white vertical playhead follows `playProgress`. Subtle horizontal
scanlines (every 2 pixels, 6% black) are overlaid for a CRT feel.

---

## Importing the Engine Elsewhere

The engine (`noiseSynth.ts` and `audioEncoder.ts`) has no runtime dependency on React or on
the DOM (with the exception of `downloadBuffer`, which is purely a browser convenience).
Consumers in Node or other bundlers can import the engine directly:

```ts
// ESM
import { generateNoiseWall } from './src/utils/noiseSynth.ts';
import { encodeWAV, encodeMP3 } from './src/utils/audioEncoder.ts';
```

Notes for non-browser consumers:

- `lamejs` is a browser-friendly UMD package; it works in Node as well (it has no DOM calls).
- TypeScript types for `lamejs` live in `src/types/lamejs.d.ts` — include that file in your
  `tsconfig.json#include` (or add a similar ambient declaration) if you use `encodeMP3`.
- There are no Node-only entry points yet (planned for a future release; see
  [ROADMAP.md](../ROADMAP.md)).

---

## Versioning Policy for the API

- The **engine API** (`generateNoiseWall`, `NoiseParams`, `SAMPLE_RATE`, `DEFAULT_PARAMS`) is
  considered the semver "major" surface. Removing or renaming exports, or changing the meaning
  of existing parameters in a way that breaks callers, will bump the major version.
- The **UI components** (`Slider`, `WaveformVisualizer`, preset data) are app-private and may
  change at any time, though we will attempt to keep prop shapes stable.
- The **audio output** (the byte content of the buffer for a given seed+params) is **not**
  guaranteed to be identical across major versions. DSP improvements will change sound. Presets
  are re-validated with each release to ensure they still match their intended character.
