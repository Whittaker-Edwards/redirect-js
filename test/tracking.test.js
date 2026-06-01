import { test } from 'node:test';
import assert from 'node:assert/strict';

import { injectGTM, injectPixel, injectTracking } from '../src/tracking.js';

/**
 * Minimal fake DOM — just enough surface for the injectors: createElement,
 * head/body appendChild, querySelector against stamped marks, and attributes.
 */
function makeDoc() {
  const all = [];
  function makeEl(name) {
    const attrs = {};
    const el = {
      nodeName: name.toUpperCase(),
      tagName: name.toUpperCase(),
      children: [],
      style: {},
      attributes: [],
      setAttribute(k, v) {
        attrs[k] = String(v);
        if (!this.attributes.find((a) => a.name === k)) this.attributes.push({ name: k, value: String(v) });
      },
      getAttribute(k) { return k in attrs ? attrs[k] : null; },
      hasAttribute(k) { return k in attrs; },
      appendChild(child) { this.children.push(child); all.push(child); return child; },
      set src(v) { attrs.src = v; }, get src() { return attrs.src; },
      set async(v) { attrs.async = v; }, get async() { return attrs.async; },
      set text(v) { this._text = v; }, get text() { return this._text; },
      _attrs: attrs,
    };
    return el;
  }
  const doc = {
    defaultView: { dataLayer: undefined, fbq: undefined, _fbq: undefined },
    head: makeEl('head'),
    body: makeEl('body'),
    createElement: (n) => makeEl(n),
    querySelector(sel) {
      // Only supports the [data-we-injected="..."] form used by the code.
      const m = sel.match(/\[data-we-injected="(.+)"\]$/);
      if (!m) return null;
      return all.find((el) => el.getAttribute && el.getAttribute('data-we-injected') === m[1]) || null;
    },
  };
  doc.head.appendChild = function (c) { this.children.push(c); all.push(c); return c; };
  doc.body.appendChild = function (c) { this.children.push(c); all.push(c); return c; };
  return { doc, all };
}

test('injectGTM appends a loader script + noscript and seeds dataLayer', () => {
  const { doc, all } = makeDoc();
  assert.equal(injectGTM('GTM-TEST', doc), true);
  const script = all.find((e) => e.nodeName === 'SCRIPT');
  assert.ok(script.src.includes('googletagmanager.com/gtm.js?id=GTM-TEST'));
  assert.ok(Array.isArray(doc.defaultView.dataLayer));
  assert.ok(all.some((e) => e.nodeName === 'NOSCRIPT'));
});

test('injectGTM is idempotent (no double inject)', () => {
  const { doc } = makeDoc();
  assert.equal(injectGTM('GTM-DUP', doc), true);
  assert.equal(injectGTM('GTM-DUP', doc), false);
});

test('injectGTM returns false with no id', () => {
  const { doc } = makeDoc();
  assert.equal(injectGTM('', doc), false);
});

test('injectPixel bootstraps fbq and appends loader + noscript img', () => {
  const { doc, all } = makeDoc();
  assert.equal(injectPixel('123', doc), true);
  assert.equal(typeof doc.defaultView.fbq, 'function');
  const script = all.find((e) => e.nodeName === 'SCRIPT');
  assert.ok(script.src.includes('connect.facebook.net'));
  const img = all.find((e) => e.nodeName === 'IMG');
  assert.ok(img.src.includes('facebook.com/tr?id=123'));
});

test('injectTracking runs only configured channels', () => {
  const { doc, all } = makeDoc();
  injectTracking({ gtm: 'GTM-X', pixel: '', pixels: [], debug: false }, doc);
  assert.ok(all.some((e) => e.src && e.src.includes('gtm.js?id=GTM-X')));
  assert.ok(!all.some((e) => e.src && e.src.includes('connect.facebook.net')));
});
