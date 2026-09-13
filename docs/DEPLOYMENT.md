# Deployment

NOISE WALL's production build is a **static folder**: a single self-contained `index.html`
(`dist/index.html`, ~460 KB / ~148 KB gzipped) plus the PWA shell files (manifest, icons, service
worker). This document covers the shipping paths we actually use — a public GitHub Pages URL, a
private dev container URL, and a same-Wi-Fi URL — plus the platform specifics.

---

## Building

```bash
npm install
npm run check      # typecheck + verify + smoke (optional but recommended)
npm run build      # → dist/
```

`npm run build` runs `tsc --noEmit` first, so a type error fails the build before Vite runs.
The output:

```text
dist/
├── index.html              # 469 KB — all JS + CSS inlined (gzip ≈ 148 KB)
├── manifest.webmanifest
├── sw.js
├── favicon.svg
├── icon-192.png
├── icon-512.png
├── icon-maskable-512.png
└── apple-touch-icon.png
```

Verify what you just built:

```bash
npm run preview     # http://localhost:4173, production bundle, service worker included
ls -la dist
```

> **Why isn't everything in the one HTML file?** `vite-plugin-singlefile` inlines the app, but a
> service worker must be a separate, same-origin script, and browsers fetch manifest icons
> directly. The app still works with *only* `index.html` (that path is what `file://` users get) —
> the extra files add offline support and a home-screen icon.

---

## Option 1 — GitHub Pages (the public link to put on a phone)

Workflow: [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml)

```text
push to main → npm ci → npm run verify → npm run build → upload dist/ → deploy-pages
→ https://zazieproductions.github.io/interactive-harsh-noise-generator/
```

**One-time setup**

1. **Settings → Pages → Build and deployment → Source: GitHub Actions** — *not* "Deploy from a
   branch". A human has to do this once: changing the source takes `Administration: write`, which
   `GITHUB_TOKEN` cannot be granted. Add a `PAGES_ADMIN_TOKEN` secret (fine-grained PAT with Pages +
   Administration, read and write) if you want the workflow to do it instead.
2. Push to `main` (or run the workflow from the Actions tab with *Run workflow*).

The workflow also passes `enablement: true` to `actions/configure-pages`, which asks GitHub to
enable Pages for the repository if it isn't already.

**Why the source setting is the whole ballgame.** On "Deploy from a branch", GitHub builds the
repository root with Jekyll and serves *that*, ignoring the artifact the workflow uploads. The root
`index.html` is Vite's dev entry — its `<script type="module" src="/src/main.tsx">` 404s on Pages —
so the URL returns a blank page even though every workflow run is green. Symptom check:

```bash
curl -s https://zazieproductions.github.io/interactive-harsh-noise-generator/ | grep -c 'src/main.tsx'
# 1 → the legacy Jekyll build is being served; 0 → the real bundle is live
gh api repos/zazieproductions/interactive-harsh-noise-generator/pages --jq .build_type
# must print "workflow"
```

The deploy job now runs that same check against the live URL and fails the run if the dev entry is
what got served, so a green run means the app is actually up.

**One Pages workflow only.** The GitHub-generated *"Deploy Jekyll with GitHub Pages dependencies
preinstalled"* sample (`.github/workflows/jekyll-gh-pages.yml`) builds the repo root and deploys it
under the same `pages` concurrency group, overwriting the real deployment — it was deleted. If the
Pages UI offers to create it again, decline.

**Why this URL shape matters**

- It is served over **HTTPS**, which is what unlocks the service worker (offline + install),
  the Wake Lock API, the File System Access picker and `navigator.share` with files.
- It is a **project** page under `/interactive-harsh-noise-generator/`, so everything in
  `index.html`, the manifest and `sw.js` uses **relative** URLs (`./`, `start_url: "./"`,
  `scope: "./"`). Fork the repo under a different name and it still deploys to a working subpath.
- The deploy job prints the live URL into the run summary — that is the link to send to a phone.

**Cache-busting**: the HTML is served fresh by Pages (it sets short cache lifetimes on HTML and
immutable-caches hashed assets). Because everything is inlined, there are no hashed asset URLs;
the service worker's `network-first` navigation strategy means an online visit always picks up a
new deploy, and `CACHE_VERSION` in `public/sw.js` should be bumped when the shell changes so old
caches are dropped on activate.

---

## Option 2 — Dev container / Codespaces (private URL, ~1 minute)

[`.devcontainer/devcontainer.json`](../.devcontainer/devcontainer.json):

- image `mcr.microsoft.com/devcontainers/typescript-node:22`
- `postCreateCommand: npm ci`
- port **5173** forwarded, `visibility: public`, `onAutoForward: openPreview`

```text
Code → Codespaces → Create codespace on main → npm run dev → open the forwarded port
```

`vite.config.ts` is already configured for this environment:

- `server.host: true` binds `0.0.0.0` (required for any forwarded port to work),
- `server.allowedHosts` includes `.app.github.dev`, `.githubpreview.dev`, `.e2b.app`,
  `.trycloudflare.com` and `.local` (Vite 6+ rejects unknown `Host` headers — this is the
  difference between "works on my laptop" and "blank error page on my phone"),
- `hmr` switches to `wss` on port 443 when `CODESPACE_NAME` is present.

Same idea if you use VS Code + Dev Containers locally: the container publishes 5173 on the host.

---

## Option 3 — Same Wi-Fi (fastest iteration on a real phone)

```bash
npm run dev
#   ➜  Local:   http://localhost:5173/
#   ➜  Network: http://192.168.1.42:5173/
```

Open the **Network** URL on the phone. Notes:

- The phone and computer must be on the same network, and the computer's firewall must allow
  inbound connections on 5173 (macOS will ask once).
- Over plain HTTP on a LAN IP the browser treats the origin as insecure: **generate, play and
  save all work**, but the service worker, Wake Lock and file picker do not. To test the installed
  experience, use Option 1 or 2, or `npm run preview` behind `--https` with a trusted cert
  (e.g. `mkcert` or `cloudflared tunnel --url http://localhost:5173`).
- `npm run preview` serves the *built* bundle the same way on port 4173.

---

## Option 4 — Any other static host

The build is plain static files, so the configuration is trivial everywhere.

### Netlify

- Build command: `npm run build`
- Publish directory: `dist`

### Vercel

- Framework preset: Vite (or "Other")
- Build command: `npm run build`
- Output directory: `dist`

### Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `dist`

### nginx

```nginx
server {
  listen 443 ssl http2;
  server_name noise.example.dev;
  root /var/www/noise-wall;   # contents of dist/

  # The service worker must never be served stale.
  location = /sw.js {
    add_header Cache-Control "no-cache";
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

### S3 + CloudFront

Upload `dist/` with `--cache-control "public,max-age=300"` for `index.html` and
`no-cache` for `sw.js`. HTTPS is required for the service worker.

### Local file

`dist/index.html` opens over `file://` and everything except the service worker, Wake Lock and
the file picker works (downloads use `Blob` URLs, which are `file://`-safe). The app detects the
protocol and skips service-worker registration.

---

## Generated assets

| Asset | Generator | Deterministic |
|-------|-----------|---------------|
| `public/favicon.svg` | `npm run icons` | yes |
| `public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` | `npm run icons` | yes |
| `docs/assets/launch-qr.svg` | `npm run qr` | yes |

`NOISE_WALL_URL=https://your-host/ npm run qr` regenerates the QR code for a different host —
for example after pointing the Pages workflow at a custom domain.

---

## HTTPS and the APIs that depend on it

| API | Requires | Consequence if unavailable |
|-----|----------|----------------------------|
| Service worker (offline, install) | HTTPS or `localhost` | No home-screen install, no offline shell |
| Screen Wake Lock | HTTPS, user-visible tab | Screen may sleep during a long render |
| File System Access (`showSaveFilePicker`) | HTTPS + Chromium | Falls back to a Blob download |
| `navigator.share` with files | HTTPS + OS support | Falls back to a Blob download |
| `navigator.clipboard` | HTTPS (or a user gesture) | Falls back to a hidden-textarea copy |

Everything degrades to "generate, play, download", so an insecure deployment is still a fully
working instrument.

---

## Content Security Policy

If you serve NOISE WALL behind a CSP, the minimum that keeps everything working:

```text
default-src 'self';
script-src 'self' 'unsafe-inline';   /* the inlined bundle */
style-src 'self' 'unsafe-inline';    /* Tailwind's inlined <style> */
img-src 'self' data:;                /* icons, QR, generated blobs */
media-src 'self' blob:;              /* Blob URLs handed to <a download> / share */
worker-src 'self';                   /* sw.js */
connect-src 'self';                  /* dev-mode HMR only; nothing at runtime */
```

`unsafe-inline` is required because the single-file build inlines its script and stylesheet. If
that is unacceptable, build without `vite-plugin-singlefile` and use hashed external assets plus
`script-src 'self'`.

---

## Rollback

Pages keeps the previous deployment in the run history. Either re-run an older successful
`deploy-pages` workflow run, or `git revert` the offending commit on `main` — the workflow
redeploys automatically.

---

## Pre-flight checklist

- [ ] `npm run check` passes (typecheck + engine verification + UI smoke test)
- [ ] `npm run build` succeeds and `dist/` contains the icons, manifest and `sw.js`
- [ ] `npm run preview` serves the built bundle and the console shows the service worker
      registering
- [ ] Loaded over HTTPS on a phone: waveform scrubs, Play streams, Save writes a file
- [ ] Add to Home Screen works and the installed app launches without browser chrome
- [ ] Airplane mode still opens the installed app (offline shell)
