# Changelog

All notable changes to **NOISE WALL** are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) starting with `1.0.0`.

---

## [1.0.0] — 2025-07-24

### Added

- First public release of NOISE WALL.
- Seven seeded noise generators: white, pink, brown, grey, crackling, digital, saturated.
- 12-stage mono DSP pipeline running at 44.1 kHz:
  stacked density layers · biquad lowpass · 20 Hz DC-removal highpass · multi-component LFO ·
  multi-stage waveshaper distortion · one-sample feedback saturation · sub-bass layer ·
  band-limited grit layer · joint bit-depth/sample-rate bitcrush · glue tanh saturation ·
  12 kHz 1-pole rolloff · 80 ms quadratic fades · peak normalization to −0.27 dBTP.
- Mulberry32 seeded PRNG for fully deterministic generation across sessions and devices.
- Duration range 2 s – 600 s (up to ~26.46 million samples).
- 12 synthesis controls with quick-pick chips for duration and value readouts with tabular digits.
- 8 factory presets: Classic HNW, Static Crush, Deep Rumble, Concrete Mixer, Warm Hiss,
  Bit Rot, Crackle Storm, Total Wall.
- Real-time waveform visualizer (min/max-per-pixel density bars with playhead, grid, and scanlines).
- In-browser preview with `GainNode` volume control and `DynamicsCompressorNode` safety stage
  (threshold −20 dB, ratio 12:1, attack 3 ms, release 250 ms).
- 16-bit PCM WAV export (hand-rolled encoder with correct RIFF/WAVE fmt/data subchunks).
- MP3 export at 128 / 192 / 256 / 320 kbps via `lamejs`.
- Single-file production build via `vite-plugin-singlefile` — one `dist/index.html`, zero
  external runtime dependencies.
- Responsive, dark-mode UI built with React 19, Tailwind CSS 4, and TypeScript 5.9 in strict mode.
- Public documentation set: README, architecture doc, DSP pipeline doc, API reference,
  setup/deployment/performance/accessibility guides, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY.
- MIT license.

### Technical Notes

- Initial benchmark: 10-minute walls generate in ~2–4 s on Apple M-series silicon, ~6–10 s
  on a 2020 x86 laptop.
- Production bundle: ~350 KB gzipped (HTML + inlined JS + CSS).
- Zero outbound network requests at runtime; suitable for `file://` and fully offline use.

---

## [Unreleased]

See [ROADMAP.md](./ROADMAP.md) for planned work.

---

## [1.2.0] — 2026-09-13

"Use it from a phone" release: a mobile-first UI, a streaming player, shareable patch links,
an installable/offline PWA, and an automated GitHub Pages deployment so there is a live URL to
hand to any device.

### Added

- **Mobile-first UI.** Pinned transport bar (Generate / Play / Save / More) above the home-bar
  safe area; collapsible control groups (Source and Length open, the rest folded on phones, all
  expanded on `lg`+); a duration chip row; 44 px minimum touch targets everywhere; `dvh`
  viewport sizing; device-pixel-ratio-crisp waveform canvas; `touch-action` tuned so vertical
  drags still scroll the page.
- **Scrubbable waveform.** The canvas is now a `role="slider"`: tap or drag to audition any point
  of a 10-minute wall, arrow keys to nudge, `Shift`+arrow to jump 10%.
- **Streaming preview player** (`src/utils/streamPlayer.ts`): schedules 2 s `AudioBufferSourceNode`
  chunks a few seconds ahead of the playhead, so playback memory is constant instead of a full
  `AudioBuffer` copy (≈ a few hundred KB rather than 106 MB for a 10-minute wall). Seeking
  re-anchors the schedule; play/stop fade to avoid clicks.
- **Streaming exports.** `writeWAVAsync` / `writeMP3Async` write 512 KB slices into a `ByteSink`;
  `saveFile.ts` gives that sink three tiers — File System Access (stream straight to the file the
  user picks), the OS share sheet (`navigator.share` with files, for iOS "Save to Files"/AirDrop),
  and a Blob download fallback.
- **Shareable patch links** (`src/utils/patchUrl.ts`): every control plus the seed is mirrored into
  the URL hash (`#nw1&t=brown&d=600&…`) with `replaceState`, restored on load, and validated and
  clamped on read. Copy/share buttons in the Save and More sheets; also makes refresh safe.
- **Installable PWA**: `public/manifest.webmanifest`, a service worker (`public/sw.js`,
  network-first navigations, cache-first shell assets, same-origin only), generated icon set
  (192/512/maskable/Apple + SVG favicon), iOS `apple-mobile-web-app-*` metadata, and an in-app
  install hint wired to `beforeinstallprompt`.
- **Screen Wake Lock** (`src/hooks/useWakeLock.ts`) while rendering, playing or exporting, so a
  phone does not sleep mid-job; auto-reacquires when the tab becomes visible again.
- **Device-aware budgeting** (`src/hooks/useDeviceProfile.ts`): cores, memory, pointer type,
  standalone mode and a conservative "comfortable length" per device; the UI shows the working set
  for the selected length and flags heavy ones in amber without blocking them.
- **Haptics** (`src/utils/haptic.ts`) on generate/play/save/preset taps where supported.
- **Keyboard shortcuts**: `Space` play/stop, `G` generate, `R` new seed — suppressed while typing
  or while a dialog is open.
- **`npm run verify`** — `scripts/verify.ts`, 19 headless checks in plain Node: determinism across
  both drivers, signal hygiene, WAV structure, byte-identical streamed vs in-memory exports, MP3
  frame-header validation, preview-envelope fidelity.
- **`npm run smoke`** — `scripts/smoke.tsx` mounts the real `<App />` in jsdom (with Web Audio and
  object-URL stand-ins), restores a shared patch from the URL, generates a wall, plays it back
  while asserting the streaming player queues multiple chunks, exports WAV and MP3 end-to-end with
  byte-size checks, and opens the sheets: 23 checks. `npm run check` runs typecheck + verify +
  smoke.
- **CI workflow** (`.github/workflows/ci.yml`): typecheck, verify, smoke, build, and the bundle
  size written to the run summary.
- **GitHub Pages deployment** (`.github/workflows/deploy-pages.yml`): publishes the app to
  `https://zazieproductions.github.io/interactive-harsh-noise-generator/` on every push to `main`,
  and prints the URL in the run summary.
- **Dev container** (`.devcontainer/devcontainer.json`) for Codespaces / VS Code, forwarding port
  5173 as a public URL; Vite is configured with `allowedHosts` for the proxy domains and switches
  HMR to `wss` in Codespaces.
- **Asset generators**: `npm run icons` (deterministic PNG icons + favicon via a ~100-line PNG
  encoder on `node:zlib`) and `npm run qr` (launch QR code for the docs, retargetable with
  `NOISE_WALL_URL`).
- **`src/presets.ts`** — the factory presets are now a plain data module instead of living inside
  `App.tsx`; `src/utils/format.ts` holds duration/clock/byte formatting and render-size estimates.

### Fixed

- **MP3 export was broken.** `lamejs@1.2.1` (the package the project depended on) throws
  `ReferenceError: MPEGMode is not defined` under any bundler, because its CommonJS source
  references a binding that only exists in a global-scope IIFE build. Verified with both esbuild
  and Vite in this repository. Switched to `@breezystack/lamejs@1.2.7`, a maintained ESM build of
  the same encoder, which also ships its own TypeScript definitions.
- `Uint8Array<ArrayBuffer>` annotations throughout the encoders, fixing `BlobPart` type errors
  under TypeScript 5.9's generic typed arrays.
- Clipboard writes fall back to a hidden textarea on insecure origins where `navigator.clipboard`
  is undefined.

### Changed

- `src/App.tsx` was rewritten around the new shell (transport bar, sheets, patch-hash sync,
  streaming player lifecycle, wake lock, device profile).
- Volume control moved next to the waveform; WAV/MP3 export moved into the Save sheet, with live
  percent readouts and per-export size estimates.
- Long exports no longer allocate a second copy of the render; the render itself is still held in a
  ref and reused by the player and the encoders.

### Technical Notes

- Playback memory is now O(chunk) rather than O(render) — this is the change that makes 10-minute
  walls practical on a phone, where a 106 MB `AudioBuffer` copy is what triggers a tab reload.
- `StreamingPlayer` schedules ahead by 5 s and re-fills every 200 ms; if the tab is throttled and a
  chunk starts late it is started immediately at the correct offset instead of being dropped.
- Patch hashes are versioned (`nw1`): unknown keys are ignored and out-of-range values are clamped
  before they ever reach the DSP engine.

---

## [1.1.0] — 2026-09-12

### Added

- Non-blocking generation: the DSP pipeline now runs cooperatively on the main
  thread in ~5–12 s slices, yielding to the event loop between slices. The UI
  (sliders, progress bar, everything) stays fully responsive while a wall
  renders, and a live per-stage progress bar (stage name + percent) replaces
  the frozen spinner.
- `generateNoiseWallAsync(params, onProgress?)` and
  `buildWaveformPreview(buffer, columns)` in `src/utils/noiseSynth.ts`;
  `encodeWAVAsync(samples, onProgress?)` and
  `encodeMP3Async(samples, kbps?, onProgress?)` in `src/utils/audioEncoder.ts`.
  All async variants produce bit/byte-identical output to their synchronous
  counterparts.
- Live percent readouts on the WAV/MP3 download buttons while exports encode.

### Changed

- Presets are now length-agnostic: loading a preset **keeps the duration you've
  chosen** (each preset's listed duration is the length it was tuned at), and
  changing the duration no longer clears the active preset. The active preset
  card shows the length currently in use. Every preset works across the full
  2 s – 10 min range.
- The waveform visualizer draws from a precomputed per-column min/max preview
  (built once per generation) instead of re-scanning the full buffer on every
  frame, so playhead animation stays smooth even for 10-minute walls.
- `stackLayers` reuses a single scratch buffer across layers instead of
  allocating a fresh full-length buffer per layer, cutting peak transient
  memory in the layer stage (a 10-minute wall no longer keeps up to six
  full-length layer buffers alive at once).

### Technical Notes

- The pipeline is implemented as sliceable primitives with explicit state; the
  sync and async drivers share the exact same loop bodies, so a given
  seed + params produces bit-identical audio on either path. Verified across
  all seven noise types, extreme parameter settings, and slice-boundary cases
  (including crackling's burst skips and bitcrush hold state across slices).
