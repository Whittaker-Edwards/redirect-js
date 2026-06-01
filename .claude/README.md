# .claude/ — agent context

Committed project knowledge for AI agents (Claude Code and similar). This is the
durable, shared brain for the repo — prefer it over per-session personal memory
so every agent and teammate sees the same context.

## Start here
- [../CLAUDE.md](../CLAUDE.md) — auto-loaded summary: what the project is, repo
  map, commands, locked decisions, conventions. Read first.

## Deep references (`context/`)
- [context/architecture.md](context/architecture.md) — runtime flow, module
  responsibilities, the auto-run guard.
- [context/decisions.md](context/decisions.md) — locked design decisions (D1–D10)
  with rationale and history. Check before changing behavior.
- [context/testing.md](context/testing.md) — how the dependency-free `node:test`
  suite and fake DOM/window work.
- [context/workflows.md](context/workflows.md) — step-by-step procedures (W1–W5)
  for common tasks; each ends green only when build + tests pass.

## Maintenance
Keep these in sync with reality. When you change behavior, update the relevant
doc in the same change — stale context is worse than none. A future agent should
be able to onboard fully from CLAUDE.md + this folder without re-deriving the
design.
