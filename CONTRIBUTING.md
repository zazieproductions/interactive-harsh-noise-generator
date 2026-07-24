# Contributing to NOISE WALL

First off: thank you for wanting to make NOISE WALL better. Whether you're filing a bug,
tuning a preset, adding a new noise algorithm, or fixing a typo, your contribution matters.

This document is the canonical source of truth for how to contribute. If something is missing
or unclear, open an issue — that in itself is a valuable contribution.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to Contribute](#ways-to-contribute)
- [Development Setup](#development-setup)
- [Project Conventions](#project-conventions)
- [Commit & PR Hygiene](#commit--pr-hygiene)
- [Reporting Bugs](#reporting-bugs)
- [Requesting Features](#requesting-features)
- [Adding Presets](#adding-presets)
- [Adding DSP Stages or Noise Types](#adding-dsp-stages-or-noise-types)
- [Documentation](#documentation)
- [Security Disclosures](#security-disclosures)

---

## Code of Conduct

This project follows the [Contributor Covenant v2.1](./CODE_OF_CONDUCT.md). By participating,
you agree to uphold it. Report unacceptable behavior to the maintainers via the contact
address in `SECURITY.md`.

---

## Ways to Contribute

| Kind | How |
|------|-----|
| 🐛 Bug reports | Use [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) template |
| ✨ Feature ideas | Use [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md) template |
| 🎛️ New presets | PR — see [Adding Presets](#adding-presets) |
| 🔊 DSP improvements | PR — see [Adding DSP Stages](#adding-dsp-stages-or-noise-types) |
| 🎨 UI / UX / a11y | PR |
| 📚 Docs | PR (docs, README, JSDoc, type comments) |
| 🧪 Tests | PR — Vitest is the chosen runner (see [Roadmap](./ROADMAP.md)) |

When in doubt, **open an issue first** to discuss non-trivial changes before sinking time
into a patch.

---

## Development Setup

```bash
# 1. Fork and clone
git clone https://github.com/<your-username>/interactive-harsh-noise-generator.git
cd interactive-harsh-noise-generator

# 2. Install
npm install

# 3. Create a branch
git checkout -b feat/your-topic

# 4. Dev server (HMR)
npm run dev

# 5. Verify the production build
npm run build
npm run preview
```

**Requirements:**

- Node.js ≥ 20 (LTS)
- npm ≥ 10
- A browser with Web Audio API (any modern evergreen browser will do)

**Editors:** VS Code with the official [Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss)
and [Biome](https://marketplace.visualstudio.com/items?itemName=biomejs.biome) / ESLint extensions
is recommended, but any editor that respects `tsconfig.json` will work.

---

## Project Conventions

### TypeScript

- **Strict mode always.** `tsconfig.json` enables `strict`, `noUnusedLocals`, `noUnusedParameters`,
  and `noFallthroughCasesInSwitch`. Do not weaken these flags locally; fix the code.
- **No `any`.** If you find yourself reaching for `any`, you're probably missing a type.
  Use `unknown` plus narrowing, or define an interface. The one current exception is the
  `webkitAudioContext` cast in `App.tsx`, which is guarded by a runtime check.
- **Pure functions in `noiseSynth.ts`.** The DSP engine must remain a **DOM-free, React-free
  module** so it can be tested, ported, or run in a Web Worker without modification.
- **Public API surface:** export types and factory functions explicitly; mark anything else as
  module-private (don't export it).

### React

- Prefer **hooks** and **functional components**. No class components.
- Co-locate sub-components (e.g. `Slider`, `WaveformVisualizer`) in the same file as the parent
  unless they grow beyond ~100 lines or are reused.
- Store **audio buffers, audio contexts, and RAF handles** in `useRef`. Store **UI state** in
  `useState`. Never put a `Float32Array` of millions of samples into React state without a
  really good reason — we currently do it once, after generation, which is acceptable because
  the reference rarely changes.
- Use `useCallback` for handlers passed down to memoized or frequently-re-rendered children.

### Styling (Tailwind 4)

- Utility-first; no external CSS files beyond `index.css` which only contains `@import "tailwindcss";`.
- Use semantic spacing tokens (Tailwind defaults) rather than arbitrary values unless the design
  requires pixel-perfect alignment.
- Use the `cn()` helper from `src/utils/cn.ts` when combining conditional classes.
- Color palette is constrained: `red` for primary/action, `gray` for chrome, `amber` for
  warnings, `emerald`/`blue`/`purple` for playback and export affordances. Don't introduce
  accent colors without a documented reason.

### Naming

- Files: `camelCase.ts` for utilities, `PascalCase.tsx` for components if/when split out.
- Types: `PascalCase` (`NoiseType`, `NoiseParams`, `Preset`).
- Constants: `SCREAMING_SNAKE_CASE` only for true compile-time constants (`SAMPLE_RATE`,
  `DEFAULT_PARAMS`).
- UI labels: **Title Case** for section headers, **Sentence case** for buttons and helper text.

### Formatting / Linting

The project uses TypeScript's own checking as the primary gate. Before submitting a PR:

```bash
npm run build     # must complete with zero errors
```

A formatter/linter (Biome or Prettier+ESLint) will be added once the test suite lands; until then,
match the surrounding style (2-space indent, semicolons, single quotes, trailing commas in
multiline literals).

---

## Commit & PR Hygiene

- **One logical change per PR.** Mixing a DSP refactor with a UI color change makes review hard.
- **Write meaningful commit messages.** Imperative mood, ≤72-char subject line, optional body
  explaining the *why*.
- **Reference issues.** If a PR fixes #123, include `Fixes #123` in the PR body so GitHub
  auto-closes it.
- **Keep PRs small.** <400 lines of non-test code is a good target. Larger changes are fine but
  expect more review rounds.
- **Do not commit** build artifacts (`dist/`), `node_modules/`, or local env files. The
  `.gitignore` already covers this — don't bypass it.
- **Use the [PR template](.github/PULL_REQUEST_TEMPLATE.md).** It exists to make review faster.

---

## Reporting Bugs

Use the **Bug Report** issue template. Include:

1. Browser + version (e.g. Chrome 126, Firefox 127, Safari 17.5)
2. OS
3. Exact steps to reproduce
4. What you expected
5. What actually happened (console errors, stuck UI, distorted output, etc.)
6. The seed + preset/params that triggered it, if applicable

**Bugs that include a seed + params are dramatically easier to fix** because the engine is
deterministic — we can regenerate the exact same wall locally.

---

## Requesting Features

Use the **Feature Request** template. Please articulate:

- **The problem** you're trying to solve (not just the solution you want)
- **A sketch** of the desired behavior (UI mockup, pseudocode, or just a paragraph)
- **Whether it breaks determinism** — if so, explain why the trade-off is worth it
- **Any references** (papers, blog posts, existing VSTs) that informed the idea

Out-of-scope features (for now, and by design):

- Real-time microphone/input processing (this is a *generator*, not an effects unit)
- Multi-track / multi-voice composition
- Cloud saving or account systems (violates the "zero network calls" principle)
- Server-side rendering of audio (this is a client-first app)

If you want these, fork away — the MIT license explicitly permits it.

---

## Adding Presets

Presets live in the `PRESETS` array in `src/App.tsx`. Adding one is the lowest-friction way
to contribute. A good preset:

1. **Sounds like something.** It should have a distinct, describable character — not just
   "everything at 50".
2. **Is named evocatively.** Concrete nouns and industrial/noise-culture references work well.
3. **Uses a unique or memorable seed.** 0, 42, 137, 666, 999, and other small integers are fine
   if they sound good; there's no prize for random seeds here.
4. **Comes with a one-line description** (the `desc` field) that conveys the character.
5. **Generates safely at any reasonable volume** (no DC offset, no sustained digital full-scale
   beyond what the compressor can catch — normalization at the end of the pipeline takes care
   of the latter, but avoid pathological feedback settings).

To add a preset:

1. Append to `PRESETS` in `src/App.tsx`.
2. Use a new, unused emoji for `icon`.
3. `npm run build` to verify types.
4. Test all export formats (WAV + MP3 at 192k) to make sure nothing blows up.
5. Open a PR titled `preset: add <Name>`.

---

## Adding DSP Stages or Noise Types

The DSP engine is the heart of the project. Changes here get extra scrutiny.

1. **Open an issue first** describing the proposed algorithm. Link to papers, source code,
   or sound examples if possible.
2. Keep the `noiseSynth.ts` boundary pure (no DOM, no Web Audio, no React imports).
3. New stages must be **deterministic** given the seeded RNG; use the provided `rng()` function
   rather than `Math.random()`.
4. New stages must be **stable** (no runaway feedback, NaN, or infinity for any input in the
   advertised parameter range). Clamp / guard coefficients.
5. Add **inline comments** explaining non-obvious coefficient choices (e.g. why a Q is 0.7,
   why a fade is 80 ms).
6. If the stage is perceptually significant, mention it in `docs/DSP-PIPELINE.md` and update
   the controls table in `README.md`.
7. Verify that existing seeds still produce perceptually similar (or better) output — we don't
   promise bit-exactness across engine versions, but we do promise not to silently break the
   preset library.

### Performance budget

Any new stage should be **O(n)** and avoid allocating per-sample. Reuse buffers where possible.
A 10-minute wall should still generate in under 10 seconds on a 2020 laptop. See
[PERFORMANCE.md](docs/PERFORMANCE.md) for how to benchmark.

---

## Documentation

If you change behavior, update the relevant docs:

- **README** — public-facing overview, controls table, quick start
- **docs/ARCHITECTURE.md** — module boundaries, design decisions
- **docs/DSP-PIPELINE.md** — signal flow, per-stage math
- **docs/API.md** — exported TypeScript signatures
- **docs/PERFORMANCE.md** — benchmarks, optimization notes
- **docs/ACCESSIBILITY.md** — a11y audit
- **docs/DEPLOYMENT.md** — platform recipes
- **CHANGELOG.md** — user-visible changes for each version
- **JSDoc/TSDoc** — on all public exports from `src/utils/`

Write in clear, concise English. Favor the active voice. Avoid marketing copy in technical
docs.

---

## Security Disclosures

Do **not** open public issues for security vulnerabilities. Follow the process in
[SECURITY.md](./SECURITY.md).

---

## Final Note

This is a project about noise — but the code around it should be quiet, careful, and precise.
Write code that a future you (or a fellow noise nerd) will read and think,
"yeah, that was done with intention."

Thank you for building with us.

— Zazie Productions LLC
