# OpenTabletop Engine

OpenTabletop Engine is an API-first virtual tabletop platform for campaigns, scenes, tokens, dice, chat, journals, combat, plugins, system modules, portable campaign data, and permissioned AI assistance.

## Product Principles

1. API-first.
2. Self-hostable by default.
3. No campaign lock-in.
4. Plugins are first-class citizens.
5. Rules systems are data-driven.
6. The GM owns campaign state.
7. AI proposes; humans approve.
8. Secrets are permissioned.
9. Everything important is exportable.
10. Every destructive action is reversible or auditable.

## Apps

- `apps/api`: Fastify REST and WebSocket server.
- `apps/web`: React VTT client.
- `apps/ai-gateway`: provider-agnostic AI gateway entrypoint.
- `apps/worker`: background worker placeholder for exports, imports, and AI jobs.

## Packages

- `packages/core`: domain types, permissions, events, audit, proposals, export schemas.
- `packages/dice-engine`: dice notation parser and roller.
- `packages/api-contracts`: OpenAPI and shared route contracts.
- `packages/api-client`: typed TypeScript API client.
- `packages/plugin-sdk`: permissioned plugin SDK.
- `packages/system-sdk`: data-driven rules-system SDK.
- `packages/ai-core`: provider interface, tools, redaction, proposal helpers.
- `packages/database`: Drizzle-ready schema definitions and migration notes.

## Development

```bash
pnpm install
pnpm dev
```

API defaults to `http://localhost:4000`. Web defaults to `http://localhost:5173`.

## Validation

```bash
pnpm check
```
