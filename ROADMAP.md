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
- [x] **Keyboard shortcuts**: `Space` = play/stop, `G` = generate, `R` = new seed. *(v1.2.0 —
      number-key preset loading still open, plus discoverability via tooltips.)*
- [x] **ARIA labels** on every slider and button, plus focus-managed sheets and a keyboard-accessible
      waveform slider. *(v1.2.0 — VoiceOver/NVDA testing still to be done on hardware.)*
- [ ] **Export metadata prompt** — optional title/artist/year that is written into a BWF `INFO`
      chunk (WAV) and ID3v2 tag (MP3).
- [ ] **Undo/redo** for parameter changes using a lightweight immutable history.
- [x] **Import/export patch** — the full patch (every control + seed) is mirrored into a versioned
      URL hash and can be copied/shared from the UI, so a wall can be reopened exactly on another
      device. *(v1.2.0 — a downloadable `.json` patch file is still open.)*

### Mobile & Platform

- [ ] **Web Worker rendering** — `noiseSynth.ts` is pure, so moving the pipeline off the main
      thread is mostly wiring; it would keep scrolling perfectly smooth on low-end phones during a
      10-minute render.
- [ ] **Streaming/generational render** — reuse the chunked player to generate and play audio
      longer than the 10-minute cap without holding the whole buffer.
- [ ] **Media Session integration** — lock-screen play/pause and metadata for the preview player.
- [ ] **Share Target** — register the PWA as a share target so a patch link can be sent *into*
      the installed app.
- [ ] **iOS test matrix** — documented pass over iPhone/iPad Safari at 2 / 30 / 300 / 600 s,
      including backgrounding mid-render and the share-sheet export path.

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

- [ ] **Offload synthesis to a Web Worker** for low-end mobile. *Partially addressed in v1.1:*
      the pipeline now runs cooperatively in ~5–12 s slices with event-loop yields, so the UI
      never blocks at any duration and shows live progress (see
      [docs/PERFORMANCE.md](../docs/PERFORMANCE.md#render-budget-ui-thread)). A dedicated worker
      is still worth doing — `noiseSynth.ts` is pure, so this is mostly wiring.
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
- [x] **Mobile-first UI pass** optimized for one-thumb operation on phones; portrait-first
      layout; haptic feedback on generation complete. *(v1.2.0 — pinned transport bar,
      collapsible groups, 44 px targets, scrub-to-seek waveform, bottom sheets, haptics.)*
- [ ] **Internationalization** — extract UI strings into a resource bundle. The audio engine is
      language-neutral; the UI is currently English-only.
- [x] **PWA / installable mode** with offline service worker. *(v1.2.0 — manifest, service
      worker, generated icon set, install hint. Still open: a "new version available" refresh
      prompt when a deploy lands while the app is open.)*

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
