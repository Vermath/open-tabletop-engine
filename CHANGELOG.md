# Changelog

All notable OpenTabletop Engine release-track changes are recorded here. Release notes remain under `docs/release/`; this file is the versioned public index.

## v1.0.0 - Candidate

Status: release candidate baseline. Do not publish as final until `docs/prd-v1-gap-closure.md` release gates are satisfied or explicitly descoped.

Release notes: [docs/release/v1.0.md](docs/release/v1.0.md)

### Added

- First-run owner bootstrap, login/register/account/MFA/reset, invite acceptance, organization workspace defaults, active-workspace switching, organization member management, and active-organization invite administration.
- SCIM group-to-campaign role mapping browser coverage now verifies both mapping creation and deletion from Organization Access.
- Clean-bootstrap browser coverage now verifies active-workspace organization invite creation and revocation from the visible roster after switching between owner workspaces.
- Clean-bootstrap browser coverage now verifies organization invites created or revoked in either owner workspace remain isolated from the other workspace invite roster after switching active workspaces.
- Clean-bootstrap browser coverage now verifies organization members added in either owner workspace remain isolated from the other workspace member roster after switching active workspaces.
- Organization removal coverage now verifies removed members cannot switch a fresh bearer session back into the removed workspace or see its campaigns.
- GM campaign and scene management flows for create/edit/archive/restore/delete, scene duplicate/reorder/activate, activation history, scene thumbnails, background asset assignment, and image-backed scene prep.
- Multi-scene prep filters for folder counts, scene search, and visible/total scene summaries.
- Selected-vs-active scene state comparison for dimensions, tokens, fog, walls, lights, annotations, background posture, and actionable drift details.
- Filtered bulk scene-folder moves for the currently visible scene prep set.
- Explicit multi-select scene prep controls for selecting visible scenes, clearing selection, moving the selected set to a folder, and duplicating selected prep scenes.
- Live tabletop workflows for token inspection, targeting, notes, conditions, auras, chat history/filter/export/moderation, dice roll history, saved formulas, shared dice macros, combat lifecycle/audit, and API-backed annotations.
- Browser coverage now downloads and parses Chat History JSON and NDJSON export records for public, GM-only, and threaded-reply messages.
- Mobile/tablet tabletop layout keeps scene filters and token creation controls inside the viewport while preserving touch-target coverage.
- Phone/tablet browser smoke now touch-drags the created mobile probe token and verifies the token coordinate change through the API before cleanup.
- Phone/tablet browser smoke now exercises footer dice rolling and chat sending in touch-enabled contexts, then verifies the mobile Chat history shows the sent message.
- Scene annotation layers, groups, create/update/delete history, grid-snapped circle/line/cone area templates, affected-token capture, bulk target application, rules-system stamping, and effect hints.
- Area-template save DC, damage metadata, and damage rolling through the existing dice history.
- Area-template damage application for affected tokens through existing actor HP or token condition updates.
- Area-template save resolution with full or half damage application based on affected-token save rolls.
- Area-template damage adjustment cues for resistance, immunity, vulnerability, and concentration checks.
- Combatant rules automation now drops concentration and syncs a `concentration lost` marker when concentrating combatants become stunned, incapacitated, defeated, dead, or stable.
- Browser annotation layer visibility toggles for bulk hiding measurement, effects, drawings, and notes overlays.
- Grouped annotation delete cleanup through the existing per-annotation delete route.
- Permissioned annotation update route plus browser group nudge/recolor controls for lightweight group move/style editing.
- Per-annotation drag handles in select mode for direct canvas movement of visible annotations through the permissioned annotation update route.
- Ruler/template endpoint handles in select mode for resizing two-point annotations while preserving server-side template radius and affected-token recalculation.
- Drawing path start/middle/end handles in select mode for first-pass freehand path reshaping through the permissioned annotation update route.
- Asset library workflows for upload, thumbnails, folders/tags, lifecycle, storage posture, delivery diagnostics, batch archive/restore/delete, and background assignment.
- Browser coverage now verifies deleted asset cards disable token placement, background assignment, and signed delivery before restore recovery.
- Browser archive coverage now verifies `reject_conflicts` failure/recovery for valid archives with ID conflicts before dry-run, skip-conflict, and upsert paths.
- AI review diff/timeline surfaces, proposal failure recovery, memory metadata, and memory deletion.
- Plugin/system marketplace flows for trust, review, registry sync, source/provenance, core compatibility, version install/upgrade/rollback, and permission review.
- Clean-bootstrap admin browser coverage now verifies Plugin Operations can invoke configured registry sync.
- SDK marketplace browser coverage now verifies seeded local-catalog source filtering, registry-source empty-state behavior, and installed-vs-upgrade status filtering around the versioned plugin workflow.
- SDK/system browser coverage now verifies a GM can activate an available Generic Fantasy system from the System Registry and see the active-system state update.
- Actor action browser coverage now verifies D&D Fighter Second Wind applies healing and consumes the Second Wind resource before checking Action Surge roll-only guardrails.
- Player read-only browser coverage for SDK marketplace/system registry posture, including disabled plugin install, registry sync, system activation, and character-template creation controls.
- Admin operations for production readiness, SQLite backups and restore drills, backup and restore-drill worker job queueing, job ledger recovery, Admin Users reset/session/disable controls, individual Active Sessions revocation, Auth Operations risk-session cleanup and expired-reset pruning, failed email retry, asset-storage migration/cleanup recovery, audit export, redacted auth setup, OIDC/SCIM connection testing, and job metrics/alert dry-run plus configured send-alert browser coverage.
- Clean-bootstrap admin browser coverage now exercises Admin AI Operations stale thread, stale tool-call, and stale pending-proposal recovery controls.
- Clean-bootstrap admin browser coverage now also exercises the Admin AI Operations stale approved-proposal rejection control.
- Optional `pnpm identity:smoke` harness for release owners to verify redacted OIDC/SCIM readiness against real sandbox env without making skipped local runs count as final evidence.
- Clean-bootstrap admin browser coverage for asset-integrity quarantine recovery from a missing-byte report.
- Clean-bootstrap admin browser coverage now exercises the Asset Integrity Purge CDN action before archive-broken-assets quarantine recovery.
- Release gates for security, migration, deployment, performance, browser E2E, and release smoke.
- Public documentation index at `docs/site/index.md` and external audio/video handoff documentation.
- Hosted deployment recipes for single-VM systemd, container-host, Kubernetes-style, managed-volume, and preview-only deployments.
- Assistive-technology pass plan for manual accessibility evidence beyond automated Playwright checks.
- Explicit ARIA labels for core tabletop toolbar and visible icon-only shell controls, with browser coverage that does not accept `title` alone as a control name.
- Local public-docs HTML renderer plus GitHub Pages workflow for hosted documentation publication.

### Changed

- v1 self-hosting support is explicitly scoped to a single-writer SQLite JSON-record store plus configured asset storage.
- API/OpenAPI/client contracts now cover the main public route surface with shared error, auth, idempotency, pagination, and rate-limit policy.
- The existing AI proposal and automatic-execution modes remain supported and unchanged; plugin execution remains permission-checked and auditable through application commands.

### Known Limitations

- Live provider-specific OIDC/SCIM smoke evidence still requires real IdP sandboxes; skipped `pnpm identity:smoke` output is not sufficient for final release acceptance.
- Full assistive-technology audits remain outside the current automated Playwright accessibility smoke.
- Built-in voice/video, recording storage, and provider-side RTC moderation are not included in v1.
- Hosted deployments without durable writable SQLite and asset storage are preview-only.

## v0.3.0 - Outside Dogfood

Release evidence: `docs/verification/v0.3-dogfood-acceptance.md` (internal repository record)

### Added

- Outside-GM dogfood guides, issue reporting, and redacted report bundle flow.
- Multi-session beta dogfood archive reuse and export/import proof.
- Expanded AI, plugin, system, backup, restart recovery, failed-import recovery, and dogfood verification paths.

## v0.2.0 - Beta Dogfood

Release notes: [docs/release/beta-v0.2.md](docs/release/beta-v0.2.md)

### Added

- Three-session Ember Vault beta dogfood fixture and runbook.
- Archive `0.2.0` export, public-alpha archive import compatibility, and beta deployment/operations docs.
- Safe content import primitives with preview, apply, rollback, delete, provenance, license metadata, and audit logs.

## v0.1.0 - Public Alpha

### Added

- SRD-only Ember Vault one-shot demo archive.
- Local GM/player realtime proof for scene visibility, owned-token movement, dice, chat, and combat.
- Campaign export/import portability for scenes, assets, actors, tokens, journals, combat, rolls, permissions, and AI proposal records.
- Initial plugin and system module examples with explicit permission boundaries.
