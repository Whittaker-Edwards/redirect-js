/**
 * URL-parameter redirect logic.
 *
 * Designed to run from the <head> as early as possible so the redirect fires
 * before the rest of the page renders, making the hop as seamless as possible.
 */

import { log } from './config.js';
import { firePixelRedirectEvents } from './tracking.js';

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

/**
 * Parse a bare query fragment ("a=1&b=2", no leading '?') into ordered
 * [key, value] pairs. Empty/keyless segments are skipped.
 * @param {string} query
 * @returns {Array<[string,string]>}
 */
function queryToPairs(query) {
  if (!query) return [];
  const pairs = [];
  for (const seg of String(query).split('&')) {
    if (!seg) continue;
    const eq = seg.indexOf('=');
    const key = eq === -1 ? seg : seg.slice(0, eq);
    const val = eq === -1 ? '' : seg.slice(eq + 1);
    if (key) pairs.push([key, val]);
  }
  return pairs;
}

export function extractTarget(search, param, greedy) {
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
export function collectForwardParams(search, param, greedy) {
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
 * Find a single param's raw value ANYWHERE in a query string, regardless of
 * position — including when it sits after our `r=` token (and would otherwise
 * have been swallowed into the greedy target). Matches only as a real token
 * (start, or after '&'). Returns the LAST occurrence's value (most recent wins),
 * or null if absent.
 * @param {string} search  location.search.
 * @param {string} name
 * @returns {string|null}
 */
export function findParamValue(search, name) {
  const query = normalizeQuery(search);
  if (!query || !name) return null;

  const needle = `${name}=`;
  let value = null;
  let from = 0;
  while (from <= query.length) {
    const idx = query.indexOf(needle, from);
    if (idx === -1) break;
    if (idx === 0 || query[idx - 1] === '&') {
      const valueStart = idx + needle.length;
      const amp = query.indexOf('&', valueStart);
      value = amp === -1 ? query.slice(valueStart) : query.slice(valueStart, amp);
    }
    from = idx + 1;
  }
  return value === '' ? null : value;
}

/**
 * Append params to a target URL while keeping the result well-formed:
 *   - Splits target into base + its own query + #fragment.
 *   - Normalizes the delimiter: the query always starts with '?', even if the
 *     target arrived with a stray leading '&' (the greedy "...path&fbclid=..."
 *     case where the URL had no '?').
 *   - Merges the target's own params with `additions`. The TARGET'S OWN params
 *     are authoritative: an addition only fills in a key the target lacks (so a
 *     value the client deliberately wrote into the destination URL wins over an
 *     incidental same-named param from the landing page). Within the target's
 *     own query, a duplicated key collapses to its LAST value.
 *   - Rebuilds a clean "?a=1&b=2" query.
 *
 * @param {string} target
 * @param {Array<[string,string]>} additions  Ordered [key,value] pairs to add.
 * @returns {string}
 */
export function mergeParams(target, additions) {
  const hashIndex = target.indexOf('#');
  const beforeHash = hashIndex === -1 ? target : target.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? '' : target.slice(hashIndex);

  // Split the target's own query off its base. The query begins at the first
  // '?' OR (if none) the first '&' — the latter handles the greedy stray-'&'.
  let qStart = beforeHash.indexOf('?');
  if (qStart === -1) qStart = beforeHash.indexOf('&');
  const base = qStart === -1 ? beforeHash : beforeHash.slice(0, qStart);
  const targetQuery = qStart === -1 ? '' : beforeHash.slice(qStart + 1);

  const order = [];
  const byKey = new Map();
  const set = (key, val) => {
    if (!key) return;
    if (!byKey.has(key)) order.push(key);
    byKey.set(key, val);
  };

  // 1) Target's own params first. A duplicate key here collapses LAST-wins.
  for (const seg of targetQuery.split('&')) {
    if (!seg) continue;
    const eq = seg.indexOf('=');
    set(eq === -1 ? seg : seg.slice(0, eq), eq === -1 ? '' : seg.slice(eq + 1));
  }
  // 2) Additions only fill in keys the target does NOT already have.
  for (const [k, v] of additions || []) {
    if (k && !byKey.has(k)) set(k, v);
  }

  if (order.length === 0) return `${base}${fragment}`;
  const query = order.map((k) => `${k}=${byKey.get(k)}`).join('&');
  return `${base}?${query}${fragment}`;
}

/**
 * Carry each named param from the current page onto the target URL, regardless
 * of where it appeared in the source query (before OR after `r=`). For ad-network
 * click ids (fbclid, gclid, …) whose position is set by the ad platform. The
 * most-recent source value wins, and mergeParams de-dupes so the target is never
 * left with two copies.
 * @param {string} target   The (already extracted) redirect target URL.
 * @param {string} search   location.search.
 * @param {string[]} names  Param names to preserve, e.g. ["fbclid"].
 * @returns {string} target with each preserved param present exactly once.
 */
export function preserveParams(target, search, names) {
  if (!Array.isArray(names) || names.length === 0) return target;

  const additions = [];
  for (const name of names) {
    if (!name) continue;
    const value = findParamValue(search, name);
    if (value != null) additions.push([name, value]);
  }
  return additions.length ? mergeParams(target, additions) : target;
}

/**
 * Perform the redirect if a valid, safe target is present.
 * @param {Required<import('./config.js').WERedirectConfig>} config
 * @param {Window} [win=window]
 * @returns {boolean} true if a redirect was triggered.
 */
export function maybeRedirect(config, win = (typeof window !== 'undefined' ? window : undefined)) {
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
  // mergeParams normalizes the target's delimiter (stray '&' -> '?') and de-dupes
  // by key (last wins), so even with nothing forwarded we may want to clean up a
  // greedy-swallowed query — but to stay conservative we only merge when we have
  // params to add.
  if (config.forwardParams) {
    const forward = collectForwardParams(win.location.search, config.param, config.greedy);
    // Resolve each forwarded key to its LAST occurrence across the whole source
    // query (not just the sliced scope), so "most recent wins" holds even when a
    // key appears both before and after `r=`.
    const seen = new Set();
    const pairs = [];
    for (const [key] of queryToPairs(forward)) {
      if (seen.has(key)) continue;
      seen.add(key);
      const value = findParamValue(win.location.search, key);
      if (value != null) pairs.push([key, value]);
    }
    if (pairs.length) {
      target = mergeParams(target, pairs);
      log(config, 'forwarded params onto target:', pairs.map(([k, v]) => `${k}=${v}`).join('&'));
    }
  }

  // ALWAYS preserve click ids (e.g. fbclid) that the ad platform appends at click
  // time, regardless of forwardParams or where they landed relative to `r=`.
  // mergeParams de-dupes (last wins), so a value swallowed into the greedy target
  // and the same id elsewhere collapse to one — the most recent.
  if (config.preserve && config.preserve.length) {
    const withClickIds = preserveParams(target, win.location.search, config.preserve);
    if (withClickIds !== target) {
      log(config, 'preserved click ids onto target:', config.preserve.join(','));
      target = withClickIds;
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
