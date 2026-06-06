/**
 * SVY21 (EPSG:3414) → WGS84 coordinate conversion using proj4.
 * URA API returns x = Easting, y = Northing in SVY21.
 */
import proj4 from "proj4"; // resolved via import-map in index.html

proj4.defs(
  "EPSG:3414",
  "+proj=tmerc +lat_0=1.366666666666667 +lon_0=103.8333333333333 " +
    "+k=1 +x_0=28001.642 +y_0=38744.572 +ellps=WGS84 +units=m +no_defs"
);

/**
 * Convert SVY21 coordinates to WGS84 [lat, lng].
 * proj4 returns [lng, lat]; we swap to [lat, lng] for Leaflet.
 * @param {number|string} x - Easting (SVY21)
 * @param {number|string} y - Northing (SVY21)
 * @returns {[number, number]} [lat, lng]
 */
export function svy21ToLatLng(x, y) {
  const [lng, lat] = proj4("EPSG:3414", "WGS84", [Number(x), Number(y)]);
  return [lat, lng];
}
