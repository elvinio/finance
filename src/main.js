/**
 * main.js — App entry point.
 * Wires together: service worker, map, cluster, filters, data loading, table.
 */

import { initMap, createClusterGroup, renderProjects, onProjectTap } from "./map.js";
import { renderTable } from "./table.js";
import { loadAllProjects } from "./lib/uraClient.js";
import { makeFilterPredicate } from "./lib/transactions.js";

// ---------------------------------------------------------------------------
// Service Worker registration
// ---------------------------------------------------------------------------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch((err) => {
    console.warn("Service worker registration failed:", err);
  });
}

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const progressBar    = document.getElementById("progress");
const progressFill   = document.getElementById("progress-fill");
const progressLabel  = document.getElementById("progress-label");
const bannerEl       = document.getElementById("banner");
const filtersEl      = document.getElementById("filters");
const filtersToggle  = document.getElementById("filters-toggle");
const filtersBody    = document.getElementById("filters-body");
const tableEl        = document.getElementById("table");

// ---------------------------------------------------------------------------
// Map + cluster setup
// ---------------------------------------------------------------------------
const map          = initMap("map");
const clusterGroup = createClusterGroup();
clusterGroup.addTo(map);

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------
let _allProjects      = [];  // full dataset
let _currentProject   = null; // last tapped project

/** Current filter values. */
const _filters = {
  marketSegments: new Set(), // project-level
  propertyTypes:  new Set(),
  typesOfSale:    new Set(),
  dateFrom: null,
  dateTo:   null,
  psfMin:   null,
  psfMax:   null,
};

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

/**
 * Return projects that pass the marketSegment filter.
 * Empty Set = no constraint.
 */
function applyProjectFilter(projects) {
  if (_filters.marketSegments.size === 0) return projects;
  return projects.filter((p) => _filters.marketSegments.has(p.marketSegment));
}

/**
 * Build and return the current transaction-level predicate.
 */
function getTxnPredicate() {
  return makeFilterPredicate({
    propertyTypes:  _filters.propertyTypes,
    typesOfSale:    _filters.typesOfSale,
    dateFrom:       _filters.dateFrom,
    dateTo:         _filters.dateTo,
    psfMin:         _filters.psfMin,
    psfMax:         _filters.psfMax,
  });
}

/**
 * Re-render markers and (if a project is selected) the transaction table.
 */
function applyFilters() {
  const visible = applyProjectFilter(_allProjects);
  renderProjects(map, clusterGroup, visible);

  if (_currentProject) {
    const predicate = getTxnPredicate();
    renderTable(tableEl, _currentProject, predicate);
    tableEl.classList.remove("hidden");
  }
}

// ---------------------------------------------------------------------------
// Filter bar builder
// ---------------------------------------------------------------------------

/**
 * Derive unique values for a given field across all transactions.
 * @param {string} txnField
 * @returns {string[]} sorted unique values
 */
function collectTxnValues(txnField) {
  const vals = new Set();
  for (const p of _allProjects) {
    for (const t of p.transactions) {
      if (t[txnField]) vals.add(t[txnField]);
    }
  }
  return [...vals].sort();
}

/**
 * Derive unique market segments across all projects.
 * @returns {string[]}
 */
function collectMarketSegments() {
  const vals = new Set(_allProjects.map((p) => p.marketSegment).filter(Boolean));
  return [...vals].sort();
}

/**
 * Build a checkbox group inside filtersBody.
 * @param {string} legend - group label
 * @param {string[]} options - checkbox values
 * @param {Set<string>} filterSet - the filter Set to mutate
 * @returns {HTMLFieldSetElement}
 */
function buildCheckboxGroup(legend, options, filterSet) {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "filter-group";

  const leg = document.createElement("legend");
  leg.textContent = legend;
  fieldset.appendChild(leg);

  for (const opt of options) {
    const label = document.createElement("label");
    label.className = "filter-checkbox";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = opt;
    cb.checked = false;

    cb.addEventListener("change", () => {
      if (cb.checked) {
        filterSet.add(opt);
      } else {
        filterSet.delete(opt);
      }
      applyFilters();
    });

    label.appendChild(cb);
    label.appendChild(document.createTextNode(" " + opt));
    fieldset.appendChild(label);
  }

  return fieldset;
}

/**
 * Populate the filter bar from loaded data.
 * Called once after all projects are loaded.
 */
function buildFilterBar() {
  filtersBody.innerHTML = "";

  const segments     = collectMarketSegments();
  const propTypes    = collectTxnValues("propertyType");
  const saleTypes    = collectTxnValues("typeOfSale");

  if (segments.length > 0) {
    filtersBody.appendChild(
      buildCheckboxGroup("Market Segment", segments, _filters.marketSegments)
    );
  }

  if (propTypes.length > 0) {
    filtersBody.appendChild(
      buildCheckboxGroup("Property Type", propTypes, _filters.propertyTypes)
    );
  }

  if (saleTypes.length > 0) {
    filtersBody.appendChild(
      buildCheckboxGroup("Type of Sale", saleTypes, _filters.typesOfSale)
    );
  }

  // ---- Date range ----
  const dateGroup = document.createElement("div");
  dateGroup.className = "filter-group filter-row";

  const dateLegend = document.createElement("p");
  dateLegend.className = "filter-label";
  dateLegend.textContent = "Contract Date";
  dateGroup.appendChild(dateLegend);

  const dateRow = document.createElement("div");
  dateRow.className = "filter-date-row";

  const dateFrom = _makeInput("date", "From");
  dateFrom.addEventListener("change", () => {
    _filters.dateFrom = dateFrom.value ? new Date(dateFrom.value) : null;
    applyFilters();
  });

  const dateTo = _makeInput("date", "To");
  dateTo.addEventListener("change", () => {
    _filters.dateTo = dateTo.value ? new Date(dateTo.value) : null;
    applyFilters();
  });

  dateRow.appendChild(dateFrom);
  dateRow.appendChild(dateTo);
  dateGroup.appendChild(dateRow);
  filtersBody.appendChild(dateGroup);

  // ---- PSF range ----
  const psfGroup = document.createElement("div");
  psfGroup.className = "filter-group filter-row";

  const psfLegend = document.createElement("p");
  psfLegend.className = "filter-label";
  psfLegend.textContent = "PSF ($/sqft)";
  psfGroup.appendChild(psfLegend);

  const psfRow = document.createElement("div");
  psfRow.className = "filter-psf-row";

  const psfMin = _makeInput("number", "Min PSF");
  psfMin.min = "0";
  psfMin.step = "100";
  psfMin.addEventListener("change", () => {
    _filters.psfMin = psfMin.value ? Number(psfMin.value) : null;
    applyFilters();
  });

  const psfMax = _makeInput("number", "Max PSF");
  psfMax.min = "0";
  psfMax.step = "100";
  psfMax.addEventListener("change", () => {
    _filters.psfMax = psfMax.value ? Number(psfMax.value) : null;
    applyFilters();
  });

  psfRow.appendChild(psfMin);
  psfRow.appendChild(psfMax);
  psfGroup.appendChild(psfRow);
  filtersBody.appendChild(psfGroup);

  // ---- Reset button ----
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "btn btn-reset";
  resetBtn.textContent = "Reset Filters";
  resetBtn.addEventListener("click", () => {
    _filters.marketSegments.clear();
    _filters.propertyTypes.clear();
    _filters.typesOfSale.clear();
    _filters.dateFrom = null;
    _filters.dateTo = null;
    _filters.psfMin = null;
    _filters.psfMax = null;
    buildFilterBar(); // rebuild to reset checkbox states
    applyFilters();
  });
  filtersBody.appendChild(resetBtn);
}

/** Helper: create a labelled input element. */
function _makeInput(type, placeholder) {
  const input = document.createElement("input");
  input.type = type;
  input.placeholder = placeholder;
  input.className = "filter-input";
  return input;
}

// ---------------------------------------------------------------------------
// Collapsible filter bar toggle
// ---------------------------------------------------------------------------
if (filtersToggle && filtersBody) {
  filtersToggle.addEventListener("click", () => {
    const isHidden = filtersBody.classList.toggle("hidden");
    filtersToggle.setAttribute("aria-expanded", String(!isHidden));
    filtersToggle.textContent = isHidden ? "Show Filters" : "Hide Filters";
  });
}

// ---------------------------------------------------------------------------
// Progress bar helpers
// ---------------------------------------------------------------------------
function showProgress(done, total) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  if (progressBar)  progressBar.classList.remove("hidden");
  if (progressFill) progressFill.style.width = pct + "%";
  if (progressLabel) progressLabel.textContent = `Loading ${done}/${total} batches…`;
}

function hideProgress() {
  if (progressBar) progressBar.classList.add("hidden");
}

// ---------------------------------------------------------------------------
// Staleness banner
// ---------------------------------------------------------------------------
function showBanner(msg) {
  if (!bannerEl) return;
  bannerEl.textContent = msg;
  bannerEl.classList.remove("hidden");
}

// ---------------------------------------------------------------------------
// Tap handler: show transaction table for selected project
// ---------------------------------------------------------------------------
onProjectTap((project) => {
  _currentProject = project;
  const predicate = getTxnPredicate();
  renderTable(tableEl, project, predicate);
  tableEl.classList.remove("hidden");
  // Scroll table into view on mobile.
  tableEl.scrollIntoView({ behavior: "smooth", block: "start" });
});

// ---------------------------------------------------------------------------
// Main load flow
// ---------------------------------------------------------------------------
(async () => {
  showProgress(0, 4);

  const result = await loadAllProjects({
    onBatch(projectsSoFar, done, total) {
      showProgress(done, total);
      // Render incrementally as batches arrive.
      const visible = applyProjectFilter(projectsSoFar);
      renderProjects(map, clusterGroup, visible);
    },
  });

  _allProjects = result.projects;
  hideProgress();

  // Final render with full dataset.
  applyFilters();

  // Build filter bar now that we have data.
  buildFilterBar();

  // Staleness banner.
  if (result.stale) {
    const date = new Date(result.fetchedAt);
    const fmt  = date.toLocaleString("en-SG", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    showBanner(`Showing cached data from ${fmt}. Could not reach the server.`);
  }
})();
