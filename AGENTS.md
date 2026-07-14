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
- Do not modify, restrict, or redesign the existing AI agent behavior unless the task explicitly requests AI changes. In particular, do not convert automatic execution into a proposal-only flow.
- Plugin code must use typed, permission-checked domain commands and must not mutate storage directly.
- When an audit or roadmap implementation is requested in full, treat any "first ten" list as sequencing only: complete every code-addressable finding and list only genuinely external or manual evidence separately.
- Keep permission checks explicit and testable.
- Keep SDK packages permissively reusable even though the platform core is AGPL.
