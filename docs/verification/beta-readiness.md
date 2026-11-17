# Beta v0.2 Readiness

Last updated: 2026-05-11

## Objective

Ship OpenTabletop Engine beta v0.2 from the public-alpha baseline. Beta should move from "demo works" to a dogfoodable engine for real multi-session campaigns: reliable persistence, safer self-hosting, clearer contributor paths, SRD-only campaign play, both governed AI execution modes, permission-checked plugins, and explicit outside-dogfood proof.

## Status Key

- Ready: evidence exists, but final beta acceptance should re-run it.
- Needs work: implementation or beta-specific proof is incomplete.
- Blocked: cannot ship as requested without an external/legal/safety constraint being resolved.
- Post-beta: intentionally outside beta v0.2 scope.

## Read-First Evidence

| Artifact | Current evidence |
| --- | --- |
| `AGENTS.md` | Confirms API-first VTT scope, scoped edits, shared `packages/core` types, unchanged existing AI behavior, permissioned plugin application boundaries, explicit permissions, and permissive SDK licensing. |
| `README.md` | Current public-alpha quickstart, beta dogfood/runbook pointers, content-safety notes, release/ops pointers, package layout, and validation commands exist. |
| `docs/ROADMAP.md` | Public alpha is complete and beta v0.2 scope, acceptance gates, and post-beta boundaries are explicit. |
| `docs/verification/public-alpha-acceptance.md` | Public alpha has proof for clean install/check, runtime, GM/player, SRD demo, AI, export/import, plugin/system, and legal guardrails. Beta cannot reuse this as final proof without new multi-session/reliability validation. |
| `docs/verification/public-alpha-progress.md` | Records alpha fixes and validation slices, including archive import/export, WebSocket proxy, campaign switching, two-browser proof, and clean-copy validation. |
| `docs/ai/overview.md` | Documents the existing proposal and governed automatic-execution modes, permission-filtered tools, provider posture, admin operations, stale cleanup, retry, and audit surfaces. Beta eval pass/fail proof is recorded in `docs/verification/beta-acceptance.md`. |
| `docs/deployment/self-hosting.md` | Documents SQLite default, Docker Compose, asset storage, AI config, auth/admin, plugin trust, worker jobs, asset scanner, cleanup, local dev, archives, safe content import boundaries, and beta ops links. |
| `apps/api` | API includes campaign state, realtime, import/export, asset storage, plugin runtime, system runtime, AI routes, admin operations, SQLite store, safe content imports, and beta tests. |
| `apps/web` | React client has campaign, scene, chat, combat, AI/admin, import, plugin/system surfaces, import status, focus treatment, permission titles, and status regions. |
| `packages/core` | Domain types, permissions, proposals, events, archive helpers, seed state, vision utilities, archive version compatibility, and import provenance types exist. |
| `packages/ai-core` | Provider and tool typing exists. Beta quality proof is exercised through API eval tests. |
| `packages/system-sdk` | `dnd-5e-srd` and `generic-fantasy` system runtime/tests exist. Beta multi-session D&D/SRD support is documented and covered by fixture/API/browser proof. |
| `packages/plugin-sdk` | Permissioned SDK surface exists under MIT licensing. Beta plugin/system smoke is covered by API regression and docs. |

## Area Readiness

| Area | Status | Evidence | Gap to close for beta |
| --- | --- | --- | --- |
| 1. Beta verification docs | Ready | This file, `docs/verification/beta-progress.md`, and `docs/verification/beta-acceptance.md` exist and record final proof. | Keep updating in future beta follow-ups. |
| 2. Real campaign dogfood path | Ready | `docs/demo/ember-vault-beta-dogfood.ottx.json` and `docs/demo/beta-dogfood-runbook.md` cover prep plus three sessions with live play, combat, journals, handouts, actor updates, rests, loot/items, recap, memory, and export checkpoints. API tests and live API/web/browser smoke verify the imported campaign. | Post-beta: collect outside dogfood reports. |
| 3. Reliability and persistence | Ready | Archive exports now use `0.2.0`; imports accept `0.1.0` and `0.2.0`; unsupported versions are rejected; alpha upgrade and beta round trip are covered by API tests; backup/restore and rollback docs exist; clean temp clone validation passed. | Post-beta: production database and HA hardening. |
| 4. GM/player UX hardening | Ready | Web shows archive import progress/result summaries with `aria-live`, disables duplicate imports while in flight, switches to the imported campaign, clears file inputs, adds disabled-control permission titles, adds scene tab `aria-pressed`, adds visible focus outlines, and includes a favicon. Browser smoke verified beta campaign loading. | Post-beta: deeper accessibility audit. |
| 5. Realtime and scale smoke | Ready | A beta API realtime regression opens WebSockets for 1 GM + 3 players, verifies token movement, dice, chat, journal, combat, and reconnect delivery. A beta-scale API smoke loads/exports 80 added actors, tokens, journals, and assets. Browser smoke showed realtime connected on the imported beta campaign. | Post-beta: larger soak/load testing. |
| 6. D&D/SRD beta slice | Ready | `docs/system-sdk/dnd-srd-beta-support.md` documents supported and unsupported beta SRD features. The beta dogfood archive covers leveling metadata, rests/resources, conditions, spells/items, monsters, loot, encounter math, and character import/export metadata. API/browser proof passed. | Post-beta: broader SRD rules coverage. |
| 7. AI beta quality | Ready | AI routes/tools retain their existing proposal and governed automatic-execution modes under permission, revision, validation, and audit boundaries. The beta fixture includes a passing `beta-quality-smoke` eval. The beta API regression runs `beta-v0.2-ai-quality-gate` against encounter design, combat advice, recap/memory, rules lookup, configured-mode integrity, advertised tools, tool outputs, and forbidden permissions. | Post-beta: expand eval corpus. |
| 8. Plugin/system beta story | Ready | The beta dogfood regression lists systems, installs `generic-fantasy`, restores `dnd-5e-srd`, installs `example-macro-plugin` with only `chat.write`, verifies missing `token.read`, and runs `/spark` without token context. Plugin signing/review/registry/storage/sandbox operations are documented. | Post-beta: third-party plugin review workflows. |
| 9. Safe content import primitives | Ready | Core defines content import source adapters, provenance/license metadata, preview entities, applied records, and campaign-local import batches. API endpoints preview, list, apply, roll back, and delete user-provided actor/item/journal/handout imports with audit logs. Focused API tests verify selective import, rollback/delete, provenance/license warnings, and no hidden plugin/AI mutation path. | Post-beta: more source adapters. |
| 10. Release and ops | Ready | README points to the beta dogfood runbook and release/ops docs. Release notes, upgrade guide, backup/restore guide, deployment checklist, admin/observability checklist, security checklist, and issue template exist. | Post-beta: deployment-specific runbooks. |
| 11. Final validation | Ready | Local and clean temp clone `pnpm install --frozen-lockfile`/`pnpm check` passed, plus focused API/web/runtime/browser checks. | Re-run before future releases. |
| 12. GitHub publication | Ready | Beta v0.2 acceptance proof is complete and pushed to `origin/main`. | Track v0.3 outside dogfood separately. |

## Prompt-To-Artifact Checklist

| Requirement | Expected artifact or proof | Current result |
| --- | --- | --- |
| Create beta readiness/progress/acceptance docs | `docs/verification/beta-readiness.md`, `docs/verification/beta-progress.md`, `docs/verification/beta-acceptance.md` | Ready. |
| Track Ready / Needs work / Blocked / Post-beta | This file's status tables | Ready. |
| 3-session dogfood path | Beta archive/runbook plus test/walkthrough evidence | Ready. |
| Reliability/persistence hardening | Versioning, upgrade, restart, cleanup, recovery, backup/restore, rollback docs/tests | Ready for beta. |
| GM/player UX hardening | Web changes plus tests/manual proof | Ready. |
| Realtime 1 GM + 3 players | Automated or documented smoke proof | Ready. |
| D&D/SRD beta slice | System docs/tests and fixture proof | Ready. |
| AI beta quality | Eval fixtures/results and thresholds | Ready. |
| Plugin/system beta story | Docs/tests for one plugin and one system end to end | Ready. |
| Safe import primitives | Core/API/docs/tests for adapters, provenance, preview, selective import, rollback/delete, audit, campaign-local storage | Ready. |
| Release/ops docs | Release notes, upgrade guide, backup/restore, deployment/admin/security checklists, issue template, README pointer | Ready. |
| Final validation gates | Clean checkout, frozen install, `pnpm check`, API/web start, dogfood walkthrough, GM+3 realtime, export/import, AI eval, plugin/system smoke | Ready. |
| Push to GitHub | `git push origin main` after beta acceptance | Ready for final push. |

## Blocked Or Post-Beta Scope

| Item | Status | Reason |
| --- | --- | --- |
| Roll20 UI/brand/assets/sheets/marketplace/workflow cloning | Blocked | Explicitly prohibited; beta must keep original UX and assets. |
| Proprietary D&D, Roll20, or D&D Beyond content | Blocked | Explicitly prohibited; only SRD/open/legal content can ship. |
| D&D Beyond scraping or auth bypass | Blocked | Explicitly prohibited. Only safe public/permitted APIs or user-provided/exported data can be adapter inputs. |
| Community-scale plugin distribution | Post-beta | Requires broader trust, moderation, registry, and review operations beyond beta v0.2; the project is free OSS and does not require commercial marketplace rails. |
| Exhaustive rules-system coverage | Post-beta | Beta should prove the primary SRD system and honest limits, not every system edge case. |

## Next Concrete Work

Beta v0.2 is accepted and pushed. Collect new outside dogfood reports with `.github/ISSUE_TEMPLATE/v0.3-outside-dogfood-report.yml`.
