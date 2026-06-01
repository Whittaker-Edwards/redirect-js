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

## D12 — Track-the-redirect pixel event is OPT-IN (default off)

`trackRedirect` (`data-we-track-redirect`) defaults **false**. Only when on (and
a `pixel` is set) does the redirect fire a Meta `PageView` + custom `Redirect`
event (`{ source_url, redirect_url }`) BEFORE navigating. Rationale (client,
2026-06-01): firing pre-redirect requires a `pixelDelay` (default 120ms) so the
beacon flushes before navigation cancels it — i.e. it adds latency to the hop.
Most redirects land on a page that already carries the pixel, so this latency
should be a deliberate per-client choice, not a default tax. Implemented in
`firePixelRedirectEvents` (tracking.js) + the delay branch in `maybeRedirect`.
Two faster alternatives (image-beacon `onload`, fbq callback) were considered
and rejected as more complexity than warranted.

## D13 — Param forwarding is ON by default (opt OUT)

`forwardParams` (`data-we-forward-params`) defaults **true**: the page's other
query params (everything except `r`) are appended onto the redirect target so
UTMs/click-ids survive the hop. Clients opt out with
`data-we-forward-params="false"`. Note the asymmetry with D12 — forwarding is
cheap and almost always wanted (attribution), so it's opt-out; pre-redirect pixel
firing costs latency, so it's opt-in. Greedy-mode caveat: only params BEFORE
`r=` are forwardable (everything after `r=` is the target URL itself). See
`collectForwardParams` + `mergeParams` in redirect.js.

## D14 — Ad-network click ids preserved UNCONDITIONALLY

`preserve` (`data-we-preserve`, comma-separated) defaults to
`['fbclid','gclid','gbraid','wbraid']`. Unlike forwardParams (D13), these are
carried onto the target **regardless** of forwardParams AND regardless of where
they sit relative to `r=`. Rationale (client, 2026-06-01): the ad platform
appends the click id at click time, so its position (before/after `r=`) is out
of our control, and losing it breaks conversion attribution. Verified via web
search: Meta uses `fbclid`; Google Ads uses `gclid` plus the iOS-privacy
identifiers `gbraid` (web→app) and `wbraid` (in-app→web) — one or the other
appears per click context, so both are preserved.

Implementation notes:

- `findParamValue` locates a param ANYWHERE in `location.search` (incl. after
  `r=`, where greedy mode would have swallowed it into the target) and returns
  its LAST occurrence (most-recent wins).
- `preserveParams` resolves each id's most-recent value and hands it to
  `mergeParams`, which de-dupes — see D15.

## D15 — Query merge is always well-formed (single `?`, no dupes, destination-wins)

`mergeParams(target, additions)` is the single normalization point for building
the final redirect URL. Rules (client-confirmed via bug report, 2026-06-01;
apply to ALL params, not just click ids):

- **Single `?`**: output query always starts with `?`. A greedy-swallowed target
  like `https://d.com/p&fbclid=1` (no `?`, stray leading `&`) is normalized to
  `https://d.com/p?fbclid=1`. mergeParams splits the target query at the first
  `?` OR (if none) the first `&`.
- **No duplicates**: each key appears at most once. A key duplicated within the
  target's own query collapses to its LAST value.
- **Destination wins**: an `addition` (forwarded/preserved source param) only
  fills a key the target does NOT already have. A value the client deliberately
  authored into the target URL is never overridden by an incidental same-named
  landing-page param. (Rejected alternatives: landing-page-wins, and
  most-recent-by-string-position.)

Bug that drove this: `?fbclid=321&r=https://go.enduramind.net/test&fbclid=123`
previously produced `...test&fbclid=123?fbclid=321` (stray `&`, duplicate, stale
value). Now → `...test?fbclid=123`. Regression-locked in redirect.test.js.

Note `collectForwardParams` still slices the before/after-`r=` scope to decide
WHICH keys to forward, but maybeRedirect re-resolves each forwarded key's VALUE
via `findParamValue` (whole-query, last-wins) before merging.

## Open / future considerations

- npm scope `@whittaker-edwards` not yet confirmed as registered/owned (org must
  be created before first publish — see D11).
- License is proprietary (`UNLICENSED` in package.json) despite `private: false`.
