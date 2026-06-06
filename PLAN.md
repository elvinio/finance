# Plan: Singapore Condo Property Explorer PWA

## Context

A solo personal, mobile-first PWA to explore Singapore private residential
(condo) transactions on a Leaflet map: pan/zoom → see project markers
colour-coded by median PSF → tap a project → view its transactions in a
sortable, filterable table → optionally see nearby MRT/walking distance.

**The decisive architectural finding (the CORS blocker you flagged):** a
pure client-side fetch to the URA Data Service API **will not work**.
1. The token request needs a custom `AccessKey` request header → forces a
   CORS preflight → URA sends no `Access-Control-Allow-Origin` → blocked.
2. Even if it weren't, the `AccessKey` would be exposed in browser JS.
3. URA's API also rejects requests lacking a browser-like `User-Agent`.

Every existing open-source URA project ([Caisho/ura-transactions](https://github.com/Caisho/ura-transactions),
[jamieqianhui/URA_API_GETrequest](https://github.com/jamieqianhui/URA_API_GETrequest))
fetches server-side for exactly these reasons.

**Decisions made with you:**
- **Data access:** thin **Google Apps Script (GAS) web-app proxy** — holds
  the AccessKey, manages the daily token, forwards batch requests. Free,
  no Cloudflare/GitHub-Action secrets, leverages your Google API experience.
- **Frontend:** **Vanilla JS, no build step** — plain ES modules with an
  **import-map** pulling Leaflet, Leaflet.markercluster, and proj4 from a
  CDN (esm.sh / jsDelivr). Commit static files, no bundler/toolchain.
- **Hosting:** **GitHub Pages** (static). GAS proxy lives at its own origin;
  it serves CORS-friendly GET responses, so cross-origin works fine.

This is still "static hosting + no server you operate" in spirit — GAS is a
managed, free, zero-maintenance function.

---

## Architecture overview

```
Browser PWA (GitHub Pages, vanilla JS + Leaflet)
  │  fetch GET  ?batch=1..4
  ▼
Google Apps Script Web App  (the proxy)
  • AccessKey in Script Properties (never in browser)
  • daily token: cached in Script Properties w/ date stamp, refetched on new day
  • UrlFetchApp GET to URA with AccessKey + Token + browser User-Agent
  • returns raw URA JSON via ContentService (CORS-OK for GET)
  ▼
URA Data Service API (PMI_Resi_Transaction, batches 1–4)

Browser then:
  • converts SVY21 x/y → WGS84 (proj4, once per project)
  • stores all 4 batches in IndexedDB (48h TTL)
  • renders markers (clustered, PSF-coloured) + on-tap transaction table
  • caches app shell + tiles via service worker (offline)
```

---

## 1. Architecture validation (answers to your Section 1)

- **CORS:** Not compatible with direct browser fetch — confirmed above.
  The GAS proxy resolves it: GAS's outbound `UrlFetchApp` has no CORS, and
  its published web-app responses are reachable cross-origin via **GET**.
  ⚠️ **Design constraint:** call the proxy with `fetch(url)` GET only. A
  JSON `POST` triggers a preflight GAS can't answer. Pass `batch`/`service`
  as query params. (GAS returns a 302 to `googleusercontent.com`; `fetch`
  follows it transparently — fine for GET.)
- **Daily token flow:** moved **into the proxy**, not the browser. GAS
  stores `{token, tokenDate}` in `PropertiesService`; on each request, if
  `tokenDate !== today (SGT)`, it re-fetches from
  `https://eservice.ura.gov.sg/uraDataService/insertNewToken/v1` with header
  `AccessKey`. The browser never sees a token. (This also fixes your
  "offline / midnight expiry" concerns — there's no client token to expire.)
- **Storage sizing:** ~5yr private resi ≈ **100–150k transactions across
  ~2–3k projects ≈ 30–40 MB raw JSON / ~4–6 MB gzipped**. This **exceeds
  the ~5 MB localStorage cap → use IndexedDB.** Keep only token date / small
  flags in localStorage. Tiles & app shell go in the service-worker Cache API.

---

## 2. SVY21 → WGS84 conversion

Use **`proj4`** (CDN ES module, e.g. `https://esm.sh/proj4`) with EPSG:3414.
URA's `x` = Easting, `y` = Northing.

```js
import proj4 from "proj4"; // resolved via the import-map in index.html
proj4.defs("EPSG:3414",
  "+proj=tmerc +lat_0=1.366666666666667 +lon_0=103.8333333333333 " +
  "+k=1 +x_0=28001.642 +y_0=38744.572 +ellps=WGS84 +units=m +no_defs");

// returns [lng, lat] — Leaflet wants [lat, lng]
export function svy21ToLatLng(x, y) {
  const [lng, lat] = proj4("EPSG:3414", "WGS84", [Number(x), Number(y)]);
  return [lat, lng];
}
```

Works across **all 4 batches** — SVY21/EPSG:3414 is the national grid
covering all of Singapore (districts 01–28). Validate in Phase 1 by
spot-checking a known project against Google Maps (expect <1–2 m error).

---

## 3. Data loading strategy

- **Fetch all 4 batches on first open** (it's all of Singapore, ~4–6 MB
  gzipped, one-time). Lazy-by-viewport adds complexity for little gain since
  the full set fits in IndexedDB and enables instant offline pan/zoom.
- **Loading UX:** 4 parallel `fetch` calls to the proxy → a top progress
  bar "Loading 2/4 districts…". **Render incrementally**: as each batch
  resolves, convert coords and drop its markers onto the map immediately
  (cluster updates progressively) rather than waiting for all 4.
- **Persistence:** after all batches land, write `{fetchedAt, batches}` to
  IndexedDB. On next open within **48h TTL**, hydrate from IndexedDB first
  (instant), then optionally refresh in the background.

---

## 4. Project marker rendering

- **Dedupe to one marker/project:** group transactions by project (key =
  `project` name; coords from the project's `x/y`). The URA response is
  already grouped by project, so this is mostly direct.
- **Median PSF per project:** PSF is conventionally **per sqft** in SG.
  `sqft = area_sqm * 10.7639`; `psf = price / sqft`. Compute PSF for each
  transaction in the project, take the **median** (robust to outliers).
- **MarkerCluster config** (Leaflet.markercluster):
  `chunkedLoading: true` (essential for ~2–3k markers), `maxClusterRadius:
  60`, `disableClusteringAtZoom: 16`, `spiderfyOnMaxZoom: true`,
  `removeOutsideVisibleBounds: true`.
- **PSF colour scale** (green→yellow→red, SG condo context, per sqft):
  `<1000` green · `1000–1500` lime · `1500–2000` yellow · `2000–2500`
  orange · `2500+` red. Fixed buckets (not quantiles) so colour meaning is
  stable across filter changes. Use `circleMarker` (cheap, colourable).

---

## 5. Transaction table design

- **All data in memory** → no backend query. On `map.moveend` (debounced
  ~150ms) compute visible projects via `map.getBounds().contains(latlng)`.
- **Filtering** = chained predicates over the in-memory array: market
  segment ∈ selected, propertyType ∈ selected, typeOfSale ∈ selected,
  `contractDate` within range, `psf` within min/max. Apply the same
  predicates to both the marker layer and the table.
- **contractDate** is `MMYY` → parse to a real Date (`20YY`) once at load
  for sorting/filtering.
- **Table trigger:** tap marker → filter that project's transactions by the
  active filters → render below the map.
- **Sort default:** **most recent first** (contractDate desc). Sortable
  headers for date, price, PSF.

---

## 6. URA daily token management

**Handled entirely in the GAS proxy** (browser is token-free):
```js
function getToken() {
  const props = PropertiesService.getScriptProperties();
  const today = Utilities.formatDate(new Date(), "Asia/Singapore", "yyyy-MM-dd");
  if (props.getProperty("tokenDate") === today) return props.getProperty("token");
  const res = UrlFetchApp.fetch(
    "https://eservice.ura.gov.sg/uraDataService/insertNewToken/v1",
    { headers: { AccessKey: props.getProperty("ACCESS_KEY"),
                 "User-Agent": "Mozilla/5.0" } });
  const token = JSON.parse(res).Result;
  props.setProperty("token", token); props.setProperty("tokenDate", today);
  return token;
}
```
- **Transparent refresh / retry:** if a batch fetch returns an
  auth/expiry error, clear `tokenDate`, re-`getToken()`, retry once.
- **Offline app open:** browser detects fetch failure → **falls back to
  IndexedDB cached data** and shows a "data as of <fetchedAt>" banner. No
  token logic client-side, so offline is simply "use cache, skip network".

---

## 7. PWA setup

- **Manifest** (hand-written `manifest.webmanifest`): `name`, `short_name`,
  `start_url: "."`, `display: "standalone"`, `theme_color`,
  `background_color`, `orientation: "portrait"`, icons **192×192 + 512×512**
  (+ maskable). Linked from `index.html`. Enables Android "Add to Home
  screen".
- **Service worker (`sw.js`, hand-written — no Workbox):**
  - **Precache** app shell on `install`: `index.html`, all `src/*.js`, CSS,
    bundled static GeoJSON (MRT, planning areas), and the **pinned CDN module
    URLs** from the import-map (so Leaflet/proj4 work offline). Use a single
    `CACHE_VERSION` const; bump it to invalidate on app update; delete old
    caches on `activate`.
  - **`fetch` handler:** cache-first for the precached shell + CDN modules;
    **cache-first w/ size cap** for OneMap tiles (evict oldest past ~500).
  - Data already lives in IndexedDB, so the SW need not cache proxy
    responses (avoids double-caching/staleness).
  - Register with `navigator.serviceWorker.register('./sw.js')` from
    `main.js`.
- **Offline behaviour:** app shell from cache → app boots offline; data
  from IndexedDB (with staleness banner if >48h); tiles only for
  previously-viewed areas; graceful "offline, showing cached data" notice
  if IndexedDB is empty.

---

## 8. Phased build plan

- **Phase 0 — Accounts + proxy (foundation).**
  Register URA Data Service (website field = your GitHub profile URL) and
  data.gov.sg. Write & deploy the GAS web app ("Execute as me", "Anyone");
  store `ACCESS_KEY` in Script Properties; verify it returns batch 1 JSON
  via browser GET. *Critical: validates the whole CORS/token approach first.*
- **Phase 1 — Data shape + coords.** `svy21ToLatLng` util; fetch one batch
  through the proxy; log structure; spot-check 2–3 projects' coords vs Google
  Maps; confirm PSF math.
- **Phase 2 — Map + markers.** `index.html` with import-map (Leaflet +
  markercluster + proj4 from CDN); Leaflet + OneMap tiles; plot
  one batch's projects (no clustering). ⚠️ **Validate OneMap raster tiles
  load without an auth header** (risk — see below); fallback CARTO/OSM tiles.
- **Phase 3 — Cluster + colour + full data.** MarkerCluster (chunked); PSF
  colour buckets; load all 4 batches with progress UI; persist to IndexedDB
  w/ 48h TTL.
- **Phase 4 — Table + filters.** Tap marker → transaction table; collapsible
  filter bar; sortable columns; viewport bbox filtering on `moveend`.
- **Phase 5 — PWA.** Hand-written `manifest.webmanifest` + `sw.js`; tile
  caching; offline + staleness banner; install on Android & test offline.
- **Phase 6 — MRT + routing.** Bundle MRT GeoJSON as a toggle overlay;
  "Show nearby MRT" → OneMap Routing (token-required) **via the same GAS
  proxy** (add a `route` action; keeps OneMap creds server-side too).

---

## 9. Estimated effort (solo)

| Phase | Scope | Est. |
|---|---|---|
| 0 | Accounts + GAS proxy + token flow | 3–5 h |
| 1 | SVY21 util + data validation | 2–3 h |
| 2 | index.html/import-map + Leaflet + tiles + markers | 4–6 h |
| 3 | Cluster + colour + 4 batches + IndexedDB | 5–7 h |
| 4 | Table + filters + sort + viewport | 8–12 h |
| 5 | PWA manifest + SW + offline | 4–6 h |
| 6 | MRT overlay + routing | 4–6 h |
| | **Total** | **~30–45 h** |

---

## Key risks to validate early

1. **OneMap tile auth** — the `…/maps/tiles/Default/{z}/{x}/{y}.png` raster
   tiles may now require a token (incompatible with Leaflet `<img>` tile
   loading, which can't send headers). **Test in Phase 2**; fallback to
   CARTO Positron / OSM tiles if so.
2. **GAS response size / quota** — each batch is large; UrlFetchApp caps
   responses at 50 MB and consumer accounts allow 20k fetches/day — both
   comfortably fine for personal use, but confirm a full batch returns in
   Phase 0.
3. **GAS GET-only constraint** — never switch the proxy to JSON POST
   (preflight breaks). Keep all params in the query string.

## Critical files (to be created, greenfield repo)

- `apps-script/Code.gs` — proxy: `doGet(e)`, `getToken()`, `fetchBatch()`
  (kept in repo for version control; deployed via GAS editor / clasp).
- `src/lib/svy21.js` — coordinate util (reused everywhere markers are made).
- `src/lib/uraClient.js` — calls proxy, parses, caches to IndexedDB (TTL).
- `src/lib/transactions.js` — PSF/median, date parsing, filter predicates.
- `src/map.js` — Leaflet + MarkerCluster + colour scale.
- `src/table.js` — transaction table render + sort.
- `index.html` — import-map (CDN modules) + manifest link + SW registration.
- `src/main.js` — app entry / wiring.
- `sw.js` (root, for correct scope) — hand-written service worker.
- `manifest.webmanifest`, `icons/*` (192/512 + maskable),
  bundled `geo/mrt.geojson`.

## Verification

- **Phase 0:** open the proxy URL with `?batch=1` in a browser → valid URA
  JSON; check Script Properties shows a token dated today.
- **Coords:** log 3 projects' lat/lng → match Google Maps within metres.
- **End-to-end (Phase 4):** serve statically (`python3 -m http.server`),
  pan map → markers cluster &
  recolour; tap a project → table shows its transactions, most-recent first;
  toggle filters → markers + table update together.
- **PWA (Phase 5):** Lighthouse PWA audit passes; install on Android; enable
  airplane mode → app boots from cache, shows cached data + staleness banner.
