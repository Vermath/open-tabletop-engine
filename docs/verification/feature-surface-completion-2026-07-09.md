# Feature Surface Completion Audit — 2026-07-09

Status: implementation and local verification complete as of 2026-07-10. External release evidence is listed separately and is not represented as locally complete.

## Product intent

The repository's governing product thesis is an open-source, API-first, self-hostable virtual tabletop operating system. Campaign data must be portable; rules systems and plugins must be modular; and secrets must be permissioned. The product owner accepts the existing AI agent's proposal and automatic-execution modes as the baseline; this historical verification record does not impose a proposal-only requirement. Plugin code must use the normal typed, permission-checked application boundary rather than writing storage directly.

This audit reviewed the PRD, roadmap, release and verification documents, prior review findings, user-authored implementation plans, the shared domain model, persistence adapters, REST/OpenAPI/client route surface, realtime filtering, AI/tool execution, plugin/system SDKs and runtimes, web product surface, deployment/release workflows, and existing automated tests.

## Gap closure matrix

| Surface | Gap found | Completed coverage |
| --- | --- | --- |
| World organization | The PRD named worlds, but the domain and product treated campaign content as one flat collection. | Added durable world CRUD and optional world associations for scenes, actors, items, journals, handouts, encounters, and canonical memory. The World Atlas supports creation, editing, deletion, reassignment, and world-aware archive export. |
| Handouts | Handouts existed mainly as imported records, without a complete first-class lifecycle or reading flow. | Added audience-scoped CRUD, user/actor targeting, asset links, tags, idempotent read receipts, direct routes, persistence/archive support, realtime/audit events, and a responsive Handout Library. |
| Multi-session campaigns | There was recap data but no first-class planned/live/completed session model. | Added campaign-session CRUD, scheduling, start/complete transitions, scene/encounter links, recap proposal/journal links, live-session realtime state, Session Desk UI, and a live banner. |
| Campaign discovery | Large campaigns lacked one permission-aware search entrypoint. | Added campaign search across worlds, scenes, actors, items, journals, handouts, encounters, approved memory, chat, and rolls, with type/world filters and the same visibility rules as direct reads. |
| Campaign memory | AI memory was effectively an append-only fact list and could be fed back before human review. | Added candidate, approved, rejected, and retconned lifecycle state; confidence, source, subject, and type metadata; create/read/update/delete/review routes; audit history; and a Campaign Memory review UI. Only approved, caller-visible memory becomes provider context. |
| AI prep workflows | Encounter design and session recap were thin, provider-dependent paths with incomplete canonical-memory and session integration. | Added structured encounter and recap outputs, proposal-backed encounter/scene/journal changes, session linkage, candidate memory extraction, and a deterministic structured fallback when no provider is configured. Configured-provider failures remain visible instead of being hidden by fallback behavior. |
| AI visibility and mutation safety | Player-facing provider context could include hidden prep, and dice/chat tools were modeled as direct side effects. | Provider context now excludes inactive prep scenes, unrevealed actors, prepared encounters, and unapproved memory for player seats. Dice, chat, and campaign-edit tools require their underlying domain permission and execute through the campaign's configured manual-review or governed-auto mode; manual mode returns pending proposals. |
| Reversibility | Proposal application was auditable but did not preserve a domain-aware inverse operation. | Proposal application captures before/applied changes, inverse changes, history, per-entity audit events, and realtime updates. Authorized users can revert applied proposals, including relationship cleanup for world and scene records. |
| Data portability | Export covered a whole campaign only and was readable by any campaign reader, which exposed GM-owned portable state. | Export now requires `campaign.update` and supports a complete campaign, one dependency-closed world, or selected record collections. Manifests record scope, selected collections, compatibility notes, dependency warnings, redaction mode, asset counts, and system requirements. Portable exports exclude operational identity and secret-bearing collections. |
| Archive trust boundary | Archive import could infer ownership only from direct campaign ids or conflicting record ids, allowing relationship-only records to target another campaign. Identity and audit rows were also treated as ordinary portable content. | Import derives campaign authority through scene/thread and entity references, rejects cross-campaign relationships, protects existing accounts and ownership, strips credentials/admin/MFA/SCIM state, requires password reset for genuinely new archived users, discards untrusted audit history, records a fresh authenticated import audit, and regenerates every copied record id including audio. |
| Proposal trust boundary | Campaign proposals could carry immutable ownership/organization fields, imported proposals could bypass creation-time permissions, and reverting after intervening edits overwrote newer state. | Campaign proposal fields now match the public patch allowlist, create/update scope is revalidated, every apply path rechecks the underlying entity permission, and guarded inverses return `409 proposal_not_revertible` when post-apply state has drifted. |
| Domain integrity | A scene patch still accepted unbounded object spread and cross-campaign references. | Added a runtime-validated scene patch allowlist, immutable-field rejection, enum/geometry validation, and same-campaign world/asset reference checks. Existing campaign/token/actor/journal/combat allowlists remain intact. |
| Plugin product surface | Plugins had commands and storage, but no bounded event-subscription surface or safe asynchronous bridge. | Added validated manifest subscriptions, metadata-only redacted event envelopes, permission mapping, bounded queues and payloads, timeout/resource limits, and proposal/chat bridge receipts. The current asynchronous bridge expresses requested changes as pending proposals; this records that bridge's implementation, not a universal proposal-only policy. Trust, review, compatibility, grant, campaign-scope, permission, revision, and audit checks fail closed, and plugins do not write storage directly. |
| Rules-system lifecycle | Global system install was an in-memory manifest push with weak authority and silent Generic Fantasy fallback for unsupported systems. | Added strict manifest and semver/core compatibility validation, safe relative paths, least-privilege permissions, duplicate/conflict protection, server-admin plus campaign-owner authority, durable SQLite-backed installations, activation and audit events, client/OpenAPI coverage, and explicit `422 unsupported_system_capability` behavior. External systems are data-model-only until a trusted runtime loader exists. |
| Player experience | Core lifecycle additions had no complete browser workflow, and several tabletop conveniences remained fragmented. | Added World Atlas, Handout Library, Campaign Memory, and Session Desk panels; own-message editing; dice presets and explicit modifier controls; multiclass hit-dice presentation/rest controls; mobile layouts; focus-visible states; and explicit loading, error, empty, and disabled states. |
| Release integrity | Desktop release artifacts did not have a complete provenance/signing/SBOM chain. | The desktop workflow now produces checksums, CycloneDX SBOMs, provenance metadata, signature gates, and release artifact verification. Security/deployment tests pin the workflow and fail-closed plugin/idempotency behavior. |

## Preserved safety invariants

- The existing AI proposal and automatic-execution modes are accepted and unchanged; plugin code uses typed, permission-checked application commands rather than direct storage mutation.
- Campaign, entity, realtime, snapshot, search, export, and provider-context reads share explicit permission and visibility boundaries.
- Pending proposals and GM-only records are not exposed to player seats.
- Runtime inputs use bounded, testable validation at new or previously unsafe mutation boundaries.
- External system manifests are data declarations, not trusted executable imports.
- Portable archives omit authentication secrets, sessions, MFA, SCIM source data, plugin reviews, idempotency records, jobs, and organization records.
- User-authored `.claude/`, `PLAN-*.md`, and `fable_review.md` files were treated as review inputs and were not modified.

## Follow-up end-to-end bug review — 2026-07-10

The final cross-application review found and corrected additional defects that broad happy-path coverage did not expose:

- Authentication and replay handling no longer trust a forged legacy user header, concurrent requests with the same idempotency key coalesce behind one mutation, distinct opaque keys cannot alias through URL decoding or truncation, and SQLite commits a successful mutation and its replay record together before responding.
- REST, MCP, provider context, realtime state, and direct entity reads now share visibility rules for worlds, scenes, tokens, assets, encounters, journals, handouts, combat, imports, plugin data, AI activity, and campaign search. The world, handout, search, and campaign-session MCP tools are real implementations rather than indirect coverage claims.
- Plugin approval is bound to the exact manifest, runtime, and registry package identity. Unsupported runtime API versions, package drift, cross-campaign review data, and uninstalled plugin storage fail closed.
- Proposal reverts reject live or historical inbound references instead of deleting records still used by campaign state.
- Workspace switching, realtime world/handout reloads, session completion, and failed AI proposal actions no longer leave stale or unretryable web state.
- Tunnel paths cannot escape the shared-table origin, local redirects remain browser-visible instead of being followed by the desktop proxy, and relay host credentials are accepted only through the Bearer header rather than URL query parameters.
- Desktop release checksums are LF-only UTF-8 without a BOM so Linux verification succeeds, release workflows use least-privilege credentials, and the full dependency graph has no known advisories.

## Verification on this worktree

| Gate | Result |
| --- | --- |
| Recursive strict typecheck across workspace packages | Passed: 21 projects |
| Non-API/non-web package tests | Passed: 208 tests; database package has no tests and exits through `--passWithNoTests` |
| Web tests | Passed: 241 tests in 42 files |
| Web production build | Passed: TypeScript client/server compilation and Vite production bundle |
| API full suite | Passed: 286 tests; 1 live identity-provider smoke intentionally skipped without external provider credentials |
| Focused plugin/runtime/tunnel/release tests | Passed within the complete run: plugin runtime 27, plugin SDK 9, relay 7, desktop 9, tunnel protocol 3, deployment wiring 1 |
| API contracts/client/core/AI/system focused suites | Passed within the full package run: contracts 10, client 7, core 48, AI core 3, system SDK 49 |
| Playwright clean-bootstrap suite | Passed: 1 test |
| Playwright seeded suite | Passed: 27 tests, including accessibility, mobile/tablet, World/Handout/Session realtime, combat, AI, plugin trust, archive, invitation, and persistence journeys |
| Release-specific local gates | Passed: security, migration, deployment, performance smoke/soak, evidence verifier tests, open-issue audit tests, and a 202-component CycloneDX SBOM fixture |
| Documentation site guard | Passed: publication tests and clean generated-site check |
| Dependency audit | Passed: no known vulnerabilities at low severity or above |
| Manual browser smoke | Passed through the Playwright CLI: seeded GM login, live tabletop, Prep mode, and World Atlas; zero browser console errors |

## External and manual release gates

The following are evidence tasks, not missing local code features, and cannot be honestly fabricated in a local implementation pass:

- live provider-specific OIDC and SCIM smoke evidence;
- manual assistive-technology evidence for the required desktop and mobile matrix;
- an unaffiliated external GM validation session;
- hosted release-smoke and public documentation evidence for the exact eventual release commit;
- a live no-P0/P1 issue audit immediately before release acceptance.

Native mobile apps, first-party video chat, marketplace payments, a 3D tabletop, proprietary content integrations, procedural battlemap generation, and exhaustive automation for every game system remain explicit product non-goals or future roadmap scope. They are not silently counted as completed features.

## Decision

All locally implementable product-surface gaps found in this review are represented by concrete domain types, permissioned API behavior, persistence/archive handling, SDK or client contracts, browser workflows where user-facing, and automated regression coverage. The complete local gate is green. Final release readiness still depends on the external/manual evidence above.
