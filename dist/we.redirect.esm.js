/*!
 * @whittaker-edwards/redirect-js v0.1.0
 * Seamless URL-parameter redirect with fallback GTM/Pixel tracking injection. Attach to a landing page so Facebook/Meta ads referenced by Post ID can redirect via a URL parameter without altering the ad.
 * (c) 2026 Whittaker & Edwards
 * https://github.com/Whittaker-Edwards/redirect-js#readme
 */

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
 * @property {boolean} [forwardParams=true]  ON BY DEFAULT. Appends the page's OTHER query
 *                                      params (everything except our redirect param) onto the
 *                                      target URL, so UTMs/click-ids carry through the hop.
 *                                      Opt OUT per client with data-we-forward-params="false".
 *                                      In greedy mode only params BEFORE `r=` are forwarded
 *                                      (params after it belong to the target URL itself).
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
const DEFAULTS = {
  param: 'r',
  greedy: true,
  replace: true,
  forwardParams: true,
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
const ATTR_MAP = {
  param: 'data-we-param',
  greedy: 'data-we-greedy',
  replace: 'data-we-replace',
  forwardParams: 'data-we-forward-params',
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
function readScriptConfig(scriptEl) {
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
function resolveConfig(override) {
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
function log(config, ...args) {
  if (config && config.debug && typeof console !== 'undefined') {
    console.log('[we.redirect]', ...args);
  }
}

/**
 * Tracking injection — runs only when NO redirect param is present.
 * Injects a GTM container, the Meta/Facebook Pixel, and/or arbitrary custom
 * pixel snippets, based on resolved config.
 *
 * Everything is injected as real DOM nodes (no document.write), so it is safe
 * to call from the <head> after the document has started parsing.
 */


/** data-attribute we stamp on injected nodes to prevent double-injection. */
const MARK = 'data-we-injected';

/** True if a node bearing MARK=value already exists in the document. */
function alreadyInjected(doc, value) {
  return !!doc.querySelector(`[${MARK}="${value}"]`);
}

/** Append a node to <head> (falling back to documentElement). */
function appendHead(doc, node) {
  (doc.head || doc.getElementsByTagName('head')[0] || doc.documentElement).appendChild(node);
}

/** Append a node to <body> when it exists; otherwise defer to <head>. */
function appendBody(doc, node) {
  const body = doc.body || doc.getElementsByTagName('body')[0];
  if (body) body.appendChild(node);
  else appendHead(doc, node);
}

/**
 * Inject a Google Tag Manager container.
 * Mirrors the official snippet: an async loader script in <head> plus a
 * <noscript> iframe fallback in <body>. dataLayer is initialized first.
 * @param {string} id  GTM container id ("GTM-XXXXXXX").
 * @param {Document} [doc=document]
 * @returns {boolean} true if injected (false if missing id or already present).
 */
function injectGTM(id, doc = document) {
  if (!id) return false;
  const mark = `gtm:${id}`;
  if (alreadyInjected(doc, mark)) return false;

  const win = doc.defaultView || (typeof window !== 'undefined' ? window : undefined);
  if (win) {
    win.dataLayer = win.dataLayer || [];
    win.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
  }

  const script = doc.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
  script.setAttribute(MARK, mark);
  appendHead(doc, script);

  const noscript = doc.createElement('noscript');
  const iframe = doc.createElement('iframe');
  iframe.src = `https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(id)}`;
  iframe.height = '0';
  iframe.width = '0';
  iframe.style.display = 'none';
  iframe.style.visibility = 'hidden';
  noscript.appendChild(iframe);
  noscript.setAttribute(MARK, `${mark}:ns`);
  appendBody(doc, noscript);

  return true;
}

/**
 * Ensure the Meta/Facebook Pixel runtime (`fbq`) is bootstrapped, the
 * `fbevents.js` loader is present, and the pixel is `init`'d for `id`.
 *
 * Idempotent and side-effect-light: it does NOT fire PageView or inject the
 * <noscript> fallback — that is the caller's job (injectPixel does the full
 * page setup; the redirect path uses this to fire events before navigating).
 *
 * @param {string} id  Pixel id.
 * @param {Document} doc
 * @returns {Function|undefined} the `fbq` function, or undefined if unavailable.
 */
function ensureFbq(id, doc) {
  const win = doc.defaultView || (typeof window !== 'undefined' ? window : undefined);
  if (!win) return undefined;

  // Standard fbq bootstrap (idempotent — guards on window.fbq itself).
  if (!win.fbq) {
    const n = (win.fbq = function () {
      n.callMethod
        ? n.callMethod.apply(n, arguments)
        : n.queue.push(arguments);
    });
    if (!win._fbq) win._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
  }

  // Load fbevents.js once (stamped so we never inject it twice).
  if (!alreadyInjected(doc, 'fbevents')) {
    const script = doc.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    script.setAttribute(MARK, 'fbevents');
    appendHead(doc, script);
  }

  // init() per pixel id, once. fbq de-dupes internally too, but the mark keeps
  // our intent explicit and cheap to check.
  if (typeof win.fbq === 'function' && !alreadyInjected(doc, `pixel-init:${id}`)) {
    win.fbq('init', id);
    const marker = doc.createElement('meta');
    marker.setAttribute(MARK, `pixel-init:${id}`);
    appendHead(doc, marker);
  }

  return typeof win.fbq === 'function' ? win.fbq : undefined;
}

/**
 * Inject the Meta/Facebook Pixel base code: the fbq bootstrap + loader script,
 * an init + PageView call, and a <noscript> tracking-image fallback.
 * @param {string} id  Pixel id.
 * @param {Document} [doc=document]
 * @returns {boolean} true if injected (false if missing id or already present).
 */
function injectPixel(id, doc = document) {
  if (!id) return false;
  const mark = `pixel:${id}`;
  if (alreadyInjected(doc, mark)) return false;

  const fbq = ensureFbq(id, doc);
  if (fbq) fbq('track', 'PageView');

  // Stamp the page-level pixel mark so injectPixel itself is idempotent.
  const marker = doc.createElement('meta');
  marker.setAttribute(MARK, mark);
  appendHead(doc, marker);

  const noscript = doc.createElement('noscript');
  const img = doc.createElement('img');
  img.height = '1';
  img.width = '1';
  img.style.display = 'none';
  img.src = `https://www.facebook.com/tr?id=${encodeURIComponent(id)}&ev=PageView&noscript=1`;
  noscript.appendChild(img);
  noscript.setAttribute(MARK, `${mark}:ns`);
  appendBody(doc, noscript);

  return true;
}

/**
 * Fire Meta Pixel events for a redirect hop, BEFORE navigation.
 *
 * Fires a standard `PageView` plus a custom `Redirect` event carrying the page
 * we're leaving and the destination, so every ad click is captured no matter
 * which landing page or rotator the redirect points at.
 *
 *   fbq('track', 'PageView')
 *   fbq('trackCustom', 'Redirect', { source_url, redirect_url })
 *
 * Note: this only QUEUES the beacons with fbq. The caller is responsible for
 * giving them a moment to flush before tearing the page down (see the delay in
 * maybeRedirect) — otherwise navigation can cancel the in-flight request.
 *
 * @param {string} id           Meta Pixel id.
 * @param {string} sourceUrl    The current page URL (window.location.href).
 * @param {string} redirectUrl  The resolved redirect target.
 * @param {Document} doc
 * @returns {boolean} true if events were queued (false if pixel unavailable).
 */
function firePixelRedirectEvents(id, sourceUrl, redirectUrl, doc) {
  if (!id || !doc) return false;
  const fbq = ensureFbq(id, doc);
  if (!fbq) return false;

  fbq('track', 'PageView');
  fbq('trackCustom', 'Redirect', {
    source_url: sourceUrl,
    redirect_url: redirectUrl,
  });
  return true;
}

/**
 * Inject arbitrary custom pixel/tracking snippets (raw HTML).
 *
 * Snippets are parsed via <template> and their nodes adopted into the document.
 * Crucially, <script> elements created by innerHTML do NOT execute, so each one
 * is rebuilt as a fresh <script> node (attributes + inline code copied) which
 * the browser will run. Non-script nodes (e.g. <img>, <noscript>) are appended
 * as-is.
 * @param {string[]} snippets
 * @param {Document} [doc=document]
 * @returns {number} count of top-level nodes injected.
 */
function injectCustom(snippets, doc = document) {
  if (!Array.isArray(snippets) || snippets.length === 0) return 0;
  let count = 0;

  snippets.forEach((snippet, i) => {
    if (!snippet) return;
    const tpl = doc.createElement('template');
    tpl.innerHTML = String(snippet);

    Array.from(tpl.content.childNodes).forEach((node) => {
      let toAppend = node;
      if (node.nodeName === 'SCRIPT') {
        // Rebuild so the browser executes it.
        const fresh = doc.createElement('script');
        for (const attr of Array.from(node.attributes)) {
          fresh.setAttribute(attr.name, attr.value);
        }
        fresh.text = node.textContent || '';
        toAppend = fresh;
      }
      if (toAppend.setAttribute) toAppend.setAttribute(MARK, `custom:${i}`);
      appendHead(doc, toAppend);
      count += 1;
    });
  });

  return count;
}

/**
 * Run all configured tracking injections (GTM, Pixel, custom snippets).
 * @param {Required<import('./config.js').WERedirectConfig>} config
 * @param {Document} [doc=(typeof document !== 'undefined' ? document : undefined)]
 */
function injectTracking(config, doc = (typeof document !== 'undefined' ? document : undefined)) {
  if (!doc) {
    log(config, 'no document available; skipping tracking injection');
    return;
  }

  if (config.gtm) {
    const ok = injectGTM(config.gtm, doc);
    log(config, ok ? 'GTM injected:' : 'GTM skipped (present/invalid):', config.gtm);
  }
  if (config.pixel) {
    const ok = injectPixel(config.pixel, doc);
    log(config, ok ? 'Pixel injected:' : 'Pixel skipped (present/invalid):', config.pixel);
  }
  if (config.pixels && config.pixels.length) {
    const n = injectCustom(config.pixels, doc);
    log(config, `custom snippets injected: ${n} node(s)`);
  }
}

/**
 * URL-parameter redirect logic.
 *
 * Designed to run from the <head> as early as possible so the redirect fires
 * before the rest of the page renders, making the hop as seamless as possible.
 */


/** Schemes we are willing to redirect to. Blocks javascript:, data:, etc. */
const SAFE_SCHEME = /^https?:\/\//i;

/**
 * Best-effort decode of a query value without corrupting an already-plain URL.
 * A plain "https://..." decodes to itself; a percent-encoded value is decoded.
 * Malformed encodings (which decodeURIComponent throws on) fall back to raw.
 */
function softDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Extract the target redirect URL from a query string.
 *
 * In greedy mode (default), everything after `param=` is treated as the target,
 * so a plain target URL carrying its own &params is preserved intact:
 *   ?r=https://example.com/p?a=1&b=2  ->  "https://example.com/p?a=1&b=2"
 *
 * In non-greedy mode the value ends at the first &.
 *
 * The param is matched only as a real query token (start-of-query or after an
 * `&`), so a `param` substring inside another key/value won't false-match.
 *
 * @param {string} search  location.search (may start with "?").
 * @param {string} param   Param name to look for.
 * @param {boolean} greedy
 * @returns {string|null}  The target URL, or null if the param is absent/empty.
 */
/** Strip a leading "?" and any trailing "#fragment"; return the bare query. */
function normalizeQuery(search) {
  let query = String(search || '');
  if (query[0] === '?') query = query.slice(1);
  const hashIndex = query.indexOf('#');
  if (hashIndex !== -1) query = query.slice(0, hashIndex);
  return query;
}

/**
 * Locate `param=` as a real query TOKEN (at index 0, or right after an '&').
 * @returns {number} index of the token start, or -1 if not present.
 */
function findParamToken(query, param) {
  const needle = `${param}=`;
  let from = 0;
  while (from <= query.length) {
    const idx = query.indexOf(needle, from);
    if (idx === -1) return -1;
    if (idx === 0 || query[idx - 1] === '&') return idx;
    from = idx + 1;
  }
  return -1;
}

function extractTarget(search, param, greedy) {
  if (!search || !param) return null;

  const query = normalizeQuery(search);
  if (!query) return null;

  const at = findParamToken(query, param);
  if (at === -1) return null;

  const valueStart = at + param.length + 1; // +1 for '='
  let rawValue;
  if (greedy) {
    // Everything to the end of the query string is the target URL.
    rawValue = query.slice(valueStart);
  } else {
    const amp = query.indexOf('&', valueStart);
    rawValue = amp === -1 ? query.slice(valueStart) : query.slice(valueStart, amp);
  }

  if (!rawValue) return null;
  return softDecode(rawValue);
}

/**
 * Collect the OTHER query params (everything except our redirect `param`) so
 * they can be forwarded onto the target URL.
 *
 * In greedy mode the target is "everything after `param=`", so only the params
 * BEFORE the `param=` token are forwardable — anything after it belongs to the
 * target URL itself. In non-greedy mode, params on both sides of `param` are
 * forwarded.
 *
 * @param {string} search  location.search.
 * @param {string} param   Our redirect param name (excluded from the result).
 * @param {boolean} greedy
 * @returns {string}  A query fragment WITHOUT a leading '?', e.g. "utm=x&a=1"
 *                    (empty string if there are none).
 */
function collectForwardParams(search, param, greedy) {
  const query = normalizeQuery(search);
  if (!query) return '';

  const at = findParamToken(query, param);

  let scope;
  if (at === -1) {
    scope = query; // our param absent — forward the whole query
  } else if (greedy) {
    scope = query.slice(0, at ? at - 1 : 0); // before the '&' that precedes param
  } else {
    const valueStart = at + param.length + 1;
    const amp = query.indexOf('&', valueStart);
    const before = at ? query.slice(0, at - 1) : '';
    const after = amp === -1 ? '' : query.slice(amp + 1);
    scope = [before, after].filter(Boolean).join('&');
  }

  // Defensively drop any stray `param=` pairs from the forwarded scope.
  const kept = scope
    .split('&')
    .filter((pair) => pair && pair.split('=')[0] !== param);
  return kept.join('&');
}

/**
 * Append forwarded query params to a target URL, preserving the target's own
 * existing query and #fragment. Uses '?' if the target has no query yet, else '&'.
 * @param {string} target
 * @param {string} forward  Query fragment without a leading '?'.
 * @returns {string}
 */
function mergeParams(target, forward) {
  if (!forward) return target;

  const hashIndex = target.indexOf('#');
  const base = hashIndex === -1 ? target : target.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? '' : target.slice(hashIndex);

  const sep = base.indexOf('?') === -1 ? '?' : '&';
  return `${base}${sep}${forward}${fragment}`;
}

/**
 * Perform the redirect if a valid, safe target is present.
 * @param {Required<import('./config.js').WERedirectConfig>} config
 * @param {Window} [win=window]
 * @returns {boolean} true if a redirect was triggered.
 */
function maybeRedirect(config, win = (typeof window !== 'undefined' ? window : undefined)) {
  if (!win || !win.location) return false;

  let target = extractTarget(win.location.search, config.param, config.greedy);
  if (!target) {
    log(config, 'no redirect param present; continuing to tracking');
    return false;
  }

  if (!SAFE_SCHEME.test(target)) {
    log(config, 'redirect target rejected (unsafe scheme):', target);
    return false;
  }

  // Optionally forward the page's other query params (everything except our
  // redirect param) onto the target — e.g. carry UTMs/click ids through the hop.
  if (config.forwardParams) {
    const forward = collectForwardParams(win.location.search, config.param, config.greedy);
    if (forward) {
      target = mergeParams(target, forward);
      log(config, 'forwarded params onto target:', forward);
    }
  }

  const go = () => {
    log(config, 'redirecting to', target, config.replace ? '(replace)' : '(assign)');
    try {
      if (config.replace) {
        win.location.replace(target);
      } else {
        win.location.href = target;
      }
    } catch (err) {
      log(config, 'redirect failed:', err);
    }
  };

  // OPT-IN (config.trackRedirect): when a Meta Pixel is configured, fire
  // PageView + a custom "Redirect" event BEFORE navigating, so the click is
  // captured on the redirector itself regardless of destination. We then
  // redirect after a brief delay so the beacon can leave the browser
  // (navigation can cancel an in-flight pixel request). Off by default —
  // most redirects land on a page that already carries the pixel.
  if (config.trackRedirect && config.pixel) {
    const doc = win.document;
    const fired = doc
      ? firePixelRedirectEvents(config.pixel, win.location.href, target, doc)
      : false;

    if (fired) {
      const delay = Math.max(0, Number(config.pixelDelay) || 0);
      log(config, `pixel events queued; redirecting after ${delay}ms`);
      if (delay > 0 && typeof win.setTimeout === 'function') {
        win.setTimeout(go, delay);
        return true;
      }
    }
  }

  go();
  return true;
}

/**
 * @whittaker-edwards/redirect-js — public entry point.
 *
 * Behavior, in order:
 *   1. Resolve config.
 *        - Browser/CDN: read data-we-* attributes off the executing <script>.
 *        - npm:         pass an options object to init(config).
 *   2. If the redirect param is present and valid -> redirect immediately
 *      (before anything else on the page), as seamlessly as possible.
 *   3. Otherwise -> inject configured tracking (GTM / Meta Pixel / custom pixels).
 *
 * Usage (CDN / <head> drop-in, auto-runs — config via attributes):
 *   <script
 *     src="https://cdn.jsdelivr.net/npm/@whittaker-edwards/redirect-js/dist/we.redirect.min.js"
 *     data-we-param="r"
 *     data-we-gtm="GTM-XXXXXXX"
 *     data-we-pixel="000000000000000"></script>
 *
 * Usage (npm):
 *   import { init } from '@whittaker-edwards/redirect-js';
 *   init({ param: 'r', gtm: 'GTM-XXXXXXX', pixel: '000000000000000' });
 */


/**
 * Resolve config and run the redirect-or-track flow once.
 * @param {import('./config.js').WERedirectConfig} [config]
 * @returns {{ redirected: boolean, config: Required<import('./config.js').WERedirectConfig> }}
 */
function init(config) {
  const resolved = resolveConfig(config);
  const redirected = maybeRedirect(resolved);
  if (!redirected) {
    injectTracking(resolved);
  }
  return { redirected, config: resolved };
}

/** ATTR_MAP values, used to detect whether a script tag carries our config. */
const WE_ATTRS = Object.values(ATTR_MAP);

/** True if the element declares at least one data-we-* attribute. */
function hasWeAttrs(el) {
  return !!el && typeof el.hasAttribute === 'function' && WE_ATTRS.some((a) => el.hasAttribute(a));
}

/**
 * Locate the executing/owning <script> tag for the CDN drop-in.
 * Prefers document.currentScript (set while the classic <script> runs); falls
 * back to scanning for any <script> bearing data-we-* attributes — which also
 * covers async/deferred loads where currentScript is null at module-eval time.
 */
function findConfigScript(doc) {
  const current = doc.currentScript;
  if (hasWeAttrs(current)) return current;
  const tagged = doc.querySelectorAll('script[data-we-param], script[data-we-gtm], script[data-we-pixel], script[data-we-pixels], script[data-we-greedy], script[data-we-replace], script[data-we-debug]');
  return tagged.length ? tagged[tagged.length - 1] : null;
}

/**
 * Auto-run when loaded as a plain <script> in the browser (the CDN/.min.js path).
 * Reads config from the executing script tag's data-we-* attributes, then init()s.
 *
 * Stays inert under npm/bundler/test use: it only runs when a <script> tag
 * carrying our data-we-* attributes is found, which never happens when a
 * consumer imports this module into their own bundle.
 */
function autoRun() {
  if (typeof document === 'undefined') return;
  const scriptEl = findConfigScript(document);
  if (!scriptEl) return;
  init(readScriptConfig(scriptEl));
}

autoRun();

var index = { init };

export { ATTR_MAP, DEFAULTS, index as default, extractTarget, init };
//# sourceMappingURL=we.redirect.esm.js.map
