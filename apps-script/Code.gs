/**
 * Singapore Condo Property Explorer — GAS proxy
 *
 * Deployment:
 *   1. Open Apps Script (script.google.com), create a new project.
 *   2. Paste this file as Code.gs.
 *   3. In Project Settings → Script Properties, add:
 *        ACCESS_KEY  =  <your URA Data Service AccessKey>
 *   4. Deploy → New deployment → Web app
 *        Execute as: Me
 *        Who has access: Anyone
 *   5. Copy the deployment URL into src/lib/uraClient.js (PROXY_URL).
 *
 * The browser must call via GET only (no JSON POST — preflight would fail).
 * All parameters are passed as query-string params:
 *   ?service=PMI_Resi_Transaction&batch=1
 *
 * CORS: GAS ContentService responses automatically include
 *   Access-Control-Allow-Origin: *  for GET requests.
 */

// URA API base URL
var URA_BASE = "https://eservice.ura.gov.sg/uraDataService";

// ---------------------------------------------------------------------------
// Token management
// The daily URA access token is fetched once per Singapore calendar day and
// cached in Script Properties.  The browser never sees a token.
// ---------------------------------------------------------------------------

/**
 * Return a valid URA access token for today (SGT).
 * Fetches a new token if the cached one is from a previous day.
 *
 * @returns {string} token string
 */
function getToken() {
  var props = PropertiesService.getScriptProperties();
  var today = Utilities.formatDate(new Date(), "Asia/Singapore", "yyyy-MM-dd");

  if (props.getProperty("tokenDate") === today) {
    return props.getProperty("token");
  }

  // Fetch a fresh token.
  var accessKey = props.getProperty("ACCESS_KEY");
  if (!accessKey) {
    throw new Error("ACCESS_KEY not set in Script Properties.");
  }

  var response = UrlFetchApp.fetch(URA_BASE + "/insertNewToken/v1", {
    method: "get",
    headers: {
      AccessKey: accessKey,
      "User-Agent": "Mozilla/5.0 (compatible; SGCondoExplorer/1.0)",
    },
    muteHttpExceptions: true,
  });

  var parsed = JSON.parse(response.getContentText());
  var token = parsed.Result;
  if (!token) {
    throw new Error("Token fetch failed: " + response.getContentText());
  }

  props.setProperty("token", token);
  props.setProperty("tokenDate", today);
  return token;
}

// ---------------------------------------------------------------------------
// Batch fetcher
// ---------------------------------------------------------------------------

/**
 * Fetch a single URA PMI_Resi_Transaction batch (1–4).
 * Retries once if an auth/expiry error is returned (clears tokenDate first).
 *
 * @param {string} service - URA service name, e.g. "PMI_Resi_Transaction"
 * @param {number|string} batch - batch number 1–4
 * @returns {object} parsed JSON response from URA
 */
function fetchBatch(service, batch) {
  var accessKey = PropertiesService.getScriptProperties().getProperty("ACCESS_KEY");
  var token = getToken();

  var url =
    URA_BASE +
    "/invokeUraDS?service=" +
    encodeURIComponent(service) +
    "&batch=" +
    encodeURIComponent(String(batch));

  var options = {
    method: "get",
    headers: {
      AccessKey: accessKey,
      Token: token,
      "User-Agent": "Mozilla/5.0 (compatible; SGCondoExplorer/1.0)",
    },
    muteHttpExceptions: true,
  };

  var response = UrlFetchApp.fetch(url, options);
  var text = response.getContentText();
  var parsed;

  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error("Invalid JSON from URA: " + text.slice(0, 200));
  }

  // Detect token-expiry errors and retry once.
  var status = (parsed.Status || "").toLowerCase();
  if (status === "4" || status.indexOf("token") !== -1 || status.indexOf("auth") !== -1) {
    // Clear cached token and retry.
    PropertiesService.getScriptProperties().deleteProperty("tokenDate");
    token = getToken();
    options.headers.Token = token;
    response = UrlFetchApp.fetch(url, options);
    text = response.getContentText();
    parsed = JSON.parse(text);
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Web app entry point
// ---------------------------------------------------------------------------

/**
 * HTTP GET handler — the only entry point exposed to the browser.
 *
 * Query parameters:
 *   service  (default: "PMI_Resi_Transaction")
 *   batch    (default: "1")
 *
 * Response: JSON with CORS headers (handled automatically by ContentService).
 *
 * @param {GoogleAppsScript.Events.DoGet} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var service = params.service || "PMI_Resi_Transaction";
  var batch   = params.batch   || "1";

  var result;
  try {
    result = fetchBatch(service, batch);
  } catch (err) {
    result = { Status: "Error", Message: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
