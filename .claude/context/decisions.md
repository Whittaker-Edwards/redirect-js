# Decision log

Locked design decisions with rationale. Each was confirmed by the client during
scaffolding (2026-06-01). Treat these as requirements; flag before changing.

## D1 — Redirect param is `r`
The README example used `&redirect=`; client chose the short `r` to keep ad URLs
compact. Configurable via `data-we-param` / `init({param})`.

## D2 — Plain (non-encoded) URL value
Client opted for plain URLs over requiring `encodeURIComponent`, because the ad
URLs are hand-assembled. The parser still `softDecode`s, so an encoded value also
works — but the contract/docs assume plain.

## D3 — Greedy capture to end of query
Because the value is a plain URL that may carry its own `?a=1&b=2`, the parser
treats EVERYTHING after `r=` as the target. Consequence baked into docs: **put
`r` last in the ad URL.** Non-greedy mode (`data-we-greedy="false"`) exists for
the stop-at-`&` behavior but is not the default.

## D4 — `location.replace`, fired from `<head>` ASAP
Replace (not assign) so the redirector page leaves no back-button entry — a
seamless hop. Toggle with `data-we-replace="false"`.

## D5 — Split config sources (the big one)
- Browser/CDN: config comes ONLY from `data-we-*` attributes on the script tag.
  The earlier `window.WE_REDIRECT_CONFIG` global was explicitly DROPPED — client
  said attributes are "significantly cleaner."
- npm: `init(config)` object.
- Attribute names are namespaced `data-we-*` to avoid collisions on shared pages.
- `data-we-pixels` is a JSON-encoded array string (raw HTML snippets).

History: this started as a `window` global, then data-attributes were considered
and rejected, then the client reversed and chose data-attributes-only. The
current state (D5) is the final word.

## D6 — Tracking channels: GTM + Meta Pixel + custom snippets
Client selected all three. Generic custom-pixel support takes raw `<script>`/
`<img>` HTML so any third-party tag can be dropped in without a code change.

## D7 — Distribution: UMD + ESM + minified IIFE
- `main` = UMD (`dist/we.redirect.umd.js`) for npm/CommonJS.
- `module` = ESM for modern bundlers.
- `browser`/`unpkg`/`jsdelivr` = minified IIFE for `<head>`/CDN.

## D8 — Dist filenames `we.redirect.*` (dotted)
Client preferred dotted over `we_redirect` underscore — "looks cleaner."

## D9 — `dist/` committed to git
So jsDelivr/GitHub can serve `we.redirect.min.js` straight from the repo (the
"host on a CDN" use case) without an npm publish. `.gitignore` documents this.

## D10 — Safe-scheme allowlist
Only `^https?://` targets redirect; `javascript:`, `data:`, etc. are rejected.
Prevents the open-redirect param from becoming an XSS vector.

## D11 — Public, scoped npm distribution (lowest client friction)

Published **public** under the scoped name `@whittaker-edwards/redirect-js`
(`npm publish --access public`). Rationale (client confirmed 2026-06-01):

- npm package access and GitHub repo access are independent — clients install
  the published package and never need repo access. Source repo can stay private
  while the package is public.
- Public = zero client onboarding (no account/invite/token) and is the ONLY way
  the jsDelivr/unpkg CDN drop-in works.
- This is browser code already served to end users, so private npm would guard
  nothing while adding account/token friction (and breaking the CDN path).

Requires the free `whittaker-edwards` npm org to exist before first publish.
Full reasoning lives in PUBLISHING.md ("Distribution model"). Unscoped public
(e.g. `we-redirect-js`) was offered as a no-org alternative but not chosen.

## Open / future considerations

- npm scope `@whittaker-edwards` not yet confirmed as registered/owned (org must
  be created before first publish — see D11).
- No analytics on redirect events themselves (could fire a pixel pre-redirect if
  the client later wants attribution on the hop).
- License is proprietary (`UNLICENSED` in package.json) despite `private: false`.
