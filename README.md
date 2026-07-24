<!--
╔══════════════════════════════════════════════════════════════════╗
║                         NOISE  WALL                              ║
║        Interactive Harsh Noise Wall Generator (Browser)          ║
╚══════════════════════════════════════════════════════════════════╝
-->

<div align="center">

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white&style=flat-square)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black&style=flat-square)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7.3-646CFF?logo=vite&logoColor=white&style=flat-square)](https://vitejs.dev/)
[![Tailwind](https://img.shields.io/badge/Tailwind-4.1-06B6D4?logo=tailwindcss&logoColor=white&style=flat-square)](https://tailwindcss.com/)
[![Web Audio API](https://img.shields.io/badge/Web_Audio_API-ED1C24?logo=webaudio&logoColor=white&style=flat-square)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](./LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](./CONTRIBUTING.md)
[![Single-file build](https://img.shields.io/badge/build-single--file-8B0000?style=flat-square)](#deployment)

<!-- Logo / hero -->
<h1>
  <span style="filter: drop-shadow(0 0 32px rgba(220,38,38,0.5));">
    NOISE&nbsp;<span style="color:rgb(220,38,38);">WALL</span>
  </span>
</h1>

**An interactive, deterministic harsh-noise-wall synthesizer that runs entirely in the browser.**
Zero servers. Zero uploads. Zero telemetry. Just you, a PRNG, and a DSP chain tuned for dense,
mid-heavy static.

> ⚠ **Volume warning.** Harsh noise contains extreme and sustained frequency content.
> Lower your system volume before playback — especially on headphones. A built-in dynamics
> compressor protects speakers, but it cannot protect your hearing.

[Quick start](#quick-start) · [Architecture](./docs/ARCHITECTURE.md) · [DSP pipeline](./docs/DSP-PIPELINE.md) ·
[API reference](./docs/API.md) · [Contributing](./CONTRIBUTING.md) · [Roadmap](./ROADMAP.md) ·
[Changelog](./CHANGELOG.md)

</div>

---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Quick Start](#quick-start)
4. [Usage](#usage)
5. [Controls](#controls)
6. [Presets](#presets)
7. [Project Structure](#project-structure)
8. [Audio Architecture at a Glance](#audio-architecture-at-a-glance)
9. [Deployment](#deployment)
10. [Performance](#performance)
11. [Accessibility](#accessibility)
12. [Testing & Quality](#testing--quality)
13. [Security & Privacy](#security--privacy)
14. [Contributing](#contributing)
15. [License](#license)
16. [Acknowledgements](#acknowledgements)

---

## Overview

**NOISE WALL** is a portfolio-grade creative-coding project by **Zazie Productions LLC** that
generates reproducible harsh-noise-wall (HNW) textures directly in the browser using a custom
DSP pipeline built on top of the Web Audio API and the `<canvas>` element.

Every generation is deterministic: given the same **seed** and parameter set, the synthesizer
produces bit-identical output across sessions and devices (subject to IEEE-754 floating-point
consistency, which is guaranteed by every modern JS engine). This makes the tool useful both as
a musical instrument and as a reference implementation for seeded procedural audio.

The production build is **a single self-contained `index.html`** (~350 KB gzipped) that can be
hosted on any static host, opened directly from the filesystem, or shipped offline with zero
dependencies.

### Design Goals

| Goal | Rationale |
|------|-----------|
| **Deterministic** | Seeds reproduce exact walls — critical for composers sharing patches |
| **Offline-capable** | No server round-trip; everything synthesizes client-side |
| **Single-file deploy** | One HTML file = zero DevOps friction (GitHub Pages, USB stick, `file://`) |
| **Portfolio-grade UI** | Dark, high-contrast, typographically rigorous interface with animated waveform |
| **Type-safe** | Strict TypeScript across the entire DSP/UI boundary |
| **Accessible** | Keyboard-navigable controls, labeled inputs, reduced-motion awareness, ARIA-ready |
| **Performant** | Long-form walls (up to 10 minutes) generate in seconds, not minutes |

---

## Features

- **7 noise sources** — white, pink, brown, grey, crackling, digital, saturated
- **Durations from 2 s to 10 min** (up to 26.46 million samples at 44.1 kHz)
- **12 synthesis controls**: distortion, density (layer stacking), feedback saturation,
  grit/texture, filter cutoff & resonance, LFO rate/depth, bitcrush, sub-bass, seed
- **8 curated factory presets** — Classic HNW, Static Crush, Deep Rumble, Concrete Mixer,
  Warm Hiss, Bit Rot, Crackle Storm, Total Wall
- **Seeded mulberry32 PRNG** for reproducible output
- **Real-time waveform canvas** with playhead, scanlines, and per-pixel min/max density
- **In-browser preview** with user volume and a built-in `DynamicsCompressorNode` for safety
- **16-bit PCM WAV export** (hand-rolled encoder, no dependencies)
- **MP3 export at 128 / 192 / 256 / 320 kbps** via `lamejs`
- **Mono 44.1 kHz** pipeline — the sweet spot for dense, wall-oriented textures
- **Single-file production build** via `vite-plugin-singlefile`
- **Zero network calls at runtime** — no analytics, no CDNs, no remote assets

See [`docs/DSP-PIPELINE.md`](./docs/DSP-PIPELINE.md) for the signal-flow diagram and per-stage
mathematical details.

---

## Quick Start

### Prerequisites

- **Node.js ≥ 20** (LTS recommended)
- **npm ≥ 10**
- A modern browser with Web Audio API support (Chrome 66+, Firefox 60+, Safari 14.1+, Edge 79+)

### Install & Run

```bash
git clone https://github.com/zazieproductions/interactive-harsh-noise-generator.git
cd interactive-harsh-noise-generator
npm install
npm run dev
```

Vite will print a local URL — typically `http://localhost:5173`. Open it. That's it.

### Production Build

```bash
npm run build      # emits a single dist/index.html
npm run preview    # serves the production build locally
```

For more on toolchain, environment, and browser quirks, see
[`docs/SETUP.md`](./docs/SETUP.md).

---

## Usage

1. **Select a noise source** from the seven algorithms.
2. **Set a duration** (2 s – 10 min) using the slider or the quick-pick chips.
3. **Shape the wall** with the distortion/density, filter/modulation, and texture control groups,
   or load a preset.
4. **Pick a seed** — numeric or via the 🎲 Random button. The same (seed, params) pair will always
   regenerate the same wall.
5. **Click Generate** — the engine renders a mono `Float32Array` through the full DSP chain and
   paints the waveform.
6. **Preview** at low volume using the Play Preview button. A compressor keeps transducers safe.
7. **Export** as WAV (lossless 16-bit PCM) or MP3 at your chosen bitrate.

### Controls

| Group | Control | Range | Effect |
|-------|---------|-------|--------|
| Source | Noise Type | — | Selects the base noise-generation algorithm |
| Timing | Duration | 2 – 600 s | Length of the generated wall |
| Distortion & Density | Distortion | 0 – 100 | Multi-stage saturation / clipping / foldback drive |
| | Density (layers) | 0 – 100 | Number of stacked independent noise layers (1–6) |
| | Feedback | 0 – 100 | Self-reinforcing one-sample feedback saturation |
| | Grit | 0 – 100 | Band-limited mid-frequency static/crunch layer |
| Filter & Modulation | Filter Cutoff | 100 – 16 000 Hz | Biquad lowpass cutoff frequency |
| | Resonance | 0 – 30 | Biquad Q at cutoff |
| | LFO Rate | 0 – 10 Hz | Slow three-component amplitude modulation |
| | LFO Depth | 0 – 100 | Modulation intensity (capped at 40% to preserve "wall" character) |
| Texture | Bitcrush | 0 – 100 | Joint bit-depth (16→3 bit) and sample-rate reduction (1→9× hold) |
| | Sub Bass | 0 – 100 | Dual-oscillator noise-modulated 25–70 Hz rumble layer |
| Determinism | Seed | signed 32-bit | Seed for the mulberry32 PRNG |

### Presets

| Icon | Name | Character |
|:----:|------|-----------|
| 🧱 | Classic HNW | Dense white-noise wall, Merzbow-inspired |
| 📺 | Static Crush | TV static through a broken amplifier |
| 🕳️ | Deep Rumble | Low-frequency grinding wall, sub-heavy |
| 🏗️ | Concrete Mixer | Thick mid-range industrial grind |
| 🔥 | Warm Hiss | Pink noise driven into soft saturation |
| 👾 | Bit Rot | Heavily crushed digital decay |
| ⚡ | Crackle Storm | Bursting crackle through distortion |
| ☢️ | Total Wall | Maximum density, maximum everything |

Presets are defined as plain data in `src/App.tsx` and can be extended by adding entries to the
`PRESETS` array — no recompilation of the engine required.

---

## Project Structure

```text
interactive-harsh-noise-generator/
├── index.html                 # Vite entry HTML
├── package.json               # Dependencies & scripts
├── tsconfig.json              # Strict TypeScript config
├── vite.config.ts             # React + Tailwind + singlefile plugin
├── src/
│   ├── main.tsx               # React root
│   ├── App.tsx                # UI shell, state, presets, canvas visualizer
│   ├── index.css              # Tailwind entry
│   ├── types/
│   │   └── lamejs.d.ts        # Ambient type declarations for lamejs
│   └── utils/
│       ├── noiseSynth.ts      # DSP engine: PRNG + noise gens + filter/effect pipeline
│       ├── audioEncoder.ts    # WAV + MP3 encoders + download helper
│       └── cn.ts              # clsx + tailwind-merge helper
├── docs/                      # Deep technical documentation
│   ├── ARCHITECTURE.md
│   ├── DSP-PIPELINE.md
│   ├── API.md
│   ├── SETUP.md
│   ├── PERFORMANCE.md
│   ├── ACCESSIBILITY.md
│   └── DEPLOYMENT.md
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/ci.yml
├── CHANGELOG.md
├── ROADMAP.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
└── LICENSE                    # MIT
```

### Module Boundaries

```
┌─────────────┐     ┌───────────────────┐     ┌──────────────────┐
│  React UI   │────▶│  noiseSynth.ts    │────▶│  Float32Array    │
│  (App.tsx)  │     │  (pure functions) │     │  (mono, 44.1kHz) │
└──────┬──────┘     └───────────────────┘     └────────┬─────────┘
       │                                               │
       │                                               ▼
       │                                    ┌──────────────────┐
       │                                    │ audioEncoder.ts  │
       │                                    │ WAV / MP3 / blob │
       │                                    └──────────────────┘
       ▼
┌─────────────┐
│ Web Audio   │──▶ DynamicsCompressor ──▶ destination
│ preview     │
└─────────────┘
```

`noiseSynth.ts` is a **pure functional module** with no DOM or Web Audio dependencies. That
makes the core engine trivially testable, portable to Node, and independent of React's render
cycle. See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the rationale behind this
boundary.

---

## Audio Architecture at a Glance

The synthesis engine builds a mono `Float32Array` at 44.1 kHz through the following 12-stage
pipeline:

1. **Stacked layer generation** — `density` controls 1–6 independent noise layers, each with
   slight filter and drive variations
2. **Biquad lowpass** — main tonal shaping from `filterFreq` / `filterQ`
3. **Biquad highpass @ 20 Hz** — DC offset removal
4. **Three-component LFO** — slow amplitude movement (sub-wall modulation)
5. **Multi-stage waveshaper distortion** — tanh + asymmetric soft clip + foldback
6. **One-sample feedback saturation** — self-reinforcing density
7. **Sub-bass layer** — dual detuned sines, noise-modulated, 25–70 Hz
8. **Grit layer** — band-limited (200 Hz–6 kHz) `x·|x|` static
9. **Bitcrush** — joint bit-depth + sample-rate reduction
10. **Final glue saturation** — `tanh(x·1.8)` to cement the wall
11. **Gentle 12 kHz 1-pole rolloff** — tames shrill digital highs
12. **80 ms quadratic fades + peak normalization to −0.27 dBTP**

Playback routing inserts a `GainNode` (user volume) and a `DynamicsCompressorNode`
(threshold −20 dB, ratio 12:1, attack 3 ms, release 250 ms) between the buffer source and
`AudioContext.destination` as a safety net.

> For per-stage coefficient formulas and implementation notes, see
> [`docs/DSP-PIPELINE.md`](./docs/DSP-PIPELINE.md).

---

## Deployment

The production build is **a single self-contained HTML file**:

```bash
npm run build
# → dist/index.html  (all JS, CSS, and assets inlined)
```

This file can be deployed to:

- **GitHub Pages** — commit `dist/index.html` to the `gh-pages` branch or use a Pages Action
- **Netlify / Vercel / Cloudflare Pages** — point the build command at `npm run build` and
  the publish directory at `dist/`
- **Any static web server** — nginx, Apache, Caddy, S3 + CloudFront, etc.
- **Direct filesystem** — opening `dist/index.html` via `file://` works in most browsers
  (MP3/WAV download uses `Blob` URLs, which are filesystem-safe)
- **Offline distribution** — ship the HTML on a USB stick or attach it to an email; it has
  zero external dependencies at runtime

See [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) for platform-specific recipes, CSP notes,
and cache-busting guidance.

---

## Performance

- **Engine is O(n)** in sample count, with a small constant factor; all DSP stages run in a
  single tight pass over the buffer where possible.
- A 10-minute wall (26.46 M samples) generates in **~2–4 s** on a mid-tier MBP M-series and
  **~6–10 s** on a 2020-era laptop.
- The canvas visualizer draws **one column per pixel** using pre-aggregated min/max windows,
  so rendering cost is O(canvas width), not O(sample count) — typically ~1200 fillRect calls
  per frame regardless of audio length.
- React state updates are **minimal**: parameter changes are batched, and the audio buffer
  lives in a `useRef` to avoid re-rendering 26 million floats on every slider move.
- `vite-plugin-singlefile` inlines everything, eliminating HTTP round-trips and making
  cold-start effectively instant on any network.

See [`docs/PERFORMANCE.md`](./docs/PERFORMANCE.md) for detailed benchmarks, memory
profiles, and optimization notes.

---

## Accessibility

- All controls are native `<input type="range">`, `<button>`, `<select>`, and `<input type="number">`
  elements, so they work with keyboards, switch controls, and screen readers out of the box.
- Color contrast meets **WCAG 2.1 AA** for all UI text (checked against the dark-theme palette).
- Value readouts use `tabular-nums` so digits don't jitter as sliders move.
- The waveform canvas is a **visual only** affordance; all state (status, duration, seed, bitrate)
  is also exposed as text.
- The playhead animation respects `prefers-reduced-motion` via standard CSS/RAF guards where
  applicable, and UI animations (pulse, glow) are cosmetic only.

See [`docs/ACCESSIBILITY.md`](./docs/ACCESSIBILITY.md) for the audit checklist and known gaps.

---

## Testing & Quality

- **TypeScript strict mode** with `noUnusedLocals`, `noUnusedParameters`, and
  `noFallthroughCasesInSwitch` enabled.
- The DSP engine is architected as pure functions specifically to enable deterministic unit
  testing; a Vitest suite is planned (see [Roadmap](#roadmap)).
- Manual validation covers:
  - Seed determinism (same seed → byte-identical WAV export)
  - Clipping safety (peak normalization guarantees output ∈ [−1, 1])
  - Playback cleanup (source nodes are stopped and nulled on unmount)
  - Export integrity (WAV headers validated against SoX; MP3 validated against `ffprobe`)
- CI (GitHub Actions) runs `npm run build` on every push and PR to catch type/build regressions.

---

## Security & Privacy

- **Zero network requests** at runtime. The app does not load fonts, analytics, tracking pixels,
  or remote scripts.
- **No audio leaves your machine** — synthesis and encoding happen entirely in the browser tab.
- **No `eval`, no `innerHTML` interpolation** with user-controlled data; React's JSX escaping
  prevents XSS. The only DOM writes outside React are the ephemeral download anchor and the
  canvas bitmap.
- **`Blob` URLs** created for downloads are revoked immediately after the click to free memory.
- The single-file build is straightforward to audit — open `dist/index.html` and inspect the
  inlined script.

See [`SECURITY.md`](./SECURITY.md) for vulnerability reporting.

---

## Contributing

Contributions are welcome — bug reports, preset ideas, DSP experiments, UI polish, accessibility
fixes, and documentation improvements all count. Please read
[`CONTRIBUTING.md`](./CONTRIBUTING.md) for the development workflow, coding conventions, and
pull-request process. All participants are expected to abide by the
[Code of Conduct](./CODE_OF_CONDUCT.md).

Short version:

```bash
git checkout -b feat/your-idea
npm install
npm run dev       # iterate
npm run build     # must pass before PR
```

Open a PR against `main` using the [pull request template](./.github/PULL_REQUEST_TEMPLATE.md).

---

## License

Released under the [MIT License](./LICENSE). © Zazie Productions LLC.

---

## Acknowledgements

- The pink-noise generator is based on the classic **Voss-McCartney** algorithm as popularized
  by Paul Kellet's refined coefficients.
- **Biquad filter** formulas follow the standard RBJ Audio-EQ Cookbook.
- **mulberry32** by Tommy Ettinger provides the seeded PRNG.
- MP3 encoding uses [`lamejs`](https://github.com/zhuker/lamejs), a pure-JS port of LAME.
- HNW as a genre owes a debt to artists from Merzbow and The Haters to Vomir and Richard
  Ramirez — this tool is a love letter, not a replacement.

> *"The best wall is the one you made yourself from nothing but a seed and a tanh curve."*
