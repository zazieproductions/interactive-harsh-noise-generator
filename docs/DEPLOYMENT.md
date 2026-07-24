# Deployment

NOISE WALL's production build is a **single self-contained HTML file** at `dist/index.html`.
This document explains how to build it, where you can host it, and what to watch out for.

---

## Building

```bash
npm install
npm run build
# → dist/index.html
```

The file is entirely static: all JavaScript, CSS, and the Tailwind reset are inlined by
`vite-plugin-singlefile`. There are no external runtime fetches, no CDN assets, no analytics,
no fonts — opening it locally or serving it from any static host Just Works.

### Verifying the build

```bash
ls -la dist/index.html
# Open it directly in a browser:
#   macOS:   open dist/index.html
#   Linux:   xdg-open dist/index.html
#   Windows: start dist/index.html
npm run preview   # serves dist/ on http://localhost:4173
```

---

## Target Hosts

The single-file output works on virtually any static host. Pick whichever matches your workflow.

### GitHub Pages

1. Run `npm run build`.
2. Publish `dist/index.html` to the `gh-pages` branch, or configure Pages to serve from a
   `/docs` folder on `main` by copying `dist/index.html` to `docs/index.html`.
3. In **Settings → Pages**, set the source to the chosen branch/folder.
4. (Optional) Add a GitHub Actions workflow that builds and publishes on every tag:

```yaml
# .github/workflows/deploy.yml
name: Deploy to Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

### Netlify

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- No `_redirects` file is required (the app is client-side-rendered with one route).

### Vercel

- **Framework preset:** Vite
- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Install command:** `npm install`

### Cloudflare Pages

- **Build command:** `npm run build`
- **Build output directory:** `dist`
- Node.js version: set `NODE_VERSION=22` in Pages settings to avoid the default (which can lag
  behind Vite's requirements).

### S3 + CloudFront / R2 + Custom CDN

1. Build → `dist/index.html`.
2. Upload `dist/index.html` to your bucket with `ContentType: text/html; charset=utf-8` and
   `Cache-Control: public, max-age=0, must-revalidate` (or content-addressed cache if you
   add a hash in the filename).
3. Point your CDN distribution at the bucket. No special routing rules needed.

### Generic static server (nginx / Caddy / Apache)

Any server that can serve a static file will do. Example nginx snippet:

```nginx
server {
  listen 443 ssl http2;
  server_name noise.example.com;
  root /var/www/noise;
  index index.html;
  location / {
    try_files $uri $uri/ /index.html;
  }
  # Strong caching is fine; there are no other assets to cache beyond index.html.
  location = /index.html {
    add_header Cache-Control "no-cache";
  }
}
```

### Docker / container

A full web server is overkill for a single file, but if you need one:

```dockerfile
FROM nginx:alpine
COPY dist/index.html /usr/share/nginx/html/index.html
EXPOSE 80
```

Or, for an even smaller image, serve via `busybox httpd` or `python3 -m http.server`.

### Local filesystem (USB, email, `file://`)

Copy `dist/index.html` anywhere and double-click it. All browsers can resolve `blob:` URLs
needed for downloads from a `file://` origin, so WAV/MP3 export works even offline with no
server at all.

---

## Content Security Policy

The app is CSP-friendly for a strict static site. Recommended policy:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';        # Tailwind atomic styles are inlined
  img-src 'self' blob: data:;
  media-src 'self' blob:;
  connect-src 'self';                      # no outbound requests
  object-src 'none';
  base-uri 'self';
  frame-ancestors 'none';
```

Notes:

- **`'unsafe-inline'` for styles** is required because `vite-plugin-singlefile` inlines the
  Tailwind-generated stylesheet into a `<style>` tag. This is safe in a script-locked CSP
  because there is no HTML injection sink in the app.
- **`blob:`** is required for WAV/MP3 download (`URL.createObjectURL`).
- **No `script-src-elem` with hashes** is needed; the script is inlined as a classic script and
  a nonce/hash approach is overkill for a single-file deliverable with no dynamic script loading.

---

## Headers

Recommended security headers when serving:

| Header | Value |
|--------|-------|
| `Content-Type` | `text/html; charset=utf-8` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` |
| `X-Frame-Options` | `DENY` (or `frame-ancestors 'none'` in CSP) |
| `Cache-Control` | `no-cache` for `index.html` |

---

## Cache-Busting and Versioning

Because the output is a single file, traditional per-asset content-hash cache busting doesn't
apply. Two strategies work:

1. **Serve `index.html` with `Cache-Control: no-cache`** and rely on the browser revalidating
   with `ETag`/`Last-Modified` on each load. Simple and sufficient for small static sites.
2. **Version the filename** (e.g., `noise-wall-1.0.0.html`) and upload a fresh file for each
   release while keeping a `latest.html` symlink/rewrite. Useful if you host behind an
   aggressive CDN.

For GitHub Pages / Netlify / Vercel, option 1 is the default behavior and requires no work.

---

## Offline / PWA

The single-file build already works offline if the user has loaded the page once and their
browser serves it from cache. A service worker for full PWA/installable behavior is planned
(see [ROADMAP.md](../ROADMAP.md)) but is not part of v1.0.0.

---

## What Is *Not* Supported

- **Server-side rendering (SSR)** — there is no content that needs SSR. The app is a single
  canvas-based tool; SSR would produce no meaningful HTML and would add bundle weight.
- **Edge runtime execution** — same reason; this is a client-only interactive app.
- **Embedding via `<iframe>` on third-party sites** — recommended against (hence
  `X-Frame-Options: DENY`), but if you need it, relax the CSP/frame-ancestors and be aware
  that Web Audio can be blocked by third-party cookie/autoplay policies inside cross-origin
  frames.

---

## Testing a Deployment

After deploying, verify:

1. The page loads over HTTPS with no mixed-content warnings.
2. Clicking **Generate** produces a waveform within a few seconds.
3. **Play Preview** plays audio (you may need to click the button a second time if the browser's
   autoplay policy suspends the AudioContext; the code handles `ctx.resume()` on click, so this
   should work — if it doesn't, file a bug with the browser/version).
4. **Download WAV** produces a valid `.wav` file of the correct length (verify with `sox --i` or
   `ffprobe`).
5. **Download MP3** produces a valid `.mp3` file at the selected bitrate.
6. Seeds reproduce identical output (generate twice with the same seed; the waveform should look
   identical byte-for-byte; the downloaded WAV should diff clean).
7. The UI is usable on mobile widths (the control grid collapses to a single column).
8. (A11y check) Tab through the UI with a keyboard and confirm every control is reachable.

---

## Performance in Production

- **Cold load:** expect a single ~350 KB gzipped download, parsed and executed in well under a
  second on modern devices.
- **Runtime memory:** grows with generated wall size; 10-minute walls peak around ~400 MB on the
  JS heap (see [PERFORMANCE.md](./PERFORMANCE.md)).
- **No runtime network:** once the HTML loads, DevTools Network tab should show zero further
  requests until/unless the user clicks a download link (which creates a `blob:` URL, not a
  network request).

If you see unexpected outbound requests in production, it means something in the build or
hosting environment is injecting them (e.g., host-provided analytics). A stock
`npm run build` emits a self-contained file with zero fetches.
