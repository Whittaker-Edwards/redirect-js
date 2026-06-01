# Agentic workflows

Repeatable procedures for common tasks in this repo. Follow the matching one;
each ends green only when build + tests pass.

## W1 — Add or change config behavior
1. Edit `src/config.js` (`DEFAULTS`/`ATTR_MAP`/`readScriptConfig`/`resolveConfig`).
2. If you added a key: add it to `DEFAULTS` (its value type drives coercion),
   add its `data-we-*` entry to `ATTR_MAP`, and update the selector list in
   `findConfigScript` (src/index.js) AND the README config table.
3. Add `config.test.js` cases (coercion + attribute parse + fallback).
4. `npm run build && npm test`. Update [decisions.md](decisions.md) if the change
   alters a locked decision (and confirm with the user first).

## W2 — Change redirect parsing
1. Edit `src/redirect.js`. Preserve: token-boundary matching, fragment strip,
   `softDecode`, and the `^https?://` allowlist (D10 — security).
2. Add `redirect.test.js` cases, including an adversarial one (e.g. a new
   false-match or scheme bypass attempt).
3. `npm run build && npm test`.

## W3 — Add a tracking channel
1. Write `injectX(id, doc)` in `src/tracking.js`: build real DOM nodes, stamp
   `data-we-injected`, guard with `alreadyInjected`, no `document.write`.
2. Wire it into `injectTracking` behind a config key (W1).
3. Add a `tracking.test.js` case using/extending `makeDoc()`.
4. `npm run build && npm test`.

## W4 — Release / version bump
1. Ensure `dist/` is rebuilt (`npm run build`) — it is committed (D9).
2. Bump `version` in package.json (semver) and move the `[Unreleased]` block in
   CHANGELOG.md to the new version.
3. Do NOT `npm publish` or `git push` unless the user explicitly asks.

## W5 — Verify in a real browser
1. `npm run build`.
2. Open `examples/index.html` with a query like
   `?r=https://example.com/x?a=1&b=2` → expect immediate redirect.
3. Open it with no `?r=` → expect tracking nodes injected (check DevTools for the
   `gtm.js` / `fbevents.js` script tags). Set `data-we-debug="true"` for console
   logs prefixed `[we.redirect]`.

## Multi-agent note
This codebase is small (4 source files). Prefer direct edits over spawning
workflows. Reserve fan-out for genuinely broad tasks (e.g. a security audit of
the redirect/injection surface, or a cross-file refactor) — and only when the
user opts in.
