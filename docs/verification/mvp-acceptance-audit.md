# MVP Acceptance Audit

This audit maps the requested OpenTabletop Engine PRD MVP scope to implementation evidence. It is evidence-first: a requirement is counted only when there is product behavior, automated validation, and manual acceptance evidence.

## Objective

Turn the prototype into a working PRD MVP where:

- A clean checkout can install, validate, and run the app with documented commands.
- A GM can run a real tabletop session in the browser.
- Two clients can share realtime scene state.
- Campaign state and uploaded assets survive restarts.
- Import/export round-trips campaign data and uploaded assets.
- Auth, permissions, AI, plugins, systems, journals, actors, tokens, and realtime APIs enforce the MVP permission model.
- Every claimed PRD MVP workflow is backed by tests, command output, and manual acceptance evidence.

## Clean Checkout Runbook

Clone and validate:

```powershell
git clone https://github.com/Vermath/open-tabletop-engine.git D:\otte-clean-check-20260501
cd D:\otte-clean-check-20260501
pnpm install --frozen-lockfile
pnpm check
```

Run local development services:

```powershell
$env:PORT='4433'
$env:HOST='127.0.0.1'
$env:OTTE_SQLITE_PATH='D:\otte-clean-check-20260501\storage\clean-run-20260501.sqlite'
$env:OTTE_AI_PROVIDER='codex-loopback'
pnpm --filter @open-tabletop/api dev

$env:VITE_API_URL='http://127.0.0.1:4433'
pnpm --filter @open-tabletop/web exec vite --host 127.0.0.1 --port 5182
```

Run the Docker Compose stack on default ports when available:

```powershell
Copy-Item .env.example .env
pnpm install
docker compose up --build
```

If default ports are already occupied, override the host ports:

```powershell
$env:API_PORT='4480'
$env:WEB_PORT='5183'
$env:POSTGRES_PORT='55432'
$env:REDIS_PORT='56379'
$env:MINIO_API_PORT='9900'
$env:MINIO_CONSOLE_PORT='9901'
$env:VITE_API_URL='http://localhost:4480'
$env:OTTE_AI_PROVIDER='codex-loopback'
docker compose -p otte_clean_20260501 up --build -d
```

Smoke the running API:

```powershell
$base = 'http://127.0.0.1:4480'
$gmLogin = Invoke-RestMethod -Method Post -Uri "$base/api/v1/auth/login" -Body (@{ userId='usr_demo_gm' } | ConvertTo-Json -Compress) -ContentType 'application/json'
$headers = @{ Authorization = "Bearer $($gmLogin.token)" }
Invoke-RestMethod -Method Get -Uri "$base/api/v1/campaigns" -Headers $headers
Invoke-RestMethod -Method Post -Uri "$base/api/v1/dice/roll" -Headers $headers -Body (@{ campaignId='camp_demo'; formula='1d20+5'; visibility='public'; label='Compose Check' } | ConvertTo-Json -Compress) -ContentType 'application/json'
Invoke-RestMethod -Method Post -Uri "$base/api/v1/chat/messages" -Headers $headers -Body (@{ campaignId='camp_demo'; body='Compose stack smoke chat'; type='plain'; visibility='public' } | ConvertTo-Json -Compress) -ContentType 'application/json'
Invoke-RestMethod -Method Post -Uri "$base/api/v1/campaigns/camp_demo/ai/memory/extract" -Headers $headers -Body (@{ sourceText='Compose memory extraction works.' } | ConvertTo-Json -Compress) -ContentType 'application/json'
```

Open the browser client at the configured web URL, for example `http://127.0.0.1:5183/`, and verify:

- The page title is `OpenTabletop Engine`.
- The sidebar shows `Demo GM - owner`.
- The session status shows `Realtime connected`.
- The scene renders the `Valen Ash` token.
- API-created dice and chat entries appear in the chat rail.

## Current Clean-Run Evidence

- Fresh clone path: `D:\otte-clean-check-20260501`.
- Local-dev fresh-clone run head: `5587210 docs: add ai memory extraction evidence`.
- `pnpm install --frozen-lockfile` completed successfully from the fresh clone.
- `pnpm check` completed successfully from the fresh clone:
  - lint: `21 successful`.
  - typecheck: `21 successful`.
  - tests: `21 successful`, including API `16 passed`.
  - build: `13 successful`.
- Local dev clean-run servers:
  - API: `http://127.0.0.1:4433`.
  - Web: `http://127.0.0.1:5182`.
  - SQLite file: `D:\otte-clean-check-20260501\storage\clean-run-20260501.sqlite`.
  - API smoke returned `ots_` bearer token length `47`, campaign `camp_demo`, one scene, token `Valen Ash`, dice formula `1d20+5`, chat `Clean checkout smoke chat`, AI provider `codex-app-server`, AI memory text containing `Clean checkout memory extraction works`, and an existing SQLite file.
  - Browser smoke showed `Realtime connected`, `The Ember Vault`, token marker `VA`, actor sheet `Valen Ash`, and the API-created dice/chat entries.
- Docker Compose verification:
  - Compose implementation commit: `0babc83 fix: make compose stack runnable`.
  - `docker compose -p otte_clean_20260501 config --quiet` passed with alternate host ports.
  - `docker compose -p otte_clean_20260501 up --build -d` built API and web images and started Postgres, Redis, MinIO, API, and web containers.
  - The first compose attempt exposed and fixed a broken MinIO tag and a pnpm runtime dependency packaging issue in the API image.
  - Final compose container state showed API on `4480`, web on `5183`, Postgres on `55432`, Redis on `56379`, MinIO API on `9900`, and MinIO console on `9901`.
  - `GET http://127.0.0.1:4480/api/v1/health` returned `{ "ok": true, "version": "0.1.0", "service": "open-tabletop-api" }`.
  - Compose API smoke returned `ots_` bearer token length `47`, campaign `camp_demo`, dice formula `1d20+5`, chat `Compose stack smoke chat`, AI provider `codex-app-server`, and memory text containing `Compose memory extraction works`.
  - Compose browser smoke showed `Realtime connected`, the scene/token UI, and the compose-created dice/chat entries.
  - Browser console had only a missing `favicon.ico` error, unrelated to the MVP workflow.
- Role/ownership clean checkout verification:
  - Fresh clone path: `D:\otte-clean-role-20260501`.
  - Role audit head: `c14f83c docs: refresh asset storage audit`.
  - `pnpm install --frozen-lockfile` passed.
  - `pnpm check` passed across lint, typecheck, tests, and build; API tests reported `17 passed`.
  - Local role audit servers used API `http://127.0.0.1:4434`, web `http://127.0.0.1:5185`, and SQLite file `D:\otte-clean-role-20260501\storage\role-clean-20260501.sqlite`.
  - GM browser session loaded as `Demo GM - owner`, showed `Realtime connected`, rendered `VA`, and kept GM-only controls enabled.
  - Player browser session switched to `Demo Player - player`, showed `Synced`, rendered `VA`, and disabled GM-only controls: `Scene`, `Map`, `Token`, `Add token`, `Start combat`, `Reveal fog`, `Add wall`, and `Add light`.
  - Player-owned token `VA` moved in the player browser from `{ x: 644.46875, y: 417.640625 }` to `{ x: 669.671875, y: 434.421875 }`.
  - GM browser observed the same realtime token position `{ x: 669.671875, y: 434.421875 }`.
  - API state agreed after movement with `tok_valen` at `x: 767`, `y: 423`.
  - A player attempt to move GM-created token `tok_momxh08h2s67kkt8` returned `403`.
  - Screenshots were saved in the clean clone at `output/playwright/role-clean-gm.png` and `output/playwright/role-clean-player.png`.

## Prompt-To-Artifact Checklist

| Requirement | Evidence |
| --- | --- |
| Durable storage, migrations, and restart-safe campaign state | `c7c3fb7 feat: add durable sqlite store and session permissions`; API restart persistence test; manual API persistence evidence in `docs/verification/mvp-progress.md`. |
| Auth/session handling, password accounts, campaign invites, OIDC SSO, password reset/email delivery, first-class reset UI, TOTP MFA, SCIM provisioning, SCIM group role mapping, browser organization access administration, admin account/session operations, server-admin audit export, and REST/realtime/blob permissions | `3ce9a8d feat: add durable bearer sessions` plus the password accounts, campaign invites, OIDC SSO, production auth operations, production auth audit export, password reset UI, production auth MFA, SCIM organization sync, SCIM group role mapping, and Organization Admin Access UI slices in `docs/verification/mvp-progress.md`; browser/API bearer evidence; API tests for login, logout, restart-safe token lookup, no-token `401`, password registration/login/change/reset, TOTP MFA enrollment/confirmation/login/recovery/disable, invite create/list/accept/revoke, OIDC config/start/callback with PKCE/state/user linking, SCIM bearer enforcement/user provisioning/deprovisioning/group sync, SCIM group-to-campaign membership sync, server-admin user/session/outbox controls, browser SCIM group mapping create/delete, audit export filters/NDJSON/redaction, disabled legacy-header auth outside tests, session-token blob/realtime access, and Playwright reset-screen evidence. |
| Campaigns, scenes, maps/assets, tokens, dice, chat, actors, sheets, journals, combat, fog/walls/lights | Verified milestone evidence for uploaded maps, signed asset delivery, CDN edge configuration, quotas, lifecycle state, storage stats, migration tooling, deployed recurring asset cleanup, built-in and external asset trust scanning, GM/player session switching, hidden-token filtering, polygon fog reveal, hide/erase fog filtering, smoothed freehand fog brushes, fog delete and undo/history, multi-scene fog presets, polygon vision filtering, clipped colored lighting, terrain walls, token movement ownership, fog/wall/light authoring, dice/chat/API tests, actor sheet UI, journal visibility tests, combat UI/API, and clean-checkout role/ownership acceptance in `docs/verification/mvp-progress.md`. |
| Realtime movement across two browser sessions | `3a3e81a feat: add plugin and system runtimes` and `3db3da6 feat: add demo player session switching` manual browser evidence verify second-client realtime token movement; the clean role audit above confirms a player-owned drag in one browser updates the GM browser in a fresh checkout. |
| Export/import round-trips campaign data and uploaded assets | `6d9e56c feat: round trip campaign archives`, `7b73c10 feat: archive uploaded asset files`, and `a08b7ce feat: back assets with s3 storage`; tests and manual source/target API evidence verify scenes, tokens, actors, journals, encounters, permissions, assets, local uploaded blob restoration, and S3/MinIO uploaded blob restoration. |
| Plugin runtime behavior with permission boundaries | `3a3e81a feat: add plugin and system runtimes` plus the packaged plugin runtime, plugin version distribution, plugin trust policy, remote plugin registry sync, plugin storage API, and plugin marketplace review slices in `docs/verification/mvp-progress.md`; tests verify manifest package loading, server-entrypoint checksums, VM sandbox execution, hidden `process`, blocked `eval`, entrypoint path containment, install permission, permission-review grants, blocked command without `chat.write`, `/spark` chat after permission grant, versioned catalog metadata, install of version `1.0.0`, upgrade to version `2.0.0`, rollback to version `1.0.0`, command execution against the installed version, trusted signature verification, unsigned package install denial, tampered signature denial, allowlisted registry sync, registry provenance metadata, registry-synced install, registry-synced command execution, configure-gated plugin storage APIs, command-visible storage snapshots, command-returned storage mutations, storage audit logs, approval-required marketplace review denial, server-admin approval, install and execution after approval, rejection after install, execution denial after rejection, campaign plugin review metadata, and admin review audit logs; browser/API evidence verifies installed package metadata, checksums, trust status, command output, registry distribution, persisted plugin storage behavior, and strict review-policy behavior. |
| System runtime behavior with permission boundaries | `3a3e81a feat: add plugin and system runtimes` plus the rules compendium/conditions, character builder/advancement, encounter math, character importer, action automation, rest/resource automation, action resource consumption, target effect application, D&D 5.5e SRD focus, SRD spell upcasting, SRD saving throw proficiency, SRD skill proficiency, SRD tool proficiency, SRD equipment purchasing, SRD monster XP/CR encounter, SRD monster action automation, SRD character origin choice, SRD expanded spell/weapon compendium, SRD Armor Class automation, SRD Fighter Second Wind automation, SRD Fighter level-2 feature automation, SRD Fighter level-5 feature automation, SRD Barbarian Rage/Reckless Attack automation, SRD Bard Bardic Inspiration/Font of Inspiration automation, SRD Cleric level-2 Channel Divinity automation, SRD Cleric level-5 Sear Undead automation, SRD Paladin Lay On Hands/Divine Smite automation, SRD Druid Wild Shape/Wild Resurgence automation, SRD Ranger Favored Enemy/Hunter's Mark automation, SRD Wizard Arcane Recovery automation, and SRD Rogue Sneak Attack/Cunning Strike automation slices in `docs/verification/mvp-progress.md`; tests and browser/manual evidence now prioritize `dnd-5e-srd` with SRD 5.2.1 registration, Fighter/Barbarian/Bard/Cleric/Paladin/Druid/Ranger/Wizard/Rogue templates, SRD background/species origin catalogs, create-time origin application, SRD compendium entries, bounded expanded spell/weapon/armor entries, fixed and secondary spell damage quick rolls, computed Armor Class from Leather Armor/Studded Leather Armor/Chain Mail/Shield items, Fighter Second Wind, Action Surge, Tactical Mind, Extra Attack, and Tactical Shift automation, Barbarian Rage, Rage Damage, Danger Sense, Reckless Attack, Extra Attack, and Fast Movement automation, Bard Bardic Inspiration, Jack of All Trades, Font of Inspiration, and Charisma spellcasting automation, Cleric Channel Divinity, Divine Spark, Turn Undead, and Sear Undead automation, Paladin Lay On Hands, Divine Smite, Paladin's Smite, Extra Attack, Faithful Steed, half-caster spell slots, and Charisma spellcasting automation, Druid Wild Shape, Wild Companion, Wild Resurgence, full-caster spell slots, and Wisdom spellcasting automation, Ranger Favored Enemy, Hunter's Mark, Extra Attack, half-caster spell slots, and Wisdom spellcasting automation, Wizard Arcane Recovery rest automation, Rogue Sneak Attack and Cunning Strike automation, resource consumption for Second Wind, Rage, Bardic Inspiration, Action Surge, Channel Divinity, Font of Inspiration, Paladin's Smite, Faithful Steed, Lay On Hands, Favored Enemy, Hunter's Mark, Wild Shape, Wild Companion, Wild Resurgence, and Arcane Recovery, Extra Attack weapon attack-count metadata, class-specific resource/save/damage/advantage/rider metadata, Short Rest recovery for covered short-rest resources, Long Rest all-use recovery including Paladin resources and Arcane Recovery restoration, character import normalization, level advancement, SRD monster stat blocks, monster actor creation from threat ids, monster attack/damage quick rolls, CR/XP threat planning, 2024 Basic Rules encounter XP thresholds, spell-slot-consuming actions, Healing Word/Cure Wounds/Chromatic Orb/Ray of Sickness/Ice Knife/Divine Smite upcasting, saving throw quick rolls, class save proficiencies, skill and tool check quick rolls, class/template/background skill and tool proficiencies, SRD currency/equipment purchasing with insufficient-funds protection, Shortbow/Longbow/Scimitar/Shortsword/Dagger/Quarterstaff/Spear weapon data, target HP healing/damage application, hit dice, spell slots, short/long rest recovery, and permission denial before resource mutation. Generic Fantasy, Stellar Frontiers, and Mystic Noir remain verified demo runtimes for later expansion, but the primary gap-closing rules direction is D&D SRD. |
| AI provider config, OpenAI/Codex adapter behavior, tool coverage, retries, provider request timeouts, status observability, usage metrics, GM and server-admin operator telemetry, encounter designer, recap, memory extraction, approval queue, and proposal application | `e37b252`, `df807e8`, `d86ed8b`, `5eb9aae`, the OpenAI Responses adapter slice, the AI tool depth and observability slice, the AI integration reliability slice, the AI usage metrics slice, the AI operator dashboard slice, the AI campaign edit tools slice, the AI tool failure hardening slice, the AI tool advertisement filtering slice, the Server Admin AI Operations slice, the AI Provider Timeout Hardening slice, the AI Tool Permission Regression slice, and the AI actor action tool slice in `docs/verification/mvp-progress.md`; tests and manual evidence cover provider selection, permission-filtered context with visible actor action ids, permission-filtered provider tool advertisement, cross-role tool-advertisement permission regression, typed OpenAI Responses tool schemas, OpenAI provider usage mapping, Codex loopback proposal/encounter/journal/scene/token/actor/memory/dice/compendium/action tools, GM stateful actor-action execution, player mutation-tool denial, generic proposal underlying-permission checks, provider retry/failure/timeout handling, thread status and duration metadata, token usage and estimated-cost aggregation, GM-only front-end operator telemetry, server-admin cross-campaign AI/Codex operations telemetry, failed-tool observability, invalid tool-input rejection before side effects, encounter/recap proposal approval and application, queued memory approval, and provider-backed memory extraction. |
| Tests and manual verification for each MVP workflow | `docs/verification/mvp-progress.md` records automated validation and manual acceptance evidence for every completed slice; this audit adds clean-checkout and Docker Compose evidence. |
| Clean checkout can run app with documented commands | Fresh clone evidence above: `pnpm install --frozen-lockfile`, `pnpm check`, local dev API/web run, API smoke, browser smoke, and Docker Compose stack verification. |

## Post-MVP Limitations

These are intentionally not counted as blockers for the current PRD MVP acceptance:

- Enterprise IdP certification beyond the verified SCIM user/group provisioning, SCIM group role mapping, browser organization access administration, API-backed account/session operations, first-class password reset screen, local TOTP MFA, browser server-admin console, and server-admin audit export.
- Provider-specific storage compliance certifications beyond the verified local and S3/MinIO storage backends plus signed delivery, CDN edge configuration, quotas, lifecycle state, storage stats, migration tooling, deployed recurring cleanup jobs, built-in upload security scanning, and external AV/trust scanner webhook integration.
- External marketplace operations beyond the verified self-hosted review and allowlisted remote-registry workflow; local and registry-synced manifest packages, VM-sandboxed plugin modules, permission review, path containment, versioned installs, upgrade/rollback workflows, signed package trust policy, configure-gated plugin storage, server-admin review surfaces, approval-required review policy, rejected-package blocking, and review audit logs are now verified.
- A complete rules engine for every game system; the MVP now prioritizes D&D 5.5e SRD with `dnd-5e-srd` registration, SRD 5.2.1-oriented Fighter/Barbarian/Bard/Cleric/Paladin/Druid/Ranger/Wizard/Rogue templates, SRD background/species origin catalogs, create-time origin application, compendium entries, bounded expanded spell/weapon/armor entries, computed Armor Class from SRD armor/shield items, character import, guided advancement, action formulas, Fighter Second Wind, Action Surge, Tactical Mind, Extra Attack, and Tactical Shift class-feature quick rolls/resource/metadata automation, Barbarian Rage, Rage Damage, Danger Sense, Reckless Attack, Extra Attack, and Fast Movement quick rolls/resource/rest/metadata automation, Bard Bardic Inspiration, Jack of All Trades, Font of Inspiration, and Charisma spellcasting quick rolls/resource/rest/spell-slot metadata automation, Cleric Channel Divinity, Divine Spark, Turn Undead, and Sear Undead quick rolls/resource/metadata automation, Paladin Lay On Hands, Divine Smite, Paladin's Smite, Extra Attack, Faithful Steed, half-caster spell-slot, and Charisma spellcasting quick rolls/resource/rest/metadata automation, Druid Wild Shape, Wild Companion, Wild Resurgence, full-caster spell-slot, and Wisdom spellcasting quick rolls/resource/rest/metadata automation, Ranger Favored Enemy, Hunter's Mark, Extra Attack, half-caster spell-slot, and Wisdom spellcasting quick rolls/resource/rest/metadata automation, Wizard Arcane Recovery resource/rest/selected spell-slot recovery automation, Rogue Sneak Attack and Cunning Strike quick rolls/metadata automation, stateful spell-slot consumption, Healing Word/Cure Wounds/Chromatic Orb/Ray of Sickness upcasting, Ice Knife secondary damage and Divine Smite upcasting, fixed and secondary spell damage quick rolls, saving throw quick rolls, class save proficiencies, skill and tool check quick rolls, class/template/background skill and tool proficiencies, SRD currency/equipment purchasing, Shortbow/Longbow/Scimitar/Shortsword/Dagger/Quarterstaff/Spear weapon data, target damage/healing application, hit dice, spell slots, rest recovery including Short Rest one-use Second Wind, Rage, Channel Divinity, and Wild Shape recovery, Short Rest Action Surge recovery, Short Rest selected Wizard Arcane Recovery, and Long Rest all-use Fighter/Barbarian/Bard/Cleric/Paladin/Druid/Ranger/Wizard resource recovery, SRD monster stat blocks, monster actor creation, monster attack/damage quick rolls, CR/XP encounter threat budgets, and 2024 Basic Rules encounter XP thresholds. Remaining non-MVP D&D work is full SRD-scale spell/equipment/magic-item content coverage, broader class/subclass feature automation beyond the currently covered early-level class slices, more complete species trait automation, and full SRD-scale monster/action coverage beyond the current SRD threat catalog. Generic Fantasy, Stellar Frontiers, and Mystic Noir remain demo runtimes for later expansion.
- Codex integration hardening such as broader production provider edge cases and future-tool hardening as new tool classes are added; the MVP verifies provider abstraction, OpenAI Responses request/function-call mapping with typed tools and usage metrics, permission-filtered prompt context with visible actor actions, permission-filtered provider tool advertisement, cross-role tool-advertisement permission regression, Codex loopback behavior, proposal/encounter/journal/scene/token/actor/memory/dice/compendium/action tools, generic proposal underlying-permission checks, stateful actor-action execution with player denial, actor-action target effect application, provider retry/failure/timeout handling, thread status history, estimated-cost aggregation, GM-only front-end operator telemetry, server-admin cross-campaign AI/Codex operations telemetry, failed-tool observability, invalid tool-input rejection before side effects, proposal application, and memory extraction. Model-output quality evaluation is intentionally out of scope for the Codex integration goal.
