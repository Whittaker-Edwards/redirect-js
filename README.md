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

| Option    | Type       | Default | Description                                                        |
| --------- | ---------- | ------- | ------------------------------------------------------------------ |
| `param`   | `string`   | `"r"`   | Query param carrying the target URL.                               |
| `greedy`  | `boolean`  | `true`  | Capture everything after `param=` as the URL (plain URLs w/ params). |
| `replace` | `boolean`  | `true`  | Use `location.replace` (no history entry) vs assign.               |
| `gtm`     | `string`   | `""`    | GTM container id, e.g. `GTM-XXXXXXX`.                               |
| `pixel`   | `string`   | `""`    | Meta/Facebook Pixel id.                                            |
| `pixels`  | `string[]` | `[]`    | Raw custom `<script>`/`<img>` snippets.                            |
| `debug`   | `boolean`  | `false` | Console diagnostics.                                               |

**Config sources:**

- **Browser/CDN** — read from `data-we-*` attributes on the script tag: `data-we-param`, `data-we-greedy`, `data-we-replace`, `data-we-gtm`, `data-we-pixel`, `data-we-pixels` (a JSON array string), `data-we-debug`.
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

Implemented and tested — redirect parsing, safe-scheme redirect, and GTM/Pixel/custom tracking injection all work and ship in `dist/`. See `CHANGELOG.md`. Agent/contributor docs live in [.claude/](.claude/).
