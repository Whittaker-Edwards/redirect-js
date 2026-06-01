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

import { resolveConfig, readScriptConfig, ATTR_MAP } from './config.js';
import { maybeRedirect } from './redirect.js';
import { injectTracking } from './tracking.js';

export { DEFAULTS, ATTR_MAP } from './config.js';
export { extractTarget } from './redirect.js';

/**
 * Resolve config and run the redirect-or-track flow once.
 * @param {import('./config.js').WERedirectConfig} [config]
 * @returns {{ redirected: boolean, config: Required<import('./config.js').WERedirectConfig> }}
 */
export function init(config) {
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

export default { init };
