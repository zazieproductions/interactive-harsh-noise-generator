/*
 * NOISE WALL service worker.
 *
 * The app is a single self-contained HTML file, so "offline support" is really
 * just "keep a copy of one document around". Strategy:
 *
 *   - navigations  → network first (always pick up a new build when online),
 *                    falling back to the cached shell when offline;
 *   - icons/manifest → cache first, refreshed in the background.
 *
 * Bump CACHE_VERSION whenever the shell changes so clients drop stale copies.
 */

const CACHE_VERSION = 'noise-wall-v1.2.0';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function cacheable(response) {
  return response && response.ok && response.type === 'basic';
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (cacheable(response)) void cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = (await cache.match(request)) || (await cache.match('./index.html')) || (await cache.match('./'));
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) {
    // Refresh in the background; never block the response on the network.
    fetch(request)
      .then((response) => {
        if (cacheable(response)) void cache.put(request, response);
      })
      .catch(() => {});
    return cached;
  }
  const response = await fetch(request);
  if (cacheable(response)) void cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});
