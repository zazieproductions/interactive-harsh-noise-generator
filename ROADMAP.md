# Roadmap

This document tracks the planned, in-progress, and considered future work for NOISE WALL. It
is a living plan, not a contract — priorities shift, contributions reorder things, and good
ideas from issues and PRs will fold in here.

Versioning follows [SemVer](https://semver.org/): breaking API/spec changes bump the major
version; new features bump the minor; fixes and docs bump the patch.

---

## Near-Term (v1.1 — v1.2)

### Usability & Polish

- [ ] **Vitest unit suite** for the DSP engine:
  - Determinism tests (same seed → same `Float32Array` bit-for-bit)
  - Invariant tests (output ∈ [−1, 1]; no NaN/∞ across the full parameter cube at low resolution)
  - Per-stage smoke tests for individual filter/effect functions (factor them out to enable this)
  - WAV header structural assertions
- [ ] **Keyboard shortcuts**: spacebar = play/stop, `G` = generate, `R` = random seed, number
      keys 1–8 to load presets. Documented in-UI via tooltips.
- [ ] **ARIA labels** on every slider and button; screen-reader-tested against VoiceOver and NVDA.
- [ ] **Export metadata prompt** — optional title/artist/year that is written into a BWF `INFO`
      chunk (WAV) and ID3v2 tag (MP3).
- [ ] **Undo/redo** for parameter changes using a lightweight immutable history.
- [ ] **Import/export patch JSON** — share (seed + params) as a small text payload or shareable URL
      hash.

### Sound Design

- [ ] **Additional noise types**:
  - Velvet noise (sparse impulse sequences)
  - Blue / violet noise variants
  - "Line hum" (60/50 Hz + harmonics) layer option
- [ ] **Preset pack v2**: 6–10 additional community presets curated from contributor PRs.
- [ ] **High-pass filter control** (current HP is fixed at 20 Hz for DC removal).
- [ ] **Per-layer pan width** — optional stereo widening (still mono-compatible by default).
- [ ] **Convolution grit** — a built-in short noise-burst IR for "small room / broken speaker" grit.

---

## Mid-Term (v1.3 — v2.0)

### Architecture

- [ ] **Offload synthesis to a Web Worker** so 10-minute walls never block the main thread,
      even on slow devices. Requires splitting `noiseSynth.ts` into a worker-friendly module
      (which is already architecturally clean — it's pure — so this is mostly wiring).
- [ ] **Progressive/generational rendering**: stream the generated audio to the audio element as
      chunks become available, enabling durations well beyond the current 10-minute cap without
      linear memory growth.
- [ ] **OfflineAudioContext preview rendering** (optional) for faster-than-realtime export
      preview.
- [ ] **WebAssembly hot path**: evaluate rewriting the tight inner loops of `distort()`,
      `bitcrush()`, and `stackLayers()` in Rust (compiled to WASM) for a measured 2–4× speedup.
      This will remain optional; the JS fallback must stay fully functional for build simplicity.

### Features

- [ ] **Custom-length envelopes** (attack/hold/release) instead of the fixed 80 ms fades.
- [ ] **LFO waveform selection** (sine / triangle / square / random S&H) plus per-target
      modulation routing (currently hard-coded to amplitude).
- [ ] **Stereo mode** — optional independent L/R seeds or Haas-based widening. Default stays mono
      because HNW is historically a mono-centric form, but stereo is a reasonable user choice.
- [ ] **Drag-and-drop preset chaining** for generating EPs / albums worth of walls in batch.
- [ ] **Spectrogram view** as an alternate visualization (long-term FFT window).

### Quality & DX

- [ ] **Lighthouse/CI budget checks**: fail CI if bundle size exceeds a threshold or if there
      are a11y regressions.
- [ ] **Playwright browser tests** for critical flows (generate → play → download).
- [ ] **Automated cross-browser smoke** via BrowserStack or Playwright's browser matrix (Chrome,
      Firefox, Safari).
- [ ] **Storybook** or similar for isolated component docs (Slider, WaveformVisualizer, PresetCard).

---

## Long-Term / Exploratory

> These are ideas, not commitments. They may happen, they may not, and they may mutate based on
> what we learn from v1.x.

- [ ] **Plugin architecture** — let users drop in custom noise sources or effect stages as
      JS/TS modules (with an explicit sandbox and without sacrificing the single-file build
      for the default distribution).
- [ ] **HNW "album" mode** — generate a sequence of walls with evolving parameters (seed +
      interpolation) and emit a single audio file with track markers.
- [ ] **MIDI / Web MIDI control surface** support for hardware fader/knob mapping.
- [ ] **Web MIDI / MIDI learn** on every parameter.
- [ ] **Mobile-first UI pass** optimized for one-thumb operation on phones; portrait-first
      layout; haptic feedback on generation complete.
- [ ] **Internationalization** — extract UI strings into a resource bundle. The audio engine is
      language-neutral; the UI is currently English-only.
- [ ] **PWA / installable mode** with offline service worker.

---

## Out of Scope (by design)

These have been discussed and deliberately declined. If you want them, please open an issue to
re-argue the case — but know the default answer is "no" unless a compelling new argument appears.

- **Cloud saving / accounts / sync** — violates the zero-network, zero-telemetry principle.
- **Server-side rendering of audio** — same reason, plus it adds cost and a privacy surface.
- **Real-time mic/instrument input processing** — this is a *generator*, not a stompbox.
- **DRM on exported audio** — the output is yours; the license doesn't restrict it and we have
  no interest in locking it down.
- **Crypto, NFT, blockchain anything** — no.

---

## How to Propose Roadmap Items

Open an issue with the prefix `[Roadmap]` in the title. Explain the problem, the proposed
solution, and whether you're volunteering to implement it. The maintainers will discuss,
label, and fold accepted items into this document.
