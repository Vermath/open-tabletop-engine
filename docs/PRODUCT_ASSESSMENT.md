# Product Assessment

> Current-state assessment, 2026-07-16. It evaluates committed HEAD `e4c6ac9` plus the validated implementation working tree. All code-addressable audit tickets T01-T37 are implemented, and the frozen local aggregate/canonical acceptance gates passed. External/manual evidence X01-X08 is not complete or implied by this assessment.

## Executive verdict

Open Tabletop Engine is now a coherent, DM-first, API-first D&D 5.5e VTT implementation rather than a collection of disconnected prototypes. Campaign setup, membership, characters, scenes, gridless/square maps, encounters, combat, dice, chat, journals, archives, recovery, plugins and the campaign-governed AI agent share one permissioned persistent model. The audited correctness and workflow gaps have code solutions in the working tree.

The right product verdict is **implementation-complete and locally accepted for the audited backlog, evidence-incomplete for release**. Known P0 code counterexamples from the audit have been addressed and the final canonical/repeated aggregate gates passed. Real-table use, hosted recovery/operations, physical accessibility, provider integration, legal review, independent security review and AI evaluation remain external gates.

Do not market this as broadly production-ready yet. It is locally accepted and ready for controlled external/manual evidence work.

## Primary user and promise

The primary user is a DM running a recurring small-group campaign. Players are first-class participants, but the product is organized around the DM's need to prepare, invite, adjudicate, recover and continue a shared game.

The credible promise is:

> A persistent D&D 5.5e table where supported outcomes are authoritative and reviewable, manual rulings are labeled, and interrupted campaign state can be resumed safely.

It is not a promise to automate arbitrary prose, geometry or every commercial rules source.

## Current product value

- One persistent campaign model joins account, permission, character, scene, token, encounter, combat, chat, journal, asset and archive state.
- Rules mutations use revisions, idempotency, permission checks and reviewed consequences instead of silent client-only state.
- First-session setup is ordered and resumable rather than one fragile mega-form.
- Campaign members, gridless scenes, exact search results, dedicated duplication and streamed archives are connected in the browser.
- Player-critical lifecycles now include Death Saves, Heroic Inspiration, standard Actions, Action Surge, save Advantage, Weapon Mastery, Rage, Armor Class intent, advancement retry and controlled-creature handoff.
- Operational code covers safer session transport, coordinated backups, retention and metrics.
- Typed managed D&D actor/item views strengthen validation without destroying unknown legacy/homebrew data.
- Recorded dice rolls can be replayed consistently across persisted paths; the product explicitly does not market the stored seed hash as a witnessed pre-roll commitment or proof of host fairness.
- Heavy web surfaces are demand-loaded, reducing the last focused main production bundle relative to the audit baseline.

## Strongest verified design areas

1. **Authoritative mutation model.** Permissions, exact revisions, idempotency and audit/realtime behavior are consistently treated as server responsibilities.
2. **Rules review model.** Supported automation, reviewed manual outcomes and unsupported behavior are distinct; cancel paths do not spend resources.
3. **Campaign continuity.** Snapshots, archive validation, identity-bound rollback, resumable imports/placement and recovery operations form a credible local recovery story.
4. **Integrated session surface.** Characters, tabletop, encounters, combat, dice, chat and journals operate against the same campaign state.
5. **Extension discipline.** API/client/contracts and typed plugin commands are reusable while plugins remain an explicitly trusted-admin boundary.

## Final local validation

The frozen implementation/test tree passed three consecutive `TURBO_FORCE=true pnpm check` runs. Every run completed lint 25/25, typecheck 25/25, E2E typecheck, tests 25/25 with 303 files, 1,822 passing tests and 1 skipped test, and builds 15/15. The final isolated canonical Playwright journey passed 1/1 in 1.4 minutes against frozen snapshot `20260716T030254960Z`.

## Most serious remaining gaps

These are evidence and operating gaps, not a second hidden list of unimplemented audit tickets:

1. Repeated real-session use still needs observed GM/player correction, conflict and recovery outcomes (X01).
2. Advertised identity/provisioning support still needs a selected-provider OIDC/SCIM lifecycle (X02).
3. No current hosted proof demonstrates non-no-op state-plus-asset backup, restore, migration and rollback (X03).
4. Accessibility/device and hosted capacity/incident claims still require physical and deployed evidence (X04-X05).
5. Public distribution still requires content/legal, independent security and, if offered, representative AI evaluation (X06-X08).

## Product coherence

### Strongest workflow

The strongest workflow is the DM's session loop: create/resume a campaign, manage people, prepare characters/scenes/encounters, run reviewed actions in combat, communicate in dice/chat/journals and persist/recover the resulting state.

### Previously weak workflows now connected

- Campaign people management now exposes role update/removal with owner, self, SCIM and removed-user access guards.
- Square/gridless selection now matches the scene domain and suppresses irrelevant grid controls.
- Setup drafts are versioned, safely scoped and resumable across reload/sign-out for the same user/campaign.
- Browser duplication uses the dedicated API; archives stream with progress; search opens exact actionable records.
- Advancement failure remains visible and retryable.
- Summons/transformations hand off to source-locked controlled-creature review without premature spending; current authority is rechecked and same-tab reload restores the scoped draft for a fresh preview.

### DM-first versus player-first

The product remains intentionally DM-first, but the implementation now gives players coherent quick rolls, private/public visibility, Inspiration, Death Saves, action economy, structured consequences, rest/recovery and role-specific setup. The remaining question is usability under repeated real-table conditions, which is X01 rather than more speculative code.

### Duplication and abstraction

The architecture still has large composition roots, but the response should remain incremental. T13 and T17 extracted only touched seams and kept enforced budgets. A universal rules DSL, service split or full actor-schema rewrite would add risk without closing an evidence gate.

## Competitive capability framework

| Area | Current assessment | Boundary |
| --- | --- | --- |
| Campaign administration | Strong implementation | Real multi-user operation still needs X01 |
| Character/sheet lifecycle | Strong 5.5e core | Non-SRD/proprietary breadth is out of scope without rights |
| Tactical tabletop | Broad and connected | Geometry-dependent cover/path/Push remains reviewed/manual |
| Combat/rules transactions | Strong audited core | Arbitrary prose remains manual/unsupported as labeled |
| Recovery/archives | Strong local controls | Hosted state-plus-asset proof remains X03 |
| Accessibility/device support | Automated coverage only | Physical matrix remains X04 |
| API/plugins | Broad typed platform | Plugins are trusted-admin, not hostile sandboxed code |
| AI assistance | Permissioned manual and governed-auto modes | Quality/privacy/provider evidence remains X07-X08 |
| Hosted scale/HA | Suitable for declared single-node small-group use | Multi-replica/HA claims are not made |

## Recommended positioning

Position the product as a transparent, recoverable, DM-first 5.5e tabletop for small recurring groups. Lead with reviewed outcomes, shared state, campaign continuity and explicit support boundaries. Avoid claims of universal automation, hostile-plugin isolation, high availability or production-readiness until the corresponding evidence exists.

## Recommended scope

### Include

- the connected small-group campaign/session loop;
- supported SRD-based 5.5e character and combat automation;
- square and gridless scenes, reviewed manual geometry, assets and archives;
- API/client/contracts and trusted permission-checked plugins;
- optional AI with both existing manual and governed automatic execution modes;
- self-hosted/deployment recipes with clearly assigned operator duties.

### Exclude or defer

- guessed line of effect, cover, pathfinding or token displacement;
- arbitrary prose automation presented as authoritative;
- proprietary content without independent licensing;
- public hostile-plugin marketplace claims;
- HA/multi-region promises outside the measured single-node topology;
- more feature breadth before X01-X08 close.

## Maturity statement

The repository is **locally accepted for the audited backlog**, not yet ready for an unconditional public release claim. Promotion should occur in order:

1. run repeated real-table sessions and any advertised provider lifecycle;
2. prove hosted state-plus-asset recovery and the operating envelope;
3. complete physical accessibility/device evidence;
4. complete legal, independent security and any applicable AI evidence.

The implemented audit tranche materially improves the product. The remaining uncertainty is now mostly empirical and operational, and it should be resolved with evidence rather than another speculative rewrite.
