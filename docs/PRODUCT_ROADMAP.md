# Product Roadmap

> Post-remediation roadmap, 2026-07-14. “First ten” was an execution sequence, not a scope limit. All code-addressable non-AI P0-P3 findings from the audit are included in the current working tree. The next milestones earn external release evidence and fix only regressions discovered there.

## Product principles

1. Optimize for complete D&D 5.5e campaign and session outcomes, not generic platform breadth.
2. Keep the server authoritative for permissions, shared state, rolls, revisions, idempotency, and consequential rules transactions.
3. Automate typed, inspectable rules; make ambiguous or geometric rulings explicit and DM-controlled.
4. Preserve homebrew and reasoned overrides without presenting them as rules-correct automation.
5. Treat campaign durability, portability, privacy, accessibility, and recovery as product features.
6. Keep SDK code permissively reusable while preserving the platform/core and SRD-content license boundaries.
7. Preserve the existing AI agent's manual proposal and governed automatic-execution modes. AI is a first-class campaign capability, not a proposal-only afterthought.
8. Add surface area only after real-session evidence identifies a user problem.

## Target audience and promise

The primary audience is a Dungeon Master running a persistent small-group D&D 5.5e campaign. Players are first-class session users; operators and integrators are secondary audiences.

The product promise is to let a group prepare, run, preserve, inspect, and recover a D&D campaign with transparent automation, explicit DM authority, portable data, and campaign-governed AI operation.

## Current status

| Scope | State | Evidence boundary |
| --- | --- | --- |
| Non-AI P0 core-loop and integrity findings | Implemented | Rules/API/UI/persistence regression suites and browser journeys |
| Non-AI P1 playable-alpha findings | Implemented | Reviewed creator/session/combat/reconnect/recovery flows |
| Non-AI P2 public-hardening findings | Implemented locally | Security, migration, deployment, performance, docs and accessibility automation; hosted/manual proof remains |
| Non-AI P3 later-value findings | Implemented | Custom content, controlled creatures, advanced mechanics, inventory/commerce, webhooks, asset renditions |
| AI agent | Preserved | Existing manual and governed-auto modes intentionally unchanged |
| Release stage | Evidence-gated | Real groups, live IdP, hosted recovery, manual AT, legal/security review |

## Product-stage definitions

Stages are earned by observable outcomes, not feature counts.

### Foundation

- **Target user:** developers and one internal GM.
- **Required workflow:** install, authenticate, create/open a campaign, mutate shared state with authorization and conflict detection, restart, export, restore.
- **D&D requirement:** versioned actor/item state and deterministic rules previews cannot silently persist a known-invalid representative state.
- **Reliability/security:** durable acknowledgement, strict request/response contracts, safe archives, scoped secrets/identities, fail-closed production configuration.
- **Data-loss tolerance:** no acknowledged critical write may be lost in covered failure cases.
- **Migration/docs:** current and prior-version fixtures; local recovery and upgrade instructions.
- **Exit:** consolidated local validation passes and no code-addressable P0 remains.
- **State:** implementation and consolidated local validation complete in the current working tree; external release evidence starts at Internal Playable.

### Internal playable build

- **Target user:** the development team plus known internal DMs and players.
- **Required workflow:** campaign setup, reviewed level-one character, scene/encounter preparation, full combat, rewards/session notes, reconnect, later resume.
- **D&D requirement:** common advancement, rests, HP/temp HP/death, damage defenses, conditions, attunement, spells, effects, monster resources, and controlled-creature flows are correct or clearly manual before mutation.
- **Reliability:** repeat sessions without database repair; conflict and reconnect recovery are understandable.
- **Security:** server permissions and private snapshots hold across GM/player/observer roles.
- **Data-loss tolerance:** no lost acknowledged state; tested recovery point and archive available.
- **Docs:** first-session GM/player guide, supported rules/content boundary, recovery procedure.
- **Exit:** at least two representative groups complete repeated sessions; every stop-ship defect has a regression test; recovery drill succeeds.
- **State:** code-ready; human play evidence remains.

### Private alpha

- **Target user:** invited external DMs and players with support access.
- **Required workflow:** persistent campaigns across sessions, imports/exports, homebrew, multiple DMs/characters, responsive use on supported devices.
- **D&D requirement:** published supported content/mechanics; transparent calculation and manual adjudication paths.
- **Reliability/security:** hosted HTTPS, live IdP smoke where offered, automated backups, forward migration and rollback drill, rate limits, monitoring, incident ownership.
- **Accessibility:** keyboard and manual assistive-technology pass on the declared matrix.
- **Data-loss tolerance:** documented recovery point/recovery time and successful restoration evidence.
- **Exit:** invited campaigns complete without unrecoverable loss, critical authorization failures, or unbounded support burden.
- **State:** external evidence not yet earned.

### Public beta

- **Target user:** self-selecting external groups willing to accept a documented beta boundary.
- **Required workflow:** self-service onboarding, stable persistent campaigns, supported imports, diagnostics, backups, and support escalation.
- **D&D requirement:** compatibility/version policy and content provenance are published and tested.
- **Reliability/security:** production operating envelope, independent security review, dependency/SBOM policy, abuse controls, incident response, restore/rollback rehearsals.
- **Accessibility/browser:** certified supported matrix with known limitations.
- **Data-loss tolerance:** no known path that loses acknowledged campaign data within the supported topology.
- **Exit:** SLOs and support metrics hold across the beta cohort; no unresolved Critical/High release blocker.
- **State:** not yet earned.

### Version 1.0

- **Target user:** DMs choosing the product for a long-running supported D&D 5.5e campaign.
- **Required workflow:** documented end-to-end campaign lifecycle, stable API/archive compatibility, predictable upgrade/recovery/support.
- **Rules:** explicit supported SRD/content versions and migration policy; transparent overrides and no known dangerous silent automation.
- **Reliability/security:** sustained SLOs, tested disaster recovery, independent review closure, maintained browser/accessibility matrix.
- **Data-loss tolerance:** published and repeatedly demonstrated recovery commitments.
- **Exit:** the product promise is supported by cohort retention, repeated campaigns, recovery evidence, and a stable compatibility contract.
- **State:** future evidence milestone, not a feature-shopping list.

## Priority ledger

### P0 — trustworthy D&D session core: implemented

- Versioned D&D validation and non-destructive repair previews.
- Prepared/reviewed advancement, rests, actions, typed damage, scheduled effects, and stale-safe undo.
- Mandatory exact revisions and idempotency for consequential shared mutations.
- Correct HP/temp HP/death, defenses, condition immunity, attunement, concentration, class progression, and combat synchronization.
- Reviewed encounter launch, initiative/order, hidden participants, rewards, and active-combat lifecycle.
- Durable writes, permission-filtered snapshot history, realtime sequence/gap reconciliation, strict archive validation, atomic restore, and bounded streaming archives.

### P1 — convincing playable alpha: implemented

- Complete declared level-one SRD choice graph, reviewed character state, and class-aware advancement schedules.
- Session-first actor actions, spells, loadout, resources, effects, rests, progression, and local mutation feedback.
- Monster/NPC operation, recharge, reactions, legendary/lair/regional mechanics, death state, loot and history.
- Map/grid/token calibration and transforms, targeting, templates, vision, doors/windows, lights/darkness, tactical advisory tools, accessible placement.
- Session planning, chat/presence/reconnect, campaign ownership transfer, profiles/rules policies, and character transfer.

### P2 — public hardening and differentiation: implemented locally

- Campaign knowledge graph, journal links/backlinks/history/canon, compendium provenance/version/conflict handling.
- OIDC/SCIM and SSRF hardening, scoped worker identity, production readiness, signed URL/log redaction, plugin safety defaults, request/response OpenAPI enforcement.
- SQLite migrations/maintenance/backup/recovery, coordinated asset/state recovery, bounded performance/capacity gates.
- Responsive and automated accessibility coverage, supported-browser boundary, deployment threat model, SBOM/evidence/release scripts.
- Calculation explanations, compatibility reporting, API client/contracts, snapshot deltas, campaign webhooks.

### P3 — later-value scope brought forward: implemented

- Custom monsters, spells, items, feats, species, backgrounds, subclasses, and conditions.
- Containers, currency, ammunition, encumbrance, party stash, merchants, buying/selling, combat loot and claims.
- Summons, transformations, companions/familiars/pets, controlled creatures, advanced effect scheduling and spell helpers.
- Asset thumbnails, WebP renditions, deduplication, variant delivery, quota/lifecycle tooling.
- World graph, calculation overrides, campaign-specific compatibility and operational controls.

### Not now

- More game systems or a universal rules DSL.
- Marketplace or broad plugin-ecosystem expansion.
- Voice/video, social discovery, community network, or streaming platform features.
- 3D terrain, advanced VFX, cosmetic theme breadth, or procedural generation.
- Proprietary D&D content scraping/copying/bundling.
- Speculative hex-grid expansion without D&D user demand.
- Multi-node or multi-region rewrite without measured capacity/availability need.
- Enterprise identity breadth beyond proving the existing OIDC/SCIM paths.
- Dedicated kiosk, shared-display, hot-seat, or projector modes; reconsider only after in-person campaign evidence shows ordinary authenticated browser clients are insufficient.
- Offline-first campaign operation and state reconciliation; this is a separate architecture commitment, not a missing checkbox in the current connected-client workflow.
- Changes to the existing AI agent behavior, providers, capability, or governance modes in this non-AI program.

## Milestones

### Milestone 1 — close the full non-AI audit implementation

- **User outcome:** the implemented product no longer has a known code-addressable P0-P3 audit defect hidden behind the original first-ticket sequence.
- **Included epics:** rules correctness; reviewed mutations; concurrency/durability; realtime convergence; archive safety/streaming; complete session UI; security/contracts; responsive/accessibility automation; domain decomposition; P3 campaign tooling.
- **Prerequisites:** shared core types, system SDK, Fastify API, React web, SQLite/object storage.
- **Technical risks:** contract drift, large composition roots, long full-suite runtime, dirty-tree artifact interference.
- **Rules risks:** exception-heavy class/spell/item behavior and homebrew overrides.
- **Exit:** all focused regressions and the full local validation matrix pass; six audit documents describe one current state; incidental artifacts restored.
- **Status:** complete locally through documentation closure; Milestone 2 external real-session evidence is next.

### Milestone 2 — earn Internal Playable

- **User outcome:** internal groups complete repeated real sessions and resume campaigns without manual data repair.
- **Prerequisites:** Milestone 1; named session owners; defect severity policy; support channel.
- **Risks:** real table behavior exposes discoverability, pacing, and exceptional-rules defects absent from deterministic tests.
- **Exit:** at least two groups complete the agreed repeated-session matrix; zero unresolved stop-ship defects; successful recovery rehearsal; findings become regression tests.

### Milestone 3 — earn Private Alpha

- **User outcome:** invited groups run persistent hosted campaigns on the declared browser/device boundary.
- **Prerequisites:** Internal Playable evidence; hosted topology; privacy/support ownership.
- **Risks:** live IdP, networking, storage, touch devices, assistive technology, operational support.
- **Exit:** hosted HTTPS/IdP/recovery/migration/rollback drills pass; manual AT/cross-browser matrix recorded; invited campaigns meet reliability and support thresholds.

### Milestone 4 — earn Public Beta

- **User outcome:** external groups can self-onboard and trust supported campaign data under a published beta contract.
- **Prerequisites:** private-alpha cohort evidence; independent security and content/legal review; production telemetry and incident response.
- **Risks:** abuse, data growth, support load, compatibility commitments.
- **Exit:** published operating envelope/SLOs hold; no Critical/High release blocker; recovery commitments repeatedly demonstrated.

### Milestone 5 — earn Version 1.0

- **User outcome:** DMs can choose the product for long-running campaigns with stable compatibility, support, and recovery expectations.
- **Prerequisites:** public-beta retention and operational evidence.
- **Risks:** long-term migration, content/version evolution, support sustainability.
- **Exit:** sustained campaign success and SLOs, stable API/archive policy, maintained accessibility/browser matrix, release-owner signoff.

## Dependency sequence

```text
local implementation + consolidated validation
  -> internal repeated-session evidence
  -> hosted identity/recovery/accessibility/security evidence
  -> private-alpha operating evidence
  -> public-beta SLO/support evidence
  -> 1.0 compatibility commitment
```

New feature breadth does not sit on this critical path. A defect found during a later gate returns to the narrowest relevant implementation/test layer and receives a regression before that gate resumes.

## Success metrics

| Outcome | Metric | Stage expectation |
| --- | --- | --- |
| Complete first session | Invited groups completing setup through session close without staff state edits | Internal Playable: representative groups succeed |
| Trustworthy rules | Successful-looking mutations later found to be wrong without an explicit manual boundary | Zero |
| Shared-state integrity | Lost acknowledged writes or silent stale overwrites | Zero |
| Recovery | Successful restore to declared recovery point and rollback in target topology | Every release drill |
| Session usability | Primary action success, correction rate, time-to-recover from errors | Baseline internally; improve before public beta |
| Realtime | Unreconciled gaps, duplicate application, private-state leakage | Zero known; measured under hosted load |
| Accessibility | Blocking issues on supported keyboard/AT/device matrix | Zero at stage exit |
| Security | Unresolved Critical/High authorization, secret, SSRF, dependency, or isolation findings | Zero at public beta/1.0 |
| Supportability | Campaigns requiring database repair or engineering intervention | Zero for normal supported flows |
| Retention | Groups returning for multiple sessions/campaign arcs | Required before 1.0 |

## Decision rule for new work

A new feature enters the roadmap only when it closes a measured D&D workflow failure, a release-evidence defect, a security/data-integrity obligation, or a proven compatibility need. Attractive infrastructure or AI ideas do not automatically outrank the campaign loop, and AI capability changes require an explicit product request rather than being smuggled into “safety” work.
