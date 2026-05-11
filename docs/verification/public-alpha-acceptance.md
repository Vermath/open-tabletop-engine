# Public Alpha Acceptance

Date: 2026-05-11

## Objective

Ship OpenTabletop Engine public alpha v0.1 as a launchable open-source VTT, not just the MVP: easy to run, easy to demo, safe to open source, and credible for a GM to run a real SRD one-shot.

## Final Status

Accepted for public alpha v0.1. Required alpha artifacts exist, final validation passed, and remaining items are either blocked by explicit legal/safety constraints or documented as post-alpha.

## Prompt-To-Artifact Checklist

| Requirement | Evidence |
| --- | --- |
| Read required files first | `AGENTS.md`, `README.md`, `prd.md`, `package.json`, MVP verification docs, `docs/ai/overview.md`, `apps/api`, `apps/web`, `packages/core`, `packages/ai-core`, `packages/system-sdk`, and `packages/plugin-sdk` were inspected and summarized in `docs/verification/public-alpha-progress.md`. |
| Do not clone Roll20 or ship proprietary content | README, CONTRIBUTING, SECURITY, ROADMAP, PRD, and AGENTS state the boundary. Final content search found Roll20/D&D Beyond only in guardrails/status notes; demo content is original/SRD-only. |
| `docs/verification/public-alpha-readiness.md` exists and marks areas | File exists with Ready / Blocked / Post-alpha statuses and concrete evidence rows. |
| Progress tracked in `docs/verification/public-alpha-progress.md` | File records every major chunk, changed files, commands, results, gaps, and blockers. |
| Clean SRD one-shot demo | `docs/demo/ember-vault-public-alpha.ottx.json` is an `ottx` `0.1.0` archive for `The Ember Vault: Public Alpha One-Shot`, using `dnd-5e-srd` and seeded demo users. |
| Demo content requirements | The archive includes scene/map asset, tokens, character, NPC, monster, journals/handout, combat, initiative, dice/chat, damage, healing, one condition, and an AI GM-help proposal/thread/memory/tool call. |
| Clean checkout run path | README documents `pnpm install --frozen-lockfile`, `pnpm check`, separate API/web dev commands, browser URL, import path, and GM/player smoke path. `pnpm install --frozen-lockfile` passed in the current checkout and in a temporary clean copy with an empty `node_modules` tree. |
| API/web can start and open demo | Isolated current-head runtime started API on `4000`, web on `5173`, imported the archive, and opened the imported campaign in Playwright as GM and player. |
| GM/player loop and permissions | Two-browser Playwright proof verified player token movement syncing to GM, player dice syncing to GM, GM chat syncing to player, and GM combat restart visible to player. API regression verifies journal filtering, token visibility, allowed Valen movement, hostile scout non-disclosure, player dice/chat, combat restart/deactivation, and pending AI proposal state. |
| D&D/SRD play slice | `docs/system-sdk/overview.md` documents the primary `dnd-5e-srd` runtime. Full API tests cover checks, saves, skills, attacks, damage/healing, initiative, conditions, resources, rests, equipment, spells/features, monster actions, and encounter math. Alpha regression verifies the SRD demo path. |
| AI GM help | `docs/ai/overview.md` documents local/dev, OpenAI Responses, and Codex loopback providers, proposal/approval semantics, permission-filtered tools, memory, compendium lookup, operations, and limits. Demo archive includes a pending AI proposal. API tests cover proposal approval/apply boundaries, permission-safe tool advertisement, tool execution checks, memory, rules lookup, provider posture, and no direct hidden state mutation. |
| Export/import portability | Live API proof imported and re-exported the public-alpha archive and verified scene, actor, monster, token, journal, asset, combat, roll, and proposal records survived. Full API tests cover archive asset import/export round trips. |
| Extension story | `docs/plugin-sdk/overview.md` documents installing `example-macro-plugin` with only `chat.write` and running `/spark` without token context. `docs/system-sdk/overview.md` documents listing systems, installing `generic-fantasy`, and restoring `dnd-5e-srd`. Alpha regression verifies plugin/system installs, permission review, command output, and audit logs. |
| Launch docs | README, CONTRIBUTING, SECURITY, and `docs/ROADMAP.md` were updated with alpha setup, demo, scope, limits, content safety, license notes, security posture, and roadmap. |
| D&D Beyond status | README and ROADMAP state D&D Beyond import is not implemented, must not be scraped, and future adapter work must use permitted APIs or user-provided exports while keeping proprietary content out of the repo. |
| Final validation | `pnpm --filter @open-tabletop/api test -- -t "imports the public alpha demo archive"` passed during focused regression work. `pnpm --filter @open-tabletop/api typecheck` and `pnpm --filter @open-tabletop/web typecheck` passed. Final focused failing-case regression passed with 4 selected tests. Final root `pnpm check` passed lint, typecheck, tests, and build. |
| Clean-copy validation | A temporary clone at `%TEMP%\otte-alpha-clean-b01e75c44c6a47858f42b75c86a2e9f4` was created, the current working-tree changes and public-alpha untracked files were applied, `pnpm install --frozen-lockfile` materialized dependencies from an empty checkout, and `pnpm check` passed through lint, typecheck, tests, and build. |

## Final Commands

```bash
pnpm install --frozen-lockfile
pnpm --filter @open-tabletop/api test -- -t "reports server-admin runtime posture|hard-fences legacy x-user-id|builds and advances characters|runs deterministic ai thread"
pnpm check
git clone --no-hardlinks . %TEMP%\otte-alpha-clean-...
pnpm --dir %TEMP%\otte-alpha-clean-... install --frozen-lockfile
pnpm --dir %TEMP%\otte-alpha-clean-... check
```

## Final Validation Result

- `pnpm install --frozen-lockfile`: passed.
- Focused API failing-case regression: passed, 4 selected tests.
- Root `pnpm check`: passed. Lint and typecheck completed across 22 tasks each; tests completed across 22 tasks with full API suite reporting 110 passed; build completed with the web Vite production bundle.
- Clean-copy `pnpm check`: passed from a temporary clone plus current working changes. Lint and typecheck completed across 22 tasks each; tests completed across 22 tasks with full API suite reporting 110 passed; build completed with the web Vite production bundle.
- Local listener cleanup: the remaining API dev listener on port `4000` was stopped; ports `4000` and `5173` had no listeners afterward.

## Blocked Or Post-Alpha

- Roll20 UI/brand/assets/sheets/marketplace/proprietary workflows: blocked by project rules.
- Proprietary D&D, Roll20, or D&D Beyond content: blocked by project rules.
- Direct D&D Beyond scraping/import bypass: blocked until a safe legal path exists.
- Marketplace-scale distribution, payments, broad third-party content distribution, and exhaustive rules-system coverage: post-alpha.
