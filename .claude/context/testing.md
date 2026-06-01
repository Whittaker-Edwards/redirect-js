# Testing guide

The suite uses Node's built-in runner (`node:test` + `node:assert/strict`). No
jsdom, no test framework, no runtime deps.

## Run

```bash
npm test     # node --test "test/**/*.test.js"
```

> The glob is quoted in package.json on purpose: `node --test test/` is
> interpreted by this Node version as a module path, not a directory, and fails
> with MODULE_NOT_FOUND. Keep the quoted glob.

## Files

- `test/redirect.test.js` — `extractTarget` (greedy/non-greedy, token matching,
  fragment stripping, decode) and `maybeRedirect` (replace call, scheme reject,
  no-param) using a fake `window` object.
- `test/config.test.js` — `resolveConfig` coercion/merge and `readScriptConfig`
  attribute parsing using a fake script element (`hasAttribute`/`getAttribute`).
- `test/tracking.test.js` — injectors against a hand-rolled fake `document`
  (`makeDoc()`) that implements just `createElement`, `head/body.appendChild`,
  and a `querySelector` that understands the `[data-we-injected="..."]` selector.

## How to test browser code without a browser

Every function that touches the DOM/window takes the host object as an injectable
parameter (`maybeRedirect(config, win)`, `injectTracking(config, doc)`, etc.).
Tests pass minimal fakes. When adding DOM behavior:

1. Extend `makeDoc()` in `tracking.test.js` with only the surface you need.
2. Keep fakes minimal — they document the exact DOM API the code relies on.
3. Never add jsdom; the zero-dependency property is intentional.

## Coverage expectations

Any new branch in parsing or config coercion needs a case. Current count: 23
tests across the three files. Run `npm test` and confirm `# fail 0` before
finishing a task, and `npm run build` so `dist/` stays in sync with `src/`.
