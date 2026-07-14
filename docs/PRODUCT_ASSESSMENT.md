# Product Assessment

> Post-remediation assessment, 2026-07-14. The repository and the current uncommitted working tree are the source of truth. Historical pre-remediation findings have been removed from this file; the implementation ledger is in [IMPLEMENTATION_BACKLOG.md](IMPLEMENTATION_BACKLOG.md) and the validation boundary is in [FEATURE_AUDIT.md](FEATURE_AUDIT.md).

## Executive verdict

Open Tabletop Engine is now a coherent, DM-first, API-first D&D 5.5e virtual tabletop rather than a collection of disconnected prototypes. The connected product covers account and campaign administration, reviewed character creation and advancement, a session-oriented character sheet, scene and token play, reviewed encounters and combat, typed rules transactions, chat and campaign knowledge, portable archives, homebrew, operational tooling, plugins, and the existing AI agent.

The code can support a complete representative D&D 5.5e session and can persist, restart, export, and restore a campaign in local automated evidence. That is a statement about implemented behavior, not a claim that the product has earned a public release. Real multi-session groups, live identity providers, hosted recovery and rollback, production observations, manual assistive-technology checks, content/legal approval, and independent security review remain external evidence gates.

The product maturity is therefore **code-complete for the audited non-AI P0-P3 scope and release-evidence gated**. With the consolidated local validation matrix green, it is suitable for internal dogfood; it has not yet earned the repeated-session evidence required for the formal Internal Playable exit. Private alpha and public beta remain operational decisions based on external evidence, not more speculative feature breadth.

The AI agent is an accepted first-class product capability with both manual proposal review and governed automatic execution. This remediation did not reduce, redesign, disable, or make that agent optional.

## Primary user and product promise

The primary user is a Dungeon Master running a persistent D&D 5.5e campaign for a small group. The secondary user is a player who needs a fast, understandable character and tabletop workflow without losing access to the underlying calculation or the DM's rulings.

The clearest promise is:

> Run and preserve a D&D 5.5e campaign with transparent automation, explicit DM authority, portable data, and an AI agent that can operate under the campaign's chosen governance mode.

This is deliberately narrower than “a universal VTT platform.” The shared SDK and API architecture support extension, but product choices are evaluated against the D&D session loop first.

## Current user value

The strongest connected value is the transition from preparation into authoritative play:

1. A DM creates a campaign, configures a rules profile, invites players, and prepares scenes, journals, compendium records, actors, and encounters.
2. A player creates or imports a character through a reviewed D&D choice graph and receives a session-first sheet.
3. The group launches reviewed participants into combat, rolls and applies typed actions, tracks effects/resources/death state, and records rewards.
4. Revisions, idempotency, snapshots, SQLite durability, archives, and recovery paths preserve the result for the next session.

Evidence spans `apps/web/src/App.tsx`, the extracted web panels, `apps/api/src/app.ts` and its route modules, `packages/system-sdk/src/index.ts` and focused D&D modules, `packages/core/src/state.ts`, and the integration/browser tests listed in [FEATURE_AUDIT.md](FEATURE_AUDIT.md).

## Five strongest areas

1. **Rules-safe transaction model.** Advancement, rests, consequential actions, typed multi-component damage, scheduled effects, and undo use server-prepared results, exact revisions, idempotency, permission checks, and audit rather than trusting a client patch. Evidence: `apps/api/src/app.ts` prepared D&D routes; `packages/system-sdk/src/dnd-validation-preview.ts`; `apps/api/src/p0-core-loop-integration.test.ts`; `apps/api/src/typed-damage-combat-sync.test.ts`.
2. **Complete small-group campaign loop.** Campaign setup, invitations, reviewed characters, scenes, encounters, combat, rewards, sessions, journals, chat, reconnect, and persistence are joined into actual UI/API flows. Evidence: `tests/e2e/auth-tabletop.spec.ts`, `tests/e2e/browser-evidence.spec.ts`, `apps/web/src/session-desk-panel.tsx`, and `apps/web/src/combat-panel.tsx`.
3. **DM control without brittle over-automation.** The engine automates typed, inspectable cases and exposes reasoned manual overrides or advisory results for ambiguous geometry, homebrew, cursed-item recovery, condition immunity, and calculation exceptions. Evidence: `apps/api/src/calculation-override-routes.ts`, `apps/web/src/calculation-explanation-panel.tsx`, `apps/api/src/condition-mutation-safety.test.ts`, and `apps/api/src/attunement-api.test.ts`.
4. **Data ownership and recovery.** Versioned archives, asset checksums, reference validation, conflict modes, atomic rollback, incremental framed asset streaming, snapshot history, SQLite backups, and restart fixtures make campaign portability substantive. Evidence: `apps/api/src/archive-validation.ts`, `apps/api/src/archive-stream.ts`, `apps/api/src/archive-recovery.test.ts`, `apps/api/src/snapshot-history.ts`, and `apps/api/src/sqlite-maintenance.ts`.
5. **Serious platform boundaries behind the product.** Server authorization, strict non-AI OpenAPI validation, scoped workers, OIDC hardening, plugin capability checks, outbound-only signed webhooks, readiness checks, rate limits, redaction, SBOM, and release scripts support self-hosting without displacing the D&D experience. Evidence: `apps/api/src/openapi-runtime-validation.ts`, `apps/api/src/oidc-http-security.ts`, `apps/api/src/worker-identity.ts`, `apps/api/src/plugin-runtime.ts`, and `apps/api/src/campaign-webhooks.ts`.

## Five most serious remaining gaps

These are evidence or operating-model gaps, not hidden code feature tickets.

1. **No qualifying real-campaign evidence yet.** Automated journeys cannot establish that several groups can run repeated, messy sessions without support intervention or manual data repair.
2. **Live identity-provider evidence is absent.** OIDC and SCIM behavior has local protocol, security, concurrency, and rollback coverage, but a real provider tenant, hosted callback, provisioning, deprovisioning, and role-mapping run still requires external credentials.
3. **Manual accessibility and cross-browser certification is incomplete.** Automated labels, keyboard paths, responsive layouts, and Chromium journeys exist; NVDA, Narrator, VoiceOver, TalkBack, Safari, Firefox, Edge, and representative touch devices require human evidence.
4. **Hosted operations are not proven.** Local restart, migration, archive, rollback, security, and capacity fixtures exist, but the selected HTTPS topology still needs recorded backup/restore, forward migration, rollback, capacity, observability, alerting, and incident-response evidence.
5. **Release-owner assurance is external.** Independent security review plus SRD/content attribution, distribution, and legal approval cannot be certified by the implementation itself.

## Product coherence

### What the product is

It is a persistent D&D 5.5e campaign VTT with strong rules transactions, campaign knowledge, data portability, self-hosting, APIs, plugins, and an integrated AI agent. It is not merely a battle map, character builder, campaign wiki, or rules-engine demo; each of those capabilities participates in the same campaign and permission model.

### Strongest workflow

The strongest workflow is preparing a reviewed character and encounter, launching combat, applying inspectable D&D actions/effects/rewards, then resuming the durable campaign. That path now has coverage across system SDK unit tests, API integration tests, web component tests, and browser journeys.

### Weakest critical workflow

The weakest critical workflow is operational rather than a missing UI: moving a real long-running campaign through deployment upgrades, identity-provider integration, backup/restore, and incident rollback under external load. The code has local fixtures and runbooks, but the evidence must be created in the actual target environment.

### DM-first versus player-first

The product is intentionally DM-first in preparation, governance, visibility, homebrew, overrides, and campaign administration. During play it is balanced: players receive owned-character actions, rolls, spell/inventory/resource flows, movement/targeting, chat, private information, reconnect, and local error feedback without seeing GM-only state.

### Abstraction level

The narrow rules architecture is appropriate: shared records and transaction envelopes live in reusable packages; D&D semantics live in `@open-tabletop/system-sdk`; the API remains authoritative; and UI panels consume typed contracts. A universal rules DSL, cross-system normalization project, or multi-region rewrite would add risk without improving the defined D&D audience.

## Competitive capability classification

This classification describes user expectations associated with mature D&D VTT categories; it does not claim feature-for-feature parity or reproduce a competitor's product.

| Classification | Current capabilities | Decision |
| --- | --- | --- |
| Essential table stakes | Accounts, campaigns, invites, roles, scenes, maps, tokens, dice, chat, encounters, initiative, combat, persistence, import/export | Implemented; preserve reliability and usability budgets |
| Required for playable alpha | Reviewed level-one characters, session sheet, typed damage/rest/effect transactions, monster operation, rewards, reconnect, session planning | Implemented locally; earn with real-session evidence |
| Important for public beta | Recovery drills, migration compatibility, security posture, accessibility, responsive operation, provenance, support/telemetry | Code and local automation implemented; external gates remain |
| Differentiating opportunity | Transparent calculations, user-owned archives, campaign knowledge graph, self-hosting/API access, governed AI operation | Continue only where usage evidence supports polish |
| Specialized or niche | Advanced controlled creatures, custom-content builders, webhooks, deep inventory commerce, calculation overrides | Implemented as bounded campaign-manager tools; do not let them dominate onboarding |
| Intentionally out of scope | Proprietary content redistribution, voice/video, community network, 3D spectacle, universal system support | Keep out of the near-term product |
| Premature | Marketplace expansion, multi-region architecture, procedural world generation, speculative hex investment | Reconsider only after measured demand |

## Recommended positioning and scope

Position Open Tabletop Engine as a transparent, campaign-ownable D&D 5.5e VTT for DMs who want automation they can inspect and override, plus an AI agent that can work within campaign-selected governance. Lead with the complete session loop and data ownership. Self-hosting, APIs, plugins, and AI are meaningful differentiators, but they should demonstrate how they reduce preparation or session friction rather than replace the core promise.

Near-term product work should be evidence-driven:

- Run internal campaigns and collect task success, correction, conflict, reconnect, and recovery outcomes.
- Perform hosted identity, migration, backup/restore, rollback, HTTPS, and observability drills.
- Complete manual assistive-technology, cross-browser, and touch-device passes.
- Fix regressions discovered by those exercises; do not invent new breadth to fill the queue.
- Publish a precise supported-content, browser, deployment, and compatibility boundary.

## Explicit non-goals

- Do not redesign the product as a system-neutral VTT or build a universal rules language.
- Do not expand to more game systems without a separate product decision.
- Do not copy, scrape, or bundle proprietary D&D content.
- Do not add voice/video, social discovery, community feeds, or streaming infrastructure now.
- Do not build a marketplace or broad third-party plugin ecosystem before the trust/support model is proven.
- Do not pursue 3D terrain, elaborate VFX, procedural worlds, or theme breadth before real-session evidence.
- Do not undertake a multi-node or multi-region rewrite without measured capacity or availability demand.
- Do not build kiosk, hot-seat, or shared-display modes before real table evidence establishes the workflow and privacy requirements.
- Do not claim or build offline-first synchronization without a separate conflict, security, and data-recovery product decision.
- Do not change, restrict, disable, or convert the existing AI agent to proposal-only operation as part of this non-AI program.

## Evidence boundary

Verified implementation claims are tied to source, tests, and local runtime evidence in [FEATURE_AUDIT.md](FEATURE_AUDIT.md), [DND_RULES_AUDIT.md](DND_RULES_AUDIT.md), and `docs/verification/`. Strong inferences are labelled as product recommendations. External and human gates are never reported as passed until their artifacts exist.
