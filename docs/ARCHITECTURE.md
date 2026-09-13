# Architecture

This document explains how NOISE WALL is structured, why it is structured the way it is, and
where each responsibility lives. It is written for engineers who want to understand the system
end-to-end before contributing.

---

## Design Principles

1. **Pure DSP core.** The synthesis engine has no I/O, no DOM, no Web Audio, no React. It accepts
   typed inputs and returns a new buffer. This makes it deterministic, testable, portable to
   Node/WASM/Web Workers, and trivially cacheable.
2. **Thin UI shell.** React owns state, layout, event wiring, and the canvas visualizer. It does
   not own signal processing.
3. **Single-file deliverable.** The build outputs one `index.html` containing all JS, CSS, and
   assets. There is no runtime chunk loading, no CDN, no font fetch.
4. **Strict TypeScript everywhere.** `strict: true`, no `any` in engine code, explicit types for
   the public API.
5. **Determinism over randomness.** All stochastic processes flow through a seeded PRNG passed
   into functions; there are no calls to `Math.random()` inside the DSP chain.
6. **Client-first, zero-network.** No telemetry, no remote fonts, no tracking, no fetch calls
   after the initial page load. The user's audio never leaves the tab.

---

## High-Level Module Map

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              index.html                                 │
│  (Vite entry; mounts #root; inlined JS/CSS in production build)         │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                            src/main.tsx                                 │
│  Creates React root; renders <App/> inside <StrictMode>                 │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                             src/App.tsx                                 │
│  • UI shell: header, collapsible <Section>s, waveform, presets, footer  │
│  • React state: NoiseParams (seeded from the URL hash), samples,        │
│    transport, volume, sheets, status                                    │
│  • Components: components/ (Slider, Section, WaveformVisualizer,        │
│    TransportBar, SaveSheet, MoreSheet, InstallHint, Sheet)              │
│  • Hooks: hooks/ (useDeviceProfile, useWakeLock, useInstallPrompt)      │
│  • Wires noiseSynth → audioEncoder/saveFile → file or share sheet       │
│  • Wires noiseSynth → streamPlayer → Compressor → destination           │
└───────┬──────────────────────────┬───────────────────┬──────────────────┘
        │                          │                   │
        ▼                          ▼                   ▼
┌────────────────┐  ┌───────────────────────┐  ┌────────────────────┐
│ noiseSynth.ts  │  │ audioEncoder.ts       │  │ streamPlayer.ts    │
│                │  │  + saveFile.ts        │  │ (browser)          │
│ Pure function  │  │                       │  │ Chunked scheduling │
│ library.       │  │ encodeWAV/encodeMP3   │  │ GainNode (volume)  │
│ No side        │  │ writeWAV/MP3Async     │  │ DynamicsCompressor │
│ effects.       │  │ sinks → FS Access /   │  │ AudioContext       │
│ Runs in Node.  │  │ share sheet / download│  │                    │
└────────────────┘  └───────────────────────┘  └─────────┬──────────┘
│ Types:        │                                   │
│  NoiseType    │                                   ▼
│  NoiseParams  │                             destination
│ API:          │                           (speakers/headphones)
│  DEFAULT_     │
│  PARAMS       │
│  SAMPLE_RATE  │
│  generateNoise│
│  Wall(params) │
└───────┬───────┘
        │
        ▼
  Float32Array (mono, 44.1 kHz, normalized)
```

Supporting modules:

- `src/index.css` — single `@import "tailwindcss";` directive; all styling is utility-class based.
- `src/utils/cn.ts` — `clsx` + `tailwind-merge` helper for conditional class names.
- `src/types/lamejs.d.ts` — minimal ambient type declaration for `lamejs` (the library ships its
  own types without a `"types"` field in its package.json, so we declare the surface we use).

---

## Build Pipeline

```
            vite dev (HMR)                  vite build
           ┌──────────────┐             ┌──────────────────┐
source ──▶ │  Vite (ESM)  │             │  Rollup (bundler)│
  files    │  esbuild     │             │  minify + tree-  │
           │  dev server  │             │  shake           │
           └──────┬───────┘             └───────┬──────────┘
                  │                             │
                  ▼                             ▼
            localhost:5173             ┌──────────────────┐
                                       │ @tailwindcss/vite│
                                       │  (JIT → atomic   │
                                       │   CSS inlined)   │
                                       └───────┬──────────┘
                                               │
                                               ▼
                                       ┌──────────────────┐
                                       │ vite-plugin-     │
                                       │  singlefile      │
                                       │ (inlines all JS, │
                                       │  CSS, assets     │
                                       │  into one HTML)  │
                                       └───────┬──────────┘
                                               │
                                               ▼
                                        dist/index.html
                                        (single file, gzippable)
```

Key build decisions:

- **`vite-plugin-singlefile`** eliminates HTTP requests for chunks, CSS files, or assets. The
  result can be hosted anywhere, sent as an email attachment, or opened from the filesystem.
- **`@tailwindcss/vite`** integrates Tailwind 4's JIT engine directly into Vite; there is no
  separate PostCSS config.
- **Path alias `@/* → src/*`** is configured in both `vite.config.ts` and `tsconfig.json` for
  cleaner imports (not heavily used in v1.0, but ready as the codebase grows).
- **`@vitejs/plugin-react`** uses the new React 19 automatic JSX runtime.

---

## DSP Core (`src/utils/noiseSynth.ts`)

### Public API

```ts
export type NoiseType =
  | 'white' | 'pink' | 'brown' | 'grey'
  | 'crackling' | 'digital' | 'saturated';

export interface NoiseParams {
  duration: number;           // seconds, 2–600
  noiseType: NoiseType;
  distortionAmount: number;   // 0–100
  density: number;            // 0–100
  feedback: number;           // 0–100
  lfoRate: number;            // 0–10 Hz
  lfoDepth: number;           // 0–100
  filterFreq: number;         // 100–16000 Hz
  filterQ: number;            // 0–30
  bitcrush: number;           // 0–100
  subBass: number;            // 0–100
  grit: number;               // 0–100
  seed: number;               // signed 32-bit
}

export const DEFAULT_PARAMS: NoiseParams;
export const SAMPLE_RATE: 44100;
export function generateNoiseWall(params: NoiseParams): Float32Array;
```

### Internal structure

The engine is a collection of **in-place DSP primitives** that mutate a `Float32Array`, composed
by `generateNoiseWall` into a fixed 12-stage pipeline:

```
stackLayers() → biquadLowpass → biquadHighpass(20Hz) → applyLFO → distort()
  → feedbackSaturate() → addSubBassLayer() → addGritLayer() → bitcrush()
  → final tanh → lp1(12kHz) → applyEnvelope() → normalize()
```

Each primitive is a `function(buf, …)` that either mutates `buf` in place or adds a layer into
`buf`. The layering functions (`addSubBassLayer`, `addGritLayer`, `stackLayers`) allocate
temporary buffers of the same length as the main buffer; future optimizations may reuse a
single scratch buffer to reduce GC pressure (see [`PERFORMANCE.md`](./PERFORMANCE.md)).

### RNG discipline

The single source of randomness is the `seededRandom(seed)` function which returns a
**mulberry32** generator. The `rng` instance is created once in `generateNoiseWall` and threaded
through to every stage that needs it (`stackLayers`, `addSubBassLayer`, `addGritLayer`). There
are **zero** calls to `Math.random()` inside the engine. This is what makes the output
bit-deterministic across environments given the same seed + params.

### Invariants maintained by the engine

- Output length = `floor(duration * SAMPLE_RATE)` samples.
- All output samples are in `[-1, 1]` after `normalize()`.
- No NaN, Inifinity, or subnormal poisoning occurs for inputs in the documented ranges
  (guarded by coefficient clamping in the biquad stages and by `Math.tanh` saturation in the
  distortion/feedback stages).
- DC component is removed by the 20 Hz high-pass stage.
- Start/end transients are removed by 80 ms quadratic fades.

---

## UI Layer (`src/App.tsx`)

### State model

| State | Type | Purpose |
|-------|------|---------|
| `params` | `NoiseParams` | Current slider/preset values; drives generation. Initialised from the URL patch hash. |
| `samples` | `Float32Array \| null` | Render handle for rendering. The buffer itself also lives in `samplesRef` so the player/encoders can read it without participating in React state. |
| `isPlaying` / `positionSeconds` | `boolean` / `number` | Transport UI; the authoritative playhead lives in the player. |
| `isGenerating` / `genProgress` | `boolean` / `{percent, stage}` | Render progress for the transport rail and status line. |
| `encoding` | `{kind, percent} \| null` | Which export is in flight, for progress readouts. |
| `sheet` | `'save' \| 'more' \| null` | Which bottom sheet is open. |
| `status` | `{kind, text}` | Status line (`idle`/`info`/`busy`/`success`/`error`), announced via `aria-live`. |
| `mp3Bitrate`, `volume`, `activePreset` | — | As before. |

### Refs (things that must not trigger re-renders)

| Ref | Reason |
|-----|--------|
| `samplesRef` | The render is up to 26.5 M floats — it is read by the player and encoders directly, never through state. |
| `playerRef` / `playerSamplesRef` | The `StreamingPlayer` instance and the buffer it was built for (rebuilt only when the render changes). |
| `audioCtxRef` | One `AudioContext` reused across playback, unlocked on the first user gesture (iOS/Android start suspended). |
| `genTokenRef` / `encTokenRef` | Cancellation tokens: a stale render or export can never overwrite newer state. |
| `volumeRef` / `positionRef` | Latest values for callbacks that must not be re-created on every tick. |

### Sub-components (`src/components/`)

- **`Slider`** — native range input with a 44 px hit area, 26 px thumb, and a fill driven by a
  `--nw-fill` CSS custom property. Native input = free keyboard + screen-reader behaviour.
- **`Section`** — control group that collapses on phones (`aria-expanded`/`aria-controls`) and is
  permanently expanded at `lg`+ so the desktop layout is unchanged.
- **`WaveformVisualizer`** — DPR-aware canvas drawn from the precomputed per-column preview. The
  surface is a `role="slider"`: pointer drag or arrow keys seek; the playhead follows the scrub
  head until release.
- **`TransportBar`** — pinned bottom bar above the safe-area inset. Owns Generate / Play / Save /
  More plus the progress rail and the status region.
- **`SaveSheet` / `MoreSheet` / `Sheet`** — focus-managed dialogs (bottom sheets on phones,
  centred dialogs at `sm`+) with scroll-locked backgrounds.
- **`InstallHint`** — dismissible add-to-home-screen nudge (localStorage-remembered).

### Rendering tree

```
<App>
├── ambient glow (decorative, aria-hidden)
├── header (logo, live dot, device label)
├── <InstallHint/>                       (phones only, dismissible)
├── <div flex-col lg:grid lg:grid-cols-12>
│   ├── Controls (order-2 on phones, col-span-4 lg / col-span-3 xl)
│   │   ├── <Section title="Noise source">  7 source buttons
│   │   ├── <Section title="Length">        slider + chips + size estimate
│   │   ├── <Section title="Distortion & density">
│   │   ├── <Section title="Filter & modulation">
│   │   ├── <Section title="Texture">
│   │   └── <Section title="Seed">          number input + randomise
│   └── Visualiser (order-1, col-span-8 lg / col-span-9 xl)
│       ├── Waveform section + volume slider + size readouts
│       ├── Presets (snap-scroll row on phones, grid at sm+)
│       └── Volume warning callout
├── <TransportBar/>                      fixed bottom, safe-area aware
├── <SaveSheet/>  <MoreSheet/>           rendered only while open
└── footer (format tagline + keyboard shortcuts)
```

On phones the visualiser comes *first* (you generate, then tweak) and the transport bar means the
primary actions are always one thumb-tap away — no scrolling to find Generate.

---

## Shell & Offline Layer

```
index.html          PWA metadata: theme-color, apple-mobile-web-app-*, manifest link,
                    apple-touch-icon, format-detection, og/twitter cards
public/manifest.…   name/short_name, start_url & scope "./" (project-subpath safe),
                    display: standalone, background/theme #08080e, icons any + maskable
public/sw.js        install: precache the shell; activate: drop older CACHE_VERSIONs;
                    fetch: network-first for navigations, cache-first for shell assets,
                    same-origin GET only (cross-origin is never intercepted)
src/main.tsx        registers ./sw.js on load, http(s) origins only
```

Everything uses **relative** URLs so the same build works at a domain root, under
`/interactive-harsh-noise-generator/` on GitHub Pages, and inside a Codespaces preview origin.
`vite.config.ts` lists the proxy hostnames in `server.allowedHosts` (Vite 6+ rejects unknown
`Host` headers, which is what would otherwise break phone access through a tunnel), binds
`0.0.0.0`, and switches HMR to `wss` inside Codespaces.

The app remains fully functional without any of this: the offline shell and install path are
additive, and `file://` loads skip the service worker entirely.

---

## Encoder Layer (`src/utils/audioEncoder.ts`)

### WAV

`encodeWAV(samples)` produces a 44-byte RIFF/WAVE header followed by 16-bit little-endian PCM
samples. The implementation:

- Hard-codes mono, 44.1 kHz, 16-bit (matching the engine).
- Clamps samples to `[-1, 1]` defensively (the engine already guarantees this).
- Maps negative floats to `Int16` range using the standard `s * 0x8000` / `s * 0x7FFF` split
  (preserves the full-scale symmetry and avoids −32768 overflow).

### MP3

`encodeMP3(samples, kbps)` wraps `lamejs.Mp3Encoder`:

- Converts `Float32Array` → `Int16Array` once.
- Feeds samples in 1152-frame blocks (the MPEG-1 frame size for 44.1 kHz).
- Flushes the encoder and concatenates output chunks into a single `Uint8Array`.

### Streaming

Each encoder has a streaming twin that writes ~512 KB slices into a `ByteSink`:
`writeWAVAsync(samples, sink, onProgress)` and `writeMP3Async(samples, kbps, sink, onProgress)`.
`BlobSink` collects the slices as Blob parts (no single contiguous `ArrayBuffer`), and
`saveFile.ts` can instead point the sink at the user's real file handle via the File System Access
API. The concatenation is byte-identical to the in-memory encoder — asserted by `npm run verify`.

### Download

`downloadBlob(blob, filename)` creates an object URL, dispatches a synthetic click on an ephemeral
`<a download>` element, and revokes the URL after the click's default action has run (Safari needs
it alive until then). `downloadBuffer` is the v1.0 wrapper kept for compatibility. `saveFile.ts`
adds the higher-level tiers: File System Access → OS share sheet → download.

---

## Audio Playback Path

```
samples (Float32Array, up to 26.5 M floats)
        │
        ▼
StreamingPlayer.schedule()            ← every 200 ms, while playing
  for each 2 s chunk whose start time
  is within the next 5 s:
      ctx.createBuffer(1, chunkFrames, 44100)
      .getChannelData(0).set(samples.subarray(...))
        │
        ▼
AudioBufferSourceNode (one per chunk, released after it plays)
        │
        ▼
GainNode (player.gain)      ← user volume slider (live)
        │
        ▼
DynamicsCompressorNode
  threshold: -20 dB         ← safety net for transducers
  ratio: 12:1
  attack: 3 ms
  release: 250 ms
        │
        ▼
ctx.destination             ← speakers/headphones
```

The compressor is deliberately aggressive: HNW is unforgiving material, and this is the last
line of defense before the user's hardware. It does not eliminate the need for a volume warning.

Playback progress is derived from `ctx.currentTime - startCtxTime + offset` inside the player and
polled by a `requestAnimationFrame` loop, which also re-renders the canvas playhead. Chunks that
start late (throttled tab, resumed context) are started immediately at the correct *offset*, so
the audio never drifts out of sync with the visual playhead.

---

## Determinism Guarantees

Given the **same** `NoiseParams` (including seed) and the **same** engine version,
`generateNoiseWall` produces bit-identical `Float32Array` output on every mainstream JS engine
(V8, SpiderMonkey, JavaScriptCore) for the following reasons:

1. All arithmetic uses IEEE-754 `double` (JavaScript `number`), which is consistent across engines
   for the operations used here (+, −, ×, /, `Math.sin`, `Math.tanh`, `Math.PI`, `Math.imul`).
2. The PRNG is pure arithmetic — no `Date.now()`, no `Math.random()`, no engine-specific
   intrinsics.
3. Loop bounds are deterministic and depend only on `params.duration`.
4. No `sort` with an unstable comparator, no `Map`/`Set` insertion-order tricks, no shared
   mutable globals.

Determinism may be broken by:

- Engine versions that implement a math built-in differently (rare, but not impossible for
  `Math.tanh` at edge values). We do not currently pin engine behavior; we test against V8
  (Chromium) and accept that a 1-ULP difference across engines is a cosmetic non-issue for audio.
- Future DSP changes. We do **not** promise that seed X will sound identical across major
  versions; only that within a version it is stable. Presets are re-validated when stages change.

---

## Failure Modes & Defensive Design

| Risk | Mitigation |
|------|-----------|
| User clicks Generate multiple times | `setTimeout(..., 60)` allows UI to paint "Generating…" before the synchronous render pass starts; subsequent generate calls are not queued (they simply overwrite state with a fresh buffer) |
| Playback while AudioContext is suspended (autoplay policy) | `await ctx.resume()` is called before starting the source |
| `webkitAudioContext` on Safari | Feature-detect; fall back to prefixed constructor |
| Component unmount during playback | `useEffect` cleanup calls `stopPlayback()` and closes the AudioContext |
| Memory bloat for long walls | `URL.revokeObjectURL` after downloads; `Float32Array` is released when `generatedBuffer` is set to `null` (e.g., on new preset or generation) |
| Biquad instability at extreme Q/F | Coefficients are clamped: frequency to [20 Hz, Nyquist × 0.96], Q to ≥ 0.1 |
| Feedback runaway | `fb` capped at 0.85 to keep the recursive tanh loop bounded |
| Download on `file://` | Uses `Blob` URLs rather than `data:` URIs; works on all major browsers' `file://` scheme |
| MP3 encoding of empty/short buffers | `lamejs.flush()` handles the tail even for sub-frame buffers |

---

## Why No State Management Library?

The entire app's state is ~10 values, most of which are scalars. Introducing Zustand/Redux/Jotai
here would add cognitive and bundle weight for zero benefit. If the app grows substantially
(e.g., preset chaining, multi-track, undo/redo trees), we will revisit this decision — likely
reaching for `useReducer` first, then Zustand if the tree becomes awkward.

---

## Why No Component Framework Beyond React?

The UI is a single-page creative tool with one canonical layout. A router is not needed. SSR is
not needed. A design-system library is not needed (and would bloat the single-file build).
Tailwind + a small set of hand-rolled primitives (`Slider`, `WaveformVisualizer`) is the
highest-leverage stack for this problem shape.

---

## Where to Go Next

- **Signal-flow math & coefficient choices** → [`DSP-PIPELINE.md`](./DSP-PIPELINE.md)
- **Public function signatures & types** → [`API.md`](./API.md)
- **Benchmarks and memory profiles** → [`PERFORMANCE.md`](./PERFORMANCE.md)
- **Running locally, editor setup, browser quirks** → [`SETUP.md`](./SETUP.md)
- **Deploying to platforms** → [`DEPLOYMENT.md`](./DEPLOYMENT.md)
