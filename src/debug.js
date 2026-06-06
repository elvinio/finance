/**
 * debug.js — Troubleshooting panel: live status cards + timestamped log.
 */

const _statusMap = new Map();
let _logEl = null;
let _logWrap = null;
let _statusEl = null;

export function initDebugPanel() {
  const fab     = document.getElementById("debug-fab");
  const panel   = document.getElementById("debug-panel");
  const closeBtn = document.getElementById("debug-close");
  const clearBtn = document.getElementById("debug-clear");

  _logEl    = document.getElementById("debug-log");
  _logWrap  = document.getElementById("debug-log-wrap");
  _statusEl = document.getElementById("debug-status-grid");

  if (fab && panel) {
    fab.addEventListener("click", () => {
      const hidden = panel.classList.toggle("hidden");
      fab.setAttribute("aria-pressed", String(!hidden));
    });
  }
  if (closeBtn && panel) {
    closeBtn.addEventListener("click", () => {
      panel.classList.add("hidden");
      fab.setAttribute("aria-pressed", "false");
    });
  }
  if (clearBtn && _logEl) {
    clearBtn.addEventListener("click", () => { _logEl.innerHTML = ""; });
  }
}

/**
 * Append a timestamped log entry.
 * @param {string} msg
 * @param {"info"|"success"|"error"|"warn"|"step"} [type]
 */
export function debugLog(msg, type = "info") {
  if (!_logEl) return;
  const li = document.createElement("li");
  li.className = `dl-entry dl-${type}`;
  const ts = new Date().toLocaleTimeString("en-SG", { hour12: false });
  li.textContent = `[${ts}] ${msg}`;
  _logEl.appendChild(li);
  if (_logWrap) _logWrap.scrollTop = _logWrap.scrollHeight;
}

/**
 * Set or update a named status card.
 * @param {string} key   - card label
 * @param {string} value - card value
 * @param {"neutral"|"info"|"success"|"error"|"warn"} [type]
 */
export function debugSetStatus(key, value, type = "neutral") {
  _statusMap.set(key, { value, type });
  _renderStatus();
}

function _renderStatus() {
  if (!_statusEl) return;
  _statusEl.innerHTML = "";
  for (const [key, { value, type }] of _statusMap) {
    const card = document.createElement("div");
    card.className = `ds-card ds-${type}`;
    card.innerHTML =
      `<span class="ds-key">${key}</span><span class="ds-val">${value}</span>`;
    _statusEl.appendChild(card);
  }
}
