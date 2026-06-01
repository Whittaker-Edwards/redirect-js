# CLAUDE.md — @whittaker-edwards/redirect-js

Project guide for AI agents working in this repo. Read this first, then pull the
deeper docs under [.claude/context/](.claude/context/) as needed.

## What this is

A tiny (~6 KB) browser script that loads in a page's `<head>` and does ONE of two
things on page load:

1. **Redirect** — if a configured URL parameter (default `r`) is present, it
   redirects to that URL immediately via `location.replace`, before the page
   renders. Used so Facebook/Meta ads referenced by Post ID can be re-pointed to
   a new destination via a URL param **without editing the ad** (editing an ad's
   URL destroys its comments/engagement).
2. **Inject tracking** — if the param is absent, it injects configured tracking
   (Google Tag Manager container, Meta/Facebook Pixel, and/or arbitrary custom
   pixel snippets).

See [README.md](README.md) for the user-facing story and [.claude/context/architecture.md](.claude/context/architecture.md) for how it's built.

## Repo map

| Path | Role |
| --- | --- |
| `src/index.js` | Public API (`init`), browser auto-run, exports. Entry point for the bundle. |
| `src/config.js` | `DEFAULTS`, `ATTR_MAP`, `readScriptConfig` (data-we-* attrs), `resolveConfig`, `log`. |
| `src/redirect.js` | `extractTarget` (greedy query parser) + `maybeRedirect` (safe-scheme `location.replace`). |
| `src/tracking.js` | `injectGTM`, `injectPixel`, `injectCustom`, `injectTracking`. |
| `gulpfile.js` | Build: rollup → ESM + UMD, terser → minified IIFE, banner on all. |
| `dist/` | Built artifacts (`we.redirect.{esm,umd,min}.js`). **Committed** (jsDelivr serves from repo). |
| `examples/index.html` | data-we-* drop-in demo. |
| `test/*.test.js` | `node:test` suite (no DOM dep — uses tiny fakes). |

## Commands

```bash
npm install        # one-time
npm run build      # clean + rollup + terser -> dist/
npm run watch      # rebuild on src change
npm test           # node --test, all suites
```

## Non-negotiable design decisions

These were explicitly chosen by the client (Whittaker & Edwards). Do not change
without asking. Full rationale in [.claude/context/decisions.md](.claude/context/decisions.md).

- **Param `r`, plain (non-encoded) URL, captured GREEDILY to end of query** — so
  `?r=https://x.com/p?a=1&b=2` redirects to the whole thing. Put `r` LAST in ad URLs.
- **`location.replace`** (no back-button entry), fired ASAP from `<head>`.
- **Config sources are split:** browser/CDN reads `data-we-*` attributes off the
  script tag ONLY (no `window` global); npm consumers call `init(config)`.
- **Dist filenames use dotted style** `we.redirect.*` (not `we_redirect`).
- **Only `https?:` redirect targets** are allowed (blocks `javascript:`/`data:`).

## Conventions

- Source is ES modules, no TypeScript, no runtime deps. Keep it dependency-free.
- Everything must work injected from `<head>` (no `document.write`; real DOM nodes).
- Guard every browser global (`window`, `document`) so the bundle is import-safe
  under Node/SSR/tests.
- Add a `node:test` case for any new parsing/branching logic; tests use fake
  DOM/window objects, never jsdom.
- After changing `src/`, run `npm run build` AND `npm test` before declaring done.

## Working agreement with the user

- The user (Ryan, ryanjameswhittaker@gmail.com) scaffolds-then-reviews: confirm
  open questions before large changes; don't commit or push unless asked.
- Git remote: `https://github.com/Whittaker-Edwards/redirect-js.git` (capital W&E).
