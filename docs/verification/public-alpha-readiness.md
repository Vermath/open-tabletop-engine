# Public Alpha Readiness

Last updated: 2026-05-11

## Objective

Ship OpenTabletop Engine public alpha v0.1 as a launchable open-source VTT, not just the already-proven MVP. The alpha must be easy to run, easy to demo, safe to open source, and credible for a GM running a real SRD-compatible fantasy one-shot.

## Status Key

- Ready: evidence exists, but may still need final release re-run before acceptance.
- Needs work: implementation or alpha-specific proof is incomplete.
- Blocked: cannot ship as requested without an external/legal/safety constraint being resolved.
- Post-alpha: intentionally out of public-alpha scope.

## Read-First Evidence

| Artifact | Current evidence |
| --- | --- |
| `AGENTS.md` | Confirms API-first VTT scope, scoped edits, shared `packages/core` types, proposal-only AI/plugin state changes, explicit permissions, and permissive SDK licensing. |
| `README.md` | Introduces product principles, apps/packages, clean `pnpm install --frozen-lockfile`, `pnpm check`, separate API/web startup commands, public-alpha demo import runbook, alpha scope, and legal/content-safety notes. |
| `prd.md` | Defines full platform plan, legal boundaries, plugin/system/AI architecture, MVP scope, and later beta hardening; public alpha is a stricter launch-readiness step after MVP. |
| `package.json` | Version `0.1.0`; `pnpm check` runs lint, typecheck, test, and build through Turbo. |
| `docs/verification/mvp-acceptance-audit.md` | MVP acceptance is extensively evidenced, including clean checkout, role/ownership, export/import, plugins/systems, D&D SRD, and AI. Public alpha still needs fresh alpha-specific acceptance proof. |
| `docs/verification/mvp-progress.md` | Contains historical and recent evidence slices through 2026-05-11, but not a public-alpha checklist or acceptance artifact. |
| `docs/ai/overview.md` | Documents local/dev, OpenAI Responses, and Codex loopback provider posture; proposal/approval, permission-filtered tools, admin operations, cost, safety, and replay behavior are covered. |
| `apps/api` | Fastify API, tests, realtime, asset storage, plugin runtime, SQLite store, and route implementation exist. |
| `apps/web` | React client, Admin operations surfaces, API client wrapper, and VTT UI exist. |
| `packages/core` | Domain types, permission model, proposals, events, archive helpers, seed state, and vision utilities exist. |
| `packages/ai-core` | Provider interface, OpenAI Responses adapter, permission-filtered context, and AI tool typing exist. |
| `packages/system-sdk` | Large system runtime implementation and tests exist, including `dnd-5e-srd`. |
| `packages/plugin-sdk` | Permissioned plugin SDK surface exists under MIT licensing. |
| `docs/demo/ember-vault-public-alpha.ottx.json` | Importable SRD-only public-alpha one-shot archive with map asset, scene, actors, tokens, journals, handout, combat, rolls/chat, condition, and AI proposal evidence. |

## Area Readiness

| Area | Status | Evidence | Gap to close for public alpha |
| --- | --- | --- | --- |
| 1. Public-alpha readiness docs | Ready | This file tracks the readiness map; `docs/verification/public-alpha-progress.md` tracks work chunks; `docs/verification/public-alpha-acceptance.md` records final proof. | None. |
| 2. Clean demo one-shot | Ready | `docs/demo/ember-vault-public-alpha.ottx.json` provides an SRD-only one-shot archive with `dnd-5e-srd` campaign/actors, map asset, scene, three tokens, character/NPC/monster actors, journals, handout, combat, initiative/damage/healing rolls with chat messages, one condition, and an AI GM help proposal. The archive was imported into a live runtime and opened in the web app; the focused alpha regression imports it and verifies its play data and permissions. | None. |
| 3. Clean checkout run | Ready | README gives the install/check/start/import instructions. Current-head validation passed `pnpm install --frozen-lockfile`, `pnpm check`, API startup on `4000`, web startup on `5173`, archive import, and browser opening of the imported campaign. A temporary clean copy with the current working changes applied also passed frozen install and full `pnpm check` from an empty `node_modules` tree. | None. |
| 4. GM/player loop | Ready | MVP audit records prior two-browser GM/player role check, player-owned token movement syncing to GM, and forbidden movement returning `403`. Current-head Playwright smoke showed the imported alpha campaign in GM and player sessions, player-disabled GM controls, player-visible public journal/chat/combat, and API-to-browser realtime chat delivery after fixing the Vite WebSocket proxy. A current-head two-browser Playwright pass verified the imported alpha campaign opens directly for a player who only belongs to that campaign, player token movement syncs to the GM browser, player dice rolls sync to the GM browser, GM chat syncs to the player browser, and GM combat restart shows the updated tracker to the player. `apps/api/src/app.test.ts` now imports the alpha archive and asserts player public journal filtering, GM/player token visibility, allowed Valen movement, hostile scout non-disclosure, player dice/chat, combat restart/deactivation, and pending AI proposal. | Re-run during final acceptance. |
| 5. D&D/SRD play slice | Ready | `docs/api/rest.md`, `docs/system-sdk/overview.md`, and `apps/api/src/app.test.ts` cover `dnd-5e-srd` checks, saves, skills, attacks, damage/healing, initiative, conditions, resources, rests, equipment, spells/features, monster actions, and encounter math. The public-alpha archive is bound to `dnd-5e-srd`; the alpha regression verifies SRD actors, monster data, condition evidence, dice/chat, combat, and initiative. | None. |
| 6. AI GM help | Ready | `docs/ai/overview.md` documents local/dev, OpenAI Responses, and Codex loopback providers; AI tools are permission-filtered and proposal/approval based. The alpha archive includes a pending AI GM-help proposal, AI thread, memory, and tool call; API tests verify proposal review boundaries, provider abstraction, permission-filtered tools, memory, compendium lookup, and no direct secret state mutation. | None. |
| 7. Portability | Ready | Current-head API injection imported `docs/demo/ember-vault-public-alpha.ottx.json` through `POST /api/v1/import/campaign`, exported it through `GET /api/v1/campaigns/camp_public_alpha_ember_vault/export`, and verified scene, actor, monster, token, journal, asset, combat, roll, and proposal records survived. Full API tests also cover archive asset import/export round trips. | None. |
| 8. Extension story | Ready | `docs/plugin-sdk/overview.md` documents the public-alpha `example-macro-plugin` install and `/spark` command path with an explicit `chat.write`-only grant, proving no ambient `token.read`. `docs/system-sdk/overview.md` documents the active `dnd-5e-srd` system and `generic-fantasy` install/restore smoke path. `apps/api/src/app.test.ts` now imports the alpha archive, installs the plugin, runs the command, verifies the subset permission review and audit log, lists systems, installs `generic-fantasy`, audits `system.install`, and restores `dnd-5e-srd`. | Re-run the focused regression and final `pnpm check` during final acceptance. |
| 9. Launch docs | Ready | README now has public-alpha quickstart, demo runbook, current alpha scope, content safety, and license notes. `docs/ROADMAP.md` defines public-alpha, post-alpha, and out-of-scope work. `CONTRIBUTING.md` uses the current clean-checkout commands and public-alpha content rules. `SECURITY.md` calls out permissions, plugin grants, AI proposals, import safety, and secret handling. AI/API/plugin/system docs are detailed. | Re-read during final acceptance and keep limits honest. |
| 10. Legal/content safety | Ready | README states no proprietary Roll20, D&D Beyond, or non-SRD D&D content/assets/workflows, and documents D&D Beyond import as not implemented with no scraping or access-control bypass. PRD and AGENTS carry the same guardrail. Final content search found those terms only in guardrails/status notes and `dnd-5e-srd`/SRD references in the demo. | None. |
| 11. Final validation | Ready | `pnpm install --frozen-lockfile` passed. Focused alpha/API regressions passed. Final root `pnpm check` passed lint, typecheck, tests, and build. | None. |
| 12. Final acceptance artifact | Ready | `docs/verification/public-alpha-acceptance.md` exists and maps the prompt to concrete artifacts and evidence. | None. |

## Prompt-To-Artifact Checklist

| Requirement | Evidence inspected | Current result |
| --- | --- | --- |
| Make `docs/verification/public-alpha-readiness.md` | This file. | Ready. |
| Mark each area Ready / Needs work / Blocked / Post-alpha | Area readiness table above. | Ready. |
| Make `docs/verification/public-alpha-progress.md` | Created and updated throughout the public-alpha work. | Ready. |
| Clean demo has scene/map/tokens/actors/NPC/monster/journal/combat/dice/chat/initiative/damage/healing/condition/AI flow | `docs/demo/ember-vault-public-alpha.ottx.json` parsed, imported, opened in web, and covered by the alpha regression. | Ready. |
| Clean checkout can install, check, start API/web, open demo | README has alpha install/check/start/import instructions; current-head validation passed frozen install, full check, API/web startup, archive import, and Playwright opening of the imported demo. Temporary clean-copy validation also passed frozen install and full check. | Ready. |
| GM/player realtime permissions | API regression and two-browser Playwright proof covered imported alpha player visibility, allowed/blocked token access, token movement, dice/chat, combat restart, and AI proposal state. | Ready. |
| D&D/SRD play slice | `docs/api/rest.md`, `docs/system-sdk/overview.md`, `packages/system-sdk`, and full API tests. | Ready. |
| AI GM help | `docs/ai/overview.md`, API route docs, demo proposal/thread/memory/tool call, and API tests. | Ready. |
| Export/import portability | API injection imported and re-exported the public-alpha archive with key data preserved; full API tests cover import/export. | Ready. |
| Plugin/system examples | `docs/plugin-sdk/overview.md`, `docs/system-sdk/overview.md`, `plugins/example-macro-plugin`, `plugins/example-system-generic-fantasy`, and the public-alpha API regression. | Ready. |
| Launch docs | README, `docs/ROADMAP.md`, `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE`, package license files, and docs license. | Ready. |
| Safe/legal public release | AGENTS, PRD, licenses, README content-safety section, and final content search. | Ready. |
| `pnpm check` passes | Final root `pnpm check` passed. | Ready. |
| `docs/verification/public-alpha-acceptance.md` proves all requirements | Acceptance artifact added. | Ready. |

## Blocked Or Post-Alpha Scope

| Item | Status | Reason |
| --- | --- | --- |
| Roll20 UI/brand/assets/sheets/marketplace cloning | Blocked | Explicitly prohibited; public alpha must use original UX and assets. |
| Proprietary D&D, Roll20, or D&D Beyond content | Blocked | Explicitly prohibited; only SRD/open/legal content can ship. |
| Direct D&D Beyond import/scrape | Blocked | No safe public/legal path is established in this repo. Public alpha should document safe adapter/import options only. |
| Marketplace payments and broad third-party distribution | Post-alpha | PRD places marketplace-scale distribution after core plugin/runtime safety. |
| Every rules system and full D&D automation edge cases | Post-alpha | Public alpha should prove one SRD one-shot and document limits honestly. |

## Next Concrete Work

No required public-alpha work remains before handoff. Post-alpha items remain listed above.
