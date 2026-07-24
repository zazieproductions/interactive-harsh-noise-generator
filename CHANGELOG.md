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
- Project documentation: README, architecture doc, DSP pipeline doc, API reference,
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
