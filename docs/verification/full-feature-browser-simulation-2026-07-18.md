# Full-feature Browser simulation — 2026-07-18

## Objective

Manually exercise every locally reachable product feature from account setup and campaign creation through four-character play, recovery, and operator review. The run uses the in-app Browser against the current local API/Vite stack, preserves screenshot evidence, records every discrepancy, fixes repository-controlled findings, reruns affected paths, and qualifies the exact commit before a direct fast-forward push to `main`.

The manual scope is every user-visible surface in the local build. API-only security invariants remain covered by the repository test suite. External OIDC, SCIM, email delivery, remote registries, third-party webhooks, CDN/scanner services, provider-backed AI/PDF/image generation, audible device output, assistive technology, and genuinely independent concurrent clients are tested through their local unavailable/validation states and are called out separately rather than simulated dishonestly.

## Test cast and continuity

- Server-admin baseline: the existing synthetic local administrator, used only for safe operator checks before the fresh campaign.
- Fresh GM: Quinn Meridian.
- Players: Ari Flint, Bela Thorn, Cyra Moss, and Dax Wren.
- Persistent characters:
  - Kestrel Forge — Fighter; weapon mastery, critical damage, action economy.
  - Luma Vey — Cleric; healing, concentration, conditions, recovery.
  - Orin Glass — Wizard; attack/save spells, templates, area effects.
  - Pip Thistledown — Rogue; stealth, Advantage, reactions, precision damage.
- Campaign: **The Obsidian Relay: Full-Feature Trial**.
- Play arc: three linked sessions using square and gridless scenes, recurring actors, saved encounters, rewards, rests, and advancement.

No passwords, invitation tokens, session credentials, private journal text, whisper bodies, or dice seeds are written to the evidence packet.

## Environment and evidence protocol

- Local UI: `http://127.0.0.1:5173/` through Vite.
- Local API: `http://127.0.0.1:4000/` through the preserved Compose stack.
- Primary viewport: desktop. Responsive checkpoints: tablet, phone, short phone, and short landscape when the Browser surface permits resizing.
- Evidence directory: `artifacts/full-feature-browser-2026-07-18/`.
- Screenshots use ordered semantic names. A defect receives `before` and `after` captures where visual evidence is useful.
- Each phase ends with a hard reload and authoritative-state comparison. Privacy checks are repeated from a player or observer seat.
- Destructive features operate only on disposable records or use dry-run/restore-drill paths.

## Coverage matrix

Every row below has a terminal disposition. Detailed run context, grouped coverage, defect IDs, and screenshot filenames live in the [results report](full-feature-browser-simulation-results-2026-07-18.md); the machine-readable closeout authority is the evidence manifest. `Pass after fix` means the affected Browser path was rerun after remediation. External-provider, native file-picker/download, human-device, and safety boundaries are stated explicitly and are never counted as successful integrations.

### O — operator and deployment baseline

| ID | Manual feature coverage | Expected evidence | Status |
|---|---|---|---|
| O-01 | Health, semantic compatibility, exact source fingerprint, realtime connection | Direct and proxied health agree; UI connected | Pass after fix — FF-008; readiness capture `01`, reconnect and final reload evidence in the [results report](full-feature-browser-simulation-results-2026-07-18.md). |
| O-02 | Production-readiness refresh and remediation cards | Readiness categories render without secret data | Pass — readiness/remediation capture `01`; no secrets recorded. |
| O-03 | OIDC and SCIM connection checks | Clear configured/unconfigured result | Expected external boundary — truthful unconfigured states passed locally; no OIDC/SCIM tenant success is claimed. |
| O-04 | Measured-retention preview | Exact bounded impact; no deletion | Pass — bounded preview inspected; no retention deletion executed. |
| O-05 | SQLite backup and restore drill | Paired backup and non-destructive drill succeed | Pass — paired non-destructive drill in capture `02`. |
| O-06 | Job queue, ledger, and alert dry-run | Job lifecycle and redacted alert result | Pass — local lifecycle/dry-run and redaction state recorded in the results report. |
| O-07 | Asset storage/integrity/rendering diagnostics | Safe diagnostics; no destructive cleanup | Pass — safe diagnostic surfaces inspected; destructive cleanup was outside the drill. |
| O-08 | Rules, AI, plugin, and audit operational summaries | Accurate configured/unavailable states | Pass — configured and unavailable summaries matched the local stack; provider success is not claimed. |
| O-09 | Redacted audit filtering/export and report bundle | Download/summary contains no secrets | Pass — redacted filter/summary inspected; native OS save completion is a boundary, not evidence. |

### A — authentication, account, preferences, and workspaces

| ID | Manual feature coverage | Expected evidence | Status |
|---|---|---|---|
| A-01 | Registration validation, account creation, logout, failed login, successful relogin | Errors recover; session persists only after success | Pass after fix — FF-001/FF-002; captures `03` and `04` plus fresh-account continuity in the results report. |
| A-02 | Password change and relogin | Old password rejected; new password accepted | Pass — old/new credential behavior and relogin were exercised without recording credentials. |
| A-03 | Password-reset request and local unavailable-delivery state | Non-enumerating, actionable response | Expected external boundary — non-enumerating local request state passed; outbound email delivery was not configured. |
| A-04 | MFA enroll, invalid code, valid code, recovery/disable if locally supported | Second factor enforced without lockout | Pass — enroll/error/recovery-state flow exercised; no MFA secret is retained in evidence. |
| A-05 | Display name, Midnight/Ember theme, 3D dice, reduced motion, chat notifications | Preferences persist across reload/login | Pass — persisted preference and reload behavior recorded in the results report. |
| A-06 | Create/switch organization workspace and isolation | Campaigns and permissions stay workspace-scoped | Pass — workspace switching and campaign isolation exercised across seats. |
| A-07 | Command palette and keyboard navigation | Search, execute, Escape, and focus restoration work | Pass with human-device boundary — Browser keyboard/focus behavior passed; physical assistive-device use is not claimed. |

### C — campaign lifecycle and first-session setup

| ID | Manual feature coverage | Expected evidence | Status |
|---|---|---|---|
| C-01 | Create D&D campaign with name, description, visibility, and permission template | Fresh campaign selected and revisioned | Pass — captures `05`–`08` establish the fresh campaign and selected revisioned state. |
| C-02 | First-session wizard open, partial progress, dismiss/reload, resume, completion | Draft resumes in exact campaign | Pass — draft/review/resume evidence in captures `05` and `06`. |
| C-03 | Edit campaign settings and visibility | Saved values survive reload | Pass — campaign settings persisted through later sessions and reload. |
| C-04 | Rules profile/version, automated toggle, table rulings, custom rule add/remove | Automation and rulings remain clearly distinguished | Pass — rules-profile evidence in capture `08` and the results report. |
| C-05 | Campaign duplication with portable assets/content | Isolated copy with independent IDs | Pass — disposable duplicate and independent identity verified; primary campaign retained. |
| C-06 | Archive/reactivate campaign | Correct selector/state and preserved content | Pass after fix — archive/reactivation surface plus FF-015/FF-016 recovery and authority regressions. |
| C-07 | Typed delete confirmation on disposable duplicate | Exact-name guard and audited removal | Pass — exact-name guard exercised only on the disposable duplicate. |
| C-08 | Outbound webhook validation, create/test/rotate/disable where local policy permits | Safe local validation or explicit policy block | Pass after fix / expected external boundary — FF-011 repaired delete concurrency; local validation passed, but third-party delivery success is not claimed. |

### P — people, roles, privacy, and ownership

| ID | Manual feature coverage | Expected evidence | Status |
|---|---|---|---|
| P-01 | Invite player, observer, assistant GM, and GM roles | Roster and invite status/count agree | Pass — owner/GM/assistant/observer/player roster and counts exercised; results report has the role matrix. |
| P-02 | Accept invitations with four distinct accounts | Each member sees only authorized campaign state | Pass — four player identities joined and retained their authorized views across three sessions. |
| P-03 | Search invite/member rosters; revoke pending invite | Status and count update without stale rows | Pass — invite/member search and disposable revoke state exercised. |
| P-04 | Change member role across player/observer/assistant GM/GM | Surfaces and effective permissions update immediately | Pass — role changes and resulting surface permissions were checked sequentially. |
| P-05 | Scene-specific view/edit delegation | Only delegated scene powers change | Pass — scene delegation grant/revoke changed only scoped powers. |
| P-06 | Private-sheet sharing and revoke | Recipient gains/loses read-only private view | Pass — private actor sharing and revocation were verified from recipient views. |
| P-07 | Character transfer review, reject, accept, and transfer back | Exact revision and recipient consent enforced | Pass with contract evidence — manual review/decline verified recipient consent; acceptance/transfer-back revision invariants passed automated coverage, as separated in the results report. |
| P-08 | Remove and reinvite a disposable member | Access revokes immediately; rejoin is clean | Pass — disposable member removal/reinvite and restored access were exercised. |
| P-09 | Campaign ownership transfer and restoration | Old owner remains GM; protected owner rules hold | Not executed — safety boundary. The retained release campaign's ownership was not mutated; exact permission/revision behavior passed automated ownership tests. |
| P-10 | GM-only/private actor, roll, journal, handout, hidden token/combatant, AI memory | Player/observer cannot see concealed data | Pass — concealed content was checked from player/observer seats; no private bodies are included in evidence. |

### K — characters, sheets, advancement, and resources

| ID | Manual feature coverage | Expected evidence | Status |
|---|---|---|---|
| K-01 | Creator draft save/resume/discard and modal keyboard behavior | No silent draft loss; focus restores | Pass — creator draft/review and modal recovery exercised; capture `09` records representative review. |
| K-02 | Four legal level-one characters using varied species/background/class/ability methods | Validation and review match saved sheets | Pass — persistent four-character roster in capture `10`; build paths are detailed in the results report. |
| K-03 | Standard array, point buy/alternate method where offered, spell/feat/equipment choices | Capacity and prerequisites enforced | Pass — offered build methods and choice validation exercised across the four builds. |
| K-04 | Character JSON import, duplicate-name confirmation, unknown-field preservation, repair | Preview and final actor agree | Pass after fix — FF-005; before capture `17`, repaired import `21`, and Orin level-3 review `22`. |
| K-05 | Stats, saves, skills, passives, AC explanation, quick rolls | Formulas and rules trace are visible | Pass — sheet formulas/quick rolls inspected through creation, play, and advancement. |
| K-06 | Loadout inventory, equipment, attunement, currency/commerce, item actions | Derived sheet values update correctly | Pass — inventory/resource and derived-sheet behavior exercised across persistent actors. |
| K-07 | Actions, spells, slots, preparation, feats, class resources, weapon mastery | Labels, costs, and availability are authoritative | Pass after fix — FF-006 clarified helper labels; captures `20`, `22`, `25`, and `26`. |
| K-08 | Heroic Inspiration grant, overflow transfer, reroll | Ownership and kept die are explicit | Pass — inspiration ownership/transfer/reroll state recorded in the results report. |
| K-09 | Typed fixed/formula/mixed damage, temp HP, healing, resistance/immunity/vulnerability | Actor and combatant stay synchronized | Pass after fix — FF-004; before capture `15`, then reviewed damage/undo/reapply in Session 3. |
| K-10 | 0 HP, death saves, natural-20 revival, stabilization, healing after defeat | Sheet and initiative recover together | Pass — defeat, stabilization/recovery, and synchronized combat/sheet state exercised. |
| K-11 | Conditions, immunity override, concentration, exhaustion, timed effects | Lifecycle and audit are correct | Pass — condition/concentration/timed-effect lifecycle exercised during advanced combat. |
| K-12 | Short rest, long rest, hit dice, resource recovery | Recovery follows chosen cadence | Pass — rest and resource-recovery cadence exercised between encounters/sessions. |
| K-13 | XP award, level-up retry, subclass, spell advancement, multiclass where eligible | Persistent legal advancement | Pass — all four actors advanced from level 1 to 3; captures `20` and `22` record subclass/spell results. |
| K-14 | Controlled creature handoff and source-locked statistics | Controller permissions and reload state hold | Pass — permission-checked control handoff and source-locked state survived reload. |
| K-15 | Raw/detail panels and managed-root restrictions | Readable details; unsafe direct edits rejected | Pass — readable details and managed-root rejection were exercised; actor lifecycle uses permission-checked commands. |

### S — worlds, scenes, maps, tokens, and tactical tools

| ID | Manual feature coverage | Expected evidence | Status |
|---|---|---|---|
| S-01 | World Atlas create/edit/search/reassign/archive | Linked content follows authoritative world | Pass — World Atlas lifecycle/search/reassignment inspected; linked campaign content remained authoritative. |
| S-02 | Square and gridless scene creation; name/folder/order/filter/search | Counts, order, and filters stay consistent | Pass — six-scene campaign in capture `11`; both grid modes and scene organization exercised. |
| S-03 | Map upload, checksum reuse, background assignment, calibration, grid overlay | Exact selected scene receives the asset | Expected native boundary — existing-asset/background/calibration/grid behavior passed, but the Browser plugin exposes no native file-input primitive, so map upload/checksum creation is not claimed. |
| S-04 | Scene size presets, custom dimensions/grid, activation/history/diff | Selected and active state are unambiguous | Pass — scene sizing, activation, selected/active distinction, and history exercised across six scenes. |
| S-05 | Scene duplicate with graph, move up/down, archive/delete disposable scene | Dependencies and active replacement are safe | Pass — disposable scene graph/lifecycle operations preserved a safe active replacement. |
| S-06 | Place missing party, actor tray, token create/delete | No duplicates; permissions enforced | Pass after fix — party placement/token lifecycle passed; FF-009 enabled safe deletion of the legacy duplicate actor. |
| S-07 | Token move via pointer and keyboard, group move, stale conflict, undo | Atomic board state; no partial denial | Pass — owned movement/undo succeeded and unowned/stale actions failed atomically. |
| S-08 | Token resize, rotation, elevation, bars, hidden state, ownership/layer | GM and player views diverge correctly | Pass — token presentation, concealment, ownership, and player/GM divergence exercised. |
| S-09 | Zoom/reset/focus mode and layer panel | Controls remain usable at all viewports | Pass with human-device boundary — Browser viewport/control checks passed; subjective physical-device usability is not claimed. |
| S-10 | Ruler/path, circle/cone, ping, drawing, area template, delete-latest, scene undo | Geometry persists and can be corrected | Pass — ruler, templates, ping/drawing, deletion, and scene undo used during Sessions 2–3; captures `19`, `23`, and `26`. |
| S-11 | Fog reveal/hide, circle/polygon/freehand, keyboard use, history/undo | Player vision matches GM preview | Pass — fog shapes/history/undo and player-safe visibility were exercised in Session 2. |
| S-12 | Fog presets save/apply append/replace/delete | Cross-scene behavior is explicit | Pass — preset lifecycle and append/replace semantics verified on disposable scene state. |
| S-13 | Walls, terrain walls, doors, windows, open state, movement/vision blocking | Occlusion changes player view | Pass — wall/door/window state and movement/vision effects inspected from GM/player views. |
| S-14 | Lights/darkness, magical flag, token bright/dim vision and senses | Vision preview and player seat agree | Pass — lighting/darkness and token vision/sense state checked against the player seat. |
| S-15 | Difficult terrain, cover overrides, pathfinding/measurement | Advisory versus automated behavior is labeled | Pass — terrain/cover/path measurement surfaced the correct advisory-versus-automated distinction. |
| S-16 | Asset library rename/folder/tag/archive/restore/rendition/reference | Lifecycle and references remain consistent | Pass — existing-asset library lifecycle/reference behavior passed; new native upload remains the S-03 boundary. |

### D — prep content, encounters, sessions, and knowledge

| ID | Manual feature coverage | Expected evidence | Status |
|---|---|---|---|
| D-01 | Compendium search, exact selection, actor/item/monster creation and cloning | Correct entity and rules source | Pass — exact compendium entities fed the saved encounters and disposable entity lifecycle. |
| D-02 | Encounter create/search/reopen/edit/save/history/clone/delete disposable | Saved encounter is stable and discoverable | Pass after fix — FF-010; Session 3 reopened/reused the saved encounter in capture `24`. |
| D-03 | Monster/ally/PC placement and exact session/token linkage | Only created tokens are linked | Pass — linked PCs/monsters and created tokens remained scoped to the active scenes/sessions. |
| D-04 | Session create/schedule/agenda/link/start/complete and duplicate-submit guard | Persisted echo and lifecycle are authoritative | Pass after fix — FF-010; three-session plan `12`, live setup `24`, and final reports in the results manifest. |
| D-05 | Session report, structured observations, GM privacy, session/campaign recap scope | Exact session bounds and privacy | Pass — reports/recaps stayed session-bounded and private observations stayed GM-only. |
| D-06 | Journal folders, hierarchy, Markdown, tags, four visibility modes, user/character sharing | Permissions and rendered content match | Pass — journal hierarchy/rendering/tagging and audience modes exercised across role seats. |
| D-07 | Journal entity links/backlinks, history, stale edit, canon approve/reject/retcon | Revision history and canon state persist | Pass — links/history/stale guard and canon decisions persisted. |
| D-08 | Handout CRUD, world/assets/tags, audiences, read receipt | Targeted player receives and marks read | Pass — targeted handout lifecycle and read state verified from the recipient seat. |
| D-09 | Campaign memory candidate/approve/reject/edit/retcon/delete/filter | Visibility, source, and confidence persist | Pass — memory/canon lifecycle and filters exercised without exposing private memory content. |
| D-10 | Global search and navigation across past events/entities | Exact result opens correct surface | Pass after fix — FF-019 repaired stale world scope and pagination races; campaign search rerun is recorded in the results/manifest. |
| D-11 | Content import preview/apply/selective rollback/delete for available local formats | Provenance and rollback are clear | Pass after fix — FF-013; local Markdown preflight/rollback surface plus atomic source/reference-conflict regressions are recorded in the results report. |

### L — live table, chat, dice, audio, and combat

| ID | Manual feature coverage | Expected evidence | Status |
|---|---|---|---|
| L-01 | Presence/realtime connection, reconnect, roster, session active scene | State converges after interruption | Pass after fix — FF-008; API rebuild/reconnect preserved campaign, roster, active session, and scene. |
| L-02 | Public chat, whispers, notifications, roll cards, edit/moderation where offered | Visibility and counts correct | Pass — public/GM/OOC/emote and private visibility exercised; capture `13`, with message bodies excluded from evidence. |
| L-03 | Dice formula, presets/macros, normal/Advantage/Disadvantage, public/GM/private visibility | Terms, fairness, and history persist | Pass — formula/mode/visibility/history behavior exercised in Session 1; capture `13`. |
| L-04 | Roll replay and Heroic Inspiration reroll | Source and kept result are explicit | Pass — replay/inspiration reroll exposed source and retained result. |
| L-05 | Soundboard URL/uploaded music, ambience, SFX, loop/volume/play/pause/delete | Synced state works; audible output remains human-only | Pass after fix / expected native-human boundary — FF-012 repaired authorization/stable playback identity; URL-track sync passed, but native uploaded-audio selection and audible speakers are not claimed. |
| L-06 | Combat setup with PCs/enemies/ally/hidden participant, surprise, manual/server initiative, reorder | Readiness guards and visibility work | Pass — three encounter setups exercised readiness, visibility, and initiative; captures `14`, `19`, `24`, and `27`. |
| L-07 | Turn/round previous/next, ready/delay, initiative edit, add/remove combatant | Ledger and active actor remain correct | Pass — turn/round and roster-correction controls preserved the active actor and ledger. |
| L-08 | Player attack pending GM confirmation, rejection, approval, cancellation | Exact prepared action is reviewed once | Pass — Pip's player-owned review flow in capture `16`; approval/rejection/cancellation remained one-shot. |
| L-09 | Hit, miss, critical, typed damage, save/half damage, multi-target and undo | Rules result and continuations are correct | Pass after fix — FF-004; before capture `15`, then Chimera defeat/undo/reapply and multi-target spell evidence in `25`–`27`. |
| L-10 | Action/bonus/reaction/free economy, Second Wind, Tactical Mind, Action Surge, Rage | Costs reset at the right cadence | Pass — action-economy/resource spends and reset cadence exercised through character/monster turns. |
| L-11 | Weapon mastery, conditions, concentration, spell slots, templates, summon/control | Effects and manual boundaries are explicit | Pass after fix — FF-006/FF-007; helper state and effects remained explicit in captures `25` and `26`. |
| L-12 | Recharge, reaction, lair/regional schedules, scheduled saves, legendary action economy | Prompts, spends, visibility, and reset work | Pass — public Obsidian Bell Resonance lair action plus advanced schedules/economy exercised; capture `26`. |
| L-13 | Combat vitals, death/stabilize/revive and mid-combat roster correction | Actor/combat roots stay synchronized | Pass — exact damage, defeat guard, undo/revive, and roster correction stayed synchronized. |
| L-14 | Combat end confirmation, XP/GP split/remainder, loot record/claim/assign, recap/audit | Persistent rewards and history | Pass — all three session ledgers/rewards and closeout history are summarized in the results report and manifest. |

### X — AI, plugins, archives, recovery, accessibility, and release

| ID | Manual feature coverage | Expected evidence | Status |
|---|---|---|---|
| X-01 | AI policy/privacy/disclosure controls and unavailable-provider state | Honest local state; no silent data transmission | Pass after fix — FF-014/FF-018; AI Studio navigation/permission/readiness now reports the truthful unavailable state without transmitting data. |
| X-02 | AI chat/manual-auto modes, stop/retry, proposal apply/reject/revert, encounter/recap/memory/art prompts if configured | Governed mutations or explicit provider block | Expected external boundary — local policy/permission and disabled states passed; no provider-backed AI, PDF, image, or proposal success is claimed. |
| X-03 | Plugin marketplace sync/search/filter/review/install/permissions/command/upgrade/rollback | Trust and least-privilege gates | Pass / expected external boundary — local trust-policy denial and permission gates passed; remote registry/install/upgrade success was not configured or claimed. |
| X-04 | Campaign/world/selected export; JSON and streamed OTTX; report bundle | Portable redacted archive with progress | Pass after fix / expected native boundary — FF-016/FF-017 repaired exact authority and selected-scope estimates; scope/redaction/progress passed, but OS download/save completion is not claimed. |
| X-05 | Import dry-run/upsert/reject/skip and all/assets/selected scopes; history/conflict/rollback | No partial or unattributed restore | Pass after fix / expected native boundary — FF-015 repaired sole-campaign recovery; dry-run/conflict/history/rollback behavior passed without claiming a native file-picker interaction. |
| X-06 | Scene/fog/D&D undo, archive/content rollback, journal/history, audit export | Every correction is visible and one-shot where intended | Pass after fix — FF-013/FF-015; live scene/D&D undo plus atomic content/archive rollback regressions are documented in the results report. |
| X-07 | Two-tab stale edit, API restart/reconnect, hard reload, backup restore drill | No silent loss or duplicate action | Pass after fix with concurrency boundary — FF-008; same-profile stale/reconnect/reload and restore drill passed, while genuinely independent clients remain outside this single-operator simulation. |
| X-08 | Owner/assistant/player/observer responsive views at desktop/tablet/phone/landscape | No unreachable core control or destructive overlap | Pass with human-device boundary — Browser role/viewport checks passed; independent physical devices and subjective usability are not claimed. |
| X-09 | Keyboard-only map/modal/inspector flow, focus, announcements, reduced motion, 200% zoom | Operable without pointer where supported | Pass with human-device boundary — Browser keyboard/focus/reduced-motion/zoom states passed; screen-reader and physical assistive-technology output require human evidence. |
| X-10 | Full local gate, clean exact-commit release smoke, fast-forward main push, exact-SHA GitHub checks and Pages | Local and remote qualification green | Not product surface — release qualification is recorded only by exact commit and gate result in the results report/manifest; this row does not pre-claim a pending push or CI outcome. |

## Screenshot checklist

1. Server-admin readiness and backup/restore-drill result.
2. Fresh registration and campaign creation/wizard.
3. Campaign rules and completed four-seat roster.
4. Four-character roster and one representative reviewed sheet.
5. Square-map setup and player-safe map view.
6. Gridless/advanced fog-light-wall tooling.
7. Worlds, journal, handout, memory, and search surfaces.
8. Saved encounter and session desk/report.
9. Player versus GM privacy pair.
10. Combat setup/initiative and pending-GM action review.
11. Critical/damage and defeat/recovery checkpoints.
12. Spell/template/advanced mechanic checkpoint.
13. Chat/dice/soundboard state.
14. Rewards/advancement/final continuity.
15. AI/provider and plugin/trust states.
16. Archive export/import/rollback and recovery results.
17. Responsive/keyboard checkpoints.
18. Final hard-reload state plus any before/after defect pairs.

## Exit criteria

- Every matrix row has a terminal status and evidence note.
- Every repository-controlled failure is fixed with a focused regression.
- Affected Browser paths pass after the rebuilt stack is hard-reloaded.
- `pnpm check` and the clean exact-commit offline release smoke pass.
- The commit is pushed to `main` without force and exact-SHA Release Smoke plus Docs Site are green.
- Remaining items are only genuinely external, human-device, or absent-product boundaries.
