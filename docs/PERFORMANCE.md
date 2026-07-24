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
lands at ~6 s). These are well under the UI budget: the UI displays a "Generating…" state while
the work happens in a `setTimeout(..., 60)` tick so the spinner paints first.

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
2. **No React re-renders during generation.** The audio buffer is produced synchronously and
   only dropped into state once, after generation completes. This avoids re-rendering 26 million
   floats.
3. **Canvas is O(canvas-width), not O(n).** The visualizer aggregates min/max per pixel column;
   there are always ~1200 fillRect calls per frame.
4. **AudioContext is reused** across playbacks (one `AudioContext` per tab lifetime) instead of
   being recreated per play.
5. **Single-file build** via `vite-plugin-singlefile` eliminates HTTP round-trips on cold load.
6. **mulberry32** is one of the fastest seeded PRNGs with reasonable statistical properties —
   far cheaper than a generic xorshift+ or PCG in JS while being entirely adequate for audio.
7. **`Math.imul`** is used in the PRNG for C-like 32-bit multiplication semantics, which V8
   optimizes well.
8. **Tight biquad inner loops** use local-variable-captured coefficients and x1/x2/y1/y2 state,
   avoiding property lookups inside the loop.

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

Generation runs synchronously on the main thread. For a 10-minute wall, that is a multi-second
block. To keep the UI honest:

- The **Generate button** shows an "isGenerating" spinner and is disabled.
- The call is wrapped in `setTimeout(..., 60)` to let the browser paint the loading state before
  the thread blocks.
- We accept this tradeoff because:
  - Walls up to 2–3 minutes are nearly instantaneous and represent the common case.
  - 10-minute walls (the cap) block for a few seconds on modern hardware — tolerable for a
    music-generation tool.
  - Moving to a Web Worker (planned) will remove main-thread blocking entirely, at the cost of
    slightly more plumbing.

If profiling shows generation blocking longer than ~10 seconds on modern hardware, that is a
performance bug and should be filed.

---

## Playback Performance

- Playback itself is handed to the browser's audio thread (the `AudioBufferSourceNode` is
  scheduled and mixed by the browser's real-time audio graph, which runs off the main thread
  in all modern engines).
- The only main-thread work during playback is the `requestAnimationFrame` loop that updates
  `playProgress`, which triggers the canvas re-render. That re-render is <1 ms/frame on modern
  hardware and runs at display refresh rate (60/120/144 Hz depending on the monitor).
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
- If a change doubles generation time without a compelling sonic reason, it needs either
  optimization or a strong justification.

---

## Future Optimizations (on Roadmap)

Tracked in [ROADMAP.md](../ROADMAP.md) but summarized here for performance relevance:

1. **Web Worker offload** — render audio off the main thread so 10-minute walls don't block UI.
2. **Scratch buffer reuse** — pass a reusable scratch `Float32Array` to `addGritLayer` and
   `addSubBassLayer` instead of allocating fresh buffers each call.
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
