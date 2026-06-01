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
- 23 dependency-free `node:test` cases (fake DOM/window).
- Agent/contributor docs under `.claude/`.

## [0.1.0] - scaffold

- Initial repository scaffold.
