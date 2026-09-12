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
