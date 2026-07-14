# Roadmap implementation verification - completed through 2026-07-14

## Status and claim boundary

The current working tree implements the code-addressable capability bullets in `docs/PRODUCT_ROADMAP.md` from P0 through P3. The roadmap's **Not now** section remains deliberately excluded.

This is an engineering implementation record, not a declaration that the Internal Playable, Private Alpha, Public Beta, or 1.0 stage exits have been earned. Those exits also require evidence that code cannot manufacture: real multi-session play, external users, hosted backup/restore and migration drills, production-sized capacity observations, and manual assistive-technology passes.

The D&D rules/content baseline is the [official SRD 5.2.1 PDF](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf). No proprietary D&D content was copied, scraped, or bundled. The `@open-tabletop/system-sdk` source code remains MIT-licensed, while its structured SRD-derived records remain CC BY 4.0 content under the package-local `CONTENT_NOTICE.md` and the published [System SDK code and content notice](../legal/system-sdk-content-notice.md); distributors must preserve both license boundaries and the SRD attribution.

## P0 - Rules-safe session core

- Added versioned D&D actor/item validation, lossless unknown-field handling, sourced issues, and non-destructive repair previews.
- Replaced unsafe advancement, rest, consequential action, scheduled-effect, and typed-damage mutations with server-authoritative prepared preview/commit transactions. Commits require the stored prepared key, exact actor/item/combat revisions as applicable, a separate idempotency key, current authorization, and the exact server-calculated or server-rolled result; direct unprepared consequential commits fail without mutation.
- Closed the generic actor/item `PATCH` escape hatch around those transactions. Every raw replacement now requires the exact current revision; character-review evidence is immutable on the raw route; rules-managed actor and inventory/preparation/consumption roots require the reviewed mutation APIs. Campaign actor managers retain an explicitly reasoned, length-bounded manual override for exceptional recovery, and each override is separately audited. Owners can still edit descriptive and homebrew fields without pretending those edits are rules automation.
- Added durable pending advancement records for both incomplete choice drafts and ready reviews. Drafts survive reload, SQLite restart, archive round trip, and actor switching; the UI can resume or explicitly cancel them before a prepared commit.
- Added typed multi-component and multi-target damage with temporary-HP handling, immunity, resistance, vulnerability, rounding, sourced calculations, per-target reviewed amounts for save-for-half style batches, and manual fallback for ambiguous inputs. Every target and relevant item revision is checked before the batch applies atomically, so one stale or unauthorized target prevents all hit-point changes.
- Added exact, stale-safe, idempotent undo for prepared D&D action, typed-damage, and scheduled-effect mutations. Undo restores the captured actor, item, and optional combat roots only while every post-commit revision is still current, and refuses to overwrite later edits.
- Gated item benefits and actions by equipped/attuned state, prerequisites, limits, charges, and reasoned DM override.
- Linked effect instances to sources, targets, duration, concentration, expiry, replacement, and cleanup.
- Replaced synthetic combat entry with selected/reviewed participants, server initiative, manual tie/order handling, hidden-participant redaction, and saved-encounter launch.
- Added authoritative reconnect snapshots, missed-event refresh, structured stale-write conflicts, durable critical-write acknowledgement, and rollback on injected persistence failures.
- Expanded archive intake beyond 1 MiB with complete schema/reference/checksum validation, bounded asset restore, staging cleanup, atomic publish/rollback, and replay-safe retry.
- Added SQLite durability, backup retention, interrupted-write recovery, coordinated state/asset restore coverage, and an end-to-end restart/export/import D&D fixture that kills and replaces the API process, reloads the same SQLite file, proves a post-export mutation persisted, and then proves archive upsert restores the earlier reviewed state.

## P1 - Playable alpha workflows

- Completed the declared SRD level-one choice graph: species/ancestry, background/origin, languages, class skills, starting equipment alternatives, Weapon Mastery, spells, feats, and class-specific choices. Focused records: [species and ancestries](level-one-species-ancestries-2026-07-13.md), [languages](level-one-languages-2026-07-13.md), [class skills](level-one-class-skills-2026-07-13.md), [equipment and mastery](level-one-starting-equipment-weapon-mastery-2026-07-13.md), and [spells, feats, and class choices](level-one-spells-feats-class-choices-2026-07-13.md).
- Added optional-by-default campaign character review with player submission, fingerprinted revisions, DM approval/change requests, reasoned validation override, audit history, and a required-review policy that gates token linking and every combat-entry path. See [character review verification](dnd-character-review-2026-07-13.md).
- Connected the session-first actor loadout, spell known/prepared/always-prepared/spellbook/resource semantics, actions, defenses, effects, attunement, rests, and advancement review cards.
- Connected saved encounters to combat, monster initiative/actions/resources, conditions, duration, reactions, recharge, death-state handling, XP/GP/loot awards, and durable reward history.
- Completed chat reply/delete/moderation and local actionable mutation errors.
- Added doors/windows, open-state vision, token rotation/elevation, typed senses, authored light/darkness including magical darkness, and GM player-vision preview.
- Added current-owner-only campaign ownership transfer, archived-campaign write policy, backup retention, and coordinated database/object recovery guidance and tests.

## P2 - Public hardening and differentiation

- Added journal folders, entity links, backlinks, history, campaign-canon review, revision checks, permissions, persistence, archive coverage, and connected UI.
- Added a standalone campaign compendium with source/version/license provenance, conflict inspection, keep/merge/replace resolution, actor import-state reporting, and archive-safe metadata. See [compendium verification](campaign-compendium-2026-07-13.md).
- Added advisory difficult-terrain measurement and explicit directional manual-cover rulings without pathfinding, collision, geometry inference, or hidden AC mutation.
- Hardened OIDC verified-email linking, scoped worker identities, secret readiness, signed-URL and request-log redaction, rate limiting, and deployment checks.
- Added automated capacity, performance, fault, soak, restart, migration, security, and accessibility regression gates. The separate manual assistive-technology and production-observation evidence remains an external release gate.
- Added an explicit [deployment threat model](../deployment/threat-model.md) for local, private-hosted, and public-hosted modes and a [supported-browser boundary](../dogfood/supported-browsers.md) that names desktop Chromium as the automated baseline while keeping Edge, Firefox, Safari, mobile devices, and manual assistive technology outside the certified evidence.
- Closed the AR-16 default-topology mismatch by removing unused PostgreSQL and Redis services and dependencies from Docker Compose. The shipped topology now reflects the actual SQLite single-writer API plus MinIO-backed assets and an optional scoped worker, rather than implying shared database, realtime, or rate-limit capabilities that the runtime does not use.
- Added sourced calculation explanations and campaign rules/system/content compatibility reporting. See [calculation and compatibility verification](calculation-explanations-compatibility-2026-07-13.md).
- Added AI retrieval citations, untrusted-content labels, campaign enablement/status policy, scoped context transmission, local retention/pruning controls, privacy diagnostics, and the existing proposal/automatic-execution modes. See [AI verification](ai-safety-privacy-citations-2026-07-13.md). The current non-AI remediation program intentionally leaves the agent unchanged.

## P3 - Later-value capabilities brought forward

- Added permissioned, revisioned, idempotent custom builders for monsters, spells, items, feats, species, backgrounds, subclasses, and conditions, with campaign-scoped storage and compendium availability. See [custom-content verification](dnd-custom-content-builders-2026-07-13.md).
- Added containers and cycle/depth validation, weight, ammunition, party inventory/stash, merchants, buy/sell flows, combat loot, claims/assignment, audit, permissions, and persistence. See [inventory and commerce verification](dnd-inventory-commerce-2026-07-13.md).
- Added preview/confirm/command/end lifecycle for summons, transformations, companions, and concentration-linked controlled creatures. See [controlled-creature verification](dnd-controlled-creatures-2026-07-13.md).
- Added regional/lair mechanics, richer effect scheduling/advancement, and specialized spell-helper previews with explicit confirmation. See [advanced D&D mechanics verification](advanced-dnd-mechanics-2026-07-13.md).
- Added versioned outbound campaign webhooks with a metadata-only event allowlist, GM-only management, exact revisions, idempotency, one-time secret display/rotation, HMAC signing, DNS rebinding/SSRF defenses, pinned delivery, absolute deadlines, bounded queues and ledgers, async test/retry, lifecycle cancellation, audit, archive redaction, OpenAPI/client support, and a campaign-manager UI. Webhooks cannot accept inbound state mutations and are not exposed as direct MCP mutation tools.
- Added image thumbnails, optimized WebP renditions, content-hash deduplication, variant-aware signed delivery URLs, storage/quota accounting, and thumbnail UI. The API image pipeline uses `sharp`. See [asset-rendition verification](asset-renditions-deduplication-2026-07-13.md).

## Safety boundaries retained

- Existing AI agent behavior is an accepted product-owner boundary and is not restricted or redesigned by this non-AI implementation record. Plugin code uses the normal permission-checked application boundary rather than writing storage directly.
- Consequential mutations keep explicit permission, revision, idempotency, audit, and preview/confirmation boundaries.
- D&D automation remains **correct or clearly manual**. Unsupported and ambiguous exceptions do not silently rewrite state.
- Tactical helpers remain advisory. They do not move tokens, pathfind, enforce collision, infer line of sight, or alter Armor Class/damage from guessed geometry.
- SDK source code remains permissively reusable even though the platform core is AGPL. The `system-sdk` package metadata and distribution files distinguish MIT-licensed code from CC BY 4.0 SRD-derived structured content and preserve the required attribution notice.

## Deliberate exclusions

The implementation does not add any roadmap **Not now** item:

- more game systems or a universal rules DSL;
- a marketplace or broad plugin ecosystem expansion;
- voice/video, streaming, social-network, discovery, or community features;
- AI-agent behavior, capability, or provider changes, which are intentionally outside this non-AI remediation program;
- 3D terrain, advanced VFX, cosmetic themes, or procedural generation;
- speculative hex-grid expansion;
- dedicated kiosk, projector, shared-display, or hot-seat presentation modes before observed in-person table use establishes concrete privacy and control requirements;
- offline-first operation or reconciliation without a separate conflict, security, and recovery design;
- enterprise identity expansion beyond hardening existing identity paths;
- a multi-region/multi-node rewrite without measured demand;
- proprietary D&D content scraping, copying, or bundled redistribution.

## Verification status

Focused rules, API, persistence, contract, client, UI, security, recovery, and browser tests were added with each implementation slice. The consolidated root run is complete for every local gate that does not require a clean worktree, external credentials, hosted infrastructure, or human participants.

### Browser acceptance evidence

- The final normal Chromium suite passed **49/49 in 7.3 minutes**. The final clean-deployment bootstrap suite passed **1/1 in 56.5 seconds**. These are the two suites composed by `pnpm e2e`.
- Three public-UI first-session journeys passed independently: Dwarf Cleric, Elf Wizard, and Halfling Rogue. Each journey completed the legal creator wizard, saved a Goblin Warrior encounter, directly launched it into reviewed combat, ended combat, and planned, started, and completed a linked first session without direct campaign-state API mutation or page-script state injection.
- The fourth browser fixture saved and cancelled an incomplete advancement draft, resumed a durable ready review, committed exact prepared advancement, Second Wind, and Short Rest results, then performed a true API child-process restart against the same SQLite file. It exported through the archive UI, changed HP after export and verified that changed value survived reload, imported the downloaded archive in upsert mode, and verified the earlier HP/resource/advancement state returned. The restore assertion is therefore non-no-op.
- `pnpm e2e:typecheck` passed after the final browser edits. The normal suite also covered labelled/keyboard accessibility, phone/tablet layouts, session-switch abort guards, private invite acceptance, reviewed combat, campaign archive intake, SDK trust policy, and explicit D&D prepared-action confirmations. All seven tracked browser evidence screenshots remained unchanged.
- Sneak Attack and Rage Damage correctly remained manual in browser evidence because the generic `weapon` damage type was ambiguous. Their prepared reviews displayed the unsupported reason, kept commit disabled, and left target HP unchanged rather than guessing a damage type.

### Consolidated root validation record

- `pnpm check` passed: **28/28 lint targets** in 25.605 seconds, **28/28 typecheck targets** in 12.002 seconds, E2E TypeScript compilation, **28/28 test targets** in 2 minutes 34.753 seconds, and **17/17 build targets** in 54.566 seconds. The production web build retained its non-blocking chunk-size warning.
- Major package totals in that run were:
  - API: **89 files**, **611 passed**, **1 skipped**;
  - web: **92 files**, **458 passed**;
  - API contracts: **15 files**, **72 passed**;
  - API client: **9 files**, **38 passed**;
  - core: **10 files**, **75 passed**;
  - system SDK: **20 files**, **159 passed**;
  - worker: **1 file**, **27 passed**.
- The standalone strict API JSON run also passed **89/89 files and 611/612 tests** in 190.3 seconds. Its one skip is the live identity-provider smoke requiring external OIDC/SCIM endpoint and credential variables.
- `security:audit` found **no known production dependency vulnerabilities**. `security:smoke` passed **7/7**, `migration:smoke` passed **2/2**, and `deployment:smoke` passed **2/2**.
- `perf:smoke` and `perf:soak` each passed the selected test; Vitest reports the deliberately unselected counterpart as skipped in each filtered command.
- `perf:capacity` passed the declared local envelope: one GM, five players, six realtime connections, 200 scene tokens, 302 observed chat messages, and 60 journals. P95 measurements were **18.661 ms initial connect**, **65.14 ms reads**, **40.826 ms mutations**, **40.905 ms event fanout**, and **2.748 ms reconnect**; the three-cycle workload completed in **379.23 ms**, produced a **372,736-byte** SQLite store, and persisted after reopen. This remains a deterministic single-node/single-writer compatibility result, not production load or hosted SLO evidence.
- `docs:site:test`, `docs:site:check`, `sbom:test`, `v1:evidence:test`, and `v1:issues:test` all passed.
- `release:smoke` was not run as a combined command because its first gate requires a clean worktree, while this implementation is intentionally still an uncommitted working tree. Its local component gates above were run directly. `v1:issues:check` remains an external authenticated-GitHub check and was not treated as local evidence.
- Final `git diff --check` passed. Git emitted only the existing Windows LF-to-CRLF working-copy warnings.

## Evidence that remains external or manual

Only these evidence gates remain; they are not unfinished code tickets:

1. Repeated real GM/player campaigns without database repair.
2. Live OIDC and SCIM against the selected identity providers over hosted HTTPS.
3. Manual NVDA, Narrator, VoiceOver, and TalkBack plus Edge, Firefox, Safari, and physical touch-device passes.
4. Hosted HTTPS backup/restore, forward migration, rollback, production-capacity, observability, alerting, and support drills against the chosen topology.
5. Release-owner legal/content/provenance approval and an independent security review.
