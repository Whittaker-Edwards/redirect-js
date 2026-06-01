# REDIRECT.JS (Whittaker & Edwards)

A tiny script that, when attached to a landing page, either **redirects** to a URL supplied via a query parameter or — when no such parameter is present — **injects tracking** (GTM container, Meta Pixel, and/or custom pixels).

## Use Case

When creating a Facebook ad, you are forced to add the website URL link immediately upon creation. When making edits to an ad, if you change the URL it will instead create a new post and remove all comments and other important aspects of the ad without mentioning it to you.

This script lets us create new ads using Post IDs in Facebook to reference existing ads, then append a URL parameter (e.g. `?r={URL}`) which redirects to the URL upon load. We simply add this script to the target landing page so ads can be pointed at a different page or rotator without affecting the ad itself.

## How it works

When the page loads, the script runs as early as possible from the `<head>`:

1. **Redirect path** — if the redirect parameter (default `r`) is present, it redirects immediately, before the rest of the page renders, via `location.replace` (no back-button trap). The URL is taken **as a plain URL**, greedily capturing everything after `r=` so the target may contain its own query params:

   ```text
   https://landing.example.com/?r=https://destination.com/offer?utm_source=fb&utm_campaign=spring
   ```

   > Because the target is captured greedily to the end of the query string, put `r` **last** in the ad URL.

2. **Tracking path** — if the parameter is absent, the script injects whatever tracking is configured (GTM container, Meta/Facebook Pixel, custom pixel snippets) so we can improve tracking on the page.

## Installation

### CDN / drop-in (`<head>`)

Config is read from `data-we-*` attributes on the script tag — no inline JS:

```html
<script
  src="https://cdn.jsdelivr.net/npm/@whittaker-edwards/redirect-js/dist/we.redirect.min.js"
  data-we-param="r"
  data-we-gtm="GTM-XXXXXXX"
  data-we-pixel="000000000000000"></script>
```

Or self-host `dist/we.redirect.min.js` and reference it the same way.

### npm

```bash
npm install @whittaker-edwards/redirect-js
```

```js
import { init } from '@whittaker-edwards/redirect-js';

init({ param: 'r', gtm: 'GTM-XXXXXXX', pixel: '000000000000000' });
```

> Maintainers: see **[PUBLISHING.md](PUBLISHING.md)** for how to publish this
> package to the public npm registry (and CDN) for the first time and on each
> release.

## Configuration

| Option          | Type       | Default | Description                                                        |
| --------------- | ---------- | ------- | ------------------------------------------------------------------ |
| `param`         | `string`   | `"r"`   | Query param carrying the target URL.                               |
| `greedy`        | `boolean`  | `true`  | Capture everything after `param=` as the URL (plain URLs w/ params). |
| `replace`       | `boolean`  | `true`  | Use `location.replace` (no history entry) vs assign.               |
| `forwardParams` | `boolean`  | `true`  | Append the page's OTHER query params (UTMs, …) onto the redirect target. Opt out with `false`. |
| `preserve`      | `string[]` | `["fbclid","gclid","gbraid","wbraid"]` | Ad-network click ids carried onto the target **always** — regardless of `forwardParams` and of whether they land before or after `r=`. |
| `gtm`           | `string`   | `""`    | GTM container id, e.g. `GTM-XXXXXXX`.                               |
| `pixel`         | `string`   | `""`    | Meta/Facebook Pixel id.                                            |
| `pixels`        | `string[]` | `[]`    | Raw custom `<script>`/`<img>` snippets.                            |
| `trackRedirect` | `boolean`  | `false` | Opt in: fire a Meta `PageView` + custom `Redirect` event **before** the redirect (needs `pixel`). Adds `pixelDelay` ms to the hop. |
| `pixelDelay`    | `number`   | `120`   | Only with `trackRedirect`: ms to wait after firing events so the beacon can flush before navigating. |
| `debug`         | `boolean`  | `false` | Console diagnostics.                                               |

### Param forwarding (on by default)

Any query params on the landing page other than `r` are carried onto the
destination, so attribution survives the hop:

```text
https://landing.example.com/?utm_source=fb&fbclid=abc&r=https://dest.com/offer
        ─────────────────────────────────────────────►  https://dest.com/offer?utm_source=fb&fbclid=abc
```

In greedy mode only params **before** `r=` are forwarded (everything after `r=`
is part of the target URL itself). Disable per client with
`data-we-forward-params="false"`.

The merged query is always well-formed: it starts with a single `?`, and each
param appears **at most once** (no duplicates). When the same param name exists
in both the landing-page URL and the destination URL you wrote, the
**destination's value wins** — a param you deliberately put in the target is
never clobbered by an incidental same-named param on the landing page.

### Ad-network click ids (always preserved)

Ad platforms append a click id to the URL **at click time**, so its position
relative to `r=` is out of our control — it can land before or after. These ids
are therefore preserved onto the target **unconditionally** (even with
`forwardParams` off, and de-duplicated so they're never doubled):

| Param | Network |
| --- | --- |
| `fbclid` | Meta / Facebook |
| `gclid` | Google Ads (standard click id) |
| `gbraid` | Google Ads (iOS web→app, privacy-preserving) |
| `wbraid` | Google Ads (iOS in-app→web, privacy-preserving) |

Override the list with `data-we-preserve="fbclid,gclid"` (comma-separated) or
`init({ preserve: ['fbclid'] })`. Set it empty to disable.

### Tracking the redirect itself (opt in)

By default the redirect does **not** fire a pixel — most destinations already
carry one. If a client needs the click captured on the redirector, set
`data-we-track-redirect="true"` (with a `data-we-pixel`). It fires a standard
`PageView` and a custom `Redirect` event (`{ source_url, redirect_url }`) before
navigating, waiting `pixelDelay` ms so the beacon flushes.

**Config sources:**

- **Browser/CDN** — read from `data-we-*` attributes on the script tag: `data-we-param`, `data-we-greedy`, `data-we-replace`, `data-we-forward-params`, `data-we-preserve` (comma-separated), `data-we-gtm`, `data-we-pixel`, `data-we-pixels` (a JSON array string), `data-we-track-redirect`, `data-we-pixel-delay`, `data-we-debug`.
- **npm** — passed programmatically to `init(config)`.

## Build

```bash
npm install
npm run build      # -> dist/we.redirect.esm.js, .umd.js, .min.js
npm run watch      # rebuild on change
npm test           # node --test
```

| File                    | Format | Use                                  |
| ----------------------- | ------ | ------------------------------------ |
| `dist/we.redirect.min.js` | IIFE   | CDN / `<head>` drop-in (`browser`)   |
| `dist/we.redirect.umd.js` | UMD    | npm / CommonJS (`main`)              |
| `dist/we.redirect.esm.js` | ESM    | Modern bundlers (`module`)           |

## Status

**v1.0.0** — stable. Redirect parsing, param forwarding, safe-scheme redirect, optional pre-redirect pixel events, and GTM/Pixel/custom tracking injection all work and ship in `dist/`. The config surface is the stable v1 API. See [CHANGELOG.md](CHANGELOG.md); agent/contributor docs live in [.claude/](.claude/); release steps in [PUBLISHING.md](PUBLISHING.md).
