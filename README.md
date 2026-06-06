# Singapore Condo Property Explorer

A mobile-first progressive web app (PWA) for exploring Singapore private residential condo transactions. Pan and zoom an interactive Leaflet map to see project markers colour-coded by median price-per-square-foot (PSF); tap any marker to view its full transaction history in a sortable, filterable table. Data is sourced from the URA Data Service API via a lightweight Google Apps Script proxy (no server required), cached in IndexedDB for 48-hour offline use, and the app shell is cached by a hand-written service worker so the app loads instantly — even in airplane mode. See [PLAN.md](./PLAN.md) for the full architecture and design rationale.

---

## Prerequisites

- A Google account (for the GAS proxy)
- A URA Data Service API key — register at <https://eservice.ura.gov.sg/> (website field: your GitHub profile URL)
- Python 3 (for local static serving)
- A modern browser (Chrome/Firefox/Safari) or Android device for PWA install

---

## Deploy the GAS proxy

1. Open [Google Apps Script](https://script.google.com) and create a new project.
2. Paste the contents of `apps-script/Code.gs` into the editor.
3. Go to **Project Settings → Script Properties** and add:
   - Key: `ACCESS_KEY` — Value: your URA API access key
4. Deploy as a **Web App**:
   - **Execute as:** Me
   - **Who has access:** Anyone
5. Copy the `/exec` URL provided after deployment.
6. In `src/lib/uraClient.js`, paste that URL into the `PROXY_URL` constant and set `USE_MOCK` to `false`.

Verify by opening `<your-exec-url>?batch=1` in a browser — you should see valid URA JSON.

---

## Run locally (mock data, no proxy needed)

```bash
cd /path/to/finance
python3 -m http.server 8080
```

Open <http://localhost:8080> in your browser. With `USE_MOCK = true` (the default) in `src/lib/uraClient.js`, the app uses bundled mock data — no proxy or URA key required.

---

## Deploy to GitHub Pages

1. Push the repository to GitHub.
2. Go to **Settings → Pages**, set **Source** to `main` branch, root folder `/`.
3. GitHub Pages will serve the app at `https://<username>.github.io/<repo>/`.
4. Make sure `PROXY_URL` in `src/lib/uraClient.js` points to your GAS `/exec` URL and `USE_MOCK` is `false`.

---

## PWA install and offline use

### Install on Android

1. Open the app in Chrome on Android.
2. Tap the browser menu → **Add to Home screen**.
3. The app installs as a standalone PWA (no browser chrome).

### Offline behaviour

- After the first full load, the app shell (HTML, JS, CSS, icons, MRT GeoJSON) is cached by the service worker.
- Map tiles are cached on first view (up to ~500 tiles); previously viewed areas work offline.
- Transaction data is stored in IndexedDB with a 48-hour TTL. If the device is offline or data is stale, the app boots from cache and shows a "data as of \<date\>" banner.
- CDN modules (Leaflet, proj4, markercluster) are cached opportunistically on first fetch, so the app works fully offline after one complete online session.

---

## Architecture reference

See [PLAN.md](./PLAN.md) for the full architecture, data flow, phased build plan, and key risk notes.
