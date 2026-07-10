# Architecture Overview

OpenTabletop Engine follows the PRD's API-first shape:

- Browser client uses REST for domain CRUD and WebSocket events for permission-filtered realtime scene and campaign state.
- API server owns campaigns, worlds, scenes, actors/items, journals/handouts, sessions, encounters/combat, canonical memory, proposals, audit-friendly events, scoped import/export, durable system installations, plugin registries/event delivery, and AI thread entrypoints.
- Shared packages define stable contracts for core data, permissions, dice, plugins, systems, AI providers, API routes, and the TypeScript API client.
- Docker Compose starts PostgreSQL, Redis, MinIO, API, and web services. The API now persists campaign state through a SQLite record store at `storage/opentabletop.sqlite`, with schema migrations in `apps/api/src/sqlite-store.ts`. PostgreSQL remains in the stack for the longer-term database adapter milestone.

The implementation intentionally keeps AI and plugins from directly mutating campaign state. They draft `Proposal` records, and an authorized human approves and applies those changes. Applying a proposal captures a domain-aware inverse change set, so it can be audited and reverted without bypassing normal campaign permissions. AI provider context is built from the caller's readable state and approved canonical memory only; hidden prep and candidate/rejected/retconned facts are excluded.

Portable archives can cover a complete campaign, one dependency-closed world, or selected record collections. Operational authentication secrets, sessions, MFA, SCIM source data, plugin reviews, idempotency records, jobs, and organization records are never included in portable campaign exports.
