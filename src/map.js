/**
 * Map module: Leaflet map initialisation, marker cluster, project rendering.
 */
import L from "leaflet";
import "leaflet.markercluster";
import { psfColor } from "./lib/transactions.js";

/** Registered tap callback, called with a project object when a marker is clicked. */
let _tapCallback = null;

/**
 * Initialise the Leaflet map inside the given element ID.
 * Uses CARTO Positron tiles as the default (reliable, no auth required).
 * @param {string} elementId - ID of the DOM element to mount the map into
 * @returns {L.Map}
 */
export function initMap(elementId) {
  const map = L.map(elementId, {
    center: [1.3521, 103.8198],
    zoom: 12,
    zoomControl: true,
  });

  // CARTO Positron — no API key required, reliable default.
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; ' +
        '<a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
    }
  ).addTo(map);

  // OneMap alternative (may require auth token — test before enabling):
  // L.tileLayer(
  //   "https://maps-{s}.onemap.sg/v3/Default/{z}/{x}/{y}.png",
  //   { subdomains: ["a","b","c"], maxZoom: 19,
  //     attribution: "…OneMap attribution…" }
  // ).addTo(map);

  return map;
}

/**
 * Create a Leaflet.MarkerClusterGroup configured for ~2–3k project markers.
 * @returns {L.MarkerClusterGroup}
 */
export function createClusterGroup() {
  return L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 60,
    disableClusteringAtZoom: 16,
    spiderfyOnMaxZoom: true,
    removeOutsideVisibleBounds: true,
  });
}

/**
 * Render all projects onto the map as PSF-coloured circle markers, clustered.
 * Clears the cluster group first (safe to call on filter updates).
 *
 * @param {L.Map} map - the Leaflet map instance (unused directly but kept for API consistency)
 * @param {L.MarkerClusterGroup} clusterGroup - the cluster group to populate
 * @param {object[]} projects - normalised Project[]
 */
export function renderProjects(map, clusterGroup, projects) {
  clusterGroup.clearLayers();

  for (const project of projects) {
    if (project.lat == null || project.lng == null) continue;

    const marker = L.circleMarker([project.lat, project.lng], {
      radius: 8,
      fillColor: psfColor(project.medianPsf),
      color: "#ffffff",
      weight: 1.5,
      opacity: 0.9,
      fillOpacity: 0.85,
    });

    marker.bindTooltip(
      `<strong>${project.name}</strong><br>` +
        `${project.street}<br>` +
        `Median PSF: $${Math.round(project.medianPsf).toLocaleString()}`,
      { sticky: true }
    );

    marker.on("click", () => {
      if (_tapCallback) _tapCallback(project);
    });

    clusterGroup.addLayer(marker);
  }
}

/**
 * Register a callback to be invoked whenever a project marker is tapped/clicked.
 * @param {(project: object) => void} cb
 */
export function onProjectTap(cb) {
  _tapCallback = cb;
}
