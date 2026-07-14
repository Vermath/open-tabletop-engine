# Contract-to-Journey Feature Audit - 2026-07-12

Status: all accepted P0-P2 gaps found in this local audit were implemented and covered by regression tests. Release evidence that requires a hosted environment, external identity provider, assistive technology, or an unaffiliated GM remains explicitly open.

> Product-owner direction (2026-07-13): the existing AI agent behavior is intentionally unchanged. Any proposal-only statement in this historical audit is superseded and is not a current product or release requirement.

## Audit method

This pass treated a feature as complete only when the same capability was represented across the layers that apply to it: shared domain types, permission and validation rules, persistence and archive behavior, REST/OpenAPI/API-client contracts, audit and realtime behavior, a usable browser journey, and regression coverage. It reviewed the PRD and roadmap, public and internal verification documents, user-authored plans, package boundaries, API routes, SQLite storage, AI and plugin proposal paths, worker jobs, the web workspace, Railway configuration, and the full automated test surface.

The 2026-07-09 feature-surface audit was useful backend coverage, but it sometimes treated an API capability as a complete product journey. This follow-up therefore used contract-to-journey checks and a current-run visual audit to catch gaps such as search without a browser entrypoint, proposal reversibility without a recovery control, and encounter metadata without a reusable saved-encounter workflow.

## Implemented gap matrix

| Priority | Gap found | Implemented closure | Primary evidence |
| --- | --- | --- | --- |
| P0 | Roll/chat references and realtime broadcasts could widen or leak GM-only dice results. | Chat now validates referenced roll ids without widening visibility; roll search, snapshots, and realtime delivery use the canonical `chat.read` boundary; plugin event subscriptions do not receive private roll lifecycle events. | API integration/privacy tests, plugin event privacy tests, seeded player E2E |
| P0 | Proposal apply/revert behavior did not consistently recheck the underlying domain permission, preserve recap pointers, or commit apply plus recap atomically. | Revert now checks the inverse operation's domain permission, rejects drift, preserves scene draft safety, updates recap/session pointers only for applied proposals, clears them on reject/revert, and persists proposal apply plus recap as one transaction. | Core proposal tests, API integration safety tests, proposal review tests |
| P0 | Encounter metadata exposed prep-only composition to players and accepted stale or cross-system relationships. | Encounter reads redact builder-only metadata from non-prep players; saved encounters validate campaign, system, party actors, world, and archive dependencies; actor and encounter deletion clean dependent relationships. | API integration safety tests and encounter builder tests |
| P1 | Campaign search existed as an API but not as a usable discovery journey, and rolls were omitted from user-facing search. | Added a debounced, abort-safe Search panel and command action with type/world filters, permission copy, roll coverage, honest non-navigable states, and exact record routing/focus for scenes, actors, items, journals, handouts, canon, chat, and rolls. | Search panel tests and seeded E2E |
| P1 | Applied proposals were auditable but not recoverable from the browser. | Added permission-aware, two-step proposal revert controls with authoritative refresh and explicit non-revertible feedback. | Proposal review tests and seeded E2E |
| P1 | Character import was a stub rather than a real, reviewable workflow. | Added bounded JSON file/paste import, normalization, owner selection, duplicate confirmation, lawful-use acknowledgement, wrapped-field preservation/reporting, stale-workspace protection, and post-import refresh guards. | Character import tests and seeded E2E |
| P1 | Saved encounter data could be created but not managed as a reusable lifecycle. | Added persisted system, party, and threat metadata; reopen, edit, update, delete, and new-composition controls; legacy upgrade messaging; stale campaign/system guards; and canonical Prep scene synchronization. | Encounter builder/API contract tests and seeded E2E |
| P1 | Plugin install/upgrade review was not bound clearly enough to the exact target version and could over-grant permissions. | Added an accessible exact-version review modal with trust/source/compatibility context, selectable least-privilege grants, two-step install/upgrade/rollback actions, deterministic compatibility output, focus trapping, and post-success reconciliation. | SDK panel tests, API contract/client tests, seeded E2E |
| P1 | Campaign canon and journal recovery flows were incomplete. | Canon now exposes approved-only provenance plus a two-step retcon workflow. Journal entries now have create, edit, visibility/target controls, retryable errors, and two-step deletion. | Web panel tests and seeded E2E |
| P1 | `report.bundle` jobs were unsupported or available through overly broad campaign-read access. | Implemented worker report bundles and restricted enqueue/read behavior to campaign editors or server-admin workers. | Worker and API integration tests |
| P1 | Asset and dice-macro mutations were missing complete lifecycle signaling and privacy-aware realtime behavior. | Added create/update/delete audit rows and events, proposal parity, permission-aware broadcasts, macro tombstones, and explicit exclusion from plugin subscriptions where lifecycle payloads could expose private data. | Asset/dice lifecycle and core event tests |
| P2 | Campaign, rules-system, encounter-plan, and actor-owner mutations had validation/audit/realtime inconsistencies. | Added campaign PATCH allowlisting and validation, system activation and generated-plan events, explicit actor owner integrity, and permission-aware realtime delivery. | API feature completeness tests and contract tests |
| P2 | Empty and off-board workspace states could leave stale selections or block legitimate preparation. | Empty world filters now clear stale scenes, Prep uses the canonical scene id, and actors may be selected and edited before a token is placed. | Scene, actor rail, and workspace guard tests |
| P2 | Railway shutdown could terminate active work abruptly. | Added graceful SIGTERM/SIGINT draining and kept static web/API deployment wiring aligned with Railway. | Runtime tests and deployment smoke |
| P2 | The encounter builder auto-selected characters that were incompatible with the active rules system, surfacing a late validation error only after a threat was added. | Party choices are now limited to same-campaign character actors compatible with the selected system, excluded characters are explained in the builder, and empty compatible-party state is handled before composition submission. | Encounter builder regression tests and current-run visual audit |

## Preserved safety invariants

- Historical correction: the current AI agent supports both governed proposal and automatic-execution modes; plugin code remains behind typed, permission-checked application commands.
- Every apply, revert, import, report, search, snapshot, and realtime path keeps an explicit permission boundary.
- Player seats do not receive pending proposals, GM-only rolls, hidden encounter prep, or unapproved canon.
- Campaign/system/world/actor relationships are validated before persistence and again at authoritative apply boundaries.
- Plugin grants are version-bound and least-privilege; missing grants fail closed.
- Archive and delete operations validate or clean dependent relationships rather than leaving dangling references.
- User-authored `.claude/`, `PLAN-*.md`, and `fable_review.md` files were treated as audit input and were not modified.

## Historical verification snapshot - 2026-07-12

These totals record the July 12 run only. They are superseded for current-tree totals by [the completed implementation record](implementation-2026-07-13.md) and [the current feature audit](../FEATURE_AUDIT.md).

| Gate | Result |
| --- | --- |
| `pnpm check` | Passed across 21 packages, including lint, strict typecheck, tests, and production builds |
| API suite | 317 passed, 1 external identity-provider smoke skipped, 18 files |
| Core suite | 56 passed |
| Web suite | 307 passed, 50 files |
| API contracts / API client | 12 / 9 passed |
| Worker / plugin SDK / desktop | 20 / 13 / 20 passed |
| Seeded Playwright | 36 of 36 journeys passed after fixing three issues exposed by the first run |
| Clean-bootstrap Playwright | 1 of 1 journey passed |
| Security / migration / deployment smoke | 6 / 2 / 1 matching tests passed |
| Performance smoke / soak | Passed |
| Docs, SBOM, release-evidence, and issue-audit tests | Passed |
| Dependency audit | No known vulnerabilities at low severity or above |
| Diff hygiene | `git diff --check` passed; existing Windows line-ending warnings remain informational |

The web production build still reports the existing large-chunk warning (roughly 1.09 MB for the main bundle and 553 KB for the dice chunk). It is a performance-maintainability signal, not a failed build or a correctness defect.

## Current-run visual audit

The current-run browser audit used the seeded GM campaign and checked the visible product state in addition to automated assertions. Saved evidence lives in `artifacts/feature-audit-2026-07-12/`.

1. **Live tabletop - healthy.** The GM can identify campaign, connection and player-live state, manipulate the active map, and inspect the selected actor without leaving the primary workspace. Evidence: `01-live-table.png`.
2. **Campaign discovery - healthy.** Search communicates its permission boundary, returns a specific actor result, and routes that result into the authoritative Prep actor view. Evidence: `02-campaign-search.png`.
3. **Plugin permission review - healthy.** The modal names the exact target version, source and trust state; each requested capability is independently selectable; and installation is a distinct confirming action. Evidence: `03-plugin-permission-review.png`.
4. **Encounter preparation - healthy after regression fix.** Saved compositions, threat discovery, compatible party selection, live difficulty, and persistence controls are visible in one focused workflow; incompatible actors are explained before submission rather than failing late. Evidence: `04-encounter-builder.png`.

This is a focused workflow audit, not a claim of full WCAG conformance or a substitute for the required assistive-technology matrix.

## Historical follow-up list - superseded 2026-07-14

This snapshot's former follow-up table is not a current backlog. The later full remediation implemented every code-addressable non-AI P0-P3 ticket selected by the current audit, including reviewed encounter-to-combat launch and architecture budgets, and records those closures as T01-T38 in [IMPLEMENTATION_BACKLOG.md](../IMPLEMENTATION_BACKLOG.md). Current product decisions and external/manual release gates are authoritative in [FEATURE_AUDIT.md](../FEATURE_AUDIT.md) and [PRODUCT_ROADMAP.md](../PRODUCT_ROADMAP.md); this historical file must not be used to reopen completed work or to impose proposal-only AI behavior.

## Decision

All P0-P2 feature gaps accepted during this audit are now represented by authoritative domain behavior, explicit permissions, persistence, API/client contracts where applicable, a usable browser journey where user-facing, and regression coverage. No deployment, commit, push, or Railway environment mutation was performed. The repository is locally green; release acceptance still depends on the external/manual evidence above.
