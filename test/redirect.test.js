import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractTarget, maybeRedirect, collectForwardParams, mergeParams, findParamValue, preserveParams } from '../src/redirect.js';
import { CLICK_ID_PARAMS } from '../src/config.js';

test('greedy: captures full target URL including its own query params', () => {
  const target = extractTarget('?r=https://example.com/p?a=1&b=2', 'r', true);
  assert.equal(target, 'https://example.com/p?a=1&b=2');
});

test('greedy: strips a trailing #fragment from the captured query', () => {
  const target = extractTarget('?r=https://example.com/p?a=1#frag', 'r', true);
  assert.equal(target, 'https://example.com/p?a=1');
});

test('returns null when the param is absent', () => {
  assert.equal(extractTarget('?utm_source=fb', 'r', true), null);
});

test('non-greedy: value stops at the first &', () => {
  const target = extractTarget('?r=https://example.com/p&x=1', 'r', false);
  assert.equal(target, 'https://example.com/p');
});

test('does not false-match a param name embedded in another key', () => {
  // "or=" contains "r=" but is not the `r` token.
  assert.equal(extractTarget('?or=nope', 'r', true), null);
});

test('matches the param when it is not first in the query', () => {
  const target = extractTarget('?utm=fb&r=https://example.com/x', 'r', true);
  assert.equal(target, 'https://example.com/x');
});

test('percent-encoded target is decoded', () => {
  const target = extractTarget('?r=https%3A%2F%2Fexample.com%2Fp', 'r', true);
  assert.equal(target, 'https://example.com/p');
});

// --- Param forwarding --------------------------------------------------------

test('collectForwardParams (greedy): only params BEFORE r= are forwarded', () => {
  // Everything after r= belongs to the target URL itself.
  assert.equal(collectForwardParams('?utm=x&fbclid=abc&r=https://d.com/p?a=1', 'r', true), 'utm=x&fbclid=abc');
});

test('collectForwardParams (greedy): none before r=', () => {
  assert.equal(collectForwardParams('?r=https://d.com/p', 'r', true), '');
});

test('collectForwardParams (non-greedy): params on both sides forwarded', () => {
  assert.equal(collectForwardParams('?utm=x&r=https://d.com&gclid=y', 'r', false), 'utm=x&gclid=y');
});

test('collectForwardParams: param absent forwards the whole query', () => {
  assert.equal(collectForwardParams('?utm=x&a=1', 'r', true), 'utm=x&a=1');
});

test('mergeParams: appends with ? to a target that has no query', () => {
  assert.equal(mergeParams('https://d.com/p', [['utm', 'x']]), 'https://d.com/p?utm=x');
});

test('mergeParams: merges into the target existing query', () => {
  assert.equal(mergeParams('https://d.com/p?a=1', [['utm', 'x']]), 'https://d.com/p?a=1&utm=x');
});

test('mergeParams: normalizes a stray leading & to ? (greedy-swallowed query)', () => {
  // Greedy can produce "path&fbclid=1" with no '?'; output must use '?'.
  assert.equal(mergeParams('https://d.com/p&fbclid=1', []), 'https://d.com/p?fbclid=1');
});

test('mergeParams: target param is authoritative; addition does not override it', () => {
  // Destination-wins: an addition for a key the target already has is ignored.
  assert.equal(mergeParams('https://d.com/p?fbclid=keep', [['fbclid', 'ignored']]), 'https://d.com/p?fbclid=keep');
  // ...but an addition for a NEW key is appended.
  assert.equal(mergeParams('https://d.com/p?a=1', [['b', '2']]), 'https://d.com/p?a=1&b=2');
  // A key duplicated WITHIN the target query collapses to its last value.
  assert.equal(mergeParams('https://d.com/p?a=1&a=2', []), 'https://d.com/p?a=2');
});

test('mergeParams: preserves the target fragment', () => {
  assert.equal(mergeParams('https://d.com/p?a=1#sec', [['utm', 'x']]), 'https://d.com/p?a=1&utm=x#sec');
});

test('mergeParams: no additions and no query returns target unchanged', () => {
  assert.equal(mergeParams('https://d.com/p', []), 'https://d.com/p');
});

test('maybeRedirect with forwardParams merges other params onto target', () => {
  const calls = [];
  const win = { location: { search: '?utm=spring&r=https://dest.com/o?x=1', replace: (u) => calls.push(u) } };
  const result = maybeRedirect({ param: 'r', greedy: true, replace: true, forwardParams: true, debug: false }, win);
  assert.equal(result, true);
  assert.deepEqual(calls, ['https://dest.com/o?x=1&utm=spring']);
});

test('maybeRedirect without forwardParams leaves target untouched', () => {
  const calls = [];
  const win = { location: { search: '?utm=spring&r=https://dest.com/o', replace: (u) => calls.push(u) } };
  const result = maybeRedirect({ param: 'r', greedy: true, replace: true, forwardParams: false, debug: false }, win);
  assert.equal(result, true);
  assert.deepEqual(calls, ['https://dest.com/o']);
});

// --- Click-id preservation (fbclid / gclid / gbraid / wbraid) ---------------

test('findParamValue finds a param BEFORE r=', () => {
  assert.equal(findParamValue('?fbclid=abc&r=https://d.com/p', 'fbclid'), 'abc');
});

test('findParamValue finds a param AFTER r= (greedy-swallowed position)', () => {
  // FB may append fbclid after our param; findParamValue still locates it.
  assert.equal(findParamValue('?r=https://d.com/p&fbclid=xyz', 'fbclid'), 'xyz');
});

test('findParamValue returns null when absent', () => {
  assert.equal(findParamValue('?r=https://d.com/p', 'fbclid'), null);
});

test('preserveParams appends a missing click id', () => {
  const out = preserveParams('https://d.com/p', '?fbclid=abc&r=https://d.com/p', ['fbclid']);
  assert.equal(out, 'https://d.com/p?fbclid=abc');
});

test('preserveParams does NOT duplicate a click id already on the target', () => {
  // Greedy already swallowed fbclid into the target -> must not append a 2nd.
  const out = preserveParams('https://d.com/p?fbclid=xyz', '?r=https://d.com/p&fbclid=xyz', ['fbclid']);
  assert.equal(out, 'https://d.com/p?fbclid=xyz');
});

test('CLICK_ID_PARAMS covers the major ad-network click ids', () => {
  assert.deepEqual(CLICK_ID_PARAMS, ['fbclid', 'gclid', 'gbraid', 'wbraid']);
});

test('maybeRedirect preserves fbclid that lands AFTER r=, normalizing & to ?', () => {
  const calls = [];
  // Greedy swallows fbclid into the target as "...o&fbclid=abc"; preserve must
  // not dup it AND the stray '&' must be normalized to '?'.
  const win = { location: { search: '?r=https://dest.com/o&fbclid=abc', replace: (u) => calls.push(u) } };
  maybeRedirect(
    { param: 'r', greedy: true, replace: true, forwardParams: false, preserve: ['fbclid'], debug: false },
    win
  );
  assert.deepEqual(calls, ['https://dest.com/o?fbclid=abc']);
});

test('maybeRedirect preserves a gclid that lands BEFORE r= with forwarding off', () => {
  const calls = [];
  const win = { location: { search: '?gclid=g123&r=https://dest.com/o', replace: (u) => calls.push(u) } };
  maybeRedirect(
    { param: 'r', greedy: true, replace: true, forwardParams: false, preserve: ['gclid'], debug: false },
    win
  );
  assert.deepEqual(calls, ['https://dest.com/o?gclid=g123']);
});

test('maybeRedirect: forwarded fbclid (before r=) is not doubled by preserve', () => {
  const calls = [];
  const win = { location: { search: '?fbclid=abc&r=https://dest.com/o', replace: (u) => calls.push(u) } };
  maybeRedirect(
    { param: 'r', greedy: true, replace: true, forwardParams: true, preserve: ['fbclid'], debug: false },
    win
  );
  // forwarded once; preserve resolves the same value -> de-duped to one.
  assert.deepEqual(calls, ['https://dest.com/o?fbclid=abc']);
});

// Regression: the exact URL from the bug report — fbclid both BEFORE and AFTER
// r=. Expect a single, proper '?', no duplicate, and the MOST RECENT value (123).
test('maybeRedirect: duplicate param before & after r= -> one ?, most recent wins', () => {
  const calls = [];
  const win = {
    location: {
      search: '?fbclid=321&r=https://go.enduramind.net/test&fbclid=123',
      replace: (u) => calls.push(u),
    },
  };
  maybeRedirect(
    { param: 'r', greedy: true, replace: true, forwardParams: true, preserve: ['fbclid'], debug: false },
    win
  );
  assert.deepEqual(calls, ['https://go.enduramind.net/test?fbclid=123']);
});

// The same de-dup / most-recent / single-? rule applies to ANY param, not just
// click ids — here a non-click-id `pid` appears twice via forwarding + target.
test('maybeRedirect: dedup + most-recent applies to all forwarded params', () => {
  const calls = [];
  const win = {
    location: { search: '?pid=old&r=https://dest.com/p?pid=new', replace: (u) => calls.push(u) },
  };
  maybeRedirect(
    { param: 'r', greedy: true, replace: true, forwardParams: true, preserve: [], debug: false },
    win
  );
  // pid=new is authored into the target; pid=old is an incidental landing-page
  // param. Destination wins -> the forwarded pid=old does not override it.
  assert.deepEqual(calls, ['https://dest.com/p?pid=new']);
});

test('maybeRedirect uses location.replace for a safe target', () => {
  const calls = [];
  const win = { location: { search: '?r=https://safe.example.com/x', replace: (u) => calls.push(['replace', u]) } };
  const result = maybeRedirect({ param: 'r', greedy: true, replace: true, debug: false }, win);
  assert.equal(result, true);
  assert.deepEqual(calls, [['replace', 'https://safe.example.com/x']]);
});

test('maybeRedirect rejects unsafe schemes (javascript:)', () => {
  let replaced = false;
  const win = { location: { search: '?r=javascript:alert(1)', replace: () => { replaced = true; } } };
  const result = maybeRedirect({ param: 'r', greedy: true, replace: true, debug: false }, win);
  assert.equal(result, false);
  assert.equal(replaced, false);
});

test('maybeRedirect returns false when no param present', () => {
  const win = { location: { search: '?foo=bar', replace: () => {} } };
  const result = maybeRedirect({ param: 'r', greedy: true, replace: true, debug: false }, win);
  assert.equal(result, false);
});

// --- Pixel-before-redirect ---------------------------------------------------

// Minimal browser env: a fake document supporting ensureFbq + a window whose
// setTimeout is captured (not run) for assertion. fbevents.js never loads here,
// so the real fbq stub buffers every call into fbq.queue — which we read back.
function pixelEnv(search) {
  const nodes = [];
  const makeEl = () => {
    const attrs = {};
    return {
      style: {},
      setAttribute: (k, v) => { attrs[k] = String(v); },
      getAttribute: (k) => (k in attrs ? attrs[k] : null),
      appendChild: () => {},
    };
  };
  const doc = {
    createElement: () => { const el = makeEl(); nodes.push(el); return el; },
    head: { appendChild: (n) => nodes.push(n) },
    body: { appendChild: (n) => nodes.push(n) },
    querySelector: (sel) => {
      const m = sel.match(/\[data-we-injected="(.+)"\]$/);
      if (!m) return null;
      return nodes.find((n) => n.getAttribute && n.getAttribute('data-we-injected') === m[1]) || null;
    },
  };
  const scheduled = [];
  const win = {
    document: doc,
    location: { href: 'https://landing.example.com/page', search, replace: () => {} },
    setTimeout: (fn, ms) => { scheduled.push([fn, ms]); return 1; },
  };
  doc.defaultView = win;
  // fbqCalls() reads the buffered calls the real stub queued (minus init/array form).
  const fbqCalls = () => (win.fbq && win.fbq.queue ? win.fbq.queue.map((a) => Array.from(a)) : []);
  return { win, fbqCalls, scheduled };
}

test('maybeRedirect fires PageView + custom Redirect event before navigating', () => {
  const { win, fbqCalls, scheduled } = pixelEnv('?r=https://dest.example.com/offer');
  const replaced = [];
  win.location.replace = (u) => replaced.push(u);

  const result = maybeRedirect(
    { param: 'r', greedy: true, replace: true, pixel: '123', trackRedirect: true, pixelDelay: 120, debug: false },
    win
  );

  assert.equal(result, true);
  const tracks = fbqCalls().filter((c) => c[0] === 'track' || c[0] === 'trackCustom');
  assert.deepEqual(tracks[0], ['track', 'PageView']);
  assert.equal(tracks[1][0], 'trackCustom');
  assert.equal(tracks[1][1], 'Redirect');
  assert.deepEqual(tracks[1][2], {
    source_url: 'https://landing.example.com/page',
    redirect_url: 'https://dest.example.com/offer',
  });
  // Navigation is deferred by the delay, not performed synchronously.
  assert.equal(replaced.length, 0);
  assert.equal(scheduled[0][1], 120);
  // Running the scheduled callback performs the redirect.
  scheduled[0][0]();
  assert.deepEqual(replaced, ['https://dest.example.com/offer']);
});

test('maybeRedirect with pixelDelay=0 redirects synchronously after firing', () => {
  const { win, fbqCalls, scheduled } = pixelEnv('?r=https://dest.example.com/x');
  const replaced = [];
  win.location.replace = (u) => replaced.push(u);

  maybeRedirect(
    { param: 'r', greedy: true, replace: true, pixel: '999', trackRedirect: true, pixelDelay: 0, debug: false },
    win
  );

  assert.ok(fbqCalls().some((c) => c[1] === 'Redirect'));
  assert.equal(scheduled.length, 0); // no deferral
  assert.deepEqual(replaced, ['https://dest.example.com/x']);
});

test('maybeRedirect does NOT fire pixel events when trackRedirect is off (default)', () => {
  const { win, fbqCalls, scheduled } = pixelEnv('?r=https://dest.example.com/y');
  const replaced = [];
  win.location.replace = (u) => replaced.push(u);

  // pixel is set but trackRedirect omitted -> no pre-redirect events, no delay.
  const result = maybeRedirect(
    { param: 'r', greedy: true, replace: true, pixel: '123', trackRedirect: false, pixelDelay: 120, debug: false },
    win
  );

  assert.equal(result, true);
  assert.equal(fbqCalls().length, 0);          // fbq never bootstrapped/fired
  assert.equal(scheduled.length, 0);            // no deferral
  assert.deepEqual(replaced, ['https://dest.example.com/y']); // immediate redirect
});
