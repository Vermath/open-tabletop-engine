# Agent Guide

This repository is an API-first virtual tabletop engine. Before editing, inspect the package or app you are changing and keep work scoped.

Useful commands:

```bash
pnpm install
pnpm check
pnpm --filter @open-tabletop/api dev
pnpm --filter @open-tabletop/web dev
```

Rules:

- Prefer existing shared domain types from `packages/core`.
- Do not let AI or plugin code mutate campaign state directly; create proposals.
- Keep permission checks explicit and testable.
- Keep SDK packages permissively reusable even though the platform core is AGPL.
