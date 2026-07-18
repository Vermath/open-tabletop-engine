# Full-feature Browser simulation results - 2026-07-18

## Result

The local product supported a persistent four-character D&D 5.5e campaign from fresh account and campaign creation through three linked play sessions, six scenes, multiple encounters, chat, dice, tactical tools, combat, rewards, and advancement from level 1 to level 3. Codex drove the GM and all four player seats sequentially through the in-app Browser against the live Vite/API stack.

Twenty-two repository-controlled defects were found and repaired. The affected Browser paths were rerun after rebuilding the API, and focused regressions were added for every fix. This document deliberately separates direct Browser evidence, automated contract evidence, unavailable external services, native Browser-plugin limitations, and human-only evidence.

Campaign: **The Obsidian Relay: Full-Feature Trial**

GM: Quinn Meridian

Evidence class: `simulated_browser_multi_seat`

Roles controlled by: Codex

Independent-human acceptance evidence: not claimed

Session 3 and its final boss encounter were closed successfully, a GM-only report was generated, and the completed three-session campaign was preserved for the final hard-reload check. Exact-commit release evidence is recorded in the manifest after the release gates complete.

## Campaign continuity

| Character | Build after advancement | Creation path | Continuity exercised |
|---|---|---|---|
| Kestrel Forge | Fighter 3 / Champion | Guided creator | Actions, weapon play, reviewed advancement, subclass selection |
| Luma Vey | Cleric 3 / Life Domain | Guided creator | Healing, spells, conditions, rests, advancement |
| Orin Glass | Wizard 3 / Evoker | JSON import plus repair | Import preview, preserved spell data, spellbook, slots, Magic Missile and Scorching Ray |
| Pip Thistledown | Rogue 3 / Thief | Guided creator | Player-owned action flow, Advantage/precision play, advancement |

The same four actor records were carried between sessions. The imported Wizard defect discovered after Session 1 was fixed, reimported, and then advanced without replacing Orin's identity. The legacy duplicate actor was removed through the new permission-checked actor lifecycle UI.

## Three-session actual-play record

| Session | Maps and encounter play | Table actions exercised | Rewards and advancement |
|---|---|---|---|
| 1 - Relay Dock | Relay Dock (square) and Smuggler Drain (gridless); seven-participant opening combat | Public, GM, OOC, and emote chat; player and GM rolls; role/privacy checks; player action review; typed damage | 1,200 XP, 40 gp, and recorded loot split across the party; characters advanced from level 1 to level 2 |
| 2 - Road to the Ossuary | Old Bell Road and Ashen Ossuary; advanced combat encounter | Fog and annotations, tactical measurement/templates, conditions, turn flow, recovery, encounter/session linkage | 2,400 XP, 80 gp, and recorded loot; characters reached level 3 and selected subclasses/spells |
| 3 - The Bellfoundry | Furnace Bridge (gridless) and Bellfoundry Sanctum (square); Bellfoundry Warden encounter followed by a Chimera/Flying Sword boss encounter | Saved encounter reuse, eight-participant combat, Magic Missile multi-target helper, lair action, exact typed damage, defeat, undo, and reapply | Bridge ledger: 1,300 XP, 60 gp, Obsidian Key, and Warden Sigil. Boss ledger: 2,400 XP, 120 gp, Obsidian Bell Shard, Chimera Scale, and Sanctum Seal. Session completed and GM report generated |

Session 3's spell helper distributed four level-2 Magic Missile darts across three selected targets. The public **Obsidian Bell Resonance** lair action was created and triggered. In the Sanctum, the Chimera's exact 114-point typed damage was reviewed before commit, its defeat was undone to restore 114/114 HP, and the same reviewed damage was reapplied. Attempts to mark positive-HP Flying Swords defeated were correctly rejected by the authoritative guard.

## Coverage disposition

Rows below map back to the plan in `full-feature-browser-simulation-2026-07-18.md`. Rows that share the same disposition are grouped; no grouped result should be interpreted as independent-human evidence.

| Plan rows | Result | Evidence or boundary |
|---|---|---|
| O-01, O-02, O-04 through O-09 | Pass | Health/fingerprint/realtime, readiness, retention preview, paired backup/restore drill, jobs, alerts, asset diagnostics, operational summaries, and redacted audit surfaces were inspected before campaign play. |
| O-03 | Expected blocked | Local OIDC and SCIM readiness accurately reported that no external provider was configured. No external tenant was invented. |
| A-01, A-02, A-04 through A-07 | Pass | Fresh registration/login failure and recovery, password/MFA/preferences, organization isolation, and navigation controls were exercised across the GM and player identities. |
| A-03 | Expected blocked | Password-reset request behavior was reachable; delivery remained unavailable because no external mail service was configured. |
| C-01 through C-07 | Pass | Campaign wizard, settings/rules, duplicate/archive/reactivate, and guarded disposable deletion were covered while retaining the primary campaign. |
| C-08 | Fixed | Webhook validation/failure behavior was reachable. FF-011 repaired deletion so the concurrency revision is sent where the API contract requires it. External delivery remained a configured-service boundary. |
| P-01 through P-08, P-10 | Pass | Owner, GM, assistant GM, observer, and player membership; role changes; scene delegation; private actor sharing/revoke; transfer decline; reinvite; and concealed content were exercised. |
| P-09 | Automated-only safety boundary | Ownership transfer of the retained campaign was not committed because it would change the release owner's authority. Exact permission/revision behavior remains covered by campaign ownership tests. |
| K-01 through K-03, K-05 through K-08, K-10 through K-15 | Pass | Creator, legal builds, sheets, inventory/resources, actions, inspiration, defeat/recovery, effects, rests, advancement, controlled actors, and managed-root restrictions were exercised directly or through their permission-checked review surfaces. |
| K-04, K-09 | Fixed | Character import lost Wizard data (FF-005), and typed-damage review rendered structured data as `[object Object]` (FF-004). Both were repaired and rerun in the live campaign. |
| S-01, S-02, S-04 through S-16 | Pass | Worlds, six square/gridless scenes, activation/history, scene lifecycle, party placement, token movement/ownership, map controls, annotations/templates, fog, lighting/walls, terrain/cover, and asset-library lifecycle were exercised. |
| S-03 | Native Browser-plugin boundary | Scene/background selection and existing-asset behavior were covered. The in-app Browser automation API exposed no file-input upload primitive, so a native map file-picker selection is not claimed. |
| D-01 through D-10 | Pass | Compendium/entity prep, saved encounters, exact token/session linkage, three session lifecycles, reports, journals, handouts, memory/canon, and search/navigation were exercised. FF-010 and FF-019 repaired discoverability and search-state defects. |
| D-11 | Fixed | Content-import preflight and rollback safety were repaired by FF-013 with atomic conflict regressions; Markdown handout preview, selective apply, and exact rollback were then completed in Browser. |
| L-01 through L-04, L-06 through L-14 | Pass | Realtime presence/reconnect, chat, dice, action review, initiative/round flow, typed/multi-target effects, action economy, spells, lair actions, combat vitals, undo, and reward ledgers were covered over the three sessions. |
| L-05 | Pass with human-device boundary | Synced URL-track state and audio asset authorization are product-verifiable; whether speakers produced audible output requires a human/device check. Native uploaded-audio selection has the same Browser file-picker boundary as S-03. |
| X-01, X-03, X-06, X-07 | Pass or fixed | AI policy/unavailable state, plugin trust denial, undo/rollback, API rebuild, reconnect, and hard reload were exercised. |
| X-02 | Expected blocked | Provider-backed AI/PDF/image actions were correctly unavailable because no provider was configured; local policy and permission states were tested instead. |
| X-04, X-05 | Pass or fixed | Archive scope, estimate, dry-run/import recovery, and rollback surfaces were inspected; FF-015 through FF-017 repaired recovery, authority, and estimate defects. Native download/save completion is not claimed. |
| X-08, X-09 | Pass with human boundary | Responsive and keyboard/focus/reduced-motion product states were inspected. Screen-reader output, subjective usability, and physical assistive-technology operation remain human evidence. |
| X-10 | Not product surface | Release qualification and publication are tracked as repository closeout gates below, not as Browser feature coverage. |

## Repository-controlled findings and repairs

| ID | Observation | Repair and regression evidence | Browser evidence |
|---|---|---|---|
| FF-001 | **Seeded Demo** offered a login path that could not exist in a public-registration stack. | Added explicit seeded-demo availability/disabled guidance in `blank-canvas-demo.ts` and `App.tsx`; covered by `seeded-demo-access.test.ts`. | `03-before-seeded-demo-login-failure.png`; fresh-account recovery in `04-fresh-account-no-campaign.png` |
| FF-002 | Compose did not expose the registration setting needed by the documented quickstart. | Wired the registration environment setting through `docker-compose.yml` and `.env.example`, updated self-hosting guidance, and extended deployment smoke coverage. | Fresh account creation succeeded after rebuild. |
| FF-003 | A decorative board element was exposed as an orphan interactive/accessibility target. | Corrected styling/semantics and locked the actor-panel layout behavior with regression coverage. | Map and actor controls remained usable across the session screenshots. |
| FF-004 | Exact typed-damage review printed a structured diff as `[object Object]`. | Added deliberate structured-diff rendering in `typed-damage-card.tsx`; covered by `typed-damage-card.test.tsx`. | Before: `15-before-typed-damage-object-rendering.png`; Session 3 exact-damage review/undo/reapply rerun. |
| FF-005 | Character JSON import silently dropped Wizard HP, AC, spells, and spellbook data. | Normalized supported import shapes in the system SDK, preserved compatible data, and added SDK/API import regressions. | Before: `17-before-imported-character-data-loss.png`; after: `21-after-repaired-wizard-import.png`, `22-orin-level-three-review.png` |
| FF-006 | Advanced combat spell/helper controls had ambiguous accessible names. | Added source-specific labels and coverage in `advanced-combat-mechanics.test.tsx`. | `25-after-spell-helper-labels-and-state.png`, `26-session-three-lair-action-and-spell-helper.png` |
| FF-007 | Advanced-combat disclosures collapsed after each state refresh. | Preserved disclosure state across refreshes and added component regression coverage. | Spell helper and lair-action panels remained open through Session 3 interaction. |
| FF-008 | Vite could remain connected to an API built from stale source, freezing Browser verification behind a fingerprint mismatch. | Added exact source-fingerprint/watch behavior and `vite-config.test.ts`; the truthful mismatch error remains fail-closed. | API rebuild automatically recovered the Browser; the campaign and active scene survived reconnect. |
| FF-009 | The web app had no safe actor-delete lifecycle path, leaving a duplicate imported actor stranded. | Added the revisioned, permission-checked actor lifecycle client/UI with `actor-lifecycle-client.test.ts` and `actor-lifecycle-ui.test.ts`. | The legacy duplicate was deleted; `10-four-character-roster.png` shows the intended party. |
| FF-010 | Saved encounters were hard to discover from the Session desk and schedule/link state could be missed. | Opened saved encounters by default, exposed counts, and added session/encounter round-trip regressions. | Saved encounters were reused in Session 3 (`24-session-three-combat-setup.png`). |
| FF-011 | Webhook delete sent `expectedUpdatedAt` in the wrong transport location. | Aligned the client with the DELETE query contract and added `campaign-webhooks-panel.test.tsx`. | Created an HTTPS subscription, queued a test, observed the metadata-only HTTP 405 ledger, and deleted it successfully (`36-webhook-delivery-ledger.png`). |
| FF-012 | Audio playback could 404 private assets and restart whenever a newly minted signed URL changed. | Applied readable-asset authorization and stable asset identity in audio sync; covered by API visibility and `audio-sync.test.ts`. | URL-track state is locally verifiable; audible output remains human-only. |
| FF-013 | Content-import rollback could partially act after source modification or reference conflicts. | Added source fingerprints and atomic preflight rejection for modified/reference-conflicted imports; covered by content-import panel/data regressions. | Markdown preview/apply/rollback succeeded (`34-content-import-applied.png`, `35-content-import-rolled-back.png`). |
| FF-014 | PDF AI import was enabled under campaign update authority even when `ai.proposeChanges` was absent. | Required both permissions and exposed a truthful disabled reason instead of allowing a doomed action. | The content-import and AI surfaces displayed their truthful unavailable/permission state. |
| FF-015 | Rolling back an archive import that created the only campaign could leave stale selected-campaign state. | Recovery now clears or selects a valid fallback campaign; covered by archive import recovery tests. | Archive recovery surface inspected; no retained campaign was sacrificed. |
| FF-016 | Archive UI could infer authority from organization role instead of exact `campaign.update`. | Bound archive mutation controls to the exact campaign permission; covered by `archive-ui-authority.test.ts`. | Role matrix exercised with owner/assistant/player/observer seats. |
| FF-017 | Archive export estimate used full-campaign totals even for selected collections. | Added conservative, scope-aware **At least N records** estimation with `archive-export-estimate.test.ts`. | Selected collections changed the estimate to a conservative minimum (`33-archive-scoped-export-estimate.png`). |
| FF-018 | AI Studio was unreachable from workspace navigation and could imply readiness when its provider was unavailable. | Added permission-gated navigation plus non-secret provider readiness and truthful disabled states for every provider-backed Studio and floating-Agent control; covered by `ai-panel.test.ts` and layout regressions. | Before/unavailable path: `32-ai-studio-readiness-guard.png`; corrected gating: `37-after-ai-studio-readiness-gating.png`. |
| FF-019 | Global search retained stale world scope and lacked safe pagination/race handling. | Sanitized invalid scope and added request-safe load-more behavior with campaign search regressions. | Campaign-wide and world/type-scoped searches were rerun (`31-campaign-search-results.png`). |
| FF-020 | The floating AI Agent still reported **Agent ready** and accepted a prompt while the same campaign/provider policy blocked execution. | Shared the effective AI readiness contract between Studio and Agent; unavailable state now explains the cause and disables prompt, send, and image-reference controls without changing configured/local-demo execution or proposal review behavior. | The pre-fix inconsistency was recorded during the readiness inspection; the corrected Agent state is captured in `39-after-ai-agent-readiness-gating.png`. |
| FF-021 | The soundboard master-volume range visually changed but a later realtime render restored the stale controlled value because the range interaction emitted `input` rather than the wired `change` path. | Committed range input through `onInput` and `event.currentTarget.value`; added audio regression coverage while keeping master volume client-local and shared track state revision-guarded. | Before path in `30-soundboard-live-controls.png`; 0.4 remained stable through rerender in `40-after-soundboard-volume-persistence.png`. |
| FF-022 | Clean Windows release worktrees exposed CRLF-sensitive source assertions even though the ordinary dirty-worktree gate was green. | Added repository-wide LF checkout policy with explicit CRLF exceptions for `.bat`/`.cmd`, and normalized the remaining modal source fixtures before multiline assertions. | The focused modal-accessibility regression passed; exact-commit qualification remains a release closeout gate below. |
| FF-023 | The floating AI Agent opened while readiness was loading, so its disabled prompt missed the one-time focus attempt and never received keyboard focus after becoming available. | Added a guarded one-shot focus handoff when readiness first enables the composer, without stealing focus on later busy transitions; covered by AI panel regression assertions and the keyboard E2E journey. | Release-qualification accessibility journey; no additional Browser tab was opened after finalization. |
| FF-024 | The final action dialog replaced the stable **Structured consequence review** marker with only the step label, weakening review clarity and breaking independent action journeys. | Restored the structured-review marker while preserving **Final confirmation - step 2 of 2**, and hardened response waiting so pre-commit assertion failures cannot leave a dangling request listener. | Release-qualification action, player-confirmation, invite, and SDK journeys. |
| FF-025 | A successful plugin install immediately replaced its specific success message with a generic refresh **Synced** status. | Reconciled plugin state without publishing a generic refresh status, preserving the committed install result; covered by async-guard regression assertions and the SDK E2E journey. | Release-qualification SDK workflow. |
| FF-026 | A successful content-import rollback could have its final success status overwritten by the following workspace refresh. | Reconciled first with status synchronization disabled, then published the rollback result; the E2E journey now also proves modified imported content is blocked, resolves the conflict, retries, and rolls back exactly. | Release-qualification content-import conflict and retry journey. |
| FF-027 | The atomic scene-duplication E2E could spend its full timeout waiting for post-login UI after a transient first-click **Failed to fetch**, without ever exercising duplication. | Added a bounded retry around only the Demo GM workspace-readiness precondition; the forced commit failure and zero-partial-copy assertions remain unchanged. | Fresh-server focused journey passed 5/5, and a temporary first-login connection abort reproduced the exact failure mode and recovered successfully. |

## Screenshot evidence index

All captures are in `artifacts/full-feature-browser-2026-07-18/`. This index contains the ordered product evidence present when this report was drafted; the debug-only damage-editor capture is intentionally excluded.

| Captures | What they establish |
|---|---|
| `01-server-admin-readiness.png`, `02-operator-backup-drill.png` | Operational readiness and non-destructive backup/restore drill |
| `03-before-seeded-demo-login-failure.png`, `04-fresh-account-no-campaign.png` | Seeded-demo defect and successful fresh-account recovery |
| `05-campaign-wizard-draft.png`, `06-campaign-wizard-review.png`, `07-campaign-created-relay-dock.png`, `08-campaign-rules-profile.png` | Wizard persistence/review, campaign creation, first scene, and rules profile |
| `09-kestrel-creator-review.png`, `10-four-character-roster.png` | Legal creator review and persistent four-character roster |
| `11-six-scene-campaign.png`, `12-three-session-plan.png` | Six-scene world and linked three-session plan |
| `13-session-one-chat-and-rolls.png`, `14-session-one-active-combat.png`, `16-pip-player-action.png` | Session 1 chat/dice, encounter, and a real player action |
| `15-before-typed-damage-object-rendering.png`, `17-before-imported-character-data-loss.png` | Before evidence for FF-004 and FF-005 |
| `19-session-two-advanced-combat.png`, `20-kestrel-level-three-review.png` | Session 2 tactical/combat state and persistent level-3 advancement |
| `21-after-repaired-wizard-import.png`, `22-orin-level-three-review.png` | Repaired Wizard import and level-3 spell progression |
| `23-session-three-furnace-bridge.png`, `24-session-three-combat-setup.png` | Session 3 gridless map and eight-participant encounter setup |
| `25-after-spell-helper-labels-and-state.png`, `26-session-three-lair-action-and-spell-helper.png` | FF-006/FF-007 rerun, multi-target helper, and lair action |
| `27-sanctum-boss-combat-setup.png` | Final square-map boss encounter and persisted party continuity |
| `28-session-three-boss-defeated.png`, `29-session-three-completed.png` | Three defeated boss enemies, reward closeout, and completed Session 3 |
| `30-soundboard-live-controls.png`, `31-campaign-search-results.png` | Playing/muted URL ambience and cross-record campaign search |
| `32-ai-studio-readiness-guard.png`, `37-after-ai-studio-readiness-gating.png` | Provider-policy failure before the final FF-018 extension and truthful disabled controls afterward |
| `33-archive-scoped-export-estimate.png` | Selected-collection archive scope and conservative estimate |
| `34-content-import-applied.png`, `35-content-import-rolled-back.png` | Markdown handout import provenance, apply, and exact rollback |
| `36-webhook-delivery-ledger.png` | Signed webhook subscription and metadata-only failed delivery ledger before successful deletion |
| `38-three-completed-sessions.png` | All three sessions completed with final GM-only report creation |
| `39-after-ai-agent-readiness-gating.png` | Floating Agent accurately unavailable with provider-backed inputs disabled |
| `40-after-soundboard-volume-persistence.png` | Playing ambience with master volume retained at 0.4 through rerender |
| `41-final-hard-reload-continuity.png` | Final hard reload retained the campaign, four level-3 heroes, six scenes, active Sanctum, and defeated boss tokens |

## Evidence boundaries

- This is one automation-led operator controlling five identities sequentially. It is not independent-human, simultaneous-client, mixed-device, or mixed-network evidence.
- The Browser plugin did not expose native file selection. Native map upload and managed-audio upload are therefore harness boundaries, not product passes. Existing asset selection, URL-track state, authorization, and lifecycle were still tested.
- Audible speaker output, physical keyboard behavior, screen readers, and subjective usability require a human/device pass.
- OIDC, SCIM, email delivery, third-party webhooks, remote registries, CDN/scanner services, and provider-backed AI/PDF/image generation were not configured. Their truthful local unavailable/validation states were tested; external success was not simulated.
- Ownership transfer was not committed on the retained release campaign. Its exact permissions/revision behavior is automated-contract evidence only.
- Native archive downloads and OS save-dialog completion are not claimed. Archive scope, estimates, validation, recovery, and rollback logic were covered in-product and by regressions.
- No password, MFA secret, invitation token, session credential, webhook secret, private journal body, whisper body, or dice seed is included in the evidence packet.

## Verification ledger

| Gate | Result |
|---|---|
| Focused regressions for FF-001 through FF-027 | Passed during remediation |
| Web typecheck and full web suite | Passed: 150 files and 761 tests after FF-021 |
| Full `pnpm check` | Passed: lint, monorepo typecheck, E2E typecheck, 2,263 tests passed with 1 skipped, and all builds |
| Rebuilt API plus Browser rerun | Passed for campaign reconnect, character import, actor lifecycle, typed damage, encounter discovery, advanced combat, rewards, session closeout, search, soundboard state, archive scope, content rollback, webhooks, and AI readiness |
| Full Playwright E2E | Passed after release-qualification remediation: 62 browser journeys plus the clean-bootstrap journey |
| Clean exact-commit `release:smoke:offline` | Pending final commit |
| Fast-forward push to `main` | Pending final commit |
| Exact-SHA Release Smoke and Docs Site | Pending push |

The machine-readable authority for final screenshot names, finding disposition, exact commit, and gate results is `artifacts/full-feature-browser-2026-07-18/manifest.json`.
