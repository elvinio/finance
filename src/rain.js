/**
 * rain.js — Rain tab: fetches Singapore rainfall data from data.gov.sg
 * and renders station circles on a Leaflet map.
 */

import L from "leaflet";

const RAIN_API = "https://api.data.gov.sg/v1/environment/rainfall";
const DEFAULT_HOURS = 1;
const REFRESH_MS = 5 * 60 * 1000; // 5 minutes

let _map = null;
let _markerLayer = null;
let _currentHours = DEFAULT_HOURS;
let _refreshTimer = null;

function rainColor(mm) {
  if (mm <= 0)   return "#adb5bd";
  if (mm < 0.5)  return "#74c0fc";
  if (mm < 2)    return "#339af0";
  if (mm < 5)    return "#1971c2";
  if (mm < 10)   return "#0c8599";
  if (mm < 30)   return "#2f9e44";
  if (mm < 60)   return "#e67700";
  return "#c92a2a";
}

function toDateStr(d) {
  // Returns YYYY-MM-DD in local time (Singapore is UTC+8; use ISO slice as close enough
  // since data.gov.sg accepts UTC date strings)
  return d.toISOString().slice(0, 10);
}

async function fetchDay(dateStr) {
  const resp = await fetch(`${RAIN_API}?date=${dateStr}`);
  if (!resp.ok) throw new Error(`Rainfall API ${resp.status}`);
  return resp.json();
}

async function loadRainfall(hours) {
  const now = new Date();
  const cutoff = new Date(now - hours * 3600 * 1000);

  const dates = new Set();
  for (let d = new Date(cutoff); d <= now; d.setDate(d.getDate() + 1)) {
    dates.add(toDateStr(new Date(d)));
  }
  dates.add(toDateStr(now));

  const results = await Promise.all([...dates].map(fetchDay));

  const stations = {};
  const totals = {};

  for (const result of results) {
    for (const s of (result.metadata?.stations ?? [])) {
      stations[s.id] = s;
    }
    for (const item of (result.items ?? [])) {
      const ts = new Date(item.timestamp);
      if (ts < cutoff || ts > now) continue;
      for (const r of (item.readings ?? [])) {
        totals[r.station_id] = (totals[r.station_id] ?? 0) + (r.value ?? 0);
      }
    }
  }

  return { stations, totals };
}

function renderMarkers(stations, totals) {
  _markerLayer.clearLayers();

  for (const [id, station] of Object.entries(stations)) {
    const mm = totals[id] ?? 0;
    const { latitude: lat, longitude: lng } = station.location;

    const marker = L.circleMarker([lat, lng], {
      radius: 10,
      fillColor: rainColor(mm),
      color: "#fff",
      weight: 1.5,
      fillOpacity: 0.88,
    });

    marker.bindPopup(`<strong>${station.name}</strong><br>${mm.toFixed(1)} mm`);
    _markerLayer.addLayer(marker);
  }
}

async function refresh() {
  const statusEl = document.getElementById("rain-status");
  if (statusEl) statusEl.textContent = "Loading…";

  try {
    const { stations, totals } = await loadRainfall(_currentHours);
    renderMarkers(stations, totals);
    const t = new Date().toLocaleTimeString("en-SG", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
    if (statusEl) statusEl.textContent = `Updated ${t}`;
  } catch (err) {
    if (statusEl) statusEl.textContent = "Error loading data";
    console.error("[rain]", err);
  }
}

export function initRainTab() {
  _map = L.map("rain-map", {
    center: [1.3521, 103.8198],
    zoom: 11,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(_map);

  _markerLayer = L.layerGroup().addTo(_map);

  document.querySelectorAll(".rain-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".rain-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      _currentHours = Number(pill.dataset.hours);
      refresh();
    });
  });

  refresh();
  _refreshTimer = setInterval(refresh, REFRESH_MS);
}

export function invalidateRainMap() {
  if (_map) _map.invalidateSize();
}
