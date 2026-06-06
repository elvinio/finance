/**
 * URA Client: loads all project/transaction data, with IndexedDB caching.
 * Supports a mock mode (USE_MOCK=true) for development/testing without a live proxy.
 */
import { svy21ToLatLng } from "./svy21.js";
import { computePsf, parseContractDate, median } from "./transactions.js";

/** GAS proxy URL — replace REPLACE_WITH_YOUR_DEPLOYMENT_ID with your actual deployment ID. */
export const PROXY_URL =
  "https://script.google.com/macros/s/AKfycbwJK8mtfYM_PBZq2bYWtGhEcMP7ic3szrMzyGn3qAky_0u_lZynrgsPnOq0McjWWfcQOg/exec";

/**
 * Flip to false to use the real GAS proxy.
 * When true the app runs entirely on the inline mock dataset below.
 */
export const USE_MOCK = false;

// ---------------------------------------------------------------------------
// Inline mock dataset in raw URA shape (so normalizeBatch applies directly).
// 5 projects across CCR / RCR / OCR with realistic SVY21 coordinates.
// SVY21 reference: Marina Bay ~(30000, 29000); Orchard ~(28500, 31500);
//   Bishan ~(29500, 38000); Jurong West ~(16500, 36000); Tampines ~(42000, 38500)
// ---------------------------------------------------------------------------
const MOCK_RAW = [
  // ---------- CCR: Marina Bay / District 01 ----------
  {
    street: "MARINA BOULEVARD",
    project: "THE SAIL @ MARINA BAY",
    marketSegment: "CCR",
    x: "30168.21",
    y: "29299.84",
    transaction: [
      {
        area: "65",
        floorRange: "16-20",
        noOfUnits: "1",
        contractDate: "0124",
        typeOfSale: "Resale",
        price: "2350000",
        propertyType: "Condominium",
        district: "01",
        typeOfArea: "Strata",
        tenure: "99-year Leasehold",
      },
      {
        area: "90",
        floorRange: "21-25",
        noOfUnits: "1",
        contractDate: "1123",
        typeOfSale: "Resale",
        price: "3100000",
        propertyType: "Condominium",
        district: "01",
        typeOfArea: "Strata",
        tenure: "99-year Leasehold",
      },
      {
        area: "120",
        floorRange: "26-30",
        noOfUnits: "1",
        contractDate: "0923",
        typeOfSale: "Resale",
        price: "4500000",
        propertyType: "Condominium",
        district: "01",
        typeOfArea: "Strata",
        tenure: "99-year Leasehold",
      },
    ],
  },

  // ---------- CCR: Orchard / District 09 ----------
  {
    street: "PATERSON ROAD",
    project: "PATERSON SUITES",
    marketSegment: "CCR",
    x: "28530.45",
    y: "31624.77",
    transaction: [
      {
        area: "110",
        floorRange: "06-10",
        noOfUnits: "1",
        contractDate: "0224",
        typeOfSale: "Resale",
        price: "3900000",
        propertyType: "Condominium",
        district: "09",
        typeOfArea: "Strata",
        tenure: "Freehold",
      },
      {
        area: "148",
        floorRange: "11-15",
        noOfUnits: "1",
        contractDate: "1223",
        typeOfSale: "Resale",
        price: "5600000",
        propertyType: "Condominium",
        district: "09",
        typeOfArea: "Strata",
        tenure: "Freehold",
      },
      {
        area: "75",
        floorRange: "01-05",
        noOfUnits: "1",
        contractDate: "0824",
        typeOfSale: "Sub Sale",
        price: "2450000",
        propertyType: "Condominium",
        district: "09",
        typeOfArea: "Strata",
        tenure: "Freehold",
      },
      {
        area: "200",
        floorRange: "16-20",
        noOfUnits: "1",
        contractDate: "0524",
        typeOfSale: "Resale",
        price: "7200000",
        propertyType: "Condominium",
        district: "09",
        typeOfArea: "Strata",
        tenure: "Freehold",
      },
    ],
  },

  // ---------- RCR: Bishan / District 20 ----------
  {
    street: "BISHAN STREET 22",
    project: "SKY HABITAT",
    marketSegment: "RCR",
    x: "29512.33",
    y: "38143.90",
    transaction: [
      {
        area: "95",
        floorRange: "11-15",
        noOfUnits: "1",
        contractDate: "0324",
        typeOfSale: "Resale",
        price: "1980000",
        propertyType: "Condominium",
        district: "20",
        typeOfArea: "Strata",
        tenure: "99-year Leasehold",
      },
      {
        area: "130",
        floorRange: "21-25",
        noOfUnits: "1",
        contractDate: "0124",
        typeOfSale: "Resale",
        price: "2700000",
        propertyType: "Condominium",
        district: "20",
        typeOfArea: "Strata",
        tenure: "99-year Leasehold",
      },
      {
        area: "70",
        floorRange: "06-10",
        noOfUnits: "1",
        contractDate: "1123",
        typeOfSale: "New Sale",
        price: "1450000",
        propertyType: "Condominium",
        district: "20",
        typeOfArea: "Strata",
        tenure: "99-year Leasehold",
      },
    ],
  },

  // ---------- OCR: Jurong West / District 22 ----------
  {
    street: "JURONG WEST STREET 41",
    project: "LAKEVILLE",
    marketSegment: "OCR",
    x: "16423.88",
    y: "36089.12",
    transaction: [
      {
        area: "85",
        floorRange: "06-10",
        noOfUnits: "1",
        contractDate: "0424",
        typeOfSale: "Resale",
        price: "1200000",
        propertyType: "Condominium",
        district: "22",
        typeOfArea: "Strata",
        tenure: "99-year Leasehold",
      },
      {
        area: "120",
        floorRange: "11-15",
        noOfUnits: "1",
        contractDate: "0224",
        typeOfSale: "Resale",
        price: "1680000",
        propertyType: "Condominium",
        district: "22",
        typeOfArea: "Strata",
        tenure: "99-year Leasehold",
      },
      {
        area: "55",
        floorRange: "01-05",
        noOfUnits: "1",
        contractDate: "0924",
        typeOfSale: "Resale",
        price: "780000",
        propertyType: "Condominium",
        district: "22",
        typeOfArea: "Strata",
        tenure: "99-year Leasehold",
      },
      {
        area: "160",
        floorRange: "16-20",
        noOfUnits: "1",
        contractDate: "0624",
        typeOfSale: "New Sale",
        price: "2200000",
        propertyType: "Condominium",
        district: "22",
        typeOfArea: "Strata",
        tenure: "99-year Leasehold",
      },
    ],
  },

  // ---------- OCR: Tampines / District 18 ----------
  {
    street: "TAMPINES AVENUE 10",
    project: "THE TAPESTRY",
    marketSegment: "OCR",
    x: "42215.64",
    y: "38567.33",
    transaction: [
      {
        area: "72",
        floorRange: "06-10",
        noOfUnits: "1",
        contractDate: "0724",
        typeOfSale: "Resale",
        price: "1080000",
        propertyType: "Condominium",
        district: "18",
        typeOfArea: "Strata",
        tenure: "99-year Leasehold",
      },
      {
        area: "98",
        floorRange: "11-15",
        noOfUnits: "1",
        contractDate: "0524",
        typeOfSale: "Resale",
        price: "1480000",
        propertyType: "Condominium",
        district: "18",
        typeOfArea: "Strata",
        tenure: "99-year Leasehold",
      },
      {
        area: "130",
        floorRange: "16-20",
        noOfUnits: "1",
        contractDate: "0324",
        typeOfSale: "New Sale",
        price: "1890000",
        propertyType: "Condominium",
        district: "18",
        typeOfArea: "Strata",
        tenure: "99-year Leasehold",
      },
      {
        area: "50",
        floorRange: "01-05",
        noOfUnits: "1",
        contractDate: "1024",
        typeOfSale: "Resale",
        price: "750000",
        propertyType: "Condominium",
        district: "18",
        typeOfArea: "Strata",
        tenure: "99-year Leasehold",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// IndexedDB helpers (promise-based)
// ---------------------------------------------------------------------------

const DB_NAME = "sgcondo";
const DB_STORE = "cache";
const DB_VERSION = 1;
const CACHE_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

/** Open (or create) the IndexedDB database. Returns a Promise<IDBDatabase>. */
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

/** Read a key from the cache store. Returns Promise<value|undefined>. */
async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).get(key);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

/** Write a value to the cache store. Returns Promise<void>. */
async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    const req = tx.objectStore(DB_STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

// ---------------------------------------------------------------------------
// Data normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise a raw URA Result array into our internal Project[] shape.
 * Each URA project object: { street, project, marketSegment, x, y, transaction:[...] }
 *
 * @param {Array<object>} rawResult - the "Result" array from a URA batch response
 * @returns {Array<object>} Project[]
 */
export function normalizeBatch(rawResult) {
  if (!Array.isArray(rawResult)) return [];

  return rawResult
    .filter((p) => p && p.x && p.y)
    .map((p) => {
      const [lat, lng] = svy21ToLatLng(p.x, p.y);

      const transactions = (p.transaction || []).map((t) => {
        const area = parseFloat(t.area) || 0;
        const price = parseFloat(t.price) || 0;
        const psf = computePsf(price, area);
        const date = parseContractDate(t.contractDate);
        return {
          area,
          floorRange: t.floorRange || "",
          noOfUnits: parseInt(t.noOfUnits, 10) || 1,
          contractDateRaw: t.contractDate || "",
          date,
          typeOfSale: t.typeOfSale || "",
          price,
          psf,
          propertyType: t.propertyType || "",
          district: t.district || "",
          typeOfArea: t.typeOfArea || "",
          tenure: t.tenure || "",
        };
      });

      const allPsf = transactions.map((t) => t.psf).filter((v) => v > 0);
      const medianPsf = median(allPsf);

      return {
        name: p.project || p.street || "Unknown",
        street: p.street || "",
        marketSegment: p.marketSegment || "",
        x: Number(p.x),
        y: Number(p.y),
        lat,
        lng,
        medianPsf,
        transactions,
      };
    });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return the age of the cached data.
 * @returns {{ fetchedAt: number, ageMs: number } | null}
 */
export function getDataAge() {
  // Sync check of a module-level variable set after the last successful load.
  const entry = _lastFetchedAt;
  if (entry === null) return null;
  return { fetchedAt: entry, ageMs: Date.now() - entry };
}

// Internal module-level cache timestamp (populated by loadAllProjects).
let _lastFetchedAt = null;

/**
 * Load all projects.
 *
 * USE_MOCK=true path:
 *   Normalise the inline mock, call onBatch once, return immediately.
 *
 * Live path:
 *   1. If IndexedDB has fresh data (<48h) and !forceRefresh → return cache.
 *   2. Otherwise fetch batches 1–4 in parallel from PROXY_URL, normalise,
 *      call onBatch incrementally, persist to IndexedDB.
 *   3. On network failure fall back to IndexedDB cache with stale:true.
 *
 * @param {{ onBatch?: Function, forceRefresh?: boolean }} [options]
 * @returns {Promise<{ projects: object[], fetchedAt: number, stale: boolean }>}
 */
export async function loadAllProjects({ onBatch, onLog, forceRefresh = false } = {}) {
  const notify = typeof onBatch === "function" ? onBatch : () => {};
  const log    = typeof onLog  === "function" ? onLog  : () => {};

  // ---- Mock path ----
  if (USE_MOCK) {
    log("Mock mode active — using inline dataset (USE_MOCK=true)", "warn");
    const projects = normalizeBatch(MOCK_RAW);
    _lastFetchedAt = Date.now();
    const txnCount = projects.reduce((s, p) => s + p.transactions.length, 0);
    log(`Mock data ready: ${projects.length} projects, ${txnCount} transactions`, "success");
    notify(projects, 1, 1);
    return { projects, fetchedAt: _lastFetchedAt, stale: false };
  }

  // ---- Live path ----
  log("Live mode — checking IndexedDB cache…", "step");

  // Try IndexedDB cache first (unless forceRefresh).
  if (!forceRefresh) {
    try {
      const cached = await idbGet("data");
      if (cached && cached.fetchedAt && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        _lastFetchedAt = cached.fetchedAt;
        const projects = cached.projects;
        const ageMin = Math.round((Date.now() - cached.fetchedAt) / 60000);
        const ageStr = ageMin < 60 ? `${ageMin}m` : `${Math.round(ageMin / 60)}h`;
        const txnCount = projects.reduce((s, p) => s + p.transactions.length, 0);
        log(`Cache hit — data is ${ageStr} old (${projects.length} projects, ${txnCount} txns)`, "success");
        notify(projects, 1, 1);
        return { projects, fetchedAt: cached.fetchedAt, stale: false };
      } else if (cached && cached.fetchedAt) {
        const ageH = Math.round((Date.now() - cached.fetchedAt) / 3600000);
        log(`Cache expired — data is ${ageH}h old (threshold: 48h); fetching fresh`, "warn");
      } else {
        log("Cache miss — no data in IndexedDB; fetching from proxy", "info");
      }
    } catch (idbErr) {
      log(`IndexedDB read error: ${idbErr.message}`, "error");
    }
  } else {
    log("Force-refresh requested — bypassing cache", "warn");
  }

  // Fetch all 4 batches in parallel; normalise and report incrementally.
  const BATCH_COUNT = 4;
  const allProjects = [];
  let completed = 0;

  try {
    const fetchBatch = async (n) => {
      const url = `${PROXY_URL}?service=PMI_Resi_Transaction&batch=${n}`;
      log(`Batch ${n}: fetching from proxy…`, "step");
      const t0  = Date.now();
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Batch ${n} HTTP ${res.status}`);
      const json = await res.json();
      // URA response shape: { Status: "Success", Result: [...] }
      const result = json.Result || json.result || json;
      const batchProjects = normalizeBatch(Array.isArray(result) ? result : []);
      const elapsed = Date.now() - t0;
      const txns = batchProjects.reduce((s, p) => s + p.transactions.length, 0);
      log(`Batch ${n}: ${batchProjects.length} projects, ${txns} transactions (${elapsed}ms)`, "success");
      allProjects.push(...batchProjects);
      completed += 1;
      notify([...allProjects], completed, BATCH_COUNT);
      return batchProjects;
    };

    await Promise.all(
      Array.from({ length: BATCH_COUNT }, (_, i) => fetchBatch(i + 1))
    );

    const fetchedAt = Date.now();
    _lastFetchedAt = fetchedAt;

    const totalTxns = allProjects.reduce((s, p) => s + p.transactions.length, 0);
    log(`All batches done — ${allProjects.length} projects, ${totalTxns} transactions total`, "success");

    // Persist to IndexedDB.
    try {
      await idbSet("data", { fetchedAt, projects: allProjects });
      log("Data persisted to IndexedDB (TTL: 48h)", "info");
    } catch (idbErr) {
      log(`IndexedDB write failed (non-fatal): ${idbErr.message}`, "warn");
    }

    return { projects: allProjects, fetchedAt, stale: false };
  } catch (networkErr) {
    log(`Network fetch failed: ${networkErr.message}`, "error");
    console.warn("Network fetch failed; falling back to IndexedDB cache.", networkErr);

    // Fall back to stale cache on network error.
    try {
      const cached = await idbGet("data");
      if (cached && cached.projects) {
        _lastFetchedAt = cached.fetchedAt;
        const ageH = Math.round((Date.now() - cached.fetchedAt) / 3600000);
        log(`Falling back to stale cache — data is ${ageH}h old`, "warn");
        notify(cached.projects, 1, 1);
        return { projects: cached.projects, fetchedAt: cached.fetchedAt, stale: true };
      }
    } catch (_err) {
      log("Stale cache also unavailable — no data to display", "error");
    }

    // Total failure — return empty.
    return { projects: [], fetchedAt: Date.now(), stale: true };
  }
}
