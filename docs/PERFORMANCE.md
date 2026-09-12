# Performance

This document records the performance characteristics of NOISE WALL, the profiling methodology
used, and the optimizations already applied. It is intended for engineers making changes to the
DSP pipeline or the UI, and for anyone trying to reason about how long a wall will take to
render on a given device.

---

## Headline Numbers

Measured on the default preset (`DEFAULT_PARAMS`, seed 42) at various durations, running in
Chrome on a 2023 MacBook Pro (M2 Pro):

| Duration | Samples | Gen time (cold) | Allocated (approx) | WAV size | MP3 size (192 kbps) |
|---------:|--------:|----------------:|-------------------:|---------:|--------------------:|
| 10 s | 441 000 | ~40 ms | ~10 MB | ~860 KB | ~240 KB |
| 30 s | 1 323 000 | ~100 ms | ~25 MB | ~2.5 MB | ~720 KB |
| 60 s | 2 646 000 | ~200 ms | ~45 MB | ~5.1 MB | ~1.4 MB |
| 5 min | 13 230 000 | ~1.1 s | ~200 MB | ~25 MB | ~7 MB |
| 10 min | 26 460 000 | ~2.3 s | ~400 MB | ~50 MB | ~14 MB |

A 2020 Intel 13" MacBook Pro (i5-1038NG7) sees roughly **2.5×** those times (so a 10-minute wall
lands at ~6 s). Those figures are pure DSP work time. The UI budget is separate and now
guaranteed: generation runs cooperatively in slices with event-loop yields between them, so the
"Generating…" state (spinner + live per-stage progress bar) paints first and keeps animating
for the whole render (see [Render Budget](#render-budget-ui-thread)).

> Note: All measurements are mono `Float32Array` generation only; WAV/MP3 encoding time is
> additional (WAV encoding is a linear scan + DataView writes, ~50–150 ms for 10 min; MP3
> encoding is the most expensive non-DSP step and adds 1–3 s for 10 min at 192 kbps).

---

## Where the Time Goes

Profiling a 60-second generation in Chrome DevTools:

| Stage | Share of total | Why |
|-------|:--------------:|-----|
| `stackLayers` (layer generation + per-layer filter/drive) | ~35% | Allocates N Float32Arrays and runs N biquads + tanh drives |
| `distort` (multi-stage waveshaper) | ~15% | Per-sample branching for foldback + multiple `tanh`/`sin` calls |
| `addGritLayer` + `addSubBassLayer` | ~20% combined | Allocate scratch buffers + bandpass filter on grit |
| `bitcrush`, `feedbackSaturate`, `applyLFO` | ~15% combined | Linear passes, cheap ops |
| `biquadLowpass` / `biquadHighpass` / `lp1` | ~10% combined | Biquad inner loops are tight and cheap |
| `normalize`, `applyEnvelope`, final tanh | ~5% combined | Single linear scans |

Key insight: **buffer allocation and bandpass filtering of scratch buffers is expensive**.
The fastest future wins will come from reusing scratch buffers and fusing passes.

---

## Memory Profile

During a 10-minute generation peak allocations include:

- Main buffer: 26.46M × 4 bytes = ~100 MB `Float32Array`
- Up to 6 per-layer buffers during `stackLayers`: up to ~600 MB transient (allocated and freed
  per layer, so steady state is closer to ~100 MB + one scratch)
- Grit scratch buffer: ~100 MB during stage 8
- MP3 encoding `Int16Array` scratch: ~50 MB
- Intermediate typed arrays for MP3 chunks: small (<1 MB total)

Total observed JS heap at peak during a 10-minute MP3 export is **~350–450 MB**. This is within
the budget for modern desktop browsers (which typically allow 2–4 GB per tab) but is a real
constraint on low-memory mobile devices — this is one reason Web Worker rendering and progressive
generation are on the roadmap.

---

## Optimizations Already Applied

1. **Single-pass in-place stages.** Most DSP primitives (distort, feedback, LFO, bitcrush,
   glue tanh, envelope, normalize) mutate the buffer in place rather than allocating and
   returning new arrays.
2. **No React re-renders of the audio data.** The buffer is produced cooperatively (see
   Render Budget) and only dropped into state once, after generation completes. This avoids
   re-rendering 26 million floats.
3. **Canvas is truly O(canvas-width), not O(n).** The visualizer draws from a precomputed
   per-column min/max preview (`buildWaveformPreview`), built once per generation; there are
   always ~1200 fillRect calls per frame, including the playhead animation during playback of a
   10-minute wall.
4. **AudioContext is reused** across playbacks (one `AudioContext` per tab lifetime) instead of
   being recreated per play.
5. **Single-file build** via `vite-plugin-singlefile` eliminates HTTP round-trips on cold load.
6. **mulberry32** is one of the fastest seeded PRNGs with reasonable statistical properties —
   far cheaper than a generic xorshift+ or PCG in JS while being entirely adequate for audio.
7. **`Math.imul`** is used in the PRNG for C-like 32-bit multiplication semantics, which V8
   optimizes well.
8. **Tight biquad inner loops** use local-variable-captured coefficients and x1/x2/y1/y2 state,
   avoiding property lookups inside the loop.
9. **Sliceable DSP pipeline.** Every stage is a primitive over a `[start, end)` sub-range with
   explicit state; the sync and async drivers share the exact same loop bodies (bit-identical
   output), and the async driver yields to the event loop between slices.
10. **Scratch buffer reuse in `stackLayers`.** One full-length scratch buffer is reused across
    layers (zeroed first for crackling, whose burst logic skips index ranges) instead of
    allocating a fresh full-length buffer per layer.
11. **Sliced WAV/MP3 encoding.** Exports process ~32 slices with an event-loop yield and a
    progress callback between them; the MP3 encoder instance is fed the exact same 1152-sample
    blocks as the sync path, so output is byte-identical.

---

## Bundle Size

As of v1.0.0:

| Asset | Size | Gzipped |
|-------|-----:|--------:|
| `dist/index.html` (single file) | ~850 KB | ~350 KB |

Where that comes from:

- React 19 + ReactDOM: ~45 KB gzipped
- Tailwind 4 atomic CSS (inlined): ~30 KB gzipped
- `lamejs`: ~190 KB gzipped (largest single contributor — MP3 encoder tables)
- App + DSP code + Vite runtime: ~85 KB gzipped

`lamejs` dominates. If we ever need to drop bundle size further, lazy-loading `lamejs` only when
the user clicks "Download MP3" would save ~190 KB gzipped on initial load. Tracked in
[ROADMAP.md](../ROADMAP.md).

---

## Render Budget (UI Thread)

Generation runs **cooperatively on the main thread** (no Web Worker). The pipeline is processed
in ~5–12 s slices of audio; `runSlices` accumulates the wall-clock cost of each slice and awaits
a `setTimeout(0)` tick once ~50 ms of slice work has accumulated since the last yield. Net
effect:

- **No multi-second main-thread blocks at any duration** — sliders stay live and the progress
  bar animates during a 10-minute render.
- The **Generate button** shows a spinner plus a live per-stage progress bar (stage label +
  percent); `generateNoiseWallAsync` yields once before the first work slice so the loading
  state is guaranteed to paint.
- **Yield overhead is small**: yields fire at most every ~50 ms of actual work, so a 2–4 s
  render adds well under 100 ms of event-loop hand-off time on modern hardware.
- Each slice holds the main thread for at most one slice of work (tens of ms even on slow
  hardware), and the per-slice progress callback keeps the bar updating at ~10–20 fps.
- A dedicated Web Worker remains on the roadmap, motivated by low-end mobile rather than by any
  UI-thread problem (see [Future Optimizations](#future-optimizations-on-roadmap)).

If profiling shows a single slice holding the main thread for longer than ~100 ms on modern
hardware, that is a performance bug and should be filed.

---

## Playback Performance

- Playback itself is handed to the browser's audio thread (the `AudioBufferSourceNode` is
  scheduled and mixed by the browser's real-time audio graph, which runs off the main thread
  in all modern engines).
- The only main-thread work during playback is the `requestAnimationFrame` loop that updates
  `playProgress`, which triggers the canvas re-render. That re-render reads the precomputed
  per-column preview (~1200 fillRect calls), is <1 ms/frame on modern hardware, and runs at
  display refresh rate (60/120/144 Hz depending on the monitor) — for any wall length.
- The `GainNode` is wired live to the volume slider; changes are sample-accurate and do not
  cause re-renders of the audio buffer.

---

## Benchmarking Checklist

When adding or modifying DSP stages, check:

```bash
# 1. Ensure the build still works
npm run build

# 2. Generate at max duration in the browser and time it
#    - Open DevTools → Performance → Record
#    - Click Generate
#    - Stop recording; inspect the "generateNoiseWall" call stack

# 3. Quick ad-hoc micro-benchmark (paste in browser console after loading the module):
console.time('gen');
for (let i = 0; i < 3; i++) {
  // call generateNoiseWall({...DEFAULT_PARAMS, duration: 60})
}
console.timeEnd('gen');
```

### Heuristics

- A 60-second wall should take **<250 ms** on an M-series Mac.
- A 10-minute wall should take **<4 s** on an M-series Mac, **<10 s** on a 2020 laptop.
- A 10-minute generation must keep the progress bar animatable and the sliders responsive
  the whole time (no multi-second main-thread blocks).
- If a change doubles generation time without a compelling sonic reason, it needs either
  optimization or a strong justification.

---

## Future Optimizations (on Roadmap)

Tracked in [ROADMAP.md](../ROADMAP.md) but summarized here for performance relevance:

1. **Web Worker offload** — render audio off the main thread. v1.1 shipped cooperative
   in-thread slicing, so the UI no longer blocks at any length; the remaining motivation is
   low-end mobile, where even ~50 ms slices are worth moving off-thread entirely.
2. **Scratch buffer reuse (partially done)** — `stackLayers` reuses one scratch buffer; the
   grit stage still allocates one full-length scratch per run (fold it into pass fusion).
3. **Pass fusion** — fuse feedback + glue tanh into a single loop; fuse normalize + envelope
   into a single loop. Small wins but cheap to implement.
4. **SIMD via WASM** — rewrite the tight inner loops in Rust (compiled to WASM) for a measured
   2–4× speedup. Candidate stages: `distort`, `stackLayers`, `bitcrush`.
5. **Lazy-load lamejs** — dynamic `import()` of `lamejs` only when the user clicks MP3 export.
6. **Progressive rendering** — stream chunks out of the generator so users can hear the first
   seconds while the rest is still being synthesized (enables >10 minute walls with bounded
   memory).

---

## Mobile Performance

Mobile Safari and Chrome on Android run V8/JavaScriptCore with JITs comparable to desktop
engines, but with tighter memory budgets (~1–2 GB heap on mid-range phones) and slower CPUs.
Expect:

- 1–2 minute walls: fast and fluid on modern phones.
- 5+ minute walls: may hit memory pressure on low-end Android devices; will work but with
  noticeable generation time.
- 10-minute walls: currently the upper bound for safety on most phones; if you target mobile
  specifically, consider shorter durations.

The Web Worker work and scratch-buffer reuse will be the biggest wins for mobile.

---

## Reporting Performance Regressions

File an issue using the Bug Report template with:

- Browser + OS + hardware (CPU model, RAM)
- Duration / preset / seed that reproduces the slowness
- A Performance profile trace (Chrome DevTools → Performance → Save) if possible
- Your measured generation time vs. expectations
- The last commit where performance was acceptable (use `git bisect` if you can)

Performance regressions are treated as bugs.
