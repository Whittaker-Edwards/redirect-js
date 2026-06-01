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
 * Append forwarded query params to a target URL, preserving the target's own
 * existing query and #fragment. Uses '?' if the target has no query yet, else '&'.
 * @param {string} target
 * @param {string} forward  Query fragment without a leading '?'.
 * @returns {string}
 */
export function mergeParams(target, forward) {
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
