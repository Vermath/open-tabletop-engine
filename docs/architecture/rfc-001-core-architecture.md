# RFC-001: Core Architecture

Status: accepted for initial implementation.

The core is a TypeScript monorepo with independently buildable apps and packages. Every user-facing action should map to a public API route and produce an event suitable for realtime broadcast, replay, audit, or AI summarization.

The first implementation uses file-backed state for fast local iteration. The data model and Docker Compose services prepare the repository for PostgreSQL, Redis, and object storage migration.
