import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULTS, resolveConfig, readScriptConfig } from '../src/config.js';

test('resolveConfig returns defaults for empty input', () => {
  assert.deepEqual(resolveConfig(), { ...DEFAULTS });
  assert.deepEqual(resolveConfig({}), { ...DEFAULTS });
});

test('resolveConfig merges and coerces overrides', () => {
  const cfg = resolveConfig({ param: ' x ', gtm: 'GTM-ABC', debug: true });
  assert.equal(cfg.param, 'x'); // trimmed
  assert.equal(cfg.gtm, 'GTM-ABC');
  assert.equal(cfg.debug, true);
  assert.equal(cfg.pixel, ''); // untouched default
});

test('resolveConfig coerces string booleans from attribute-style values', () => {
  assert.equal(resolveConfig({ replace: 'false' }).replace, false);
  assert.equal(resolveConfig({ greedy: 'true' }).greedy, true);
});

test('resolveConfig falls back to default param when blank', () => {
  assert.equal(resolveConfig({ param: '' }).param, DEFAULTS.param);
});

test('resolveConfig rejects a non-array pixels value', () => {
  assert.deepEqual(resolveConfig({ pixels: 'oops' }).pixels, DEFAULTS.pixels);
  assert.deepEqual(resolveConfig({ pixels: ['<img>'] }).pixels, ['<img>']);
});

// Minimal fake script element mimicking the DOM attribute API.
function fakeScript(attrs) {
  return {
    hasAttribute: (n) => n in attrs,
    getAttribute: (n) => (n in attrs ? attrs[n] : null),
  };
}

test('readScriptConfig reads only present data-we-* attributes', () => {
  const el = fakeScript({ 'data-we-param': 'r', 'data-we-gtm': 'GTM-XYZ', 'data-we-debug': 'true' });
  const out = readScriptConfig(el);
  assert.deepEqual(out, { param: 'r', gtm: 'GTM-XYZ', debug: true });
});

test('readScriptConfig parses pixels as a JSON array, with safe fallback', () => {
  assert.deepEqual(readScriptConfig(fakeScript({ 'data-we-pixels': '["<img>","<script>x</script>"]' })).pixels, ['<img>', '<script>x</script>']);
  assert.deepEqual(readScriptConfig(fakeScript({ 'data-we-pixels': 'not json' })).pixels, []);
});

test('readScriptConfig returns empty object for null element', () => {
  assert.deepEqual(readScriptConfig(null), {});
});
