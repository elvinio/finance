/**
 * Transaction table: renders a sortable, filterable table for a project's transactions.
 */

/** Currently active sort state. */
let _sortCol = "date";
let _sortDir = -1; // -1 = descending, 1 = ascending

/** Currently selected print margin in cm. */
let _printMarginCm = "1";

const PRINT_MARGINS = [
  { label: "0.5 cm", value: "0.5" },
  { label: "0.75 cm", value: "0.75" },
  { label: "1 cm", value: "1" },
  { label: "1.5 cm", value: "1.5" },
  { label: "2 cm", value: "2" },
];

function applyPrintMargin(cm) {
  let el = document.getElementById("_print-page-margin");
  if (!el) {
    el = document.createElement("style");
    el.id = "_print-page-margin";
    document.head.appendChild(el);
  }
  el.textContent = `@page { margin: ${cm}cm; }`;
}

/** Column definitions: key in transaction object, display header label, formatter. */
const COLUMNS = [
  {
    key: "date",
    label: "Date",
    format: (v) =>
      v instanceof Date && !isNaN(v)
        ? v.toLocaleDateString("en-SG", { year: "numeric", month: "short" })
        : "–",
  },
  {
    key: "floorRange",
    label: "Floor",
    format: (v) => v || "–",
  },
  {
    key: "area",
    label: "Area (sqft)",
    format: (v) => (v ? Math.round(v * 10.7639).toLocaleString() : "–"),
  },
  {
    key: "price",
    label: "Price ($)",
    format: (v) => (v ? "$" + Math.round(v).toLocaleString() : "–"),
  },
  {
    key: "psf",
    label: "PSF ($)",
    format: (v) => (v ? "$" + Math.round(v).toLocaleString() : "–"),
  },
  {
    key: "propertyType",
    label: "Type",
    format: (v) => v || "–",
  },
  {
    key: "typeOfSale",
    label: "Sale",
    format: (v) => v || "–",
  },
];

/**
 * Compare two transaction objects by the given column key.
 * @param {object} a
 * @param {object} b
 * @param {string} col
 * @param {number} dir - 1 for ascending, -1 for descending
 * @returns {number}
 */
function compareBy(a, b, col, dir) {
  let va = a[col];
  let vb = b[col];

  // Date comparison.
  if (va instanceof Date && vb instanceof Date) {
    return (va.getTime() - vb.getTime()) * dir;
  }

  // Numeric comparison.
  if (typeof va === "number" && typeof vb === "number") {
    return (va - vb) * dir;
  }

  // String comparison.
  va = String(va ?? "");
  vb = String(vb ?? "");
  return va.localeCompare(vb) * dir;
}

/**
 * Render a sortable transaction table into the given container element.
 *
 * Header shows: project name, market segment, median PSF.
 * The table rows are filtered by filterPredicate and sorted.
 * Clicking a column header toggles sort asc/desc.
 *
 * @param {HTMLElement} containerEl - element to render into (cleared first)
 * @param {object} project - normalised Project object
 * @param {(txn: object) => boolean} filterPredicate - transaction filter
 */
export function renderTable(containerEl, project, filterPredicate) {
  containerEl.innerHTML = "";

  // ---- Project header ----
  const header = document.createElement("div");
  header.className = "table-header";
  const marginOptions = PRINT_MARGINS
    .map(m => `<option value="${m.value}"${m.value === _printMarginCm ? " selected" : ""}>${m.label}</option>`)
    .join("");
  header.innerHTML =
    `<h2 class="table-project-name">${escapeHtml(project.name)}</h2>` +
    `<div class="table-project-meta">` +
    `<span class="badge badge-segment">${escapeHtml(project.marketSegment)}</span>` +
    `<span class="table-meta-psf">Median PSF: <strong>$${Math.round(project.medianPsf).toLocaleString()}</strong></span>` +
    `</div>` +
    `<div class="table-print-controls no-print">` +
    `<label class="print-margin-label" for="print-margin-select">Margin</label>` +
    `<select id="print-margin-select" class="print-margin-select" aria-label="Print margin">${marginOptions}</select>` +
    `<button class="btn-print" type="button">Print</button>` +
    `</div>`;
  containerEl.appendChild(header);

  containerEl.querySelector("#print-margin-select").addEventListener("change", (e) => {
    _printMarginCm = e.target.value;
  });
  containerEl.querySelector(".btn-print").addEventListener("click", () => {
    applyPrintMargin(_printMarginCm);
    window.print();
  });

  // ---- Filter transactions ----
  const rows = (project.transactions || []).filter(filterPredicate);

  if (rows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "table-empty";
    empty.textContent = "No transactions match filters.";
    containerEl.appendChild(empty);
    return;
  }

  // ---- Sort ----
  rows.sort((a, b) => compareBy(a, b, _sortCol, _sortDir));

  // ---- Build table ----
  const tableWrapper = document.createElement("div");
  tableWrapper.className = "table-wrapper";

  const table = document.createElement("table");
  table.className = "txn-table";

  // Thead
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const col of COLUMNS) {
    const th = document.createElement("th");
    th.textContent = col.label;
    th.dataset.col = col.key;
    th.className = "sortable";
    if (col.key === _sortCol) {
      th.classList.add(_sortDir === -1 ? "sort-desc" : "sort-asc");
    }
    th.addEventListener("click", () => {
      if (_sortCol === col.key) {
        _sortDir = -_sortDir;
      } else {
        _sortCol = col.key;
        _sortDir = col.key === "date" ? -1 : 1;
      }
      // Re-render with the new sort.
      renderTable(containerEl, project, filterPredicate);
    });
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Tbody
  const tbody = document.createElement("tbody");
  for (const txn of rows) {
    const tr = document.createElement("tr");
    for (const col of COLUMNS) {
      const td = document.createElement("td");
      td.textContent = col.format(txn[col.key]);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  tableWrapper.appendChild(table);
  containerEl.appendChild(tableWrapper);

  // ---- Row count ----
  const count = document.createElement("p");
  count.className = "table-count";
  count.textContent = `Showing ${rows.length} transaction${rows.length !== 1 ? "s" : ""}`;
  containerEl.appendChild(count);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Escape special HTML characters.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
