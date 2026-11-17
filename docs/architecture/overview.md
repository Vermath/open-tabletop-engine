# Architecture Overview

OpenTabletop Engine follows the PRD's API-first shape:

- Browser client uses REST for domain CRUD and WebSocket events for permission-filtered realtime scene and campaign state.
- API server owns campaigns, worlds, scenes, actors/items, journals/handouts, sessions, encounters/combat, canonical memory, proposals, audit-friendly events, scoped import/export, durable system installations, plugin registries/event delivery, and AI thread entrypoints.
- Shared packages define stable contracts for core data, permissions, dice, plugins, systems, AI providers, API routes, and the TypeScript API client.
- Docker Compose starts MinIO, the single-writer API, and the web client. The API persists campaign state through the SQLite record store at `storage/opentabletop.sqlite`, with schema migrations in `apps/api/src/sqlite-store.ts`; MinIO/S3-compatible storage owns asset bytes. PostgreSQL and Redis are not implied by the shipped topology and should be added only if a measured future architecture requires them.

The AI agent's existing governed proposal and automatic-execution modes are both first-class product behavior. AI actions run under the caller's readable context, permissions, revisions, validation, and audit trail; proposal review is available when that mode is selected, not imposed universally. Plugin code uses typed, permission-checked application commands and never writes storage directly. Applying a proposal captures a domain-aware inverse change set so reviewed work remains auditable and reversible. AI provider context is built from the caller's readable state and approved canonical memory only; hidden prep and candidate/rejected/retconned facts are excluded.

Portable archives can cover a complete campaign, one dependency-closed world, or selected record collections. Operational authentication secrets, sessions, MFA, SCIM source data, plugin reviews, idempotency records, jobs, and organization records are never included in portable campaign exports.

The browser applies supported realtime event payloads directly to its local snapshot and bounds high-volume chat and dice histories to 200 entries. Events that need derived data coalesce into narrow vision or lore reconciliation requests; unsupported or cascade-sensitive events fall back to one debounced campaign snapshot. A successful reconnect always performs a fresh permission-filtered snapshot before the UI reports the table ready. Campaign snapshots retain the complete active campaign graph but bound each append-only history collection after permission filtering, prioritizing actionable rows before the newest completed history and returning explicit total/returned/truncated metadata.
