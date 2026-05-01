# Contributing

OpenTabletop Engine is organized as a TypeScript monorepo. Keep changes API-first: if the UI can perform an action, the public API must expose the same capability.

## Local Setup

```bash
pnpm install
pnpm dev
```

## Expectations

- Add tests for shared package behavior and permission boundaries.
- Keep campaign data portable.
- Route AI and plugin changes through proposals unless a user explicitly approves mutation.
- Do not bundle proprietary tabletop content.
