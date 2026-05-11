# Beta v0.2 Progress

This log tracks work toward OpenTabletop Engine beta v0.2. It starts from the pushed public-alpha baseline and should not be used to re-litigate alpha acceptance.

## 2026-05-11 Initial Beta Readiness Audit

Changed files:

- `docs/verification/beta-readiness.md`
- `docs/verification/beta-progress.md`
- `docs/verification/beta-acceptance.md`

Commands and evidence inspected:

- Read the public-alpha verification structure in `docs/verification/public-alpha-readiness.md`, `docs/verification/public-alpha-progress.md`, and `docs/verification/public-alpha-acceptance.md`.
- Confirmed `docs/verification` did not yet contain beta readiness, progress, or acceptance artifacts.
- Checked the current Git status; only untracked graphify scratch outputs were present before beta edits.

Results:

- Created the beta readiness matrix with Ready / Needs work / Blocked / Post-beta status.
- Created this beta progress log for changed files, commands, evidence, gaps, blockers, and validation.
- Created the beta acceptance artifact as explicitly not accepted until final proof exists.
- Confirmed public-alpha proof is a useful baseline but not sufficient for beta because beta requires multi-session dogfood, reliability, GM+3 realtime, safe import primitives, AI evals, release/ops docs, and fresh validation.
- Kept Roll20 cloning, proprietary content, and D&D Beyond scraping/auth bypass as blocked scope.

Gaps carried forward:

- Add a 3-session beta dogfood fixture/runbook.
- Add alpha-to-beta archive upgrade and import/export tests.
- Build safe content import primitives.
- Harden GM/player UX and accessibility basics.
- Prove GM+3 realtime and scale smoke.
- Add AI beta evals and plugin/system beta proof.
- Add release/ops docs and README beta runbook pointer.
- Run final clean checkout, frozen install, full check, runtime, dogfood, realtime, export/import, AI, and plugin/system validation before acceptance.

Validation:

- `git diff --check -- docs/verification/beta-readiness.md docs/verification/beta-progress.md docs/verification/beta-acceptance.md` passed.

## 2026-05-11 Beta Dogfood Fixture And Archive Versioning

Changed files:

- `docs/demo/ember-vault-beta-dogfood.ottx.json`
- `docs/demo/beta-dogfood-runbook.md`
- `apps/api/src/app.ts`
- `apps/api/src/app.test.ts`
- `packages/core/src/types.ts`
- `packages/core/src/state.ts`
- `docs/verification/beta-readiness.md`
- `docs/verification/beta-progress.md`

Commands and evidence inspected:

- Parsed `docs/demo/ember-vault-beta-dogfood.ottx.json` with Node and confirmed counts for 4 users, 4 members, 2 scenes, 5 tokens, 6 actors, 4 items, 5 journals, 2 handouts, 6 chat messages, 4 rolls, and 1 AI evaluation.
- Inspected archive types and import/export code in `packages/core/src/types.ts`, `packages/core/src/state.ts`, and `apps/api/src/app.ts`.
- Inspected the existing public-alpha archive regression in `apps/api/src/app.test.ts`.

Results:

- Added an SRD-only beta dogfood archive for `The Ember Vault: Beta Dogfood Campaign`.
- Added a beta dogfood runbook covering prep, session 1, session 2, session 3, GM/player checks, and export/import checkpoints after every session.
- The fixture covers prep, live play, combat, journals, handouts, actor updates, long and short rests, loot/items, recaps, AI memory, export checkpoints, plugin storage, and 1 GM + 3 player membership.
- Added archive version typing for `0.1.0` and `0.2.0`.
- Updated new exports to produce archive `version: "0.2.0"` and `manifest.schemaVersion: "0.2.0"`.
- Added import normalization that fills missing state collections from `emptyState()`, strips ephemeral auth/session collections, drops plugin reviews during import, and treats files as optional.
- Added import rejection for unsupported archive versions.
- Added focused API regression coverage that imports the beta fixture, verifies player-safe visibility, three player-owned token moves, hidden-scout non-disclosure, combat order, pending AI proposal, AI eval result, plugin storage, v0.2 export, checkpoint audit logs, and round-trip import into a fresh runtime.
- Added focused alpha upgrade coverage that imports the public-alpha `0.1.0` archive, exports it as `0.2.0`, and rejects unsupported archive version `9.9.9`.

Validation:

- `node -e "const fs=require('fs'); ... JSON.parse(...)"` parsed `docs/demo/ember-vault-beta-dogfood.ottx.json` and printed expected collection counts.
- `pnpm --filter @open-tabletop/core typecheck` passed.
- `pnpm --filter @open-tabletop/core build` passed so API tests used updated core dist output.
- `pnpm --filter @open-tabletop/api test -- -t "beta dogfood archive"` passed: 1 selected test, 111 skipped.
- `pnpm --filter @open-tabletop/api test -- -t "imports alpha archives"` passed: 1 selected test, 111 skipped.
- `pnpm --filter @open-tabletop/api typecheck` passed.
- `git diff --check -- apps/api/src/app.ts apps/api/src/app.test.ts packages/core/src/types.ts packages/core/src/state.ts docs/demo/ember-vault-beta-dogfood.ottx.json docs/demo/beta-dogfood-runbook.md docs/verification/beta-readiness.md docs/verification/beta-progress.md docs/verification/beta-acceptance.md` passed, with only Windows LF-to-CRLF working-copy warnings for touched source files.

Gaps carried forward:

- Run the full API/web dogfood walkthrough and GM+3 realtime smoke.
- Add failed import recovery proof and docs for backup/restore/rollback.
- Add safe content import primitives.
- Add beta release/ops docs and README pointer.
- Run dedicated AI eval command/reporting proof instead of relying only on fixture data.

## 2026-05-11 Safe Content Import Primitives

Changed files:

- `packages/core/src/events.ts`
- `packages/core/src/types.ts`
- `packages/core/src/state.ts`
- `apps/api/src/app.ts`
- `apps/api/src/app.test.ts`
- `docs/api/rest.md`
- `docs/deployment/self-hosting.md`
- `docs/verification/beta-readiness.md`
- `docs/verification/beta-progress.md`

Commands and evidence inspected:

- Inspected core state/type definitions and API proposal/import/export route patterns.
- Inspected existing API tests for campaign archive import/export and audit assertions.
- Rebuilt `@open-tabletop/core` before API tests so the API consumed updated workspace package types and dist output.

Results:

- Added content import domain types for source adapters, provenance/license metadata, preview entities, applied records, and campaign-local import batches.
- Added realtime event types for content import preview/apply/rollback/delete.
- Added `EngineState.contentImports`, empty-state initialization, archive export/import inclusion, and deleted-preview omission from campaign exports.
- Added API endpoints:
  - `GET /api/v1/campaigns/{campaignId}/content-imports`
  - `POST /api/v1/campaigns/{campaignId}/content-imports/preview`
  - `GET /api/v1/content-imports/{importId}`
  - `POST /api/v1/content-imports/{importId}/apply`
  - `POST /api/v1/content-imports/{importId}/rollback`
  - `DELETE /api/v1/content-imports/{importId}`
- Preview records require `campaign.update`, store source/provenance/license metadata, normalize actor/item/journal/handout entities, and add warnings for private-home-game or external-service-boundary sources.
- Apply is selective and user-driven, creates only selected actor/item/journal/handout records, records applied ids for rollback, and audits `contentImport.applied`.
- Rollback removes only records created by that import batch and audits `contentImport.rolledBack`.
- Delete hides unapplied or rolled-back preview state, blocks deletion of still-applied batches until rollback, and audits `contentImport.deleted`.
- Docs now distinguish campaign archive import from safe content import primitives and explicitly state the D&D Beyond/no-scraping/no-auth-bypass boundary.

Validation:

- `pnpm --filter @open-tabletop/core typecheck` passed before the focused content import test.
- `pnpm --filter @open-tabletop/core build` passed after the state/type changes.
- `pnpm --filter @open-tabletop/api typecheck` passed.
- `pnpm --filter @open-tabletop/api test -- -t "user-provided content imports"` passed: 1 selected test, 112 skipped.
- Re-ran `pnpm --filter @open-tabletop/api test -- -t "beta dogfood archive"` after the EngineState change; passed: 1 selected test, 112 skipped.
- Re-ran `pnpm --filter @open-tabletop/api test -- -t "imports alpha archives"` after the EngineState change; passed: 1 selected test, 112 skipped.

Gaps carried forward:

- Add web import-status UX for the new content import path or explicitly document API-only beta status.
- Add release/ops docs: beta release notes, upgrade guide, backup/restore guide, deployment/admin/security checklists, issue template, and README beta pointer.
- Run full API/web dogfood walkthrough, GM+3 realtime smoke, final `pnpm check`, and clean-copy validation.

## 2026-05-11 Beta Release And Ops Docs

Changed files:

- `README.md`
- `docs/ROADMAP.md`
- `docs/release/beta-v0.2.md`
- `docs/deployment/upgrade-guide.md`
- `docs/deployment/backup-restore.md`
- `docs/deployment/beta-deployment-checklist.md`
- `docs/deployment/admin-observability-checklist.md`
- `docs/deployment/security-checklist.md`
- `.github/ISSUE_TEMPLATE/beta-dogfood-report.yml`
- `docs/verification/beta-readiness.md`
- `docs/verification/beta-progress.md`

Results:

- Added beta release notes covering the dogfood fixture, archive `0.2.0`, alpha import compatibility, safe content import primitives, compatibility, known beta limits, and validation targets.
- Added an upgrade guide for public alpha `0.1.0` to beta `0.2.0`, including backup, install/check, alpha export/import upgrade proof, and rollback.
- Added a backup/restore guide for SQLite, assets, campaign archives, plugin packages, environment inventory, restore order, and recovery checks.
- Added deployment, admin/observability, and security checklists for outside dogfood.
- Added a GitHub beta dogfood issue template with campaign id, area, steps, expected/actual, and evidence fields.
- Updated README with a beta dogfood section that points to the archive, runbook, release/ops docs, beta verification docs, archive compatibility, and safe content import behavior.
- Updated the roadmap with beta v0.2 work and acceptance boundaries.

Validation:

- `git diff --check -- README.md docs/ROADMAP.md docs/release/beta-v0.2.md docs/deployment/upgrade-guide.md docs/deployment/backup-restore.md docs/deployment/beta-deployment-checklist.md docs/deployment/admin-observability-checklist.md docs/deployment/security-checklist.md .github/ISSUE_TEMPLATE/beta-dogfood-report.yml docs/api/rest.md docs/deployment/self-hosting.md docs/verification/beta-readiness.md docs/verification/beta-progress.md` passed, with only Windows LF-to-CRLF working-copy warnings for existing Markdown files.

Gaps carried forward:

- Improve web import/status and accessibility basics.
- Run final API/web dogfood walkthrough, GM+3 realtime smoke, AI eval, plugin/system smoke, full `pnpm check`, clean-copy validation, and beta acceptance audit.

## 2026-05-11 Web Import Status And Accessibility Pass

Changed files:

- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `docs/verification/beta-readiness.md`
- `docs/verification/beta-progress.md`

Results:

- Added archive import progress/result state to the sidebar.
- Import now reports collection counts, restored asset file counts, and conflict counts.
- Import now refreshes directly into the imported campaign when the API returns an imported campaign id.
- Import failure is reported without leaving stale file input state; duplicate archive imports are disabled while one is running.
- Added `aria-live` status regions for import and overall runtime status.
- Added `aria-describedby` and `aria-label` on the archive import control/input.
- Added permission-specific disabled titles for scene, map, and token controls.
- Added `aria-pressed` on scene tabs.
- Added visible keyboard focus outlines for buttons, inputs, selects, and textareas.

Validation:

- `pnpm --filter @open-tabletop/web typecheck` passed.
- `git diff --check -- apps/web/src/App.tsx apps/web/src/styles.css docs/verification/beta-readiness.md docs/verification/beta-progress.md` passed, with only Windows LF-to-CRLF working-copy warnings for touched web files.

Gaps carried forward:

- Verify the import-status behavior in the browser during the final API/web dogfood walkthrough.
- Finish GM+3 realtime smoke, AI eval proof, plugin/system smoke, full `pnpm check`, clean-copy validation, and beta acceptance audit.

## 2026-05-11 AI, Plugin/System, And SRD Beta Proof

Changed files:

- `docs/demo/ember-vault-beta-dogfood.ottx.json`
- `docs/demo/beta-dogfood-runbook.md`
- `apps/api/src/app.test.ts`
- `docs/system-sdk/dnd-srd-beta-support.md`
- `README.md`
- `docs/ROADMAP.md`
- `docs/verification/beta-readiness.md`
- `docs/verification/beta-progress.md`

Results:

- Expanded the beta dogfood AI thread to advertise and use `read_compendium` in addition to campaign/proposal tools.
- Updated the AI assistant message to explicitly cover encounter design, combat advice, recap/memory, SRD-only rules lookup, and proposal safety.
- Added a beta API quality gate that requires the expected tool calls, advertised tools, forbidden tool/permission omissions, SRD compendium output, proposal approval-required output, and named response criteria for the five beta AI quality areas.
- Extended the beta dogfood regression to list systems, install `generic-fantasy`, restore `dnd-5e-srd`, install `example-macro-plugin` with only `chat.write`, verify missing `token.read`, and run `/spark` without token context.
- Added `docs/system-sdk/dnd-srd-beta-support.md` to document supported, verified, unsupported, and post-beta D&D/SRD features.
- Linked the SRD beta support document from README and the roadmap.

Validation:

- `node -e "const fs=require('fs'); ... JSON.parse(...)"` confirmed the beta fixture has 3 AI tool calls and advertises `create_proposal`, `create_memory`, `read_campaign`, and `read_compendium`.
- `pnpm --filter @open-tabletop/api test -- -t "beta dogfood archive"` passed after the AI/plugin/system expansion: 1 selected test, 112 skipped.

Gaps carried forward:

- Run final browser dogfood and GM+3 realtime smoke.
- Run full `pnpm check`, clean-copy validation, and beta acceptance audit.

## 2026-05-11 GM+3 Realtime Smoke

Changed files:

- `apps/api/src/app.test.ts`
- `docs/verification/beta-readiness.md`
- `docs/verification/beta-progress.md`

Results:

- Added an API/WebSocket regression that imports the beta dogfood archive, starts the API on an ephemeral local port, logs in 1 GM and 3 players, opens four realtime sockets, and verifies broadcast delivery.
- The smoke covers player token movement, player dice roll, GM chat, GM-created public journal, GM-started combat, and player reconnect receiving a later chat event.
- The smoke uses bearer session tokens in the realtime URL and the beta campaign membership set rather than relying only on legacy user headers.

Validation:

- `pnpm --filter @open-tabletop/api test -- -t "GM and three players"` passed: 1 selected test, 113 skipped.

Gaps carried forward:

- Add large-campaign perf/load smoke.
- Run final browser dogfood walkthrough, full `pnpm check`, clean-copy validation, and beta acceptance audit.

## 2026-05-11 Beta Scale Smoke

Changed files:

- `apps/api/src/app.test.ts`
- `docs/verification/beta-readiness.md`
- `docs/verification/beta-progress.md`

Results:

- Added a beta-scale API smoke that imports the beta dogfood archive, adds 80 actors, 80 tokens, 80 journals, and 80 assets, then verifies actors/tokens/journals/assets list endpoints and campaign export preserve the larger dataset.

Validation:

- `pnpm --filter @open-tabletop/api test -- -t "beta-scale campaign"` passed: 1 selected test, 114 skipped.
- `pnpm --filter @open-tabletop/api typecheck` passed after the realtime and scale test additions.

Gaps carried forward:

- Run final browser dogfood walkthrough, full `pnpm check`, clean-copy validation, and beta acceptance audit.

## 2026-05-11 Beta Version Metadata

Changed files:

- `package.json`
- `apps/*/package.json`
- `packages/*/package.json`
- `apps/api/src/app.ts`
- `packages/api-contracts/src/index.ts`
- `apps/api/src/app.test.ts`
- `docs/verification/beta-progress.md`

Results:

- Bumped workspace app/package metadata to `0.2.0`.
- Updated API health to return `version: "0.2.0"`.
- Updated the OpenAPI spec version to `0.2.0`.
- Updated server core compatibility reporting to `0.2.0` and adjusted the related plugin-compatibility test expectation.

Gaps carried forward:

- Run final browser dogfood walkthrough, full `pnpm check`, clean-copy validation, and beta acceptance audit.

## 2026-05-11 Final Beta Acceptance

Changed files:

- `docs/verification/beta-acceptance.md`
- `docs/verification/beta-readiness.md`
- `apps/web/index.html`
- `apps/web/public/favicon.svg`

Results:

- Ran the final local validation gates: frozen install, core build, API typecheck, focused beta archive regression, web typecheck, full workspace `pnpm check`, and web production build.
- Started a live API on a temporary SQLite database at `http://127.0.0.1:4400` and a web dev server at `http://127.0.0.1:5173`.
- Verified `GET /api/v1/health` returned API version `0.2.0`.
- Imported `docs/demo/ember-vault-beta-dogfood.ottx.json` through the live API and exported `camp_beta_ember_vault` back as archive `0.2.0`.
- Verified the live export preserved 4 users, 4 members, 2 scenes, 5 tokens, 6 actors, 4 items, 5 journals, 2 handouts, 6 chat messages, 4 rolls, 1 encounter, 1 combat, 1 AI thread, 1 AI eval, 3 AI tool calls, plugin storage, and audit logs.
- Ran a Playwright CLI browser smoke against the web app, selected the beta campaign, and verified the 4-seat session switcher, beta scenes/tokens, import status, and realtime status.
- Fixed the only browser console error by adding `apps/web/public/favicon.svg`; the recheck had no browser console errors.
- Validated the staged beta patch in a clean temp clone at `%TEMP%\otte-beta-clean-1778536962` with frozen install and full `pnpm check`.

Validation:

- `pnpm install --frozen-lockfile` passed.
- `pnpm --filter @open-tabletop/core build` passed.
- `pnpm --filter @open-tabletop/api typecheck` passed.
- `pnpm --filter @open-tabletop/api test -- -t "beta dogfood archive"` passed.
- `pnpm --filter @open-tabletop/web typecheck` passed.
- `pnpm check` passed.
- `pnpm --filter @open-tabletop/web build` passed.
- Clean clone `pnpm install --frozen-lockfile --dir %TEMP%\otte-beta-clean-1778536962` passed.
- Clean clone `pnpm --dir %TEMP%\otte-beta-clean-1778536962 check` passed.

Gaps carried forward:

- Push the accepted beta v0.2 commit to GitHub.
