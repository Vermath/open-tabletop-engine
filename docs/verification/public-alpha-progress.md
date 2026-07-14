# Public Alpha Progress

This log tracks work toward OpenTabletop Engine public alpha v0.1. It is separate from the historical MVP evidence because the public-alpha bar includes launch docs, a clean SRD one-shot demo, current-head portability proof, and public release safety.

## 2026-05-11 Initial Readiness Audit

Changed files:

- `docs/verification/public-alpha-readiness.md`
- `docs/verification/public-alpha-progress.md`

Commands and evidence inspected:

- Read `AGENTS.md`, `README.md`, `prd.md`, `package.json`, `docs/verification/mvp-acceptance-audit.md`, `docs/verification/mvp-progress.md`, and `docs/ai/overview.md`.
- Inspected app/package surfaces for `apps/api`, `apps/web`, `packages/core`, `packages/ai-core`, `packages/system-sdk`, and `packages/plugin-sdk` through package metadata and file lists.
- Checked existing verification docs: `docs/verification` previously contained only `mvp-acceptance-audit.md` and `mvp-progress.md`.
- Checked `packages/core/src/state.ts` seed data for the current demo campaign.
- Checked `docs/api/rest.md` for export/import, plugin runtime, system runtime, D&D SRD, and AI route documentation.

Results:

- Created the initial public-alpha readiness matrix with Ready / Needs work / Blocked / Post-alpha status.
- Created this public-alpha progress log for changed files, commands, evidence, gaps, and blockers.
- Confirmed MVP evidence is extensive but not sufficient by itself for public-alpha completion.
- Confirmed the current seeded demo `camp_demo` / `The Ember Vault` has a scene, wall, light, one player-owned token/actor, and one GM-only journal, but is not yet a full SRD one-shot demo because it lacks the required seeded NPC/monster, combat, initiative, damage/healing, condition, and AI GM help flow evidence.
- Confirmed the current seed actor uses `generic-fantasy`, while the public-alpha one-shot must prove a D&D/SRD play slice.
- Confirmed direct D&D Beyond import/scraping should be treated as blocked unless a safe public/legal path exists; public alpha should document adapter/import options only.
- Validation for this docs-only chunk: `git diff --check -- docs/verification/public-alpha-readiness.md docs/verification/public-alpha-progress.md` passed; targeted `Select-String` found the readiness statuses, D&D Beyond block, acceptance-doc gap, `The Ember Vault`, `generic-fantasy`, and `dnd-5e-srd` references.

Gaps carried forward:

- Build or identify a clean SRD one-shot fixture/export.
- Add alpha quickstart/demo docs to README.
- Re-run clean checkout current-head install/check/start/browser demo proof.
- Re-run GM/player realtime and permission proof against the alpha demo.
- Prove alpha demo export/import round trip.
- Document one plugin and one system module as the public-alpha extension story.
- Create `docs/verification/public-alpha-acceptance.md` only after all requirements have current-head evidence.

## 2026-05-11 Public Alpha Demo Archive Fixture

Changed files:

- `docs/demo/ember-vault-public-alpha.ottx.json`
- `docs/verification/public-alpha-readiness.md`
- `docs/verification/public-alpha-progress.md`

Commands and evidence inspected:

- Parsed `docs/demo/ember-vault-public-alpha.ottx.json` with Node.
- Summarized archive counts for users, campaigns, scenes, assets, tokens, actors, items, journals, handouts, chat, rolls, encounters, combats, proposals, AI threads, AI memory, AI tool calls, audit logs, and embedded files.
- Checked fixture predicates for SRD campaign/actors, map asset, NPC/monster, condition, initiative, damage/healing, combat, and AI proposal evidence.
- Inspected `packages/core/src/types.ts` for archive, asset, actor, chat, roll, AI, and audit field shape before tightening the fixture.

Results:

- Confirmed `docs/demo/ember-vault-public-alpha.ottx.json` is an `ottx` `0.1.0` campaign archive for `The Ember Vault: Public Alpha One-Shot`.
- Confirmed the fixture is SRD-only: campaign default system and all actors use `dnd-5e-srd`.
- Confirmed fixture contents include one map asset, one active scene, three tokens, a player character, an NPC guide, a monster opponent, two items, two journals, one handout, three public roll records, public chat messages for initiative, damage, and healing, one encounter, one active combat, one pending AI-created proposal, one AI thread, one AI memory fact, one AI tool call, and one audit log.
- Added explicit active lifecycle and clean security metadata to the inline map asset.
- Updated the archive to use the seeded `Demo GM` / `Demo Player` user ids so a clean checkout can import the file through the web UI and immediately see the campaign without manually editing browser storage.
- Kept the default `packages/core/src/state.ts` seed unchanged because existing API tests depend on the minimal seed shape and on `act_valen` using `generic-fantasy`.
- Updated `docs/verification/public-alpha-readiness.md` so the demo row records the archive fixture as present while still requiring clean import, browser demo, GM/player realtime, and export/import proof.
- Validation: the first `pnpm exec tsx -e ...` API injection attempt failed before app execution because top-level `await` is unsupported in the command's CommonJS output format.
- Validation: reran the API injection inside an async wrapper with `OTTE_ALLOW_LEGACY_USER_HEADER=true`; `POST /api/v1/import/campaign` returned `200`, `GET /api/v1/campaigns/camp_public_alpha_ember_vault/export` returned `200`, and the exported archive preserved the alpha scene, SRD actor, monster, token, player handout journal, map asset, combat, healing roll, and AI proposal.
- Validation: `node -e ...` fixture predicates passed for archive format/version, SRD campaign and actors, map, tokens, character, NPC, monster, journals, handout, combat, initiative, damage, healing, condition, AI proposal, and audit log.
- Validation: `git diff --check -- docs/demo/ember-vault-public-alpha.ottx.json docs/verification/public-alpha-readiness.md docs/verification/public-alpha-progress.md` passed.

Gaps carried forward:

- Import the archive into a clean runtime and verify it opens in the web app.
- Prove GM/player permissions and realtime sync against this alpha fixture.
- Re-run the fixture export/import round trip as final clean-checkout/browser acceptance evidence.
- Add launch-facing README demo instructions.
- Run final current-head `pnpm check` only after the launch docs and alpha verification are complete.

## 2026-05-11 README Public Alpha Runbook

Changed files:

- `README.md`
- `docs/verification/public-alpha-readiness.md`
- `docs/verification/public-alpha-progress.md`

Commands and evidence inspected:

- Inspected `apps/web/src/api.ts` to confirm the browser client uses bearer sessions and can log in as seeded/local users.
- Inspected `apps/web/src/App.tsx` to confirm the sidebar includes campaign selection, session switching, and an `Import` button wired to `POST /api/v1/import/campaign`.
- Inspected `apps/web/vite.config.ts` to confirm the local web dev server proxies `/api` to `http://localhost:4000`.
- Inspected `apps/api/src/server.ts` to confirm the API dev server defaults to port `4000`.

Results:

- Updated README development commands to use `pnpm install --frozen-lockfile`, `pnpm check`, and separate API/web dev server commands.
- Added a public-alpha demo runbook that imports `docs/demo/ember-vault-public-alpha.ottx.json` through the web sidebar and identifies the imported demo users as `Demo GM` and `Demo Player`.
- Added a two-browser smoke-test prompt for GM/player visibility and permission checks.
- Added a public-alpha scope section that names the current SRD, AI, plugin, system, and export/import surfaces and explicitly lists remaining hardening gaps.
- Added content-safety guidance: do not ship proprietary Roll20, D&D Beyond, or non-SRD D&D content/assets/workflows; D&D Beyond import is not implemented and must not be scraped or bypass access controls.
- Updated `docs/verification/public-alpha-readiness.md` so README, clean-checkout, launch-doc, and legal/content-safety rows reflect the new runbook while keeping final proof gaps open.
- Runtime correction: an initial browser smoke after importing the archive showed only the default `The Ember Vault` campaign because the first archive revision used separate `usr_alpha_*` members. The fixture and README now use seeded demo users so the documented clean-checkout import path can surface the alpha campaign directly.

Gaps carried forward:

- Run the README from a clean checkout/current-head runtime and capture browser proof.
- Prove GM/player realtime sync and permissions in two browsers against the imported alpha fixture.
- Review roadmap, contributing, security, and license notes for launch-readiness gaps.
- Create final `docs/verification/public-alpha-acceptance.md` after all public-alpha requirements have current-head evidence.

## 2026-05-11 Runtime Demo And Realtime Smoke

Changed files:

- `apps/web/src/App.tsx`
- `apps/web/src/api.ts`
- `apps/web/vite.config.ts`
- `docs/verification/public-alpha-readiness.md`
- `docs/verification/public-alpha-progress.md`

Commands and evidence inspected:

- Started the API against a temporary SQLite database at `%TEMP%\otte-public-alpha-demo\state.sqlite` with `pnpm --filter @open-tabletop/api dev`.
- Started the web client with `pnpm --filter @open-tabletop/web dev`.
- Imported `docs/demo/ember-vault-public-alpha.ottx.json` into the running API and exported it back through the running API.
- Used `npx --package @playwright/cli playwright-cli` to open `http://localhost:5173`, click the imported campaign, switch between `Demo GM` and `Demo Player`, inspect Journal, Combat, and AI tabs, and inspect console output.
- Posted a chat message through `POST /api/v1/chat/messages` while the browser was open to verify API-to-browser realtime delivery.

Results:

- Live API import returned `200` with campaign `camp_public_alpha_ember_vault` and counts for 2 members, 1 scene, 3 actors, 3 tokens, and 4 chat messages.
- Live API export returned the imported campaign with 2 members, 1 scene, 3 actors, 3 tokens, and 1 combat.
- Browser campaign list showed both the default seed and `The Ember Vault: Public Alpha One-Shot`; clicking the alpha campaign opened scene `Ember Vault Gate`.
- GM browser view showed SRD actor details, inventory, resources, public chat rolls for initiative/damage/healing, and AI proposal review controls.
- Player browser view showed the alpha campaign, disabled GM-only creation/map/fog/combat controls, public handout `Handout: Ember Vault Door`, and combat tracker round 1 with `Valen Ash` initiative 15 and `Vault Scout` initiative 12.
- The first browser smoke exposed a launch blocker: the Vite `/api` proxy did not forward WebSockets, so the UI showed `Realtime unavailable`.
- Patched `apps/web/vite.config.ts` to use an object proxy with `target: "http://localhost:4000"` and `ws: true`.
- After restarting web, the alpha campaign showed `Realtime connected` and console output had no WebSocket warnings. The only remaining browser error was a missing `favicon.ico`.
- Posted `Realtime smoke: the sealed door answers.` through the API; the open browser displayed it in chat without a manual refresh.
- The browser smoke also exposed a campaign-switch bug: the first refresh after selecting the alpha campaign could reuse `scn_vault_entry` from the default seed campaign while showing alpha campaign data.
- Patched `apps/web/src/api.ts` so `loadSnapshot` only honors a requested scene id when it belongs to the selected campaign.
- Patched `apps/web/src/App.tsx` so refresh resets the selected token to a loaded token when the previous selection is not present in the current snapshot.
- Re-ran the minimal browser path after the stale-scene fix; clicking `The Ember Vault: Public Alpha One-Shot` loaded `Ember Vault Gate`, fetched `scn_alpha_ember_vault` tokens, and showed the alpha token vision/resources on the first campaign click.
- Validation: `pnpm --filter @open-tabletop/web typecheck` passed after the Vite proxy change.
- Validation: fixture checks passed after switching the archive to seeded demo users.
- Validation: `git diff --check -- apps/web/src/App.tsx apps/web/src/api.ts apps/web/vite.config.ts README.md docs/demo/ember-vault-public-alpha.ottx.json docs/verification/public-alpha-readiness.md docs/verification/public-alpha-progress.md` passed, with only Git LF-to-CRLF working-copy warnings for Windows.
- Validation: `pnpm --filter @open-tabletop/web typecheck` passed after the stale-scene and selected-token fixes.

Gaps carried forward:

- Run a true two-browser GM/player realtime sync pass for token movement, dice, and combat updates.
- Decide whether to add a favicon or otherwise silence the remaining browser 404 before final launch docs.
- Re-run this runtime proof from an actual clean clone/current-head acceptance pass.

## 2026-05-11 Public Alpha API Regression

Changed files:

- `apps/api/src/app.test.ts`
- `docs/verification/public-alpha-readiness.md`
- `docs/verification/public-alpha-progress.md`

Commands and evidence inspected:

- Inspected existing archive round-trip tests in `apps/api/src/app.test.ts`.
- Inspected chat, dice, token, journal, combat, proposal, and import/export route behavior while shaping assertions.
- Ran the focused test with `pnpm --filter @open-tabletop/api test -- -t "imports the public alpha demo archive"`.
- Ran `pnpm --filter @open-tabletop/api typecheck`.
- Ran `pnpm --filter @open-tabletop/web typecheck`.

Results:

- Added a focused API regression that imports `docs/demo/ember-vault-public-alpha.ottx.json` and verifies the public-alpha campaign id, import counts, SRD campaign metadata, scene/map linkage, SRD character/NPC/monster actors, poisoned monster data, public-vs-GM journal visibility, GM token visibility, player token visibility, player-owned Valen movement, hostile scout non-disclosure, player dice/chat write, combat tracker initiatives, and pending AI proposal approval state.
- The first focused run failed because the fixture path was resolved relative to `apps/api`; the test now resolves the repo-level `docs/demo` path from the package cwd.
- The second focused run showed the player cannot see `tok_alpha_vault_scout`; the test now treats that as correct permission filtering and separately checks GM visibility.
- The third focused run showed a player move attempt against the unseen scout returns `404`, not `403`; the test now locks in non-disclosure for that hostile token.
- Final focused test run passed: 1 selected API test passed, 109 tests skipped by the name filter.
- API and web typechecks passed after the API regression and web campaign-switch fixes.

Gaps carried forward:

- Broaden validation beyond the focused public-alpha regression before final acceptance.
- Run final root `pnpm check` after remaining launch docs and realtime proof are complete.

## 2026-05-11 Public Alpha Extension Story

Changed files:

- `apps/api/src/app.test.ts`
- `README.md`
- `docs/plugin-sdk/overview.md`
- `docs/system-sdk/overview.md`
- `docs/verification/public-alpha-readiness.md`
- `docs/verification/public-alpha-progress.md`

Commands and evidence inspected:

- Inspected `plugins/example-macro-plugin/plugin.manifest.json` and `plugins/example-macro-plugin/server.sandbox.js`.
- Inspected `plugins/example-system-generic-fantasy/system.manifest.json`.
- Inspected plugin install/chat-command and system install routes in `apps/api/src/app.ts`.
- Ran `pnpm --filter @open-tabletop/api test -- -t "imports the public alpha demo archive"`.

Results:

- Extended the public-alpha API regression to list systems for `camp_public_alpha_ember_vault`, verify `dnd-5e-srd` is active, install `generic-fantasy`, assert the `system.install` audit entry, and restore `dnd-5e-srd`.
- Extended the same regression to install `example-macro-plugin` with only `chat.write`, verify the permission review marks `token.read` missing, run `/spark`, assert the plugin chat message, assert no token names are available without `token.read`, and assert the plugin audit metadata.
- Updated plugin SDK docs with the exact public-alpha install and chat-command endpoints.
- Updated system SDK docs with the exact public-alpha system list/install/restore endpoints and the `campaign.update` permission boundary.
- Updated README to point alpha users to the extension smoke path.
- Validation: the first focused run failed because the audit target type was `chat`, not `chatMessage`; the assertion now matches the existing audit schema.
- Validation: the focused public-alpha regression passed after the assertion correction: 1 selected API test passed, 109 tests skipped by the filter.

Gaps carried forward:

- Run API typecheck after this test/doc update.
- Run a true two-browser GM/player realtime sync pass for token movement, dice, and combat updates.
- Run final root `pnpm check` and create `docs/verification/public-alpha-acceptance.md` only after all final proof is in place.

## 2026-05-11 Two-Browser Realtime And Permissions Proof

Changed files:

- `apps/api/src/app.ts`
- `apps/api/src/app.test.ts`
- `apps/web/src/api.ts`
- `docs/verification/public-alpha-readiness.md`
- `docs/verification/public-alpha-progress.md`

Commands and evidence inspected:

- Started API on `4000` against `%TEMP%\otte-public-alpha-sync\state.sqlite` and web on `5173`.
- Imported `docs/demo/ember-vault-public-alpha.ottx.json` into the live runtime with `x-user-id: usr_demo_gm`.
- Used Playwright CLI sessions `otte-gm` and `otte-player` against `http://127.0.0.1:5173`.
- Checked live API combat responses for both `usr_demo_gm` and `usr_demo_player`.
- Closed both Playwright browser sessions and stopped the API/web listeners after the proof.

Results:

- Found and fixed a player launch bug: the web app initialized to `camp_demo` even when the current session could not read it. `loadSnapshot` now selects the requested campaign only if it exists in the current user's campaign list, otherwise it falls back to the first visible campaign.
- Found and fixed a combat restart behavior bug: starting combat appended another active combat. The API now deactivates existing active combats in the same campaign before creating the new active combat.
- Verified the player browser, with only `usr_demo_player`, opens `The Ember Vault: Public Alpha One-Shot` directly after the campaign fallback fix and shows `Realtime connected`.
- Verified player-owned token movement from the player browser updated `tok_alpha_valen` to `x: 410, y: 390` and the GM browser saw the token move through realtime refresh.
- Verified a player browser dice roll with `1d20+7` appeared in the GM browser chat as `Table roll: 1d20+7 = 17`.
- Verified a GM browser chat message `Browser sync chat from GM` appeared in the player browser chat.
- Verified GM browser combat restart produced a new active combat with Valen Ash `20`, Mira the Archivist `19`, and Vault Scout `18`; after reload the player browser showed the same active combat tracker. Live API responses showed the original fixture combat was inactive and the new combat active for both GM and player.
- Updated the alpha API regression to cover combat restart/deactivation on the imported alpha archive.

Gaps carried forward:

- Re-run focused API/web validation after these behavior fixes.
- Review launch docs beyond README, then run final root `pnpm check`.
- Create `docs/verification/public-alpha-acceptance.md` after the final completion audit.

## 2026-05-11 Launch Documentation Pass

Changed files:

- `README.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `docs/ROADMAP.md`
- `docs/verification/public-alpha-readiness.md`
- `docs/verification/public-alpha-progress.md`

Commands and evidence inspected:

- Read `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE`, `GOVERNANCE.md`, `CODE_OF_CONDUCT.md`, and `docs/LICENSE`.
- Checked package license metadata for the AGPL platform root and MIT SDK packages.
- Searched README, PRD, docs, and package metadata for Roll20, D&D Beyond, proprietary content, SRD, license, security, and roadmap references.

Results:

- Updated `CONTRIBUTING.md` to use the current clean-checkout commands and to spell out public-alpha content restrictions.
- Updated `SECURITY.md` with the then-current proposal review language, smallest useful plugin permission grants, importer safety, and secret handling. Current product-owner direction preserves both existing AI proposal and automatic-execution modes while retaining the plugin permission boundary.
- Added README license notes for AGPL platform code, MIT SDK packages, CC BY docs, and example package license metadata.
- Added `docs/ROADMAP.md` with public-alpha commitments, post-alpha work, and explicit out-of-scope proprietary content/workflows.
- Updated readiness status so launch docs are Ready pending final acceptance re-read.

Gaps carried forward:

- Run docs diff checks and final validation.
- Create `docs/verification/public-alpha-acceptance.md` only after the final completion audit and `pnpm check`.

## 2026-05-11 Final Validation And Acceptance

Changed files:

- `apps/api/src/app.test.ts`
- `docs/verification/public-alpha-readiness.md`
- `docs/verification/public-alpha-progress.md`
- `docs/verification/public-alpha-acceptance.md`

Commands and evidence inspected:

- Ran `pnpm install --frozen-lockfile`.
- Ran focused failing-case regression: `pnpm --filter @open-tabletop/api test -- -t "reports server-admin runtime posture|hard-fences legacy x-user-id|builds and advances characters|runs deterministic ai thread"`.
- Ran final root `pnpm check`.
- Created a temporary clean copy at `%TEMP%\otte-alpha-clean-b01e75c44c6a47858f42b75c86a2e9f4`, applied the current working-tree changes and public-alpha untracked docs/demo files, then ran `pnpm install --frozen-lockfile` and `pnpm check` there.
- Searched public-alpha docs and demo fixture for Roll20, D&D Beyond, proprietary-content, SRD, and `dnd-5e-srd` references.
- Checked local listeners on ports `4000` and `5173` after validation and stopped one leftover API dev process on `4000`.

Results:

- `pnpm install --frozen-lockfile` passed: lockfile was up to date and dependencies were already installed.
- The first final `pnpm check` run failed in full API tests because four older expectations did not match current runtime behavior: server-admin configured count, production legacy-auth isolation, the Stellar Frontiers `Field Repair` template addition, and the custom AI provider runtime selection.
- Updated those tests so they assert the current behavior explicitly: two configured admin IDs, production legacy-auth test with unrelated production auth env configured, `Field Repair` present in items/talents, and `OTTE_AI_PROVIDER=eval-ai` for the custom evaluation provider.
- Focused failing-case regression passed with 4 selected API tests passing.
- Final root `pnpm check` passed end to end: lint, typecheck, tests, and build. Full API tests reported 110 passed; web production build completed with Vite.
- The clean-copy validation also passed: frozen install materialized 387 packages from an empty checkout, lint/typecheck/test/build all completed, full API tests reported 110 passed, and the Vite web production build completed.
- Final content search found Roll20 and D&D Beyond only in guardrails/status notes; the demo archive remains original/SRD-only with `dnd-5e-srd` system metadata.
- Added `docs/verification/public-alpha-acceptance.md` as the final prompt-to-artifact proof.

Gaps carried forward:

- None for public alpha v0.1 acceptance. Blocked and post-alpha items remain documented in `docs/verification/public-alpha-readiness.md` and `docs/ROADMAP.md`.
