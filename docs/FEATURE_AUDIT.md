# Feature Audit

## 2026-07-17 remediation closure addendum (authoritative)

This addendum supersedes the 2026-07-16 status language wherever it conflicts. The earlier audit is retained as the discovery ledger. All code-addressable findings identified there have now been remediated in the current **uncommitted working tree**; this is not a claim that the tranche is committed, deployed, independently reviewed, or production-proven.

### Current executive verdict

OpenTabletop is now a **locally qualified private-alpha candidate**: the final repository gate and every exact-tree browser journey recorded below are green. The strongest change is not feature count: rules-visible transitions, multi-user mutations, recovery, creator/advancement state, browser security, realtime continuity, and operator recovery now use connected authoritative paths with regression coverage. No known July 16 code-addressable release blocker remains deliberately unimplemented.

### Remediation closure matrix

| Area | July 16 findings closed in the working tree |
|---|---|
| Combat and state integrity | N01 critical verdict continuity, N02 actor/combatant recovery, N03 deterministic continuation binding, N04 atomic permission-checked batch movement, and N08 combat-panel vitals/roster controls |
| Release and operations | N05 bounded API gate diagnostics, N06 short AI durable phases around provider waits, and N07 coherent Compose/security/paired-backup wiring |
| Character and D&D workflows | N09 resumable scoped drafts, N10 authoritative standard array, N11 typed spell grants and casting attribution, N12 effective speed derivation, and N13 explicit subclass gating |
| First-session and recurring play | N14 one-scene map/onboarding readiness, N15 searchable/show-all capped collections, N16 rendered handouts plus recoverable journal drafts, and N20 selected managed-effect lifecycle coverage |
| Public trust surfaces | N17 hardened cookie session transport/CSP/revocation, N18 proxy- and account-aware throttling with bounded async verification, and N19 revision/OpenAPI/realtime sequence parity for AI and agent paths |
| Audit-adjacent tickets | T38-T41 and T48 release/rules hygiene, T42 legendary actions, T43 SRD content decision, T44 demo hygiene, T45 canvas capture, T46 sheet/API agreement, and T47 X01 evidence capture |

### Release boundary after remediation

| Stage | Current disposition |
|---|---|
| Internal engineering build | **Locally qualified.** The clean repository gate, aggregate/default browser suite, clean bootstrap, canonical restart journey, and full Level 3 combat journey are green on the same working tree. |
| Private alpha | Still requires X01 repeated real GM/player sessions, X03 an independent non-no-op hosted state-plus-asset restore, and X02 only if enterprise identity is advertised. |
| Public beta | Still requires X04 physical assistive-technology/device evidence, X05 hosted operating drills, X06 content/legal approval, X07 independent security review, and X08 provider/AI quality evidence if AI is offered. |

The correct claim is therefore **code-complete for the reviewed remediation scope, locally validated, and externally evidence-gated**. Historical tables below describe what was found, not what remains open.

### Final local qualification evidence

| Gate | Exact-tree result on 2026-07-17 |
|---|---|
| `pnpm check` | Green: lint, repository and E2E type checks, all package tests, and all production builds. API: 131 files, 807 passed, 1 intentional skip. Web: 136 files, 686 passed. System SDK: 38 files, 305 passed. |
| `pnpm e2e` | Green in one serial command: aggregate/default 62/62, followed immediately by clean-deployment bootstrap 1/1. |
| Canonical public journey | Green 1/1: blank-deployment GM/player campaign, legal advancement, combat, API restart, and resume. |
| Full Level 3 combat | Green 1/1: generated map, four legal Level 3 sheets, encounter placement, R-04 coverage, combat completion, and continuity evidence. |
| Documentation and diff hygiene | Documentation site check and `git diff --check` are required at handoff and recorded in the final validation summary. |

This evidence qualifies the local tree only. The tranche remains uncommitted, undeployed, and not independently reviewed; X01-X08 retain the release boundaries above.

## 2026-07-16 working-tree addendum (authoritative)

This addendum supersedes the release-readiness conclusions below where they conflict. It does **not** erase the historical audit ledger. The current evidence cutoff is committed HEAD `9de6a3c` plus the uncommitted working tree. That working tree contains a substantial rules and end-to-end tranche that is implemented but not yet released. This audit changed documentation only.

### Executive verdict

The repository contains a real, persistent, API-first VTT and can complete a representative D&D 5.5e level-3 combat journey. It is not yet a dependable private-alpha release candidate. Two game-state correctness defects, one partial-write collaboration defect, a nondeterministic canonical journey, and several operational/security gaps remain. The product is best described as a **functional internal playtest build with broad feature coverage and uneven workflow completion**.

Completion status uses the brief's canonical vocabulary. Historical labels such as "Verified live" and "Verified in code" below describe evidence confidence, not product completeness.

- **Complete:** the user-complete primary path is connected, persistent, and supported by current evidence.
- **Functional but incomplete:** useful end-to-end behavior exists, but a common workflow, authority boundary, recovery path, or scale case is incomplete.
- **Prototype:** demonstrable behavior exists but still depends on manual interpretation or developer-facing controls.
- **UI-only / Backend-only:** only one side of the user-to-authority path is connected.
- **Stub or placeholder:** a named surface/data marker exists without a usable behavior.
- **Broken:** a connected path can produce wrong, partial, unsafe, or unreleasable behavior.
- **Not implemented:** no path exists; this can be intentional.
- **Unable to verify:** code or configuration exists, but the required external/runtime evidence was unavailable.

### Corrective capability matrix

| Capability | Status | Current evidence and remaining product gap |
|---|---|---|
| Authentication and campaign persistence | Complete (local scope) | Account, membership, campaign, scene, actor, asset, and archive paths are persistent. Hosted durability and recovery are separately unable to verify. |
| Campaign creation and setup | Functional but incomplete | Setup guidance exists, but readiness can be reported from a background and token that belong to different scenes, and the final play condition never becomes complete. |
| Setup readiness indicator | UI-only | Readiness is derived in the web client and is both cross-scene and permanently incomplete; it is not an authoritative campaign invariant. |
| Invites, roles, and ownership | Functional but incomplete | Explicit server permissions are a strength. The invite surface truncates at eight records without paging or a complete management view. |
| Level-1 character creation | Functional but incomplete | Class/species/background/origin choices work, but there is no complete standard-array reassignment, point-buy, or rolled-stat workflow. Draft state is local and can be lost on close or reload. |
| Character advancement | Functional but incomplete | The dirty tree adds stronger advancement and spell-choice handling, but authoritative spell acquisition remains limited to a narrow Cleric/Wizard path and multiclass spellcasting ability can be attributed incorrectly. |
| Character sheet | Functional but incomplete | Core combat statistics and actions exist. Long loadouts and action lists are silently truncated, and movement bonuses are not reflected in effective speed. |
| Maps and scenes | Functional but incomplete | Scene backgrounds, walls, lights, fog, grids, and calibration exist. Upload, selection, and calibration are separated enough to slow first-session setup. |
| Hex-grid play | Not implemented (intentional) | The product is D&D-specific and supports square/gridless play; no hex parity work is recommended now. |
| Tokens and ownership | Broken | Placement and movement work, but a mixed-authority multi-token drag fans out independent writes; permitted tokens can move before another token is rejected. |
| Fog, walls, lighting, and vision | Functional but incomplete | Strong functional coverage. Keyboard-only board operation and richer tactical semantics remain incomplete. |
| Encounter setup and initiative | Complete | Encounter construction, initiative, turns, rounds, and combat lifecycle are implemented for the reviewed core path. |
| Live combat management | Functional but incomplete | Attack, damage, saves, conditions, concentration, and continuation flows exist. The combat panel lacks direct HP/temp-HP/damage/heal and add/remove-combatant controls. |
| Attack criticals | Broken | Natural-hit determination exists, but critical outcome is not persisted into the damage continuation and the critical-damage helper is unused. Critical hits can resolve ordinary damage. |
| Healing from 0 HP during combat | Broken | Actor state is normalized, but the active combatant can remain defeated with stale death-save state because combat synchronization only sets defeat and never clears it. |
| Action economy and class resources | Functional but incomplete | Focused System SDK and API suites passed, including the current action-economy and advancement tranche. Broader class/subclass completeness remains uneven. |
| Spells | Functional but incomplete | The SRD catalog is broad and spell attacks/saves/resources work. Many spells remain data-only or require manual adjudication. |
| Complex persistent-effect automation | Stub or placeholder | Many spell actions are absent or use a zero formula; typed concentration/conditions exist, but no complete managed-effect lifecycle exists. Manual adjudication is the supported fallback. |
| Monsters | Functional but incomplete | Broad SRD threat coverage, actions, saves, and initiative are available. Legendary cadence and complex persistent monster mechanics are still prototype-level. |
| Dice, chat, and visibility | Functional but incomplete | Dice and public/GM-only chat work. Whisper targeting, scroll retention, and a clear communication model are not complete. |
| Journals and handouts | Prototype | Journals are useful but draft recovery is weak. Handouts are effectively read-only text rather than a polished Markdown/media player experience. |
| Assets, export/import, and archives | Functional but incomplete | Checksummed, bounded archive behavior is a strength. Scheduled backup configuration is not fully passed through Compose, and asset/database pairing needs operator evidence. |
| Backup scheduler | Backend-only | Runtime scheduling code exists, but Compose does not pass the complete scheduler configuration and no operator-facing proof was verified. |
| Self-hosting | Broken | The documented Compose default uses an HTTP S3 endpoint while production runtime rejects non-HTTPS endpoints; a required signing secret is not enabled in the example environment. |
| AI assistance | Functional but incomplete | The automatic execution model is preserved and has explicit permissions/citations. A streamed AI request can hold the global durable mutation coordinator for the provider timeout, blocking unrelated writes. |
| Realtime recovery | Functional but incomplete | Snapshot refresh exists. AI/agent events are outside campaign sequencing, and revision/OpenAPI guards explicitly exempt important AI surfaces. |
| Browser security | Broken | A long-lived bearer token is stored in localStorage, static hosting lacks a CSP, and login throttling is proxy-unaware and not account-aware. |
| Responsive and accessible operation | Functional but incomplete | Conventional controls are usable, but the main board remains pointer-first and lacks full keyboard movement, measurement, drawing, and fog workflows. |
| Hostile-code plugin sandbox/marketplace | Not implemented (intentional) | The current VM is a trusted-administrator extension boundary; do not market it as hostile-code isolation. |
| Hosted concurrency, provider lifecycle, restore, and device matrix | Unable to verify | These require real infrastructure, providers, users, restore drills, and physical assistive-technology/device evidence. |
| Items, equipment, and treasure | Functional but incomplete | Inventory graph, equipment state, attunement, Weapon Mastery, typed bonuses, and commerce helpers exist in `packages/system-sdk/src/dnd-inventory-commerce.ts` and related modules; ammunition, party inventory/transfer, containers, buying/selling, and duplicate-effect prevention were not all verified end to end. |
| Rules content and compendium | Functional but incomplete | Current inspection found 835 entries: 475 items, 341 spells, and 19 conditions with SRD provenance; search/filter/actionability exists, while richer cross-linking, drag/drop breadth, version conflicts, and every content category remain partial. |
| Homebrew and manual overrides | Functional but incomplete | Calculation overrides, custom actors/items/actions/content provenance, and preservation of unknown import fields support table deviation; campaign-wide toggles, every custom content type, duplicate/conflict resolution, and upgrade behavior are uneven. |
| Public API and trusted-admin plugins | Functional but incomplete | Typed REST/OpenAPI/client, idempotency, permissions, events, and plugin commands are strong; AI/agent validation/sequence exceptions remain, and the plugin VM is not hostile-code isolation. |

### End-to-end workflow audit

Statuses below are completion statuses. Runtime statements come from the fresh full-combat/canonical runs or the prior live walk identified in the historical ledger; code-only conclusions are labeled in the evidence cell.

#### Campaign setup journey

| Step | Status | Evidence and UX finding | Likely abandonment / access concern |
|---:|---|---|---|
| 1. Install or open | Broken for documented self-hosting | `docker-compose.yml:23-33` defaults to HTTP MinIO while `apps/api/src/runtime.ts:142-155` rejects non-HTTPS production endpoints; `.env.example:87-88` leaves the signing secret disabled. | A self-hosting DM can fail before seeing the product. |
| 2. Create account | Complete (local) | Auth/session routes in `apps/api/src/app.ts`; registration/login exercised by `tests/e2e/canonical-public-journey.spec.ts`. | Error recovery exists; public token/throttle risks are release concerns, not a local dead end. |
| 3. Create campaign | Complete | Campaign create/settings lifecycle is connected through `apps/api/src/app.ts` and `apps/web/src/App.tsx`; exercised in the canonical journey. | Large manage surface is dense but not a blocker. |
| 4. Configure campaign rules | Functional but incomplete | Rules boundaries and manual adjudication are visible, but no complete campaign rule-toggle model was found; core rules remain system-wide/shared-SDK behavior. | A house-rule-heavy DM must use manual overrides/homebrew rather than a guided policy setup. |
| 5. Invite players | Functional but incomplete | Invitation routes and UI work; `apps/web/src/App.tsx:9503` displays only the first eight invites without paging. | Campaign-scale invite management hides records. |
| 6. Accept invitation | Complete | Second-browser join is exercised by `canonical-public-journey.spec.ts`; server membership controls access. | No critical dead end observed. |
| 7. Create/import character | Functional but incomplete | `apps/web/src/character-creator-dialog.tsx:362,625,632` keeps a local draft that dismissal/reload can lose; standard-array assignment is incomplete; import route exists in `apps/api/src/app.ts`. | Highest setup abandonment: losing a multi-step character draft. Keyboard/modal close behavior needs testing. |
| 8. DM review/approval | Not implemented as a dedicated gate | No mandatory approval workflow was located; assignment/ownership and server validation exist instead. | Acceptable only if documented as a deliberate DM-control model. |
| 9. Create scene | Complete | Scene lifecycle routes in `apps/api/src/app.ts`; scene controls in `apps/web/src/App.tsx`; duplication logic in `apps/api/src/scene-duplication.ts`. | No critical dead end observed. |
| 10. Upload map | Functional but incomplete | Background selector is around `apps/web/src/App.tsx:9631`; upload control is separated near `:9882`. | DM may search two distant surfaces and abandon map setup. |
| 11. Configure grid | Complete for square/gridless | `apps/web/src/scene-grid-fields.tsx` and `apps/api/src/gridless-scene-api.test.ts`; hex is intentionally not implemented. | Calibration is discoverability-heavy; keyboard/device evidence unavailable. |
| 12. Place tokens | Broken for mixed-authority groups | Drag is exposed at `apps/web/src/scene-canvas.tsx:731`; `apps/web/src/App.tsx:4411` fans group moves into independent requests. | A denial can leave a partially moved board. |
| 13. Create/import encounter | Complete on reviewed core path | Encounter/placement routes in `apps/api/src/app.ts`; `apps/api/src/encounter-monster-placement.test.ts`; initiative path exercised in full-combat E2E. | Large/custom encounter performance was not verified. |
| 14. Create journal/handout | Prototype | Journal routes are in `apps/api/src/app.ts`; handout surface at `apps/web/src/handout-library-panel.tsx:354` is effectively read-only text rather than rendered media-rich content. | Weak draft recovery and presentation reduce prep confidence. |
| 15. Prepare first session | Functional but incomplete | `apps/web/src/campaign-setup-steps.tsx:180-187` can combine background/token readiness from different scenes and never completes final play readiness. | The onboarding success state is misleading and then permanently incomplete. |

#### Player journey

| Step | Status | Evidence and UX finding | Likely abandonment / access concern |
|---:|---|---|---|
| 1. Join campaign | Complete | Invite acceptance and player browser are covered by the canonical journey. | No critical dead end observed. |
| 2. Open character | Complete | Character/actor sheet route and selection in `apps/web/src/App.tsx` and `actor-panel.tsx`; canonical/full-combat fixtures open the player actor. | Multiple-character scale was not manually verified. |
| 3. Find core statistics | Functional but incomplete | `apps/web/src/actor-panel.tsx` exposes vitals, defenses, saves, skills, and resources; long collections are capped. | Hidden overflow can look like missing data. |
| 4. Make ability check | Complete on reviewed path | Shared quick rolls in `packages/system-sdk/src/index.ts`; server roll resolution in `apps/api/src/app.ts`; focused action-economy tests pass. | Formula details are available; no critical issue observed. |
| 5. Make saving throw | Complete on reviewed path | Save Advantage logic in `packages/system-sdk/src/dnd-save-advantage.test.ts`; server-authoritative roll path. | Complex temporary stacking remains a broader rules risk. |
| 6. Make attack | Functional but incomplete | Attack preview works, but fresh `canonical-public-journey.spec.ts:413` failed once with a disabled final continuation and passed on rerun. | A player can stall immediately after a hit. |
| 7. Roll/apply damage | Broken for critical attacks | `packages/system-sdk/src/dnd-action-continuations.ts:46-64` omits critical metadata; critical helper at `dnd-rules-completion.ts:304-315` is unused. | The table loses trust when a visible critical deals ordinary damage. |
| 8. Cast spell | Functional but incomplete | 341 current spell records; action/save/attack/resource paths work, but complex spells are manual and grant-source ability can be wrong for affected multiclass casters. | Player may need DM/manual correction for complex or misattributed spells. |
| 9. Spend resource | Complete on focused paths | Action-economy/resource suites passed; current Second Wind/Tactical Mind fixes are in the working tree but unreleased. | Aggregate release evidence remains unstable. |
| 10. Move token | Functional but incomplete | Single-token movement works; multi-token mixed-authority movement is broken as described above. | Permission error can partially change the board. |
| 11. Target creature | Functional but incomplete | Target selection/attack/save continuations exist in web/API; advanced area/geometry remains reviewed/manual. | Manual geometry is acceptable when labeled, but adds DM overhead. |
| 12. Receive damage | Complete except critical source | Typed damage, resistance/immunity/vulnerability, temp HP, and actor updates are in System SDK/API focused coverage. | Critical source defect can under-apply damage. |
| 13. Receive healing | Broken in active combat recovery | Actor clears zero-HP state in `packages/system-sdk/src/index.ts:12029-12037`; `syncCombatDefeatedFromActorIds` at `apps/api/src/app.ts:22501-22511` never clears combatant defeat. | Sheet and initiative can disagree about whether the player may act. |
| 14. Gain condition | Complete on core path | Typed conditions/effects are represented in System SDK and actor/combat APIs; full-combat journey exercises condition state. | Complex stacking/duration semantics remain partial. |
| 15. End concentration | Complete on core path | Concentration state and cleanup are centralized in System SDK/API and surfaced on the sheet. | Exact complex spell lifecycle remains manual. |
| 16. Take rest | Complete on reviewed path | Short/Long Rest, Hit Dice, and resource restoration live in `packages/system-sdk/src/index.ts` with focused regression coverage. | No broad imported/homebrew rest matrix was run. |
| 17. Level up | Functional but incomplete | Dirty-tree advancement API tests pass; `packages/system-sdk/src/dnd-validation-preview.ts:927-946` narrows authoritative spell choices; web flow omits other casters. | Affected spellcasters can complete a level with incomplete/wrong spell attribution. |

#### Combat journey

| Step | Status | Evidence and UX finding | Likely abandonment / access concern |
|---:|---|---|---|
| 1. Activate combat scene | Complete | Scene activation and combat start in `apps/api/src/app.ts`; full-level-3 Playwright journey passed 1/1. | No critical issue observed. |
| 2. Add PCs/enemies/allies/hidden participants | Complete on reviewed path | Encounter placement and participant review are connected; hidden participant permissions were covered by prior live walk. | Very large rosters not verified. |
| 3. Roll/enter initiative | Complete | Server roll/manual input and readiness gating are connected; full-combat journey passed. | No critical issue observed. |
| 4. Handle surprise/hidden combatants | Functional but incomplete | Surprised flags and permission-filtered visibility exist in combat/participant UI; broader stealth adjudication remains manual. | Manual stealth is acceptable; player visibility must remain explicit. |
| 5. Begin first turn | Complete | Combat progression/turn ledger in API/System SDK; active turn is surfaced in combat panel. | No critical issue observed. |
| 6. Measure movement | Functional but incomplete | Scene toolbar provides ruler/measurement/path aids; movement rules such as difficult terrain/opportunity are advisory/manual. | Pointer-first tools limit keyboard and tablet users. |
| 7. Roll attack | Functional but incomplete | Hit preview works; continuation race is nondeterministic in canonical E2E. | Player can be stranded after a successful hit. |
| 8. Apply cover/advantage/disadvantage | Functional but incomplete | Roll mode and cover/tactical aids exist; geometry-derived enforcement is deliberately manual. | DM overhead, but safer than incorrect geometry automation. |
| 9. Roll/apply damage | Broken | Critical verdict is lost between attack and damage; ordinary typed damage works. | Foundation exit blocker. |
| 10. Apply resistance/immunity/vulnerability | Complete on typed paths | Central typed-damage handling in System SDK/API; focused combat coverage. | Mixed/custom untyped effects remain manual. |
| 11. Apply condition | Complete on core path | Typed condition mutation and actor/combat state are connected. | Complex duration/stacking effects remain partial. |
| 12. Check concentration | Complete on core path | Concentration checks/cleanup are part of damage resolution and sheet state. | Complex spell-specific exceptions remain manual. |
| 13. Place spell template | Prototype | Area templates/drawing tools exist on the scene canvas; authoritative geometry/effect application is reviewed/manual. | Usable with a DM, not automatic rules proof. |
| 14. Resolve multiple target saves | Functional but incomplete | Target/save continuations exist; breadth of multi-target spell categories was not exhaustively run. | Manual cleanup may be required for complex areas. |
| 15. Apply half damage on success | Functional but incomplete | Save/damage preview supports reviewed adjustments; no complete every-spell matrix was verified. | DM must inspect ambiguous spell behavior. |
| 16. Use recharge ability | Functional but incomplete | Monster stat/action/resource data supports recharge-style actions, but no full representative recharge E2E was verified. | Unable to claim table-wide automation. |
| 17. Resolve reaction | Functional but incomplete | Reaction action-economy slots exist; timing/interrupt UI and opportunity attacks remain partial/manual. | Reaction windows can be missed without DM prompting. |
| 18. Drop creature to 0 HP | Complete for actor transition | System SDK zero-HP/death-save transition and API commit are tested; full-combat path covers defeat. | Recovery from this state is the separate broken seam. |
| 19. Resolve death save/monster death | Functional but incomplete | Death saves/stabilization work; healing recovery can leave combatant defeated. | Contradictory recovery is a real-play blocker. |
| 20. Advance round | Complete | Turn/round controls and action-economy reset exist in combat progression. | Legendary between-turn cadence remains partial. |
| 21. End combat | Complete | Reviewed end confirmation and combat completion path exist. | No critical issue observed. |
| 22. Record XP/loot | Functional but incomplete | Combat completion exposes XP/GP/loot recording; richer party inventory/transfer was not verified end to end. | DM may finish accounting outside the combat panel. |

#### Campaign-management journey

| Step | Status | Evidence and UX finding | Likely abandonment / access concern |
|---:|---|---|---|
| 1. Create NPC | Functional but incomplete | Actor/custom monster creation and monster cloning exist in API/System SDK; a polished campaign-NPC workflow was not exercised fresh. | Faster than raw data entry only on known paths. |
| 2. Link NPC to location | Functional but incomplete | Journal entity links/backlinks exist in `apps/api/src/app.ts` journal routes; exact NPC-to-location UX was code-verified, not freshly run. | Dense information architecture can hide the relationship. |
| 3. Record quest | Functional but incomplete | Journal/record types and linked records support campaign information; no dedicated quest-state E2E was found. | Users may fall back to freeform notes. |
| 4. Publish handout | Prototype | Publication/player receipt is covered by canonical history, but `handout-library-panel.tsx:354` is a read-only text presentation with limited media/rich formatting. | Players receive information, but presentation is below campaign-source-of-truth quality. |
| 5. Play session | Functional but incomplete | Fresh full-level-3 combat E2E passed; exploration/social workflows are less directly evidenced. | Combat is the strongest session slice; non-combat continuity is thinner. |
| 6. Record session notes | Functional but incomplete | Journal routes/history/canon review exist; draft autosave/recovery evidence is weak. | A reload/close can threaten uncommitted writing. |
| 7. Generate AI draft summary | Unable to verify end to end | AI thread/provider paths exist in `apps/api/src/app.ts`; no live provider summary was run in this audit. | Provider/configuration/privacy behavior remains external evidence. |
| 8. Review/edit AI draft | Unable to verify end to end | Thread/review surfaces exist, but no fresh provider-backed edit/cancel workflow was completed. | Do not claim a complete AI campaign workflow. |
| 9. Update campaign canon | Functional but incomplete | Journal canon-review/history paths exist; exact AI-draft-to-canon flow was not exercised. | Manual canon review is the safe supported path. |
| 10. Search a past event | Functional but incomplete | Exact search/navigation is implemented; campaign-scale recall and ranking were not benchmarked. | Search quality at multi-session scale remains unverified. |
| 11. Export campaign | Complete locally | Bounded/checksummed archive and streaming export paths in `apps/api/src/app.ts` and `apps/web/src/archive-stream-client.ts`; focused coverage exists. | Local export is a strength. |
| 12. Restore to another installation | Unable to verify | Import/recovery code exists, but current Compose/backup wiring and paired asset restore were not proven in a clean independent installation. | Final campaign-ownership promise is not yet demonstrated. |

#### Cross-journey UX findings

- **Smooth:** account/campaign creation, core scene/encounter creation, initiative, ordinary typed rolls/damage, turn progression, and local archive export.
- **Confusing/excessive clicks:** map upload/background/calibration, combat HP management outside the combat panel, long-sheet/list truncation, and campaign information spread across dense management surfaces.
- **Dead ends/data loss:** creator draft dismissal/reload, canonical damage continuation flake, onboarding's never-complete state, mixed-authority partial move, and healed actor/combatant divergence.
- **Missing feedback:** list caps lack show-all/paging, group denial does not guarantee rollback, complex spell/manual boundaries are not uniformly surfaced, and hosted backup health is not proven.
- **Loading/error/success:** the main paths have conventional states, but the incorrect onboarding success model and stranded preview show that state transitions are not consistently authoritative.
- **Accessibility/mobile:** conventional forms are partly usable; the board remains pointer-first, core geometry tools lack full keyboard equivalents, and the physical assistive-technology/tablet matrix is unable to verify.


### Serious issues found in the current tree

| ID / severity | Affected user; user, technical, and rules impact | Evidence | Recommended response | Real-play / public-release effect | Disposition |
|---|---|---|---|---|---|
| F-01 / Critical | Players and DMs see a critical deal ordinary damage; the continuation loses the critical verdict; definitely incorrect D&D attack damage | `packages/system-sdk/src/dnd-action-continuations.ts:46-64`; unused helper `dnd-rules-completion.ts:304-315`; Champion metadata `index.ts:2241-2242` | Typed server critical verdict/threshold and dice-only transform with replay/undo tests | Blocks Foundation exit and every later stage / blocks public release | Fix immediately |
| F-02 / High | A healed player may still be defeated in initiative; actor/combat sources diverge; definitely incorrect recovery state | Actor clears state at `packages/system-sdk/src/index.ts:12029-12037`; API applies update at `apps/api/src/app.ts:10621-10665`; one-way sync at `:22501-22511` | Transactional bidirectional actor-to-combatant life-state projection | Blocks real combat and private alpha / blocks public release | Fix immediately |
| F-03 / High | DMs/players can partially move a group after permission rejection; independent writes violate atomicity; rules geometry is unchanged | Drag exposed at `apps/web/src/scene-canvas.tsx:731`; independent `Promise.all` requests at `apps/web/src/App.tsx:4411` | Typed permission-checked batch command, one transaction/event/undo | Blocks collaborative real play / blocks public release | Fix immediately |
| F-04 / High | All users can be unable to mutate while one AI stream waits; a global durable critical section spans an external provider call; D&D commands are delayed, not reinterpreted | Coordinator `apps/api/src/app.ts:844-874,1037`; mutation hook `:17904-17933,18045-18047`; AI route `:7467-7553`; provider timeout `packages/codex-app-server-provider/src/index.ts:251-255` | Split pending/provider/final phases and test delayed-provider concurrency; preserve governed automatic execution | Blocks AI-enabled real play / blocks public release if AI is offered | Fix before enabling AI for alpha; otherwise disable in that profile |
| F-05 / High | Self-host operators can fail to boot or restore incomplete campaigns; config/backup wiring contradicts runtime; no direct D&D rule impact | `docker-compose.yml:23-33,62-67`; `.env.example:87-88`; `apps/api/src/runtime.ts:142-155`; `asset-operations.ts:1819-1858` | Coherent local-storage profile, signing secret, scheduler health, paired DB/assets restore drill | Blocks documented self-host play / blocks advertised self-host public release | May begin during M0; required and independently proven for M3 exit |
| F-06 / High | Players can stall after a hit; UI preview identity/realtime state is nondeterministic; rules sequence cannot complete | Fresh failure at `tests/e2e/canonical-public-journey.spec.ts:413` followed by immediate pass; full-level-3 journey passed | Fix the state race without sleeps/retries; require delayed-event tests and 10/10 clean runs | Blocks dependable real-play release qualification / blocks public release | Fix immediately |
| F-07 / High | Public users face amplified session theft and credential abuse; browser/local auth controls are weak; no direct D&D rule impact | `apps/web/src/api.ts:5-32,248-249`; seven-day default `apps/api/src/app.ts:20326-20328`; cookie support `session-transport-auth.ts:24-41,73-87`; no CSP `static-runtime.ts:128-150`, `infra/docker/nginx.conf:1-11`; throttle `app.ts:17645-17665` | Cookie/session migration and revocation, CSP, trusted proxy plus account/network throttling | Does not block trusted local play / blocks public beta | Schedule before public beta |
| F-08 / Medium | New DMs/players lose drafts or cannot find required records; local state/list caps and pointer-first controls harm usability; no direct rules error | Creator `character-creator-dialog.tsx:362,625,632`; sheet caps `actor-panel.tsx:602,619,628,669`; invites `App.tsx:9503`; chat scroll `chat-rail.tsx:60`; handout `handout-library-panel.tsx:354` | Resumable drafts, paging/show-all, session-speed panels, keyboard task coverage | Blocks some users' real play / blocks public beta | Schedule in M1/M2 |
| F-09 / Medium | Maintainers face broad regression/conflict scope; composition roots concentrate domain changes; rules impact is indirect through regression risk | Measured current files: `apps/api/src/app.ts` about 25.6k lines; `packages/system-sdk/src/index.ts` about 18k; `packages/api-contracts/src/index.ts` about 16.3k; `apps/web/src/App.tsx` about 11.2k | Extract only touched pure seams and enforce new-growth budgets; no rewrite | Does not itself block play or public release | Monitor and reduce incrementally |

### End-to-end abandonment points

1. A first-time DM can upload a map, but upload, background selection, calibration, and onboarding completion do not form one guided path.
2. A player can spend time in character creation and lose the entire draft by dismissing or reloading the dialog.
3. A DM can enter combat but must leave the combat surface to apply routine HP changes or manage the roster.
4. A player can hit an attack and reach the damage continuation, but the canonical journey intermittently leaves the final action disabled.
5. A DM can multi-select tokens they can and cannot control and produce a partial move rather than one clear rejection.
6. A healed character can appear conscious on the sheet while remaining defeated in combat.
7. A player with a long inventory or action list can believe entries are missing because the sheet silently caps the displayed records.
8. A group can use chat, journals, and handouts, but weak draft recovery, forced chat scrolling, and limited whisper/handout presentation create friction during live play.
9. An operator following the documented Docker quickstart can fail before reaching the product because production storage validation contradicts the Compose defaults.

### Fresh verification record

Run on 2026-07-16 against the current working tree:

| Check | Result | Interpretation |
|---|---|---|
| `pnpm.cmd gate:fast` | Pass | Deployment smoke 2/2 and API contracts 81/81 passed. |
| `pnpm.cmd gate:evidence:test` | Pass | Evidence gate passed with 61 records. |
| Focused System SDK rules suites | Pass | 3 files, 30 tests passed. |
| Focused API action-economy and spell-advancement suites | Pass | 2 files, 8 tests passed. |
| Full level-3 combat Playwright journey | Pass | 1/1 passed in the fresh run. |
| Canonical public Playwright journey, run 1 | Fail | Damage preview appeared, but "Use previewed action" remained disabled. |
| Canonical public Playwright journey, immediate rerun | Pass | 1/1 passed, demonstrating nondeterminism rather than a deterministic functional absence. |
| `TURBO_FORCE=true pnpm.cmd check` | Fail | Lint and typecheck completed, but the aggregate API test stage ended with 27 failures, 4 worker RPC errors, and many late five-second timeouts; the build phase was not reached. |
| Isolated full API suite | Inconclusive | It exceeded 30 minutes and was stopped; this is test-operability evidence, not a product pass. |

The historical sections below remain useful implementation evidence, but statements such as "no hidden implementation backlog," "clean working tree," or "locally validated release candidate" are no longer current.

> Independent re-audit, 2026-07-15 (late evening). Evidence cutoff is committed HEAD `b5e30f1` ("Stabilize cold API release tests") with a clean working tree. This revision supersedes the 2026-07-16-dated ledger written by the implementing session: that ledger's claims have now been **independently re-verified** by a separate audit session through fresh validation runs, code tracing, and a live in-browser workflow walk. Differences from the prior ledger are called out explicitly.
>
> During this audit, three commits landed concurrently (`f64c6f2` audit implementation, `63d5950` dependency-audit repair, `b5e30f1` gate stabilization). `63d5950` broke the release-gate guard test for ~16 minutes; this audit independently produced the identical one-line repair that `b5e30f1` then committed. Details in "Verification incidents" below.

## Executive finding

Open Tabletop Engine at `b5e30f1` is a broad, connected, DM-first D&D 5.5e VTT. Accounts, campaigns, permissions, members, resumable setup, characters, scenes (square and gridless), tokens, encounters, combat, dice, chat, journals, assets, archives, realtime recovery, plugins, and the campaign-governed AI agent participate in one persistent permissioned model. The T01–T37 audit backlog is code-complete and committed, and this session independently confirmed representative claims in every area it probed.

The re-audit found **one new authoritative rules defect** (Second Wind consumes the standard Action instead of a Bonus Action — see `DND_RULES_AUDIT.md` R-04), one adjacent likely defect (Tactical Mind), a **red default E2E suite** (`pnpm e2e` — unmaintained through the tranche; sampled failures are predominantly stale test expectations rather than product defects, with one deterministic harness race; T48), and several evidence-hygiene findings including a CI release gate that has been red on main for the last several pushes. None of these invalidate the overall verdict: the product is a locally validated audit candidate whose remaining promotion risk is concentrated in the external/manual evidence gates X01–X08, plus a small new code tranche (T38–T48).

This document does **not** declare a public release.

## Method and status legend

Claims were traced through public UI, typed client/contracts, API validation/authorization, revisions/idempotency, rules resolution, persistence, realtime filtering, archives, and focused regressions — and, for this revision, through fresh runs and a live browser session against the demo campaign.

| Status | Meaning |
| --- | --- |
| Verified live | This session exercised it end-to-end in a running browser session or fresh test run |
| Verified in code | This session traced the implementation and its regression coverage in source |
| Implemented | Claimed by the prior ledger with named code; consistent with everything this session probed, but not individually re-traced |
| Declared boundary | Works for the stated scope; the manual/external/compatibility boundary is intentional and visible |
| External evidence required | Requires real users, providers, hosted infrastructure, devices, or independent review (X01–X08) |

## Repository overview

| Layer | Contents | Measured at `b5e30f1` |
| --- | --- | --- |
| `apps/web` | React client (Vite) | `App.tsx` 11,192 lines; heavy panels lazy-loaded |
| `apps/api` | Fastify REST + WebSocket authoritative server | `app.ts` 25,499 lines; 339 route handlers; `app.test.ts` 40,388 lines |
| `apps/desktop`, `apps/relay`, `apps/worker`, `apps/asset-edge` | Electron host, Cloudflare relay, job worker, asset edge | Present with their own suites |
| `packages/system-sdk` | D&D 5.5e SRD rules/content | `index.ts` 17,982 lines plus 40+ extracted `dnd-*` modules |
| `packages/core`, `api-contracts`, `api-client`, `dice-engine`, `plugin-sdk`, `ai-core`, `codex-app-server-provider`, `tunnel-protocol` | Shared domain, contracts, typed client, dice, plugins, AI | `api-contracts/index.ts` 16,302 lines |
| Content | SRD 5.2.1 compendium | 835 entries served with per-entry CC BY 4.0 attribution (verified live) |

## Capability inventory

### Accounts, campaigns and permissions

| Capability | Status | Notes/evidence |
| --- | --- | --- |
| Registration, password sessions, reset, MFA | Implemented | Independent security review remains X07 |
| OIDC login/link, SCIM provisioning | Declared boundary | Live provider lifecycle is X02 if advertised |
| Campaign create/settings/lifecycle | Verified live | Manage panel sections: Account/Campaign/People/Scenes/Archives |
| Resumable first-session setup (T12) | Verified live | Four-step wizard (Campaign → Scene & map → Invitation → Review) observed; draft scoping/resume covered by `campaign-setup-resume.spec.ts` |
| Member list, role update, removal (T10) | Verified in code | `campaign-member-management-api.test.ts`, `campaign-members-panel.tsx`; removed-user snapshot denial asserted |
| Invitations and rejoin | Verified live | Canonical journey creates an invite (`oti_…` token) and joins a second browser as the player |
| Character/scene-specific permissions | Verified live | Player seat: adversaries hidden ("No adversaries yet"), unowned character vitals redacted to "? / ?", GM controls absent |
| Ownership and character transfer | Implemented | Revisioned accept/decline/cancel with audit |
| Session planning | Implemented | Agenda/linked records/lifecycle per prior ledger |
| Concurrent editing/recovery | Declared boundary | Single-node scope; canonical journey restarts the API mid-session and resumes (verified live) |

### Character, advancement and player sheet

| Capability | Status | Notes/evidence |
| --- | --- | --- |
| Level-one creator | Verified live | Canonical journey builds a legal SRD character through validation gates |
| Core sheet statistics and quick rolls (T05) | Verified live | Sheet payload carries ~40 server-computed quick rolls; every formula this session checked was correct (see rules audit) |
| HP / temp HP / death / stabilization (T04) | Verified live | 0 HP → death-save row 0/3–0/3; natural 20 rolled live → "revived", HP 1, counters reset, undo envelope with expected revisions |
| Heroic Inspiration (T09) | Verified live | Grant → "Ready", overflow-grant recipient picker, "Reroll die 20 (kept)" control; API grant/transfer/reroll with audit at `app.ts:10142`, `:10190` |
| Rest and resources | Verified in code | Hit Dice, class resources, Pact Magic, exhaustion recovery (`index.ts:9994`) |
| Advancement + retry (T35) | Implemented | Canonical journey advances to Level 2 (verified live via spec assertions) |
| Multiclassing (T21) | Verified in code | Central class-level semantics; **per-class hit-dice pools now implemented** (`index.ts:3563`), superseding the earlier single-pool simplification; separate Warlock pact slots |
| Spell/inventory/effects/concentration | Verified live | Concentration state surfaced on sheet; spells carry `action: "bonus"`/`"action"` data; inventory graph/commerce modules in `dnd-inventory-commerce.ts` |
| Armor Class intent (T30) | Verified in code | `dnd-armor-class-intent.ts` migration invoked at boot and on actor mutations (`app.ts:1036` et al.); live sheet shows derived AC breakdown |
| Import/validation/repair | Implemented | `characters/import` route; unknown fields preserved (T17) |

### Rules automation

| Capability | Status | Notes/evidence |
| --- | --- | --- |
| Exact monster initiative/saves/skills (T22) | Verified in code | `dnd-monster-core-rolls.ts` |
| Action economy + Action Surge (T23) | Verified live | Turn ledger observed in a live combat resolution (round/turnIndex/actionsUsed/audit event) — **and this observation exposed R-04 (Second Wind misclassified as an Action); see rules audit** |
| Saving-throw Advantage (T27) | Verified in code | `dnd-save-advantage.test.ts`; roll-mode sources in d20 automation |
| Calculation overrides (T24) | Verified in code | `dnd-calculation-overrides.ts` + world-graph tests |
| Weapon Mastery (T28) | Verified in code | All eight properties with correct SRD semantics and source-page citations (`dnd-weapon-mastery.ts:52`); UI wired at `actor-panel.tsx:880`; Push is reviewed manual geometry |
| Rage (T29) | Verified in code | Lifecycle with eligibility (heavy-armor exclusion), extension triggers, per-roll damage bonus; correctly declares `action: "Bonus Action"` |
| Recorded-roll replay (T36) | Verified live | Live rolls carry `fairness` (algorithm/serverSeed/serverSeedHash); code comment and contract state the no-precommit trusted-host boundary (`fair-dice.ts:18`) |
| Rules support boundary (T20) | Verified live | Combat panel labels "Damage, movement, and map geometry remain manual unless shown in the preview" |
| Lair/regional mechanics | Verified in code | Scheduled environment mechanics with initiative-count/round-start/round-end triggers (`dnd-advanced-mechanics.ts:300`) — surfaced in the combat panel drawer (verified live) |
| Legendary actions | Declared boundary | Present as stat-block prose entries with a trackable effect roll (`dnd-monster-stat-blocks.ts:79` et al.); **no dedicated per-round legendary-action counter economy** — see backlog T42 |

### Scenes, maps and tokens

| Capability | Status | Notes/evidence |
| --- | --- | --- |
| Scene create/edit/duplicate/reorder/archive/activate | Verified in code | Batch duplication remaps scenes/tokens/actors/items/overrides/encounters (`scene-duplication.ts:117`, route `app.ts:3350`) |
| Square/gridless mode (T11) | Verified in code | `gridless-scene-api.test.ts`, `gridless-scenes.spec.ts`, `scene-grid-fields.tsx` |
| Map upload/positioning/calibration | Implemented | Calibration square-only (declared) |
| Tokens: placement/link/move/size/rotation/elevation/bars/hidden | Verified live | Demo board tokens listed with ownership; hidden-from-player behavior observed from the player seat |
| Drawing/measurement/pings/templates | Verified live | Toolbar: Ruler, Measure circle/cone, Ping, Reveal fog, Drawing, Area template, Delete latest, Undo scene edit |
| Fog/walls/doors/light/senses/layers | Implemented | Extensive prior-session verification; not re-walked this session |
| Cover/difficult terrain/pathfinding | Declared boundary | Reviewed/manual by design |

### Encounters and combat

| Capability | Status | Notes/evidence |
| --- | --- | --- |
| Encounter create/search/clone/save/history | Implemented | Exact search opens saved encounters (T34) |
| Monster/ally/PC placement (T26) | Verified in code | Resumable idempotent operation, `encounter-monster-placement.test.ts` |
| Initiative/manual entry/surprise | Verified live | Participant review with per-combatant initiative inputs + Surprised flags; start blocked until initiative entered; server-roll option for linked NPCs |
| Turn/round tracking and conflict recovery (T06) | Verified live | Round 1 → turn controls; two-step "End → Confirm end"; single-retry conflict logic in `combat-conflict.ts` |
| Rewards | Verified live | Split XP / Split GP / Record loot controls at combat end |
| Controlled creatures (T37) | Verified in code | Typed handoff, source-locked stat blocks, reload-scoped draft (`dnd-controlled-creatures.ts`, `controlled-creature-handoff-state.ts`) |

### Dice, chat, journals and information

| Capability | Status | Notes/evidence |
| --- | --- | --- |
| Public/private/GM roll visibility | Verified live | Roll response carries visibility; death-save redaction fields stripped for non-visible sources (`app.ts:19569`) |
| Roll history/formulas/replay | Verified live | Full formula + terms + fairness in every roll payload |
| Chat, whispers, handouts | Verified live | Roll cards auto-post; canonical journey covers handout publication and player receipt |
| Journals: folders/links/backlinks/history/canon-review | Verified in code | Routes at `app.ts:5598–5721` |
| Search/navigation | Implemented | Exact actionable targets (T34) |

### Assets, archives and recovery

| Capability | Status | Notes/evidence |
| --- | --- | --- |
| Asset upload/renditions/references | Implemented | Provider durability deployment-specific |
| Archive validation/import/export + streaming (T33) | Verified in code | `/export`, `/export/stream`, `archive-stream-client.ts` with progress/cancel |
| Campaign import recovery (T25) | Verified in code | `campaign-archive-import-recovery.ts` (539 lines), identity-bound rollback, `archive-import-operations` routes |
| Coordinated backups / retention (T15/T16) | Implemented | Hosted non-no-op proof remains X03 |

### API, plugins and AI

| Capability | Status | Notes/evidence |
| --- | --- | --- |
| Typed REST/OpenAPI/client | Verified in code | 339 handlers; contracts/client/coverage-gate pattern |
| Plugin commands/permissions/review | Implemented | Trusted-admin boundary (declared) |
| Typed managed D&D subroots (T17) | Verified in code | Managed-root set at `app.ts:16876`; unknown fields preserved |
| AI provider/policy/admin controls | Verified in code | Codex App Server provider; `OTTE_AI_*` policy env (scopes, retention, transmission disclosure); admin stale-sweep/retry/evaluation routes (`app.ts:2181–2254`) |
| AI manual review + governed auto execution | Implemented | Both modes preserved; quality/adversarial evidence remains X07/X08 |

### Operational quality

| Capability | Status | Notes/evidence |
| --- | --- | --- |
| Aggregate validation configuration (T07) | Verified live | `apps/api/vitest.config.ts` pins `maxWorkers: 2` with isolated single-fork perf project; fresh forced root runs recorded below |
| Lazy web boundaries (T13) | Verified in code | `deferred-panels.tsx`; dice runtime demand-loaded |
| Safer session transport (T14) | Verified in code | Header/cookie/subprotocol-first credential resolution; URL-token compatibility mode env-gated (`session-transport-auth.ts`) |
| Observability/retention/admin ops (T16/T18) | Verified in code | `operations-observability.ts`, `admin-retention-*` |
| CI | Verified in code | `release-smoke.yml` runs the tokenless `pnpm release:smoke:offline` suite on push/PR and scopes the authenticated open-issue audit to trusted pushes |

## End-to-end workflow findings

### Canonical blank-deployment journey (T08) — verified live

`npx playwright test -c playwright.canonical.config.ts` at the audit cutoff: **1 passed (1.3m)**. The spec (`tests/e2e/canonical-public-journey.spec.ts`, 637 lines) covers: owner bootstrap → four-step campaign setup → invite → player join in a second browser context → legal character creation → public/private rolls with structured consequence review (including focus-management assertions) → resource spend → healing with effect → rest review → concentration → advancement to Level 2 → encounter placement → combat with player action pending GM confirmation → death-save terminal states → **API process restart mid-session with state resume**.

### Live demo-campaign walk (this session)

Driven in a real browser against `pnpm dev` servers:

1. Demo GM login → full workspace (party, adversaries, scene, chat, combat).
2. Strength save roll → `POST /roll` 200; server-rolled `1d20+5 = 19` with fairness seed/hash; chat card posted.
3. Combat: participant review → initiative validation → start → "Round 1, Level 1 Fighter is up" → two-step end confirm.
4. Death saves: HP to 0 → death-save row → natural 20 → revived at 1 HP, counters reset, atomic actor update with undo envelope.
5. Heroic Inspiration: grant → Ready; overflow-grant recipient list; reroll-kept-die control bound to the last roll.
6. Player seat: adversaries hidden, vitals redacted, GM-only controls absent.
7. Compendium: 835 entries; "fireball" search returns 4; per-entry SRD 5.2.1 / CC BY 4.0 attribution.

### Workflow qualities and rough edges observed

- Roll buttons carry exact formulas in accessible labels ("Roll Strength saving throw 1d20+5").
- Selecting an actor fires three `commitMode:"preview"` roll POSTs (by design, for previews) — harmless but chatty.
- The in-app browser could not capture screenshots of the canvas-heavy board page (30s timeouts) while DOM/JS stayed responsive; text-level verification was used instead. Not reproduced under Playwright (which passed and screenshots fine); treated as an environment artifact unless it recurs (see backlog T45).
- Demo campaign chat retains months of QA debris ("Visual QA", "hello from command line") — cosmetic, but the first thing a new evaluator sees (backlog T44).

## Verification incidents (process findings)

1. **Release gate broke mid-audit.** `63d5950` (22:15) changed `security:audit` to `node scripts/audit-production-dependencies.mjs` without updating the guard pin in `deployment-smoke.test.ts:30`. This audit's first fresh forced root run therefore failed exactly there (706/708 API tests passing). This audit applied the one-line repair; `b5e30f1` (22:31) committed the identical fix plus two cold-start timeout bumps. Lesson recorded as risk AR-32: guard-pinned strings make gate drift loud (good) but the gate must be run before push (CI does run it on push — the break would have been caught there).
2. **Prior ledger's frozen evidence is not reproducible from the repo.** The claimed snapshot `20260716T030254960Z` and its consecutive-run records are not persisted as machine-readable artifacts in the tree. This audit replaced them with its own fresh runs (below). Backlog T40 proposes persisting release-gate evidence artifacts.
3. **GitHub Release Smoke has been red on main across the recent pushes** (checked live via `gh run list`/`gh run view`): `e4c6ac9` and `f64c6f2` failed in ~50s (early `security:audit` step — the old `pnpm audit` invocation, which `63d5950` then replaced), `63d5950` failed at 8m50s (the guard-pin break), and `b5e30f1` **completed failure at 29m in the `pnpm e2e` step: 18 failed / 39 passed (19.9m)** — the same failure classes this audit sampled locally, including the death-save harness race (`expect(received).toBeTruthy()`), plus additional CI-only timeout failures on the slower runner. Local `pnpm check` green and CI red coexisted for at least a day. T48 (suite repair) + the already-landed audit fix are what stand between main and a green release gate; T40/T41 formalize the loop.
4. **The default Playwright suite (`pnpm e2e`) is red at HEAD.** A fresh run failed ≥6 `auth-tabletop.spec.ts` tests. Sampled failure artifacts show **stale test expectations, not product defects**: the scene-comparison test pins pre-f64c6f2 UI copy while the shipped "Prep drift review" comparison renders correctly, and the combat-tracker test expects death-save counters to persist at 3/3 where T04's intended semantics reset them on stabilization (one residual sync question noted in T48). The suite went unmaintained through the tranche because `pnpm check` runs no Playwright, CI failed earlier at `security:audit`, and only the canonical spec was executed in isolation. Backlog **T48** repairs the suite; the CI gate cannot go green without it.

## Validation record (this session, fresh)

| Run | Command | Result |
| --- | --- | --- |
| 1 | `TURBO_FORCE=true pnpm check` at `63d5950` content | **FAILED as expected from the gate break**: API `deployment-smoke` 1 failure; 706 passed + 1 skipped of 708 API tests (114 files); all other 24 test tasks green; turbo test phase 4m51s |
| 2 | `pnpm --filter @open-tabletop/api exec vitest run src/deployment-smoke.test.ts` after repair | 2/2 passed |
| 3 | `npx playwright test -c playwright.canonical.config.ts` | **1 passed (1.3m)** — blank-deployment GM+player journey incl. API restart/resume |
| 4 | `TURBO_FORCE=true pnpm check` at `b5e30f1` content | **PASSED (exit 0)** — lint 25/25 (51.9s), typecheck 25/25 (54.1s), E2E typecheck, tests 25/25 (305 test files, **1,842 passed, 1 skipped**, 5m18s), build 15/15 (39.5s) |
| 5 | Live browser workflow walk (demo campaign) | Completed as described above |
| 6 | `pnpm e2e` (default config; bootstrap config never ran because the default suite exited 1) | **RED — 16 failed / 41 passed (17.7m)**. Caveat recorded for honesty: this audit accidentally contaminated the run's later specs — believing the background run dead, the auditor killed its port-4100/5174 servers at ~23:00 and ran a targeted spec in parallel; the canonical spec fails inside this run (at the bootstrap form) yet passed standalone, and some late-file failures (browser-evidence, campaign-setup-resume) are partially attributable to that interference. The first ~37 tests predate the interference: 8 genuine failures in `auth-tabletop.spec.ts` (tests 11, 12, 20, 22, 23, 24, 33, 37). Failure classes sampled from artifacts: stale pinned copy (pre-f64c6f2 scene-comparison text), old-semantics expectations (death-save counters pre-T04), and one deterministic harness race in a f64c6f2-added spec (re-verified alone on a quiet machine: still fails; diagnosis in backlog T48). **The clean-runner verdict is run 8 (CI): 18 failed / 39 passed** |
| 7 | `npx playwright test tests/e2e/auth-tabletop.spec.ts --grep "character at 0 HP"` (quiet machine) | 1 failed — deterministic reproduction of the run-6 class-c failure at `auth-tabletop.spec.ts:3976` (`resolution.deathSave` undefined on the awaited response); analysis in T48 |
| 8 | GitHub Release Smoke on `b5e30f1` (`gh run view 29469185455`, completed during this audit) | **Failure at the `pnpm e2e` step: 18 failed / 39 passed (19.9m)** — the authoritative full default-suite verdict; matches the locally sampled failure classes |

Line-count and artifact measurements this session: `App.tsx` 11,192; `system-sdk/index.ts` 17,982; `app.ts` 25,499; `app.test.ts` 40,388; `api-contracts/index.ts` 16,302 (all matching the prior ledger's claims).

## Intentional boundaries and non-claims

- SQLite single-writer, process-local realtime; small-group topology. HA/multi-replica not claimed.
- Cover, difficult-terrain routing, line of effect, Push displacement, and arbitrary prose remain reviewed/manual.
- Legendary actions are tracked as reviewed stat-block effects, not an automated per-round economy (candidate T42).
- Plugins are trusted-admin extensions, not hostile-code isolation.
- Proprietary non-SRD content is not distributable without independent rights; shipped content is SRD 5.2.1 under CC BY 4.0 with embedded attribution.
- Automated accessibility coverage is not a physical AT/device matrix (X04).
- AI can execute automatically only within campaign/deployment policy and typed permissioned transactions.

## External/manual gates (unchanged)

| ID | Gate |
| --- | --- |
| X01 | Repeated real GM/player sessions with observed correction/conflict/recovery outcomes |
| X02 | Live selected-provider OIDC/SCIM lifecycle, if advertised |
| X03 | Hosted non-no-op state-plus-asset backup/restore/migration/rollback |
| X04 | Physical assistive-technology/browser/device matrix |
| X05 | Hosted HTTPS/capacity/proxy/realtime/alerts/incident drill |
| X06 | Content inventory, attribution and legal approval |
| X07 | Independent security review, including plugin and adversarial AI cases |
| X08 | Representative AI quality/provider-handling evaluation, if AI is offered |

With the aggregate gate re-proven green at `b5e30f1`, the correct description remains: **locally validated audit candidate; not production-proven.** The next work is X01–X08 plus the small T38+ tranche in `IMPLEMENTATION_BACKLOG.md`.
