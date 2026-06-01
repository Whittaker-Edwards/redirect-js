/**
 * Configuration resolution for WE Redirect.
 *
 * Two entry surfaces, two config sources:
 *   - Browser/CDN  : config is read ONLY from data-we-* attributes on the
 *                    executing <script> tag (see readScriptConfig). No globals.
 *   - npm import   : config is passed programmatically to init(config).
 *
 * Either way the raw values are normalized + merged onto DEFAULTS here.
 *
 * @typedef {Object} WERedirectConfig
 * @property {string}  [param="r"]      Query param name that carries the target URL.
 * @property {boolean} [greedy=true]    Capture everything after `param=` as the URL
 *                                      (so plain target URLs may contain their own &params).
 * @property {boolean} [replace=true]   Use location.replace (no back-button entry) vs assign.
 * @property {string}  [gtm]            GTM container id, e.g. "GTM-XXXXXXX".
 * @property {string}  [pixel]          Meta/Facebook Pixel id, e.g. "123456789012345".
 * @property {string[]} [pixels=[]]     Arbitrary custom snippets (raw <script>/<img> HTML).
 * @property {boolean} [trackRedirect=false]  OPT-IN. When true AND a pixel is set, fire a
 *                                      PageView + custom "Redirect" event BEFORE the
 *                                      redirect (adds `pixelDelay` ms of latency to the hop).
 *                                      Off by default: most redirects land on a page that
 *                                      already has the pixel, so this is only needed when a
 *                                      client must capture the click on the redirector itself.
 * @property {number}  [pixelDelay=120] Only used when trackRedirect is on: ms to wait after
 *                                      firing events before navigating, so the beacon can
 *                                      flush. Set 0 to redirect immediately (least reliable).
 * @property {boolean} [debug=false]    Emit console diagnostics.
 */

/** @type {Required<WERedirectConfig>} */
export const DEFAULTS = {
  param: 'r',
  greedy: true,
  replace: true,
  gtm: '',
  pixel: '',
  pixels: [],
  trackRedirect: false,
  pixelDelay: 120,
  debug: false,
};

/**
 * Map of config key -> data-we-* attribute name (browser/CDN source).
 * data-we-pixels is expected to be a JSON-encoded array of snippet strings.
 */
export const ATTR_MAP = {
  param: 'data-we-param',
  greedy: 'data-we-greedy',
  replace: 'data-we-replace',
  gtm: 'data-we-gtm',
  pixel: 'data-we-pixel',
  pixels: 'data-we-pixels',
  trackRedirect: 'data-we-track-redirect',
  pixelDelay: 'data-we-pixel-delay',
  debug: 'data-we-debug',
};

/** Parse a "true"/"false"/"1"/"0"/"" attribute string into a boolean. */
function parseBool(value, fallback) {
  if (value == null) return fallback;
  const v = String(value).trim().toLowerCase();
  if (v === 'true' || v === '1' || v === '') return true;
  if (v === 'false' || v === '0') return false;
  return fallback;
}

/**
 * Read raw config from the data-we-* attributes of a <script> element.
 * Only attributes actually present on the element are returned; types are
 * coerced per the shape of DEFAULTS (booleans, the pixels array, strings).
 * @param {Element|null} scriptEl  Typically document.currentScript.
 * @returns {WERedirectConfig}  Partial config (only attributes that were present).
 */
export function readScriptConfig(scriptEl) {
  /** @type {WERedirectConfig} */
  const out = {};
  if (!scriptEl || typeof scriptEl.getAttribute !== 'function') return out;

  for (const [key, attr] of Object.entries(ATTR_MAP)) {
    if (!scriptEl.hasAttribute(attr)) continue;
    const raw = scriptEl.getAttribute(attr);

    if (key === 'pixels') {
      try {
        const parsed = JSON.parse(raw);
        out.pixels = Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        out.pixels = [];
      }
    } else if (typeof DEFAULTS[key] === 'boolean') {
      out[key] = parseBool(raw, DEFAULTS[key]);
    } else if (typeof DEFAULTS[key] === 'number') {
      const n = Number(raw);
      out[key] = Number.isFinite(n) && n >= 0 ? n : DEFAULTS[key];
    } else {
      out[key] = raw == null ? '' : String(raw).trim();
    }
  }

  return out;
}

/**
 * Normalize + merge a partial config onto DEFAULTS. Unknown keys are dropped;
 * each known key is coerced to the type of its default so callers can't smuggle
 * in surprises (e.g. a non-array `pixels`).
 * @param {WERedirectConfig} [override]
 * @returns {Required<WERedirectConfig>}
 */
export function resolveConfig(override) {
  /** @type {Required<WERedirectConfig>} */
  const config = { ...DEFAULTS };
  const src = override && typeof override === 'object' ? override : {};

  for (const key of Object.keys(DEFAULTS)) {
    if (!(key in src) || src[key] == null) continue;
    const value = src[key];

    if (key === 'pixels') {
      config.pixels = Array.isArray(value) ? value.map(String) : DEFAULTS.pixels;
    } else if (typeof DEFAULTS[key] === 'boolean') {
      config[key] = typeof value === 'boolean' ? value : parseBool(value, DEFAULTS[key]);
    } else if (typeof DEFAULTS[key] === 'number') {
      const n = Number(value);
      config[key] = Number.isFinite(n) && n >= 0 ? n : DEFAULTS[key];
    } else {
      config[key] = String(value).trim();
    }
  }

  // A blank param name is meaningless — fall back to the default.
  if (!config.param) config.param = DEFAULTS.param;

  return config;
}

/**
 * Tiny gated logger. No-ops unless config.debug is true and a console exists.
 * @param {Required<WERedirectConfig>} config
 * @param {...unknown} args
 */
export function log(config, ...args) {
  if (config && config.debug && typeof console !== 'undefined') {
    console.log('[we.redirect]', ...args);
  }
}
