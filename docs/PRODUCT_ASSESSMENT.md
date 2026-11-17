# Product Assessment

## 2026-07-17 post-remediation assessment (authoritative)

This assessment supersedes conflicting 2026-07-16 conclusions. It covers the current uncommitted remediation tree and deliberately separates product capability from evidence that only real users, hosted infrastructure, physical devices, or independent reviewers can provide.

### Executive product verdict

OpenTabletop has moved from a broad but uneven internal playtest build to a **coherent local private-alpha candidate**. The reviewed primary loop now connects campaign setup, character creation/advancement, maps, invites, two-user play, authoritative D&D combat, recovery, recurring-session records, archives, and restart/resume without a known code-addressable audit blocker.

### Five strongest product areas

1. **Authoritative, inspectable state:** explicit permissions, revisions, idempotency, typed commands, audit/undo, and atomic multi-entity operations.
2. **Playable D&D session loop:** creator, advancement, actor sheet, initiative, combat vitals, critical damage, death saves, conditions, concentration, rests, and recovery agree across clients.
3. **First-session usability:** resumable character drafts, standard array, map upload/background/calibration, same-scene readiness, search/show-all behavior, and direct combat controls remove the main abandonment traps.
4. **Campaign continuity:** realtime gap recovery, journal/handout drafts, archives, paired asset manifests, API restart/resume, and operator-facing recovery diagnostics.
5. **Extensible but governed platform:** typed API/client/plugin boundaries and AI automatic execution are preserved while permissions, sequencing, schemas, egress controls, and durable phases constrain them.

### Five remaining gaps

1. X01: no repeated real group has yet supplied abandonment, correction, conflict, and recovery evidence.
2. X03: paired backup/restore code has not yet passed an independent hosted, non-no-op clean-environment drill.
3. X04: automated accessibility checks are not a physical screen-reader/browser/touch-device matrix.
4. X05: the intended hosted topology still needs HTTPS, proxy, capacity, realtime, alerting, and incident exercises.
5. X06-X08: content/legal approval, independent security review, and representative AI/provider quality evidence remain external gates.

### Recommended focus

RQ01 local qualification is complete on the exact working tree. Freeze feature expansion, run RQ02 independent quickstart, begin X01 sessions, close defects they reveal, and then execute X03-X08 in release order. Do not build voice/video, a hostile-code marketplace, a universal rules DSL, hex parity, microservices, or more AI surface before that evidence exists.

## 2026-07-16 product assessment addendum (authoritative)

This assessment supersedes the release-readiness language below where it conflicts. It evaluates committed HEAD `9de6a3c` plus the current uncommitted tranche.

### Executive product verdict

Open Tabletop Engine is a **functional internal-playtest VTT, not a dependable alpha release**. A DM and player can create persistent campaign state, prepare a map, place actors, run initiative, resolve a representative level-3 combat, exchange table information, and return to saved data. That is meaningful product proof. It is not yet a smooth unassisted first-session experience, the canonical public journey is nondeterministic, two core combat states are rules-incorrect, and the documented self-host path is contradictory.

| Question | Answer |
|---|---|
| Can it run a representative D&D 5.5e session? | **Yes, with an informed facilitator and manual adjudication for complex effects.** |
| Can it persist an ongoing campaign locally? | **Yes.** Campaign, scene, actor, asset, journal, and archive foundations are real. |
| Is it safe to invite an ordinary private-alpha group today? | **No.** Critical damage, combat recovery synchronization, atomic group movement, and deterministic release evidence must land first. |
| Is it ready for public or hosted beta? | **No.** Browser-session security, login defense, operations, backup proof, accessibility, and hosted evidence remain open. |
| Should the team rebuild the architecture? | **No.** The core domain/command/persistence shape is valuable; fix narrow state transitions and split pressure points incrementally. |

### Product scorecard

Scores are current product evidence, not market potential.

| Dimension | Score | Rationale |
|---|---:|---|
| Functional breadth | 4/5 | Campaigns, scenes, actors, maps, walls, lights, fog, combat, dice, assets, journals, archives, plugins, and AI are present. |
| D&D 5.5e rules credibility | 3/5 | Broad SRD coverage is undermined by critical-damage and healed-combatant correctness defects plus uneven class/spell depth. |
| First-session usability | 2/5 | Setup, upload/calibration, creation drafts, combat HP management, and onboarding completion are fragmented. |
| Multiplayer integrity | 2/5 | Permissions are explicit, but mixed-authority group movement can partially commit and some realtime surfaces are not sequence-protected. |
| Reliability evidence | 2/5 | Focused gates pass and one full-combat journey passes; the canonical journey flakes and the aggregate API suite is not operationally stable. |
| Self-host operability | 2/5 | Packaging exists, but Compose storage validation, signing-secret defaults, and scheduled-backup wiring are contradictory. |
| Public security posture | 2/5 | Strong server authorization and archive confinement coexist with localStorage bearer tokens, no CSP, and weak login throttling. |
| Extensibility | 4/5 | Typed commands, provenance, plugin permissions, and reusable SDK intent are strong differentiators. |

### Five strongest capabilities

1. **Persistent API-first campaign model.** The product is not a canvas demo; actors, scenes, campaigns, assets, combat, and archives have durable domain behavior.
2. **Explicit authority and audit boundaries.** Server-side permissions, typed commands, revision/idempotency controls, and undo/audit patterns are stronger than the visible UI maturity suggests.
3. **Broad SRD data foundation.** Twelve classes, nine SRD species, four backgrounds, six origin feats, 341 spells, 313 monster threats, and explicit provenance create real campaign utility.
4. **Serious tactical-map substrate.** Walls, lighting, vision, fog, grid calibration, token ownership, and encounter state cover the hard foundation expected from modern VTT play.
5. **Evidence-oriented engineering.** Fast contracts, evidence records, focused rules suites, deployment smoke, and browser journeys provide a good basis for release discipline once nondeterminism is removed.

### Five biggest product gaps

1. **The combat truth can be wrong.** Critical hits and recovery from 0 HP are central moments; inconsistent results destroy player trust faster than missing niche automation.
2. **The primary DM/player loop is not session-speed.** Routine HP/roster work leaves the combat panel, attack continuation can stall, and group movement is not atomic.
3. **Character onboarding is incomplete and fragile.** Ability allocation, class-complete spell acquisition, long-sheet visibility, and draft recovery are below alpha expectations.
4. **Operations and release evidence are not dependable.** The documented self-host path can fail, scheduled backups are under-wired, and the aggregate/canonical gates are not consistently green.
5. **Public trust surfaces lag the platform ambition.** Browser token storage, CSP, login defense, accessibility, and sequenced realtime recovery need a deliberate beta gate.

### Competitive and category framework

The correct benchmark is workflow completeness, not feature-count mimicry:

| Capability class | What the market establishes | Product decision |
|---|---|---|
| Essential | Persistent campaigns, maps/scenes, tokens, character data, dice, chat, initiative, combat state, and clear permissions | Finish these paths before adding breadth. |
| Alpha-critical | Correct HP/defeat/critical transitions, atomic writes, reconnect recovery, usable creation, fast DM combat controls, deterministic smoke, and proven restore | This is the next investment boundary. |
| Beta-critical | Hardened sessions, CSP, rate limiting, responsive/keyboard operation, paging/search, polished handouts, hosted observability, and migration proof | Gate public access on these, not on more monsters or AI. |
| Differentiating | API-first domain commands, portable archives, explicit provenance, permission-checked plugins, local/self-host orientation, and optional grounded AI execution | Preserve and demonstrate through complete workflows. |
| Niche but valuable | Advanced walls/lights, tactical adjudication helpers, homebrew grants, plugin SDK, and evidence/audit exports | Prioritize from recurring campaign demand. |
| Premature | Universal rules DSL, hostile-code plugin marketplace, HA/multi-region architecture, voice/video, 3D board, automated every-spell simulation | Explicitly defer. |
| Out of scope | Proprietary non-SRD content bundled without license, replacing human DM judgment, and converting AI to proposal-only behavior | Keep as product non-goals. |

Official category references support this framing: Foundry documents [Scenes](https://foundryvtt.com/article/scenes/), [Tokens](https://foundryvtt.com/article/tokens/), [Walls](https://foundryvtt.com/article/walls/), and [Lighting](https://foundryvtt.com/article/lighting/) as integrated table primitives; Roll20 emphasizes a searchable, drag-and-drop [Compendium](https://help.roll20.net/hc/en-us/articles/360039178694-Compendium); D&D Beyond positions [Maps](https://www.dndbeyond.com/games) around official maps, tokens, initiative, spectator/in-person use, and fast setup. Open Tabletop Engine does not need parity with every product. It needs one complete, trustworthy campaign loop and a sharper portability/extensibility story.

### Recommended positioning

**For technically comfortable DMs and small groups who want a portable, auditable, D&D 5.5e SRD tabletop they can own and extend, Open Tabletop Engine provides a persistent API-first campaign engine with tactical maps, typed rules commands, provenance, and optional permission-checked automation.**

Do not lead with "all D&D rules automated," "Foundry replacement," or AI. Lead with:

- campaign ownership and portable archives;
- transparent, undoable domain actions;
- enough 5.5e automation to accelerate play without hiding adjudication;
- a platform that plugins and external tools can use safely.

### Product focus

The next product objective is not more surface area. It is: **a new DM and one player can create or resume characters, prepare one scene, play a two-hour level-3 session, recover from reconnects and mistakes, and restore the campaign without developer intervention or contradictory state.** Measure time to first playable scene, character-creation completion, combat actions without panel switching, unexpected state divergence, reconnect recovery, restore success, and canonical-journey pass rate.


### Historical-claim disposition

The older assessment below is retained as an implementation ledger, not as a current maturity or competitive verdict.

| Historical claim | Current disposition |
|---|---|
| "No critical workflow is broken at the code level" | **Withdrawn.** Critical-damage propagation and healed-combatant synchronization are current correctness blockers. |
| "Remaining uncertainty is empirical, not architectural" | **Withdrawn.** Atomic group movement, AI mutation locking, realtime/contract exceptions, and deployment wiring are architectural issues with direct product effects. |
| "At or above parity," "above typical parity," or "ahead of category norms" | **Unverified and superseded.** Use the source-backed capability framework in this addendum; no broad competitor-parity claim is made. |
| Clean-tree cutoff and green canonical/aggregate release implication | **Historical only.** The current cutoff includes an uncommitted tranche; canonical E2E is nondeterministic and the aggregate API stage failed fresh. |
| Only external/manual evidence remains | **False for the current tree.** N01-N20 and AR-34-AR-49 include code-addressable work. |


> Independent re-assessment, 2026-07-15. Cutoff: committed HEAD `b5e30f1`, clean tree. The T01–T37 audit tranche is committed; this session independently re-verified representative claims across every subsystem, re-ran the aggregate and canonical gates fresh, and walked the product live in a browser. External/manual evidence X01–X08 remains open and is not implied by anything below.

## Executive verdict

Open Tabletop Engine is a **functional, DM-first, API-first D&D 5.5e VTT** — no longer a collection of prototypes, and no longer merely "implementation-complete on paper": this session watched the core loop work end-to-end on a blank deployment (bootstrap → setup → invite → character → rolls → combat → death saves → API restart → resume) and against the seeded demo campaign in a live browser.

The right verdict is: **implementation-complete for the audited backlog; core loop locally validated fresh; evidence-incomplete for release; one new narrow rules defect open (Second Wind action classification, T38).**

Two qualifiers keep this honest:

1. **Process risk is real, and this audit measured it.** A concurrent commit broke the release gate for ~16 minutes mid-audit (guard-pin vs. script change), and the prior audit's "frozen evidence" identifiers are not reproducible from the repository. Both were repaired/replaced within the hour — but they show how a fast-moving solo workflow can outrun its own gates. The mitigation is already designed (CI runs the gate on push; T40 proposes persisted evidence artifacts).
2. **Local validation is not table validation.** Everything below the X01 line is still simulated players.

Do not market this as production-ready. It is a locally validated audit candidate ready for controlled real-table evidence work.

## Primary user and promise

The primary user is a DM running a recurring small-group 5.5e campaign; players are first-class. The credible promise:

> A persistent D&D 5.5e table where supported outcomes are authoritative and reviewable, manual rulings are labeled, and interrupted campaign state can be resumed safely.

Not promised: automation of arbitrary prose, geometry inference, or non-SRD commercial content.

## What the product demonstrably does today (this session's evidence)

- Serves an 835-entry SRD 5.2.1 compendium with per-entry CC BY 4.0 attribution.
- Computes a correct character sheet server-side (~40 quick rolls on the demo fighter; every sampled formula correct, including proficient saves, grapple/shove DCs, concentration DC rule, mastery-tagged weapon rolls) and renders it with accessible per-roll labels.
- Rolls server-side with seeded replay metadata and auto-posted chat cards.
- Runs combat with participant review, initiative validation, surprise flags, a turn/round tracker, a turn-scoped action-economy ledger, reward recording (XP/GP/loot), and a two-step end confirmation.
- Executes the full death-save lifecycle atomically (verified natural-20 revive live), synchronized between actor and combat state, with an undo envelope.
- Grants/transfers/spends Heroic Inspiration with a kept-die reroll bound to the actual roll.
- Enforces permissions server-side: from the player seat, adversaries disappear, unowned vitals redact, GM controls vanish.
- Survives an API restart mid-session and resumes (canonical journey).
- Ships operational scaffolding: coordinated backups, retention, observability metrics, header-first session transport, CI release gate.

## Strongest verified design areas

1. **Authoritative mutation model** — permissions, exact revisions, idempotency, audit, and undo envelopes appear consistently in live payloads, not just in tests.
2. **Rules review model** — supported vs. reviewed-manual vs. unsupported is visible in the product ("Damage, movement, and map geometry remain manual unless shown in the preview"), and cancel paths don't spend.
3. **Transparent calculation** — sheet payloads carry full derivations (AC breakdown, speed details, formula-labeled buttons); rolls carry seeds and terms.
4. **Campaign continuity** — resumable setup drafts, identity-bound archive rollback, resumable encounter placement, restart-resume proof.
5. **Content provenance** — SRD 5.2.1 + CC BY 4.0 attribution embedded per entry; licensing posture is unusually clean for the category.

## Most serious remaining gaps

1. **No real-table evidence (X01).** The dominant risk. Every workflow has passed automation; none has survived a real group.
2. **The release gate is red on main** — the default E2E suite went unmaintained through the audit tranche (CI: 18 failed / 39 passed at the `pnpm e2e` step on `b5e30f1`; sampled failures are predominantly stale test expectations, one harness race). T48 must land before any release-gate claim.
3. **R-04 Second Wind action-economy defect** — small, but it sits in the fighter's core turn and produces a successful-looking wrong state (T38, fix before internal play).
4. **Hosted recovery unproven (X03/X05)** — local backup/restore code exists; no provider-native drill has run. Accessibility/device claims remain automation-only (X04).
5. **Evidence hygiene** — release claims cite runs that are not persisted as artifacts (T40), and local-green coexisted with CI-red for a day; this audit demonstrated how quickly claims and reality drift in a fast solo loop.

## Product coherence

**Classification: a narrow but functional D&D 5.5e VTT** (DM-first, small-group, SRD-scoped) with an unusually deep authoritative-rules backend and deliberately manual geometry. It is not a character builder with map tools bolted on, nor a battle-map toy with a rules veneer; the same typed transaction model runs both.

- **Strongest workflow:** the DM session loop (create/resume campaign → people → characters/scenes/encounters → reviewed combat → dice/chat/journals → persist/recover).
- **Weakest critical workflow:** none is broken at the code level today; the weakest *validated* link is multi-user recovery under real concurrency (only automation-tested — X01).
- **DM-first vs. player-first:** DM-first by design; players now get a coherent seat (quick rolls, private visibility, inspiration, death saves, consequences, rest, resume). Player-side depth (e.g., spell management ergonomics at high levels) is the natural next UX frontier after X01 feedback.
- **Impressive-but-secondary:** the breadth of operations tooling (retention metrics, SBOM, evidence templates) outruns the product's user base today; it's good engineering that should not absorb further investment until X01–X05 use it.
- **Abstraction level:** correct. Rules exceptions live in typed seams (the R-04 fix is one metadata field), not a universal DSL. Composition roots remain large but budgeted (see `ARCHITECTURE_RISKS.md`).

## Competitive capability framework

| Area | Assessment vs. mature VTT expectations (Roll20/Foundry/Fantasy Grounds/Owlbear class) | Boundary |
| --- | --- | --- |
| Campaign administration | At or above parity for small groups (resumable setup, roles, transfer, duplication, archives) | Real multi-user operation needs X01 |
| Character/sheet lifecycle | Strong 5.5e SRD core with server-authoritative math — a genuine differentiator vs. client-computed sheets | Non-SRD breadth out of scope without rights |
| Tactical tabletop | Parity on core (grid/gridless, fog, walls, light, templates, measurement); intentionally below Foundry on automated geometry | Manual cover/path/Push is a stated contract, not a TODO |
| Combat/rules transactions | Above typical parity: reviewed consequences, action ledger, undo envelopes, audit trail | Arbitrary prose stays manual |
| Monsters | 168 SRD blocks with exact-bonus rolls; legendary economy manual (T42) | Larger bestiaries are licensing-bound |
| Recovery/archives/ownership | Differentiating: streamed exports, identity-bound rollback, restart-resume proof | Hosted proof is X03 |
| Accessibility | Automated coverage + structured review dialogs; ahead of category norms in intent | Physical matrix is X04 |
| API/plugins | Differentiating (typed contracts, 339 routes, MCP surface) | Trusted-admin only |
| AI assistance | Differentiating architecture (policy, scopes, disclosure, audit, proposals + governed auto) | Quality/adversarial evidence X07/X08 |
| Marketplace/social/voice | Absent | Intentionally out of scope |

**Pursue parity** in tabletop feel and content ergonomics as X01 feedback directs. **Differentiate** on: transparent authoritative rules, campaign continuity/ownership, self-hosting, API access, and auditable optional AI.

## Recommended positioning

A transparent, recoverable, DM-first 5.5e tabletop for small recurring groups — every rules outcome reviewable, every campaign exportable, AI optional and governed. Avoid claims of universal automation, hostile-plugin isolation, HA, or production-readiness until the corresponding evidence exists.

## Recommended scope

### Include
- The connected small-group campaign/session loop; SRD-based 5.5e automation with reviewed boundaries.
- Square and gridless scenes, reviewed manual geometry, assets, archives.
- API/contracts/typed client; trusted permission-checked plugins.
- Optional AI in both existing modes under policy.
- Self-hosted/deployment recipes with explicit operator duties.

### Exclude or defer
- Guessed line of effect, cover, pathfinding, token displacement.
- Arbitrary prose automation presented as authoritative.
- Proprietary content without licensing; hostile-plugin marketplace claims.
- HA/multi-region promises; universal rules-language or schema rewrites.
- Feature breadth ahead of X01–X08 and the T38+ tranche.

## Maturity statement

**Locally validated audit candidate.** Promote in this order: (1) land T38/T39 and the evidence-persistence hygiene (T40/T41); (2) run repeated real-table sessions (X01) and any advertised provider lifecycle (X02); (3) prove hosted recovery and the operating envelope (X03/X05); (4) physical accessibility (X04); (5) legal/security/AI evidence (X06–X08). The remaining uncertainty is empirical, not architectural — resolve it with evidence, not rewrites.
