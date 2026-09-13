# Setup & Development

This document covers local development, editor configuration, build verification, and known
browser/toolchain quirks for NOISE WALL. If you just want to run the app, see
[Quick Start in the README](../README.md#quick-start). This doc is for people who want to
work on the codebase.

---

## Requirements

| Tool | Minimum | Recommended |
|------|---------|-------------|
| Node.js | 20.x (Active LTS) | 22.x or latest LTS |
| npm | 10.x | Latest 10.x |
| Browser | Chrome 100+, Firefox 100+, Safari 15+ | Latest stable Chrome or Firefox |
| OS | Windows / macOS / Linux | — |
| Disk | ~100 MB for node_modules | ~250 MB for build + caches |

Why Node 20+? We rely on Vite 7 which requires Node 20.9+. We also use modern Web APIs
(`structuredClone`, `Blob.stream` in some build tooling) and ES2022 features.

---

## Install

```bash
git clone https://github.com/zazieproductions/interactive-harsh-noise-generator.git
cd interactive-harsh-noise-generator
npm install
```

This installs ~150 MB of dependencies (React, Vite, Tailwind, TypeScript, `@breezystack/lamejs`, and
the React/Vite toolchain). No native modules are compiled — everything is pure JS/TS.

### Verifying the install

```bash
npm run check     # typecheck + engine verification + jsdom UI smoke test
npm run build     # production bundle
```

`npm run check` is the fast, dependency-light gate: `scripts/verify.ts` renders real walls in
Node and asserts the determinism/export guarantees (19 checks), and `scripts/smoke.tsx` mounts the
actual `<App />` in jsdom and drives it — restore a patch from the URL, generate, play back
through a stubbed audio graph, export WAV and MP3, open the sheets (23 checks). The build should
end with a single `dist/index.html` of roughly 460 KB (~148 KB gzipped). If all of that passes,
your toolchain is healthy.

---

## Scripts

Defined in `package.json`:

```bash
npm run dev        # Vite dev server with HMR, bound to 0.0.0.0 (localhost + your LAN IP)
npm run build      # tsc --noEmit, then production build → dist/
npm run preview    # Serve the built dist/ locally (http://localhost:4173)
npm run typecheck  # tsc --noEmit only
npm run verify     # Headless DSP + encoder verification (scripts/verify.ts)
npm run smoke      # Mounts the real <App /> in jsdom and drives it (scripts/smoke.tsx)
npm run check      # typecheck + verify + smoke — the pre-PR gate
npm run icons      # Regenerate public/ PWA icons + favicon.svg
npm run qr         # Regenerate docs/assets/launch-qr.svg (NOISE_WALL_URL=… to retarget)
```

There is still no lint or format script — tracked in [ROADMAP.md](../ROADMAP.md). `npm run check`
plus `npm run build` is the pre-PR gate, and CI runs both on every push and PR.

### Testing on a real phone

`npm run dev` binds all interfaces, so Vite also prints a **Network** URL
(`http://192.168.1.42:5173`). Open that on a phone on the same Wi-Fi. Over plain HTTP the app
works fully for generate/play/save; the install-and-offline features need HTTPS, which you get
from GitHub Pages or a Codespaces port (see [DEPLOYMENT.md](./DEPLOYMENT.md)).

### Cloud dev containers

`.devcontainer/devcontainer.json` (Codespaces or VS Code Dev Containers) installs dependencies and
forwards port 5173 publicly. `vite.config.ts` allows the forwarded hostnames and switches HMR to
`wss` automatically when `CODESPACE_NAME` is set — no manual flags needed.

### Verifying changes to the audio engine

`src/utils/noiseSynth.ts` is pure, so it runs in Node: `npm run verify` renders real walls and
asserts that the sync and async drivers are byte-identical, that output stays finite and inside
[−1, 1], and that the WAV/MP3 streaming encoders match their in-memory counterparts. Add a check
there for any DSP change — it is the fastest feedback loop in the repo (~4 s).

---

## Development Workflow

1. `npm run dev`
2. Open the printed URL (typically `http://localhost:5173`).
3. Edit files under `src/`. HMR updates styles instantly and React components within a second.
4. The app's state (including sliders and the currently-generated buffer) is **not persisted**
   across HMR reloads — changing engine code will drop the current buffer. This is by design;
   re-generate after touching `noiseSynth.ts`.
5. Run `npm run build` before opening a PR. TypeScript strict mode must pass, and the
   single-file output must be produced.

### Working on the DSP engine

- `noiseSynth.ts` is pure TypeScript with no DOM dependency. You can unit-test it directly
  (see [ROADMAP](../ROADMAP.md) for the incoming Vitest suite).
- A useful ad-hoc debug pattern: add a console print for peak/RMS after each stage, or
  export an intermediate buffer from a modified `generateNoiseWall` and compare WAVs in a DAW.
- To validate bit-exact determinism while iterating:

  ```ts
  import { generateNoiseWall, DEFAULT_PARAMS } from './src/utils/noiseSynth';
  const a = generateNoiseWall({ ...DEFAULT_PARAMS, seed: 42 });
  const b = generateNoiseWall({ ...DEFAULT_PARAMS, seed: 42 });
  console.log(a.every((v, i) => v === b[i]));  // must be true
  ```

### Working on encoders

- `npm run verify` already checks WAV header structure and MP3 frame headers; use it first.
- For an independent sanity check, WAV output can be validated with `sox --i file.wav` or
  `ffprobe file.wav`, and MP3 with `ffprobe file.mp3` or any standard player.
- The MP3 encoder is `@breezystack/lamejs` (see the note below on why not `lamejs`). It does not
  produce byte-identical files across versions (internal tables change), but the files must decode
  to perceptually identical audio.

### Working on the UI

- The UI is styled with Tailwind 4. There is **no custom CSS** — if you find yourself writing
  CSS, prefer adding a utility class or refactoring into a small component.
- The color palette is intentionally constrained (see
  [CONTRIBUTING.md](../CONTRIBUTING.md#styling-tailwind-4)).
- The waveform canvas is fixed at 1200×280 (logical) and scales via CSS; changing the logical
  size changes how many min/max columns are drawn.

---

## Editor Setup

### VS Code (recommended)

Recommended extensions:

- **Tailwind CSS IntelliSense** (bradlc.vscode-tailwindcss) — autocomplete + linting for utility classes
- **Biome** or **ESLint** (once linting lands)
- **Prettier** (optional — see formatting discussion below)

A minimal `.vscode/settings.json` is not committed (intentionally, to avoid dictating personal
editor preferences). The following settings are recommended:

```json
{
  "editor.formatOnSave": false,
  "editor.codeActionsOnSave": { "source.fixAll": "explicit" },
  "typescript.tsdk": "node_modules/typescript/lib",
  "files.eol": "\n",
  "files.insertFinalNewline": true
}
```

### Other editors

Any editor that respects `tsconfig.json` will work. Vim/Neovim with `typescript-language-server`,
Emacs with tide/lsp-mode, Sublime with LSP, WebStorm, Zed — all fine.

### Formatting

The project currently has no automated formatter. A Biome or Prettier config will be introduced
along with the test suite. Until then, match the existing style:

- 2-space indent
- Semicolons on
- Single quotes
- Trailing commas in multiline objects/arrays
- 80–100 column target (softer than a hard limit; follow readability)
- Spaced comment markers (`// like this`), no block comments in code flow (JSDoc-style block
  comments at the top of modules/functions are fine)

---

## Environment Variables

There are **no required environment variables**. The build is fully static. Future features
(e.g., optional Plausible analytics opt-in) will use `VITE_*`-prefixed vars if and when they
are added, and they will be gated behind off-by-default switches.

---

## Browser Quirks

### Web Audio

| Browser | Notes |
|---------|-------|
| Chrome/Chromium | Reference platform. Everything works as designed. |
| Firefox | `AudioContext` resumes without issue. On Linux the default sample rate may differ from 44.1 kHz, but the generated audio is still 44.1 kHz (the browser resamples on playback — exported files are unaffected). |
| Safari | Requires `webkitAudioContext` fallback (handled). Autoplay policy requires a user gesture to start audio — this is why Play Preview is gated behind a button click. Safari's biquad and compressor implementations are slightly different but sonically equivalent for our purposes. |
| Edge | Chromium-based; behaves like Chrome. |

### File downloads

- `URL.createObjectURL(blob)` works in all evergreen browsers, including when the page is
  opened from `file://` (tested in Chrome, Firefox, Safari). This is what enables the
  "download and open locally" workflow.
- Safari sometimes appends `.html` to download filenames when served with certain MIME types;
  we pass `audio/wav` and `audio/mpeg` explicitly to avoid this.

### Canvas

- The visualizer uses a 1200-pixel-wide canvas and scales via CSS. On HiDPI displays the CSS
  will scale up; we currently do not set `width`/`height` based on `devicePixelRatio` (planned
  for v1.1) — the resulting rendering is slightly soft on 2×/3× displays but functionally fine.

---

## Troubleshooting

### `npm install` fails with a Node version error

Make sure you're on Node 20+. Check with:

```bash
node -v
```

Use `nvm use 22` (or `fnm use 22`, or `volta install node@22`) to switch.

### Dev server port 5173 is taken

```bash
npm run dev -- --port 5174
```

### "No sound" when hitting Play

- Check that the volume slider isn't at 0%.
- Make sure you clicked **Generate** first — Play Preview is disabled until a buffer exists.
- Your browser may be blocking autoplay; a click on the Play button is the required user
  gesture, so clicking Play should unblock it.
- On Linux with PulseAudio/PipeWire, double-check that the tab isn't muted.

### Audio is distorted/clipped

- HNW is, by design, distorted. But if it sounds broken:
  - Make sure your system volume is below 50% initially (see the volume warning in the UI).
  - The built-in compressor catches most overs, but cannot prevent clipping on bad headphones or
    Bluetooth codecs that run hot.
  - The exported WAV/MP3 is peak-normalized to −0.27 dBTP — it should not clip on replay. If it
    does in a specific player, please file a bug with the player + seed + params.

### MP3 export throws `MPEGMode is not defined`

You are on the npm package `lamejs@1.2.1`, whose CommonJS source references a `MPEGMode` binding
that does not exist; any bundler that respects ES module strictness (esbuild, Rollup, Vite) turns
that into a runtime `ReferenceError` the moment `new Mp3Encoder(...)` runs. This repository uses
`@breezystack/lamejs@1.2.7`, a maintained ESM build of the same encoder, which ships its own
types. If you must stay on the original package, importing `lamejs/lame.all.js` (IIFE) and
initialising it via a `window` shim is the only reliable workaround — that is why we switched.

### Build fails on `Uint8Array` vs `BlobPart`

TypeScript 5.7+ made typed arrays generic over their backing buffer. Encoders therefore declare
`Uint8Array<ArrayBuffer>` (not plain `Uint8Array`) in their signatures; if you add a sink or a
helper, keep that annotation, or `new Blob([bytes])` will fail to typecheck.

---

## Repository Hygiene

Things that should not be committed (enforced by `.gitignore` once added; see checklist):

- `node_modules/`
- `dist/` (build output; produced by CI or local builds)
- `.DS_Store`, `Thumbs.db`
- Editor/IDE folders: `.vscode/` (opt-in; workspace settings are fine to share but currently
  we don't commit them), `.idea/`
- Local env files: `.env`, `.env.local`, etc.
- Log files: `npm-debug.log*`, `yarn-debug.log*`

---

## CI

CI runs on GitHub Actions (see `.github/workflows/ci.yml`):

- `npm install`
- `npm run build`
- Optional test/lint steps (added as those tools land)

If CI is red on your PR, pull the latest `main`, rebase or merge, and re-run locally with
`npm run build` to reproduce the failure.
