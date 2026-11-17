# Beta v0.2 Acceptance

Date: 2026-05-11

## Objective

Ship OpenTabletop Engine beta v0.2 from the public-alpha baseline as a dogfoodable VTT for real multi-session campaigns: reliable persistence, safer self-hosting, clearer contributor paths, SRD-only content, governed manual/automatic AI execution, permission-checked plugins, safe import primitives, and outside-dogfood proof.

## Final Status

Accepted for beta v0.2 publication and pushed to GitHub on `main`.

## Prompt-To-Artifact Checklist

| Requirement | Evidence | Current result |
| --- | --- | --- |
| Beta readiness/progress/acceptance docs exist | `docs/verification/beta-readiness.md`, `docs/verification/beta-progress.md`, this file | Ready. |
| Ready / Needs work / Blocked / Post-beta tracking exists | `docs/verification/beta-readiness.md` | Ready. |
| 3-session dogfood campaign works | `docs/demo/ember-vault-beta-dogfood.ottx.json`, `docs/demo/beta-dogfood-runbook.md`, API regression, live API import/export, browser smoke | Ready. Live export preserved 4 users, 4 members, 2 scenes, 5 tokens, 6 actors, 4 items, 5 journals, 2 handouts, 6 chat messages, 4 rolls, 1 combat, 3 AI tool calls, plugin storage, and audit logs. |
| Reliability/persistence is hardened | Archive `0.2.0` export, `0.1.0` import compatibility, unsupported-version rejection, backup/restore and upgrade docs, clean-clone validation | Ready for beta. Remaining broader HA/database work is post-beta. |
| GM/player UX is beta-hardened | Web import progress/result status, `aria-live` statuses, focus outlines, permission titles, scene tab `aria-pressed`, browser smoke | Ready. Browser smoke verified the imported beta campaign, 4-seat session switcher, scene/tokens, import status, and realtime status. |
| 1 GM + 3 players realtime works | `apps/api/src/app.test.ts` beta WebSocket regression | Ready. Automated smoke covers token movement, dice, chat, journal creation, combat start, and reconnect delivery for 1 GM + 3 players. |
| D&D/SRD multi-session slice works | `docs/system-sdk/dnd-srd-beta-support.md`, beta fixture, API regression, browser smoke | Ready. The fixture covers leveling metadata, rests/resources, conditions, spells/items, monsters, loot, encounter math, and character import/export metadata without proprietary content. |
| AI beta evals pass thresholds | `beta-quality-smoke` fixture evidence and `beta-v0.2-ai-quality-gate` API regression | Ready. Eval covers encounter design, combat advice, recap/memory, rules lookup, proposal safety, advertised tools, required/forbidden tool behavior, and permission boundaries. |
| Plugin/system beta story works | API regression installs `generic-fantasy`, restores `dnd-5e-srd`, installs `example-macro-plugin` with `chat.write`, verifies missing `token.read`, and runs `/spark` | Ready. |
| Safe content import primitives exist | Core/API types and endpoints for preview/list/apply/rollback/delete, provenance/license metadata, audit logs, campaign-local records, REST/self-hosting docs, focused API regression | Ready. The boundary explicitly excludes D&D Beyond scraping/auth bypass and proprietary content. |
| Release/ops docs are beta-ready | `docs/release/beta-v0.2.md`, upgrade, backup/restore, deployment/admin/security checklists, issue template, README and roadmap pointers | Ready. |
| Final validation passes | Frozen install, focused checks, full workspace check, live API/web/browser smoke, clean temp clone install/check | Ready. |
| Beta pushed to GitHub | `origin/main` contains the accepted beta v0.2 commit | Ready. |

## Blocked Or Post-Beta

- Roll20 UI/brand/assets/sheets/marketplace/workflow cloning: blocked by project rules.
- Proprietary D&D, Roll20, or D&D Beyond content: blocked by project rules.
- D&D Beyond scraping or auth bypass: blocked by project rules.
- Community-scale plugin distribution, broad third-party content distribution, and exhaustive rules-system coverage: post-beta; no commercial marketplace rails are required for this free OSS project.

## Final Commands

- `pnpm install --frozen-lockfile`
- `pnpm --filter @open-tabletop/core build`
- `pnpm --filter @open-tabletop/api typecheck`
- `pnpm --filter @open-tabletop/api test -- -t "beta dogfood archive"`
- `pnpm --filter @open-tabletop/web typecheck`
- `pnpm check`
- `pnpm --filter @open-tabletop/web build`
- Live runtime smoke on temporary SQLite state:
  - API dev server on `http://127.0.0.1:4400`
  - Web dev server on `http://127.0.0.1:5173`
  - `GET /api/v1/health` returned `version: "0.2.0"`
  - imported `docs/demo/ember-vault-beta-dogfood.ottx.json`
  - exported `camp_beta_ember_vault` as archive `0.2.0`
  - Playwright CLI browser smoke selected the beta campaign and verified the 4-seat session switcher, beta scenes/tokens, import status, and realtime status
- Clean temp clone proof:
  - `git diff --cached --binary --output=%TEMP%\otte-beta-staged-1778536962.patch`
  - `git clone --no-hardlinks --quiet . %TEMP%\otte-beta-clean-1778536962`
  - `git -C %TEMP%\otte-beta-clean-1778536962 apply --index %TEMP%\otte-beta-staged-1778536962.patch`
  - `pnpm install --frozen-lockfile --dir %TEMP%\otte-beta-clean-1778536962`
  - `pnpm --dir %TEMP%\otte-beta-clean-1778536962 check`

## Final Validation Result

Passed.

- Local workspace `pnpm check` passed lint, typecheck, tests, and production build.
- Clean temp clone `pnpm install --frozen-lockfile` and `pnpm check` passed after applying the staged beta patch.
- Focused beta archive regression passed.
- Live API/web/browser smoke passed; the only browser console issue seen initially was a missing favicon, which was fixed with `apps/web/public/favicon.svg` and rechecked with no console errors.
