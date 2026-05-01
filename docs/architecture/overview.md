# Architecture Overview

OpenTabletop Engine follows the PRD's API-first shape:

- Browser client uses REST for CRUD and WebSocket events for realtime scene state.
- API server owns campaign state, proposals, audit-friendly events, import/export, system registries, plugin registries, and AI thread entrypoints.
- Shared packages define stable contracts for core data, permissions, dice, plugins, systems, AI providers, API routes, and the TypeScript API client.
- Docker Compose starts PostgreSQL, Redis, MinIO, API, and web services. The API now persists campaign state through a SQLite record store at `storage/opentabletop.sqlite`, with schema migrations in `apps/api/src/sqlite-store.ts`. PostgreSQL remains in the stack for the longer-term database adapter milestone.

The implementation intentionally keeps AI and plugins from directly mutating campaign state. They draft `Proposal` records, and the GM approves and applies those changes.
