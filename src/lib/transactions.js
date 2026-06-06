/**
 * Transaction utilities: PSF math, date parsing, filter predicates.
 */

/**
 * Compute the median of an array of numbers.
 * @param {number[]} nums
 * @returns {number}
 */
export function median(nums) {
  if (!nums || nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Convert square metres to square feet.
 * @param {number} areaSqm
 * @returns {number}
 */
export function toSqft(areaSqm) {
  return areaSqm * 10.7639;
}

/**
 * Compute price per square foot.
 * @param {number} price - total transaction price in SGD
 * @param {number} areaSqm - area in square metres
 * @returns {number}
 */
export function computePsf(price, areaSqm) {
  const sqft = toSqft(areaSqm);
  if (!sqft || sqft === 0) return 0;
  return price / sqft;
}

/**
 * Parse a URA contractDate string ("MMYY") into a Date object.
 * Assumes years 2000+.
 * @param {string} mmyy - e.g. "0124" → January 2024
 * @returns {Date}
 */
export function parseContractDate(mmyy) {
  if (!mmyy || mmyy.length < 4) return new Date(0);
  const mm = parseInt(mmyy.slice(0, 2), 10);
  const yy = parseInt(mmyy.slice(2, 4), 10);
  return new Date(2000 + yy, mm - 1, 1);
}

/**
 * PSF colour buckets (green → yellow → red), calibrated for Singapore condo PSF in SGD/sqft.
 * Each bucket applies when psf < max (last bucket max is Infinity).
 * @type {Array<{max: number, color: string, label: string}>}
 */
export const PSF_BUCKETS = [
  { max: 1000,     color: "#1a9850", label: "< $1,000 psf"       },
  { max: 1500,     color: "#91cf60", label: "$1,000 – $1,500 psf" },
  { max: 2000,     color: "#fee08b", label: "$1,500 – $2,000 psf" },
  { max: 2500,     color: "#fc8d59", label: "$2,000 – $2,500 psf" },
  { max: Infinity, color: "#d73027", label: "> $2,500 psf"        },
];

/**
 * Return the hex colour for a given PSF value.
 * @param {number} psf
 * @returns {string} hex colour
 */
export function psfColor(psf) {
  for (const bucket of PSF_BUCKETS) {
    if (psf < bucket.max) return bucket.color;
  }
  return PSF_BUCKETS[PSF_BUCKETS.length - 1].color;
}

/**
 * Build a filter predicate function from a filters object.
 * Note: marketSegment is project-level; it is NOT checked here (handled in main.js).
 *
 * @param {{
 *   marketSegments: Set<string>,
 *   propertyTypes: Set<string>,
 *   typesOfSale: Set<string>,
 *   dateFrom: Date|null,
 *   dateTo: Date|null,
 *   psfMin: number|null,
 *   psfMax: number|null
 * }} filters
 * @returns {(txn: object) => boolean}
 */
export function makeFilterPredicate(filters) {
  const {
    propertyTypes = new Set(),
    typesOfSale = new Set(),
    dateFrom = null,
    dateTo = null,
    psfMin = null,
    psfMax = null,
  } = filters || {};

  return function (txn) {
    // Property type filter (skip if empty Set = no constraint)
    if (propertyTypes.size > 0 && !propertyTypes.has(txn.propertyType)) {
      return false;
    }

    // Type of sale filter
    if (typesOfSale.size > 0 && !typesOfSale.has(txn.typeOfSale)) {
      return false;
    }

    // Date range filter
    if (dateFrom !== null && txn.date < dateFrom) return false;
    if (dateTo !== null && txn.date > dateTo) return false;

    // PSF range filter
    if (psfMin !== null && txn.psf < psfMin) return false;
    if (psfMax !== null && txn.psf > psfMax) return false;

    return true;
  };
}
