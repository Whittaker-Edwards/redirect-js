# Changelog

All notable changes to this project are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Project scaffolding: `package.json`, gulp build pipeline (ESM + UMD + minified IIFE), and source module layout (`src/index.js`, `src/config.js`, `src/redirect.js`, `src/tracking.js`).
- Config resolution contract: browser/CDN reads `data-we-*` attributes off the script tag; npm consumers pass an options object to `init(config)`.
- Example drop-in page and test suite.
- **Redirect engine** (`src/redirect.js`): greedy token-boundary query parsing, fragment stripping, percent-decode tolerance, `https?:`-only safe-scheme allowlist, `location.replace`/`href` per config.
- **Tracking injection** (`src/tracking.js`): GTM container, Meta/Facebook Pixel, and arbitrary custom snippet injection via real DOM nodes (no `document.write`), idempotent and `<noscript>`-fallback-complete.
- **Config** (`src/config.js`): type-coerced merge of `data-we-*` attributes / `init(config)` onto defaults, JSON-array `pixels`, gated debug logger.
- Browser auto-run that stays inert under npm/bundler imports.
- **Param forwarding** (`forwardParams`, default ON; `data-we-forward-params`): carries the page's other query params (UTMs, click ids) onto the redirect target. Greedy mode forwards only params before `r=`; `collectForwardParams`/`mergeParams` preserve the target's own query + fragment.
- **Track-the-redirect** (opt in: `trackRedirect` / `data-we-track-redirect`, default OFF): fires a Meta `PageView` + custom `Redirect` event `{ source_url, redirect_url }` before navigating, deferred by `pixelDelay` ms (default 120) so the beacon flushes. `pixelDelay` / `data-we-pixel-delay` configurable.
- 35 dependency-free `node:test` cases (fake DOM/window).
- Agent/contributor docs under `.claude/`.

## [0.1.0] - scaffold

- Initial repository scaffold.
