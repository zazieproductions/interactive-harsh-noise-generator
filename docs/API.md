# API Reference

NOISE WALL's public surface is the pure-DSP engine (`noiseSynth`) and the encoder/save layer
(`audioEncoder`, `saveFile`). `streamPlayer`, `patchUrl`, `format` and the `presets` module are
documented here too because they are self-contained and useful outside the app. This document is
the authoritative reference for their public surface and is kept in sync with the source.

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

#### `generateNoiseWallAsync(params, onProgress?): Promise<Float32Array>`

```ts
function generateNoiseWallAsync(
  params: NoiseParams,
  onProgress?: (p: GenerationProgress) => void,
): Promise<Float32Array>;
```

Runs the same 12-stage pipeline without blocking the event loop: the buffer is processed in
~5–12 s slices and the engine yields to the event loop after any slice long enough to risk
dropping a paint. `onProgress` (optional) is called after every slice with the overall percent
and the current stage label — use it to drive a progress bar.

The resolved buffer is **bit-identical** to `generateNoiseWall(params)` for the same params
(both drivers share the same sliceable loop bodies). Prefer this from browser UIs; keep
`generateNoiseWall` for synchronous contexts (Node scripts, workers).

#### `GenerationProgress` / `ProgressCallback`

```ts
interface GenerationProgress {
  percent: number;   // 0–100
  stage: string;     // e.g. 'Stacking noise layers', 'Filtering', 'Polishing'
}
type ProgressCallback = (progress: GenerationProgress) => void;
```

#### `WaveformPreview` / `buildWaveformPreview(buffer, columns)`

```ts
interface WaveformPreview {
  min: Float32Array;  // length = columns
  max: Float32Array;  // length = columns
}
function buildWaveformPreview(buffer: Float32Array, columns: number): Promise<WaveformPreview>;
```

Precomputes per-column min/max values for waveform rendering. The windowing matches the
visualizer's per-pixel scan exactly, so drawing from the preview is O(columns) instead of
O(buffer length) — the playhead animation stays smooth even for 10-minute walls. The function
yields to the event loop, so building a preview for a long wall doesn't block a paint.

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

Encodes a mono `Float32Array` to **MP3 (MPEG-1 Layer III)** using `@breezystack/lamejs`.

- `kbps` defaults to `192`. Supported values: `128`, `192`, `256`, `320` (CBR only — VBR is
  not exposed in the current UI but can be added with a `lamejs` configuration upgrade).
- Internally converts to `Int16Array` once, then feeds the encoder in **1152-sample blocks**
  (the MPEG-1 frame size for 44.1 kHz).
- Calls `encoder.flush()` at the end and concatenates all returned `Uint8Array` chunks into a
  single buffer.

The returned buffer is a complete MP3 stream of valid MPEG-1 Layer III frames, playable by any
standards-compliant decoder (`npm run verify` parses the first frame header and checks the
bitrate/sample-rate/mono fields). Note that the very first 1152-sample block usually encodes to
**zero bytes** — lamejs needs a full look-ahead window before it emits the first frame, so an
empty first chunk is expected, not a bug.

### `encodeWAVAsync(samples, onProgress?): Promise<ArrayBuffer>`

### `encodeMP3Async(samples, kbps?, onProgress?): Promise<ArrayBuffer>`

```ts
function encodeWAVAsync(samples: Float32Array, onProgress?: (fraction: number) => void): Promise<ArrayBuffer>;
function encodeMP3Async(samples: Float32Array, kbps?: number, onProgress?: (fraction: number) => void): Promise<ArrayBuffer>;
```

Byte-identical to `encodeWAV` / `encodeMP3` (same WAV header and sample mapping; the same
1152-sample MP3 blocks fed to the same encoder instance in the same order), but the work is
split into ~32 slices with an event-loop yield and a progress callback (0–1) between them.
Use these from browser UIs so long exports don't freeze the page.

### Streaming encoders and sinks

```ts
interface ByteSink { write(bytes: Uint8Array<ArrayBuffer>): Promise<void>; }
class BlobSink implements ByteSink { constructor(mimeType: string); blob(): Blob; }

buildWavHeader(dataLength: number, format?: WavFormat): Uint8Array<ArrayBuffer>

writeWAVAsync(samples: Float32Array, sink: ByteSink, onProgress?): Promise<void>
writeMP3Async(samples: Float32Array, kbps: number, sink: ByteSink, onProgress?): Promise<void>

encodeWAVBlobAsync(samples: Float32Array, onProgress?): Promise<Blob>
encodeMP3BlobAsync(samples: Float32Array, kbps?: number, onProgress?): Promise<Blob>

downloadBlob(blob: Blob, filename: string): void
```

The `write*Async` pair emits encoded bytes in ~512 KB slices as they are produced, which is what
makes the mobile export path flat in memory: `saveFile.ts` can point the sink at the user's file
handle (File System Access) instead of accumulating a second copy of the render. Slices are
written in order and the concatenation is byte-identical to the in-memory encoders — asserted by
`npm run verify`.

`buildWavHeader` exposes the exact 44-byte canonical header for callers that write their own
container. TypeScript note: sinks are typed `Uint8Array<ArrayBuffer>` (rather than plain
`Uint8Array`) because `BlobPart` requires an `ArrayBuffer`-backed view under TS 5.7+ generics.

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

## `src/utils/streamPlayer.ts`

### `class StreamingPlayer`

```ts
interface StreamingPlayerOptions {
  context: AudioContext;
  samples: Float32Array;
  sampleRate?: number;   // default 44100
  volume?: number;       // 0–1, default 0.5
  chunkSeconds?: number; // s of audio per scheduled node, default 2
  protect?: boolean;     // insert the DynamicsCompressor, default true
}

new StreamingPlayer(options: StreamingPlayerOptions)

player.play(fromSeconds?: number): void
player.stop(reset?: boolean): void   // reset: true rewinds to 0
player.seek(seconds: number): void
player.setVolume(value: number): void
player.dispose(): void

player.state: 'stopped' | 'playing' | 'ended'
player.position: number      // seconds
player.duration: number      // seconds
player.onStateChange: ((state: PlayerState) => void) | null
```

Plays a render **without copying it into an `AudioBuffer`**. Chunks of `chunkSeconds` are scheduled
as `AudioBufferSourceNode`s up to 5 s ahead of the playhead and re-filled every 200 ms, so peak
playback memory is a few hundred KB regardless of the render's length (a 10-minute wall is 106 MB
as a single `AudioBuffer`). `seek()` re-anchors the schedule at the new offset; chunks that start
late (throttled tab, resumed context) are started immediately at the correct *offset* rather than
dropped, so audio stays in sync with `position`. Play/stop apply a 20 ms gain ramp, so there are no
clicks. The source buffer is only ever read.

---

## `src/utils/saveFile.ts`

```ts
type SaveOutcome = 'saved' | 'shared' | 'downloaded' | 'cancelled';

saveWAV(samples: Float32Array, filename: string, options?: SaveOptions): Promise<SaveOutcome>
saveMP3(samples: Float32Array, kbps: number, filename: string, options?: SaveOptions): Promise<SaveOutcome>

canStreamToDisk(): boolean                       // File System Access API present
canShareFiles(filename: string, mime: string): boolean
copyText(text: string): Promise<boolean>
shareLink(url: string, title: string): Promise<'shared' | 'copied' | 'failed'>

interface SaveOptions {
  onProgress?: (fraction: number) => void;  // 0–1
  preferShare?: boolean;                    // hand the file to the OS share sheet
  title?: string;
}
```

Chooses the best available route to get a file onto the device, in this order:

1. **File System Access** — prompts for a destination and streams encoded slices to disk
   (constant memory).
2. **Web Share level 2** *(when `preferShare` is set)* — hands the finished file to the OS share
   sheet (iOS: Files/AirDrop; Android: any target).
3. **Blob download** — `<a download>` with an object URL, revoked after the click.

A user cancelling any picker resolves to `'cancelled'` rather than throwing. `copyText` falls back
to a hidden textarea when `navigator.clipboard` is unavailable (insecure origins).

---

## `src/utils/patchUrl.ts`

```ts
encodePatch(params: NoiseParams): string                 // "nw1&t=white&d=30&…"
decodePatch(hash: string): Partial<NoiseParams> | null   // validated + clamped
paramsFromPatch(patch: Partial<NoiseParams> | null): NoiseParams
patchFromLocation(): Partial<NoiseParams> | null
syncLocationHash(params: NoiseParams): void              // replaceState, no history spam
buildShareUrl(params: NoiseParams): string
```

The patch hash is versioned (`nw1`) and uses one short key per field. `decodePatch` ignores unknown
keys and clamps every number into the control's legal range, so a hand-edited URL can never feed
out-of-range parameters to the engine; `paramsFromPatch` merges over `DEFAULT_PARAMS`, so a
truncated link is still renderable.

---

## `src/presets.ts`

```ts
interface Preset {
  name: string;
  icon: string;
  desc: string;
  params: NoiseParams;   // params.duration is the length it was tuned at (informational)
}

const PRESETS: Preset[];
```

Plain data — append an entry and the preset appears in the UI. Applying one keeps the user's
current duration.

---

## `src/utils/format.ts`

```ts
formatDuration(seconds: number): string      // 90 → "1m 30s"
formatClock(seconds: number): string         // 125 → "2:05"
formatBytes(bytes: number): string           // 52428800 → "50.0 MB"

interface RenderEstimate {
  samples: number; renderBytes: number; wavBytes: number; peakBytes: number; samplesLabel: string;
}
estimateRender(seconds: number): RenderEstimate
```

`estimateRender` powers the memory warnings in the UI (render + largest export target). It is a
deliberately approximate planning tool, not a guarantee.

---

## React Components

The React components are **not part of the public API** — they are application-private and
documented here for contributors.

### `<App />`

Default export. Root component; owns all state and renders the full interface. Has no props.

### Components (`src/components/`)

| Component | Props (summary) | Notes |
|-----------|-----------------|-------|
| `Slider` | `label, value, min, max, step?, unit?, format?, onChange, hint?` | Styled native range input: 44 px hit area, 26 px thumb, fill driven by a `--nw-fill` custom property |
| `Section` | `title, summary?, defaultOpen?, description?` | Collapsible control group on phones, always expanded at `lg`+ |
| `WaveformVisualizer` | `preview, progress, durationSeconds, onSeek?, busy?` | DPR-aware canvas; the surface is a `role="slider"` scrub control (pointer drag + arrow keys) |
| `TransportBar` | `isGenerating, progress, stage, statusKind, statusText, hasBuffer, isPlaying, onGenerate, onTogglePlay, onOpenSave, onOpenMore` | Pinned bottom bar; safe-area aware |
| `SaveSheet` | `open, onClose, params, mp3Bitrate, encoding, onSaveWAV, onSaveMP3, onCopyLink, onShareLink, …` | WAV/MP3 export plus patch-link sharing |
| `MoreSheet` | `open, onClose, device, canInstall, onInstall, onRandomizeSeed, onResetDefaults, …` | Seed, reset, install, device budget, repo link |
| `Sheet` | `open, title, subtitle?, onClose, children, footer?` | Focus-managed bottom sheet / dialog primitive |
| `InstallHint` | `device, canInstall, onInstall` | Dismissible add-to-home-screen nudge |

The visualizer draws from the precomputed per-column preview: draw cost is proportional to the
canvas width (≈1200 `fillRect` calls per frame at most), not to buffer length.

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

- MP3 encoding uses `@breezystack/lamejs`, an ESM build of the pure-JS LAME port that works in both
  browsers and Node, and ships its own TypeScript types. (The original npm `lamejs@1.2.1` throws
  `ReferenceError: MPEGMode is not defined` under any bundler — see
  [SETUP.md](./SETUP.md#mp3-export-throws-mpegmode-is-not-defined).)
- `scripts/verify.ts` is a worked example of importing the engine from Node and asserting
  determinism and export integrity; `scripts/smoke.tsx` shows mounting the React app in jsdom.
- The browser-only helpers (`saveFile`, `streamPlayer`, `patchUrl`) are deliberately outside
  `noiseSynth`/`audioEncoder`, so a Node consumer can ignore them.

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
