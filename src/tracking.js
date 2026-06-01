/**
 * Tracking injection — runs only when NO redirect param is present.
 * Injects a GTM container, the Meta/Facebook Pixel, and/or arbitrary custom
 * pixel snippets, based on resolved config.
 *
 * Everything is injected as real DOM nodes (no document.write), so it is safe
 * to call from the <head> after the document has started parsing.
 */

import { log } from './config.js';

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
export function injectGTM(id, doc = document) {
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
export function ensureFbq(id, doc) {
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
export function injectPixel(id, doc = document) {
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
export function firePixelRedirectEvents(id, sourceUrl, redirectUrl, doc) {
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
export function injectCustom(snippets, doc = document) {
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
export function injectTracking(config, doc = (typeof document !== 'undefined' ? document : undefined)) {
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
