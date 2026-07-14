# Contributing

OpenTabletop Engine is organized as a TypeScript monorepo. Keep changes API-first: if the UI can perform an action, the public API must expose the same capability.

## Local Setup

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm --filter @open-tabletop/api dev
pnpm --filter @open-tabletop/web dev
```

## Expectations

- Add tests for shared package behavior and permission boundaries.
- Keep campaign data portable.
- Preserve the AI agent's existing governed manual and automatic-execution modes. Route plugin changes through typed, permission-checked application commands rather than direct storage writes.
- Do not bundle proprietary tabletop content, Roll20 assets/workflows, D&D Beyond content, or non-SRD D&D material.
- Keep public demo content original, SRD, open, or otherwise legally reusable.
- Keep SDK packages reusable under their package licenses; do not pull AGPL-only platform code into MIT SDK surfaces.
