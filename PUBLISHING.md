# Publishing Guide

How to publish `@whittaker-edwards/redirect-js` to the public npm registry so it
can be installed with `npm install` / `yarn add` and served from a CDN.

> You only need to do this once to learn it; afterwards it's `npm version` +
> `npm publish` each release.

---

## Distribution model (read first)

This package is published **public** under a **scoped** name
(`@whittaker-edwards/...`). That is a deliberate, lowest-friction choice for
clients:

- **npm access ≠ GitHub access.** Clients install the *published package* from
  the npm registry; they never need access to (or knowledge of) the GitHub repo.
  You can keep the **source repo private** while the **published package is
  public** — the two are independent systems.
- **Public = zero client friction.** A public package installs with a plain
  `npm install` / `yarn add` — no npm account, no invite, no auth token — and is
  the **only** way the `<script src="cdn.jsdelivr.net/npm/...">` CDN drop-in
  works. CDNs do not serve private packages.
- **Nothing is lost by going public.** This is browser code: `we.redirect.min.js`
  is already served to every visitor of a client's page, so there is no secret to
  protect by making the npm package private. Private npm (a paid feature) would
  add account/token friction to guard code that isn't actually hidden.
- **Private npm** would instead require every client to have an npm account, be
  granted org/team access or a token, and `npm login` in their environment —
  high friction, and it breaks the CDN path. Avoid it for this project.

Net: the `whittaker-edwards` org keeps your branding; `--access public` (step 4)
keeps client onboarding to a single copy-paste.

---

## 0. One-time prerequisites

1. **An npm account** — sign up at <https://www.npmjs.com/signup> (free).
2. **The organization scope.** This package is **scoped**: its name starts with
   `@whittaker-edwards/`. The `whittaker-edwards` org must exist on npm and your
   account must be a member.
   - Create it at <https://www.npmjs.com/org/create> (the free "unlimited public
     packages" tier is fine for public packages).
   - Or, if you don't want an org, rename the package to an unscoped name in
     `package.json` (e.g. `we-redirect-js`) — see the note in step 4.
3. **Node + npm installed** (already true here — `npm --version` works).

---

## 1. Log in from the terminal

```bash
npm login
```

Follow the browser prompt. Verify with:

```bash
npm whoami      # should print your npm username
```

> Yarn uses the same registry and the same login. `npm login` is enough even if
> consumers later install with `yarn`.

---

## 2. Pre-flight checks

Make sure what you ship is correct and complete.

```bash
npm test                 # all tests pass
npm run build            # regenerate dist/ from src/
npm pack --dry-run       # preview the EXACT files that will be published
```

`npm pack --dry-run` is the most important check — it prints the file list that
goes into the tarball. It should include `dist/`, `src/`, `README.md`, and
`LICENSE` (controlled by the `"files"` array in `package.json`) and **nothing
secret** (no `.env`, no `node_modules`).

---

## 3. Set the version (semver)

npm refuses to publish over an existing version, so bump first. Use `npm version`
— it updates `package.json` and creates a git commit + tag for you.

```bash
npm version patch        # 0.1.0 -> 0.1.1   (bug fixes)
npm version minor        # 0.1.0 -> 0.2.0   (new features, backward-compatible)
npm version major        # 0.1.0 -> 1.0.0   (breaking changes)
```

Semantic Versioning in one line: **MAJOR**.**MINOR**.**PATCH** =
breaking.feature.fix. While the API is still settling, staying on `0.x` signals
"not yet stable."

---

## 4. Publish

Because the name is **scoped**, scoped packages are **private by default** and a
plain `npm publish` would fail (private publishing is a paid feature). You must
explicitly mark it public:

```bash
npm publish --access public
```

> **Unscoped alternative:** if you renamed the package to an unscoped name (e.g.
> `we-redirect-js`) in step 0, a plain `npm publish` works and `--access public`
> is unnecessary (unscoped packages are always public). The `prepublishOnly`
> script in `package.json` runs `npm run build` automatically before publish, so
> `dist/` is always fresh.

Confirm it's live:

```bash
npm view @whittaker-edwards/redirect-js version
```

…or open `https://www.npmjs.com/package/@whittaker-edwards/redirect-js`.

---

## 5. How people install it after publish

**npm**

```bash
npm install @whittaker-edwards/redirect-js
```

**yarn**

```bash
yarn add @whittaker-edwards/redirect-js
```

```js
import { init } from '@whittaker-edwards/redirect-js';
init({ param: 'r', gtm: 'GTM-XXXXXXX', pixel: '000000000000000' });
```

**CDN (no install).** Publishing to npm automatically makes the files available
on jsDelivr and unpkg — `package.json` points both at the minified build:

```html
<script
  src="https://cdn.jsdelivr.net/npm/@whittaker-edwards/redirect-js/dist/we.redirect.min.js"
  data-we-param="r"
  data-we-gtm="GTM-XXXXXXX"></script>
```

Pin a version for production stability (an un-pinned URL serves "latest" and can
change under you):

```html
<script src="https://cdn.jsdelivr.net/npm/@whittaker-edwards/redirect-js@1.0.0/dist/we.redirect.min.js"></script>
```

---

## 6. Publishing later versions

Each subsequent release is just:

```bash
npm test && npm run build
npm version patch          # or minor / major
npm publish --access public
git push --follow-tags     # push the version commit + tag to GitHub
```

Update `CHANGELOG.md` (move the `[Unreleased]` notes under the new version
number) as part of the release.

---

## Troubleshooting

| Error | Cause / fix |
| --- | --- |
| `402 Payment Required` | Scoped package published without `--access public`. Re-run with that flag. |
| `403 Forbidden` | Not logged in, or not a member of the `whittaker-edwards` org. Check `npm whoami` and org membership. |
| `You cannot publish over the previously published version` | Bump the version with `npm version` first. |
| `ENEEDAUTH` | Run `npm login`. |
| Name `@whittaker-edwards/...` not found on install | The org/package isn't published yet, or the consumer typo'd the scope. |
