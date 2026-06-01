# Architecture

How the pieces fit together, for an agent that needs to modify behavior.

## Runtime flow

```
page loads script in <head>
        │
        ▼
  src/index.js
   ├─ autoRun()  (browser only)
   │    └─ findConfigScript(document)         # locate the <script> with data-we-*
   │         └─ init(readScriptConfig(el))    # build config from attributes
   │
   └─ init(config)  (also the npm entry)
        ├─ resolveConfig(config)              # merge onto DEFAULTS, coerce types
        ├─ maybeRedirect(resolved)            # src/redirect.js
        │     ├─ extractTarget(search, param, greedy)
        │     ├─ reject non-http(s) targets
        │     └─ location.replace(target)  ──► RETURN { redirected: true }
        │
        └─ if NOT redirected:
              injectTracking(resolved)        # src/tracking.js
                ├─ injectGTM(gtm)
                ├─ injectPixel(pixel)
                └─ injectCustom(pixels[])
```

The redirect path short-circuits tracking: a redirecting page must not waste time
firing pixels it's about to navigate away from.

## Module responsibilities

### src/config.js
- `DEFAULTS` — the canonical config shape; its value TYPES drive coercion
  everywhere (a key whose default is boolean is parsed as boolean, etc.).
- `ATTR_MAP` — config key → `data-we-*` attribute name. Single source of truth;
  `index.js` derives its script-detection selectors from this.
- `readScriptConfig(el)` — reads ONLY attributes present on the element; parses
  `data-we-pixels` as a JSON array (fallback `[]`); booleans via `parseBool`.
- `resolveConfig(override)` — merges a partial config onto `DEFAULTS`, drops
  unknown keys, coerces by type, and guarantees a non-empty `param`.
- `log(config, ...args)` — gated `console.log('[we.redirect]', ...)`; no-ops
  unless `config.debug`.

### src/redirect.js
- `extractTarget(search, param, greedy)` — the heart of the redirect feature.
  - Strips leading `?` and trailing `#fragment`.
  - Matches `param=` only as a real query TOKEN (index 0 or preceded by `&`), so
    `or=` won't false-match `r=`.
  - Greedy → slice to end of query; non-greedy → stop at next `&`.
  - `softDecode`s the value (percent-decode, falling back to raw on malformed
    input) so both plain and accidentally-encoded URLs work.
- `maybeRedirect(config, win)` — extracts, enforces `^https?://` (`SAFE_SCHEME`),
  then `location.replace` or `location.href` per `config.replace`. Returns a
  boolean so `init` knows whether to skip tracking. `win` is injectable for tests.

### src/tracking.js
- All injectors build REAL DOM nodes (no `document.write`) so they're safe from
  `<head>` mid-parse. Helpers: `appendHead`, `appendBody`.
- Idempotency: every injected node is stamped `data-we-injected="<mark>"`;
  injectors bail if a matching mark already exists (`alreadyInjected`).
- `injectGTM` — seeds `dataLayer`, appends the async `gtm.js` loader + a
  `<noscript>` iframe fallback.
- `injectPixel` — bootstraps the standard `fbq` stub, appends `fbevents.js`,
  calls `fbq('init', id)` + `fbq('track','PageView')`, adds `<noscript>` img.
- `injectCustom(snippets)` — parses each raw-HTML snippet via `<template>`. NOTE:
  `<script>` nodes created by innerHTML do NOT execute, so each is rebuilt as a
  fresh `<script>` (attrs + inline text copied) before append.
- `injectTracking(config, doc)` — orchestrates the three based on config; `doc`
  is injectable for tests.

### src/index.js
- `init(config)` — the only stateful entry. Returns
  `{ redirected: boolean, config: ResolvedConfig }`.
- `autoRun()` — fires only in a browser AND only when a `<script>` carrying
  `data-we-*` attributes is found (`document.currentScript` preferred, else a
  DOM scan). This is the build-flag-free guard that keeps the SAME bundle inert
  when imported into a consumer's npm build but auto-running as the CDN drop-in.

## Why the auto-run guard matters

ESM, UMD, and the IIFE min.js are ALL built from one `src/index.js`. There is no
build-time "browser vs npm" switch. The runtime guard (presence of a data-we-*
script tag) is what differentiates them, so don't replace it with an env flag.
