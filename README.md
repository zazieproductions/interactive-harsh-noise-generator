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
[![Installable](https://img.shields.io/badge/installable-PWA-5A0FC8?style=flat-square)](#mobile--installable-app)
[![Works offline](https://img.shields.io/badge/works-offline-2ea44f?style=flat-square)](#mobile--installable-app)

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

<h3>
  <a href="https://zazieproductions.github.io/interactive-harsh-noise-generator/">
    ▶ Launch NOISE WALL — no install, no sign-up
  </a>
</h3>

Point your phone camera at this code and you are generating walls in about ten seconds:

<img src="./docs/assets/launch-qr.svg" width="180" alt="QR code linking to the NOISE WALL web app" />

`https://zazieproductions.github.io/interactive-harsh-noise-generator/`

[Quick start](#quick-start) · [Mobile & installable app](#mobile--installable-app) ·
[Architecture](./docs/ARCHITECTURE.md) · [DSP pipeline](./docs/DSP-PIPELINE.md) ·
[API reference](./docs/API.md) · [Contributing](./CONTRIBUTING.md) · [Roadmap](./ROADMAP.md) ·
[Changelog](./CHANGELOG.md)

</div>

---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Quick Start](#quick-start)
4. [Mobile & Installable App](#mobile--installable-app)
5. [Usage](#usage)
6. [Controls](#controls)
7. [Presets](#presets)
8. [Sharing Patches](#sharing-patches)
9. [Project Structure](#project-structure)
10. [Audio Architecture at a Glance](#audio-architecture-at-a-glance)
11. [Deployment](#deployment)
12. [Performance](#performance)
13. [Accessibility](#accessibility)
14. [Testing & Quality](#testing--quality)
15. [Security & Privacy](#security--privacy)
16. [Contributing](#contributing)
17. [License](#license)
18. [Acknowledgements](#acknowledgements)

---

## Overview

**NOISE WALL** is a portfolio-grade creative-coding project by **Zazie Productions LLC** that
generates reproducible harsh-noise-wall (HNW) textures directly in the browser using a custom
DSP pipeline built on top of the Web Audio API and the `<canvas>` element.

Every generation is deterministic: given the same **seed** and parameter set, the synthesizer
produces bit-identical output across sessions and devices (subject to IEEE-754 floating-point
consistency, which is guaranteed by every modern JS engine). This makes the tool useful both as
a musical instrument and as a reference implementation for seeded procedural audio.

The production build is **a single self-contained `index.html`** (~148 KB gzipped, ~460 KB raw)
that can be hosted on any static host, opened directly from the filesystem, or shipped offline
with zero dependencies. It is also an **installable web app**: add it to a phone's home screen
and it launches fullscreen, keeps working with no signal, and generates, previews and exports
10-minute walls from a thumb.

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
| **Mobile-first** | One-thumb operation on a phone: pinned transport, 44 px targets, scrubbable waveform |
| **Installable & offline** | Home-screen app with a service-worker shell; no signal required |

---

## Features

- **7 noise sources** — white, pink, brown, grey, crackling, digital, saturated
- **Durations from 2 s to 10 min** (up to 26.46 million samples at 44.1 kHz)
- **12 synthesis controls**: distortion, density (layer stacking), feedback saturation,
  grit/texture, filter cutoff & resonance, LFO rate/depth, bitcrush, sub-bass, seed
- **8 curated factory presets** (length-agnostic — your chosen duration is kept) — Classic HNW,
  Static Crush, Deep Rumble, Concrete Mixer, Warm Hiss, Bit Rot, Crackle Storm, Total Wall
- **Seeded mulberry32 PRNG** for reproducible output
- **Real-time waveform canvas** with playhead, scanlines, and per-pixel min/max density
- **Scrubbable waveform** — tap or drag anywhere on it to audition from that point
- **Streaming preview player** — 2 s chunks scheduled ahead of the playhead, so playback of a
  10-minute wall costs a few hundred KB instead of a 106 MB copy of the render
- **16-bit PCM WAV export** (hand-rolled encoder, no dependencies)
- **MP3 export at 128 / 192 / 256 / 320 kbps** (streamed frame-by-frame)
- **Mobile-first UI** — pinned transport bar (Generate / Play / Save / More), collapsible control
  groups, 44 px targets, device-pixel-ratio-crisp canvas, safe-area insets, haptics on Android
- **Installable PWA** — manifest + service worker: home-screen icon, fullscreen launch, offline
- **Shareable patch links** — the full parameter set *and* seed live in the URL, so a wall can be
  sent from a laptop to a phone (or to a collaborator) as one link
- **Save & share sheet** — streams exports straight to disk on Chromium, and can hand the finished
  file to the OS share sheet (Files, AirDrop, a DAW) on phones
- **Screen Wake Lock** while rendering/playing/exporting, so a phone doesn't sleep mid-render
- **Device-aware budgeting** — reports the working set of the wall you are about to render and
  flags lengths that are heavy for the current device (never blocks them)
- **Mono 44.1 kHz** pipeline — the sweet spot for dense, wall-oriented textures
- **Single-file production build** via `vite-plugin-singlefile`
- **Zero network calls at runtime** — no analytics, no CDNs, no remote assets

See [`docs/DSP-PIPELINE.md`](./docs/DSP-PIPELINE.md) for the signal-flow diagram and per-stage
mathematical details.

---

## Quick Start

### Just want to use it?

**<https://zazieproductions.github.io/interactive-harsh-noise-generator/>** — that URL is
deployed from `main` by [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml)
on every push, so what you see on GitHub is what runs there. Nothing to install, nothing to
configure; scan the QR code in the README header on a phone and it's on your screen.

### Run it locally

### Prerequisites

- **Node.js ≥ 20** (LTS recommended)
- **npm ≥ 10**
- A modern browser with Web Audio API support (Chrome 66+, Firefox 60+, Safari 14.1+, Edge 79+)

```bash
git clone https://github.com/zazieproductions/interactive-harsh-noise-generator.git
cd interactive-harsh-noise-generator
npm install
npm run dev
```

Vite prints a local URL — typically `http://localhost:5173` — and, because the dev server binds
all interfaces, the same line also shows a **Network** URL such as
`http://192.168.1.42:5173`. Open that one on a phone on the same Wi-Fi to test the mobile layout
on real hardware. (Add `-- --host` if your machine reports no network address; see
[`docs/SETUP.md`](./docs/SETUP.md#testing-on-a-real-phone).)

### Or open a pre-configured cloud workspace

Click **Code → Codespaces → Create codespace on main** on GitHub. The container installs
dependencies, starts nothing automatically, and forwards port 5173 as a public HTTPS URL — run
`npm run dev`, open the forwarded port, and you have a phone-reachable dev build without touching
your laptop. See [`.devcontainer/devcontainer.json`](./.devcontainer/devcontainer.json).

### Production Build

```bash
npm run build      # emits a single dist/index.html
npm run preview    # serves the production build locally
```

For more on toolchain, environment, and browser quirks, see
[`docs/SETUP.md`](./docs/SETUP.md).

---

## Mobile & Installable App

Everything the desktop build does works on a phone — the UI is just re-arranged for a thumb.

### Add it to your home screen

| Platform | How |
|----------|-----|
| **iOS / iPadOS (Safari)** | Share ⬆ → **Add to Home Screen** |
| **Android (Chrome)** | ⋮ menu → **Add to Home screen**, or tap the in-app **Install app** button |
| **Desktop (Chrome/Edge)** | Install icon in the address bar |

Installed, the app launches fullscreen (no browser chrome), works with **no network at all**
after the first visit, and — on iOS — stops sharing a tab with Safari's aggressive memory
reclaim, which is what decides whether a long render survives.

### What the phone layout changes

- **Pinned transport bar.** Generate / Play / Save / More sit at the bottom edge above the
  home-bar inset, so you never scroll to find them after a tweak.
- **Collapsible control groups.** Source and Length are open; Distortion, Filter, Texture and
  Seed fold away until you need them. On `lg`+ screens every group is expanded, exactly as before.
- **Sliders built for fingers.** 44 px hit area, 26 px thumb, native `pan-y` touch behaviour so
  vertical drags still scroll the page.
- **Scrubbable waveform.** Drag the waveform to audition any point in a 10-minute wall; the
  playhead follows your finger while you drag.
- **Bottom sheets** for Save and More with safe-area padding, scroll-locked background, and
  `Escape`/backdrop dismissal.
- **Haptics** on Android Chrome for generate/play/save taps (a no-op where unsupported).
- **Wake lock** while rendering, playing, or exporting so the screen doesn't sleep mid-job.
- **Honest memory accounting.** The app knows roughly what each device can hold (iOS Safari gets
  the most conservative budget) and shows the working set — `≈ 51 MB` for 30 s, `≈ 1.0 GB` for
  10 minutes — in amber when a length is heavy. It never blocks a heavy render; it warns before
  the browser silently reloads the tab.

### Getting the file off the phone

The **Save** sheet writes WAV (lossless, 16-bit PCM) or MP3 (128/192/256/320 kbps). Where the
browser allows it, the export is **streamed straight to the file you pick** (File System Access
API — desktop Chrome/Edge and Android Chrome), so a 50 MB WAV never has to exist in memory as
well as on disk. On iOS, "Share a file…" hands the finished MP3 to the share sheet for
**Save to Files**, AirDrop, or a DAW import.

---

## Sharing Patches

The full patch — every control **plus the seed** — is mirrored into the URL hash as you tweak it
(`#nw1&t=brown&d=600&dis=90&…`), which means:

- **Refresh-safe**: reloading the page restores exactly what you had.
- **Shareable**: *Copy patch link* / *Share patch* in the Save sheet or More sheet produces a URL
  that reopens the identical wall on any device. Same seed + same parameters = a bit-identical
  render, so the recipient hears what you heard and can export it themselves.
- **Linkable**: hand-write or truncate a link (`#nw1&t=pink&d=300&s=777`) — unknown or
  out-of-range values are dropped or clamped, never passed to the DSP engine.

Patch links only encode the *recipe*, not audio: a link is a few dozen bytes, not 50 MB.

---

## Usage

1. **Select a noise source** from the seven algorithms.
2. **Set a duration** (2 s – 10 min) using the slider or the quick-pick chips.
3. **Shape the wall** with the distortion/density, filter/modulation, and texture control groups,
   or load a preset.
4. **Pick a seed** — numeric or via the 🎲 Random button. The same (seed, params) pair will always
   regenerate the same wall.
5. **Hit Generate** in the pinned bar — the engine renders a mono `Float32Array` through the full
   DSP chain and paints the waveform while a progress rail tracks the stage.
6. **Preview** at low volume with Play. Playback starts instantly and streams the render in 2 s
   chunks; drag the waveform to jump anywhere. A compressor keeps transducers safe.
7. **Save** as WAV (lossless 16-bit PCM) or MP3 at your chosen bitrate — or copy a patch link so
   someone else can regenerate the identical wall.

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

Presets are recipes, not fixed clips: loading one **keeps the length you've
currently selected** (each preset's listed duration is the length it was tuned
at), and changing the duration afterward never clears the active preset — every
preset works across the full 2 s – 10 min range.

Presets are defined as plain data in [`src/presets.ts`](./src/presets.ts) and can be extended by
adding entries to the `PRESETS` array — no recompilation of the engine required, and the contributed
preset shows up on phones for free.

---

## Project Structure

```text
interactive-harsh-noise-generator/
├── index.html                 # Vite entry HTML
├── package.json               # Dependencies & scripts
├── tsconfig.json              # Strict TypeScript config
├── vite.config.ts             # React + Tailwind + singlefile plugin
├── index.html                 # Vite entry HTML (manifest, icons, iOS meta)
├── public/
│   ├── manifest.webmanifest   # PWA manifest
│   ├── sw.js                  # Service worker (offline shell)
│   ├── favicon.svg            # Generated by scripts/generate-icons.mjs
│   ├── icon-192.png           # Home-screen icons (192 / 512 / maskable / Apple)
│   ├── icon-512.png
│   ├── icon-maskable-512.png
│   └── apple-touch-icon.png
├── src/
│   ├── main.tsx               # React root + service-worker registration
│   ├── App.tsx                # UI shell, state, playback, transport bar
│   ├── presets.ts             # The eight factory presets (plain data)
│   ├── index.css              # Tailwind entry + touch-first range styling
│   ├── components/
│   │   ├── Slider.tsx             # 44 px touch range control
│   │   ├── Section.tsx            # Collapsible control group
│   │   ├── WaveformVisualizer.tsx # DPR-crisp canvas + scrub-to-seek
│   │   ├── TransportBar.tsx       # Pinned Generate / Play / Save / More bar
│   │   ├── Sheet.tsx              # Bottom sheet / dialog primitive
│   │   ├── SaveSheet.tsx          # WAV + MP3 export, share, patch link
│   │   ├── MoreSheet.tsx          # Seed, reset, install, device info
│   │   └── InstallHint.tsx        # Add-to-home-screen nudge
│   ├── hooks/
│   │   ├── useDeviceProfile.ts    # Touch/cores/memory/safe render budget
│   │   ├── useWakeLock.ts         # Screen Wake Lock during long jobs
│   │   └── useInstallPrompt.ts    # `beforeinstallprompt` capture
│   └── utils/
│       ├── noiseSynth.ts      # DSP engine: PRNG + noise gens + filter/effect pipeline
│       ├── audioEncoder.ts    # WAV + MP3 encoders (sync and streaming) + sinks
│       ├── streamPlayer.ts    # Chunky streaming preview player
│       ├── saveFile.ts        # Stream-to-disk / share sheet / download
│       ├── patchUrl.ts        # Patch ⇄ URL hash (shareable links)
│       ├── format.ts          # Duration/clock/byte formatting + size estimates
│       ├── haptic.ts          # navigator.vibrate wrapper
│       └── cn.ts              # clsx + tailwind-merge helper
├── scripts/
│   ├── verify.ts              # Headless engine + encoder verification
│   ├── smoke.tsx              # Mounts the UI in jsdom and drives it
│   ├── generate-icons.mjs     # Deterministic PNG icon generator
│   └── generate-qr.mjs        # Launch QR code for the docs
├── docs/                      # Deep technical documentation
│   ├── ARCHITECTURE.md
│   ├── DSP-PIPELINE.md
│   ├── API.md
│   ├── SETUP.md
│   ├── PERFORMANCE.md
│   ├── ACCESSIBILITY.md
│   ├── DEPLOYMENT.md
│   └── assets/launch-qr.svg
├── .devcontainer/
│   └── devcontainer.json      # Codespaces / VS Code dev container
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/
│       ├── ci.yml             # typecheck + verify + smoke + build
│       └── deploy-pages.yml   # publishes the app to GitHub Pages
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
│ Streaming   │──▶ GainNode ──▶ DynamicsCompressor ──▶ destination
│ preview     │   (2 s chunks scheduled ahead; constant memory)
└─────────────┘
```

`noiseSynth.ts` is a **pure functional module** with no DOM or Web Audio dependencies. That is
what lets `npm run verify` render real walls in Node and assert the determinism guarantees, and
what keeps the engine independent of React's render cycle. Everything that touches a browser
(player, wake lock, file pickers, service worker) lives behind `utils/` and `hooks/`, so the DSP
core stays portable. See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the rationale
behind this boundary.

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
(threshold −20 dB, ratio 12:1, attack 3 ms, release 250 ms) between the streaming source and
`AudioContext.destination` as a safety net.

> For per-stage coefficient formulas and implementation notes, see
> [`docs/DSP-PIPELINE.md`](./docs/DSP-PIPELINE.md).

---

## Deployment

### GitHub Pages (the default, and how the live link is produced)

`.github/workflows/deploy-pages.yml` builds and publishes the app on every push to `main`:

```text
push to main  →  npm ci  →  npm run verify  →  npm run build  →  deploy dist/  →
https://zazieproductions.github.io/interactive-harsh-noise-generator/
```

One-time setup: **Settings → Pages → Source: GitHub Actions**. The workflow also tries to enable
Pages itself (`enablement: true`) but a token without admin rights cannot, so if the first run
reports that Pages is not enabled, flip the setting by hand and re-run — the build artifact is
already uploaded. (The workflow passes
`enablement: true` to `actions/configure-pages`, which usually turns Pages on for you — if your
token can't, flip the setting by hand and re-run the workflow from the Actions tab.)

The workflow writes the deployed URL into the run summary, so the link to hand to a phone is
always one click from the Actions tab.

### Dev container / Codespaces (a private dev URL, instantly)

`Code → Codespaces → Create codespace on main`, then `npm run dev`. Port 5173 is forwarded as a
public HTTPS URL that a phone can open; `vite.config.ts` already allows the Codespaces and
preview hostnames, and switches HMR to the `wss` proxy. Details in
[`docs/SETUP.md`](./docs/SETUP.md#cloud-dev-containers).

### Same Wi-Fi (fastest way to test on your own phone)

```bash
npm run dev      # prints http://192.168.x.y:5173 as the Network URL
```

Open that on the phone. Because the app only needs `http://`, no certificate warnings — but note
that service-worker install and Wake Lock require HTTPS or `localhost`, so the *installed*,
offline experience needs one of the hosted options below. `npm run build && npm run preview`
serves the production bundle the same way.

### Other static hosts

The build output is a folder of static files (`index.html` + icons + manifest + service worker),
so any static host works:

- **Netlify / Vercel / Cloudflare Pages** — build `npm run build`, publish `dist/`
- **Any web server** — nginx, Apache, Caddy, S3 + CloudFront. Serve over HTTPS so the service
  worker can register.
- **Local file** — `dist/index.html` still opens over `file://` (offline support and the file
  picker need a real origin, but generating, playing and downloading don't)
- **Offline distribution** — ship the HTML on a USB stick; it has zero runtime dependencies

### Generated assets

Two scripts keep the repo's binary-ish assets reproducible instead of hand-drawn:

```bash
npm run icons    # public/icon-*.png, apple-touch-icon.png, favicon.svg
npm run qr       # docs/assets/launch-qr.svg  (override: NOISE_WALL_URL=https://… npm run qr)
```

Both are deterministic — the committed icons and QR regenerate byte-for-byte.

See [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) for platform specifics, cache-busting, and CSP
notes (including the `worker-src`/`connect-src` implications of the service worker).

---

## Performance

- **Engine is O(n)** in sample count, with a small constant factor; all DSP stages run in a
  single tight pass over the buffer where possible.
- A 10-minute wall (26.46 M samples) generates in **~2–4 s** on a mid-tier MBP M-series and
  **~6–10 s** on a 2020-era laptop.
- Generation runs **cooperatively on the main thread**: the pipeline is processed in ~5–12 s
  slices with event-loop yields between them, so the UI never freezes at any length — a live
  per-stage progress bar (stage name + percent) tracks the render while sliders stay fully
  usable.
- The canvas visualizer draws from a **precomputed per-column min/max preview** built once per
  generation, so every frame — including the playhead animation during playback of a 10-minute
  wall — is O(canvas width), not O(sample count) — ~1200 fillRect calls per frame regardless
  of audio length, at device-pixel resolution.
- **Playback memory is constant.** The preview player schedules 2 s `AudioBufferSourceNode`s a
  few seconds ahead of the playhead, so listening to a 10-minute wall costs a few hundred KB
  rather than a 106 MB `AudioBuffer` copy. Seeking re-anchors the schedule instead of re-buffering.
- **Exports stream.** WAV/MP3 encoding writes 512 KB slices into a sink; on Chromium that sink is
  the user's actual file handle (File System Access API) and on other browsers it is a `Blob`
  assembled from parts. Either way there is no second full-size buffer.
- **Working-set estimates are shown before you commit.** The UI prints the render size, the WAV
  size and the peak working set for the length you have selected, and marks lengths above the
  device's comfortable budget in amber. It is information, not a gate.
- WAV/MP3 exports **encode in slices** with live percent readouts; long exports no longer block
  the UI.
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
- Every control has a 44 px minimum touch target, and the waveform is a keyboard-accessible
  `role="slider"` (arrow keys seek, `Shift`+arrow jumps 10%).
- Keyboard shortcuts: `Space` play/stop, `G` generate, `R` new seed — suppressed while typing in
  a field or while a dialog is open.
- Sheets are focus-managed dialogs: focus moves in on open, returns to the trigger on close,
  `Escape` and backdrop taps dismiss, and the background page is scroll-locked.
- Haptics are always paired with a visible state change, so they are pure enhancement.
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
- **`npm run verify`** — `scripts/verify.ts` renders real walls in Node and asserts the promises
  this README makes: same seed ⇒ bit-identical render on both the sync and the cooperative async
  driver; no NaN/∞ and peak ≤ 1; a different seed gives a different wall; WAV and MP3 are
  byte-identical whether produced in one shot or streamed slice-by-slice through a `ByteSink`;
  WAV headers are structurally valid; the waveform preview tracks the render envelope.
  19 checks, ~4 s, no test framework.
- **`npm run smoke`** — `scripts/smoke.tsx` mounts the real `<App />` in jsdom with stand-ins for
  Web Audio and object URLs, restores a shared patch from the URL, clicks Generate, plays back
  (asserting that the streaming player queues multiple chunks rather than one giant buffer),
  exports WAV and MP3 end-to-end (asserting the produced blobs have the expected byte sizes) and
  opens the sheets. 23 checks; it catches the class of bug that only appears when the component
  tree is actually mounted.
- **`npm run check`** runs typecheck + verify + smoke locally; CI
  ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)) runs all three plus the production
  build on every push and PR and reports the bundle size in the run summary.
- Manual validation still covers what headless Node cannot: real playback on speakers, iOS Safari
  memory behaviour at 10 minutes, the share sheet, and installed-app launches.

---

## Security & Privacy

- **Zero network requests** at runtime. The app does not load fonts, analytics, tracking pixels,
  or remote scripts.
- **No audio leaves your machine** — synthesis and encoding happen entirely in the browser tab.
- **No `eval`, no `innerHTML` interpolation** with user-controlled data; React's JSX escaping
  prevents XSS. The only DOM writes outside React are the ephemeral download anchor and the
  canvas bitmap.
- **`Blob` URLs** created for downloads are revoked after the click completes (Safari needs the
  URL alive until the click's default action runs) to free memory.
- **The service worker only ever caches same-origin responses.** Cross-origin requests are passed
  straight through, and it stores nothing but the app shell.
- **The File System Access picker is user-initiated and user-scoped** — the app can only write to
  the exact file the user chooses in the browser's own dialog.
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
npm run check     # typecheck + verify + smoke — must pass before a PR
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
- The PWA icons and the launch QR code are generated by `scripts/generate-icons.mjs` (a ~100-line
  PNG encoder on `node:zlib`) and `scripts/generate-qr.mjs` — no binary assets are hand-edited.
- MP3 encoding uses [`@breezystack/lamejs`](https://github.com/shijinyu/lamejs), a maintained
  build of the pure-JS LAME port. The original `lamejs@1.2.1` package on npm throws
  `ReferenceError: MPEGMode is not defined` under any bundler (verified with esbuild and Vite in
  this repo), which silently broke MP3 export — the fork ships a proper ESM build and fixes it.
- HNW as a genre owes a debt to artists from Merzbow and The Haters to Vomir and Richard
  Ramirez — this tool is a love letter, not a replacement.

> *"The best wall is the one you made yourself from nothing but a seed and a tanh curve."*
