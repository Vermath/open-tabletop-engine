# Contributing

OpenTabletop Engine is organized as a TypeScript monorepo. Keep changes API-first: if the UI can perform an action, the public API must expose the same capability.

## Local Setup

```bash
corepack enable # one-time: provides the pinned pnpm from package.json
pnpm install --frozen-lockfile
pnpm check
pnpm --filter @open-tabletop/api dev
pnpm --filter @open-tabletop/web dev
```

The current-source web dev server verifies both the semantic browser/API compatibility version and an exact fingerprint of the API, shared packages, lockfile, and bundled-plugin source before proxying API traffic. Docker images persist their build-time fingerprint. If another retained process, checkout, or Docker stack owns port `4000`, requests fail with `api_compatibility_check_failed` instead of silently exercising that build. Stop the retained API, or point Vite at the intended current-source API explicitly:

```powershell
$env:OTTE_DEV_API_URL = "http://127.0.0.1:4010"
pnpm --filter @open-tabletop/web dev
```

`OTTE_DEV_API_URL` must be an HTTP(S) origin with no path or credentials. The browser bootstrap performs the same compatibility check when `VITE_API_URL` sends requests directly rather than through the Vite proxy.

## Expectations

- Add tests for shared package behavior and permission boundaries.
- Keep campaign data portable.
- Preserve the AI agent's existing governed manual and automatic-execution modes. Route plugin changes through typed, permission-checked application commands rather than direct storage writes.
- Do not bundle proprietary tabletop content, Roll20 assets/workflows, D&D Beyond content, or non-SRD D&D material.
- Keep public demo content original, SRD, open, or otherwise legally reusable.
- Keep SDK packages reusable under their package licenses; do not pull AGPL-only platform code into MIT SDK surfaces.

## Pre-push and release evidence

Run the fast gate before pushing root script, workflow, contract, or deployment changes:

```bash
pnpm gate:fast
```

It runs the deployment wiring smoke and API contract package tests. It is intentionally smaller than `pnpm check` and the browser suites; release candidates still need the full gates.

To persist a full-gate run as machine-readable evidence, use one of these commands from a clean release-candidate worktree:

```bash
pnpm gate:evidence:record -- check
pnpm gate:evidence:record -- canonical
pnpm gate:evidence:check -- artifacts/release-evidence/<artifact>.json
```

Artifacts are written to `artifacts/release-evidence/` with the full commit SHA, exact commands, timestamps and durations, per-package results, test counts, environment, and worktree state. The standalone checker rejects failed runs, stale commits, incomplete package results, and dirty evidence whose workspace fingerprint no longer matches. `pnpm v1:evidence:check -- --gate-artifact <artifact>` additionally requires a clean release worktree. Keep routine local artifacts uncommitted; intentionally commit or attach the JSON for tagged release candidates so later audits can reproduce the cited run.
