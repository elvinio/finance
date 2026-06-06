// Service Worker for Singapore Condo Explorer
// Hand-written — no Workbox dependency.
//
// CDN module URLs (proj4/Leaflet/markercluster from esm.sh/jsDelivr) are NOT
// listed in APP_SHELL but get cached opportunistically on first fetch via the
// cache-first network fallback, so the app works fully offline after the
// initial load when all CDN assets have been fetched at least once.

const CACHE_VERSION = "sgcondo-v1";
const TILE_CACHE = "sgcondo-tiles-v1";
const TILE_CAP = 500; // max tile entries before evicting oldest

// App shell: local paths to precache on install
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./src/main.js",
  "./src/map.js",
  "./src/table.js",
  "./src/lib/svy21.js",
  "./src/lib/transactions.js",
  "./src/lib/uraClient.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./geo/mrt.geojson",
];

// ── Install: precache app shell ───────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: purge stale caches ─────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_VERSION && k !== TILE_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return true for map raster tile requests. */
function isTileRequest(url) {
  return (
    url.hostname.includes("basemaps.cartocdn.com") ||
    url.hostname.includes("onemap") ||
    // Common OSM tile CDNs used as fallbacks
    url.hostname.includes("tile.openstreetmap.org")
  );
}

/** Return true for the GAS proxy (never cache — data lives in IndexedDB). */
function isProxyRequest(url) {
  return url.hostname.includes("script.google.com");
}

/** Return true for navigation requests or same-origin shell assets. */
function isShellRequest(request, url) {
  if (request.mode === "navigate") return true;
  if (url.origin === self.location.origin) return true;
  return false;
}

/**
 * Cache-first strategy: try cache, fall back to network and store response.
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.status === 200) {
    cache.put(request, response.clone());
  }
  return response;
}

/**
 * Cache-first for tiles with a size cap.
 * When the tile cache exceeds TILE_CAP entries, oldest keys are evicted.
 */
async function tilesCacheFirst(request) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (!response || response.status !== 200) return response;

  // Evict oldest entries if we're at the cap
  const keys = await cache.keys();
  if (keys.length >= TILE_CAP) {
    const toDelete = keys.slice(0, keys.length - TILE_CAP + 1);
    await Promise.all(toDelete.map((k) => cache.delete(k)));
  }

  cache.put(request, response.clone());
  return response;
}

// ── Fetch handler ─────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. GAS proxy responses: pass through, never cache
  if (isProxyRequest(url)) {
    return; // let browser handle normally
  }

  // 2. Map raster tiles: cache-first with size cap
  if (isTileRequest(url)) {
    event.respondWith(tilesCacheFirst(event.request));
    return;
  }

  // 3. App shell (navigation, same-origin) and CDN modules/CSS:
  //    cache-first, fall back to network and cache the response
  if (isShellRequest(event.request, url) || event.request.destination === "script" || event.request.destination === "style") {
    event.respondWith(cacheFirst(event.request, CACHE_VERSION));
    return;
  }

  // 4. All other cross-origin requests (CDN fonts, etc.): cache-first
  event.respondWith(cacheFirst(event.request, CACHE_VERSION));
});
