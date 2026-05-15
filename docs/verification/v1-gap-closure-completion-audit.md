# v1 Gap Closure Completion Audit

Date: 2026-05-14
Status: incomplete; local product/code coverage is at the current v1 threshold, but external/manual release evidence is still pending.
Last refreshed: 2026-05-15.

## Objective

Close the release gaps tracked in `docs/prd-v1-gap-closure.md` so v1 can be declared ready with concrete implementation, browser evidence, release gates, documentation, and external/manual verification where required.

## Checklist

| Requirement | Evidence checked | Current status |
| --- | --- | --- |
| First-run owner bootstrap, password auth, MFA, password reset, workspace setup, organization members, organization invites, active workspace switching | Clean-bootstrap Playwright smoke in `tests/e2e/bootstrap.spec.ts` | Covered locally |
| Bidirectional organization member and invite roster isolation | Clean-bootstrap Playwright smoke switches workspaces and checks both original-to-side and side-to-original absence | Covered locally |
| Server Admin storage backup, restore drill, destructive restore, backup/restore-drill job queueing | Clean-bootstrap Playwright smoke exercises SQLite Storage controls and Job Ledger job rows | Covered locally |
| Job Ledger cancel/retry, dry-run alert, configured send alert | Clean-bootstrap Playwright smoke exercises cancel/retry plus mocked alert delivery | Covered locally |
| Admin Auth Operations recovery | Clean-bootstrap Playwright smoke exercises risk-session cleanup, expired-reset pruning, failed email retry, user reset/session/disable controls, and individual active-session revoke | Covered locally |
| Admin Organization Access SCIM mapping lifecycle | Clean-bootstrap Playwright smoke creates and deletes a SCIM group-to-campaign role mapping | Covered locally |
| Admin Asset Storage and Asset Integrity recovery | Clean-bootstrap Playwright smoke exercises asset migration, cleanup, CDN purge, and integrity quarantine recovery | Covered locally |
| Admin AI recovery controls | Clean-bootstrap Playwright smoke exercises stale thread, stale tool-call, stale pending proposal, and stale approved proposal recovery | Covered locally |
| Admin Plugin Operations and Plugin Reviews | Clean-bootstrap Playwright smoke exercises registry sync and package approve/reject/reset controls | Covered locally |
| Chat export artifacts | Seeded tabletop Playwright smoke downloads and parses JSON and NDJSON chat export artifacts | Covered locally |
| SDK/plugin/system marketplace and actor rules-action paths | Seeded tabletop Playwright smoke covers source/status filters, player read-only posture, active/available/read-only system manifest metadata, system activation, D&D Fighter Second Wind, Fighter Action Surge guardrails, Cleric Divine Spark damage/resource consumption, Bard Healing Word healing/resource consumption, Bardic Inspiration resource consumption, Font of Inspiration spell-slot-backed recovery, Druid Cure Wounds healing/resource consumption, Wizard Fire Bolt damage application, Sorcerer Chromatic Orb damage/resource consumption, Warlock Hex damage/resource consumption, Warlock Magical Cunning pact-slot recovery, Giant Spider Bite damage and Web condition application, Barbarian Rage Damage application, Paladin Lay On Hands healing/resource consumption, Paladin Divine Smite damage application, Monk Stunning Strike condition application, Ranger Hunter's Mark damage/resource consumption, and Rogue Sneak Attack damage application | Covered locally |
| Mobile/tablet live-play smoke | Mobile Playwright smoke covers viewport fit, touch token creation/drag, footer dice, and chat | Covered locally |
| Local public documentation renderer | `pnpm docs:site:check` | Covered locally |
| Local release-smoke gate | `pnpm release:smoke` on 2026-05-14, covering `pnpm check`, E2E, security, migration, deployment, and performance smoke checks | Covered locally |
| Release smoke CI workflow exists | `.github/workflows/release-smoke.yml`, root `pnpm release:smoke` wiring, and hosted PR run `25871961476` recorded in `docs/verification/release-workflow-evidence.md` | Workflow covered; hosted pass must be refreshed on the final release commit because this branch now has local-only commits after the recorded run |
| Docs-site publication workflow exists | `.github/workflows/docs-site.yml`, `pnpm docs:site:check`, hosted PR build run `25871961487`, manual publication workflow support, and a 2026-05-14 Pages enablement attempt recorded in `docs/verification/release-workflow-evidence.md` | Workflow/local/PR build/manual publication wiring present; live GitHub Pages deploy is blocked by current private-repository plan support unless the owner enables supported Pages or accepts an equivalent hosted publication |
| Broader cross-organization administration/isolation | API coverage verifies direct campaign/scenes reads, direct campaign invite create/revoke, campaign archive, journal reads, asset metadata/blob access, actor/item updates, scene annotations, combat/proposal/content-import direct-object access, AI memory reads, unscoped chat listing, organization member rosters/member ids, member-id patch/delete, and organization invite creation respect the active organization; campaign-invite acceptance creates organization membership plus an active organization session; clean-bootstrap browser coverage verifies bidirectional workspace member/invite roster isolation | Covered locally for the current v1 organization boundary |
| Broader system-specific combat/rules automation | `docs/prd-v1-gap-closure.md` records generic combat-state automation, timed combat condition expiry, browser coverage for Fighter healing, Cleric Divine Spark damage/resource consumption, Bard Healing Word healing/resource consumption, Bardic Inspiration resource consumption, Font of Inspiration spell-slot-backed recovery, Druid Cure Wounds healing/resource consumption, Wizard Fire Bolt damage, Sorcerer Chromatic Orb damage/resource consumption, Warlock Hex damage/resource consumption, Warlock Magical Cunning pact-slot recovery, Giant Spider Bite and Web condition application, Barbarian Rage Damage, Paladin Lay On Hands healing/resource consumption, Paladin Divine Smite damage, Monk Stunning Strike condition application, Monk Deflect Attacks reaction-damage presentation, Ranger Hunter's Mark damage/resource consumption, and Rogue Sneak Attack damage; API coverage verifies broader D&D SRD action effects for rogue/barbarian/paladin/ranger/monk/sorcerer/warlock/bard/cleric/monster damage, healing, condition, resource, rest, and insufficient-resource paths | Covered locally for the current v1 SRD action-effect threshold; deeper class-feature edge cases remain future polish |
| Deeper API behavior compatibility tests | API coverage compares the missing-session matrix to the served OpenAPI path/method surface, verifies every user-session-protected REST route is covered or explicitly excluded as public/browser-flow/SCIM-bearer, verifies read-only observer `403` outcomes across every non-self-service mutating user-session route from that served surface, verifies read-only observer outcomes across protected `GET` routes, verifies privileged GM/server-admin read companions, verifies privileged server-admin and GM mutating companions, verifies authenticated malformed request bodies without representative state mutation, and verifies API-client auth/header/body/upload/error/export/archive behavior plus typed realtime URL/connect/parse helpers beyond route conformance | Covered locally for the current served route and generated-client fixture surface |
| Expanded advanced-flow browser E2E | Browser coverage includes timed combat condition expiry, selected D&D SRD action-effect paths across Fighter/Cleric/Bard/Druid/Wizard/Sorcerer/Warlock/Monster/Barbarian/Paladin/Monk/Ranger/Rogue, SDK/system registry manifest metadata, plugin source/status/core/trust filters and install/upgrade/rollback/read-only/failure states, admin auth/storage/asset/AI/plugin/job/audit recovery, chat export formats, archive reject-conflict and selected-collection journal import application, signed asset delivery URL generation, deleted-asset delivery disablement, and phone/tablet touch token/dice/chat/reload smokes | Covered locally for the current v1 browser evidence threshold |
| Future/archive upgrade fixture policy | Current migration smoke covers existing v0.1/v0.2 archive fixtures and a v0.3 SQLite fixture, but `docs/prd-v1-gap-closure.md` still requires committed fixture coverage for future historical versions as they are released | Covered for current fixtures; future-version requirement remains ongoing |
| No P0/P1 open issues | `gh issue list --repo Vermath/open-tabletop-engine --state open --limit 100 --json number,title,labels,url` on 2026-05-15 returned issue #2, `Track remaining v1 external evidence blockers`, with no labels | No labeled P0/P1 product issues found; one open external-evidence tracking issue remains |
| Milestone 5 external GM validation | `docs/prd-v1-gap-closure.md` requires clean install, upgrade, dogfood, and external GM validation for the v1 release candidate; `docs/verification/external-gm-validation.md` defines the evidence template | Incomplete until an external GM validation pass or explicit owner-approved substitution is recorded |
| OIDC/SCIM provider readiness | `pnpm identity:smoke` harness and `docs/verification/identity-provider-smoke-evidence.md` evidence template exist | Incomplete until run against real provider sandbox credentials with pass output |
| Assistive technology acceptance | `docs/verification/accessibility-assistive-tech-pass.md` plan exists | Incomplete until NVDA/Narrator/VoiceOver/TalkBack pass evidence is attached |

## Remaining Blockers

- Live provider-specific OIDC/SCIM sandbox pass using real release-owner credentials, recorded with `docs/verification/identity-provider-smoke-evidence.md`.
- Completed assistive-technology pass evidence for the required screen-reader/device matrix.
- External GM validation for the final release candidate, recorded with `docs/verification/external-gm-validation.md`, or an explicit owner-approved substitution.
- Hosted release-smoke evidence refreshed for the final pushed release commit; current hosted run predates local-only commits.
- Live successful GitHub Pages docs-site publication run, recorded with `docs/verification/release-workflow-evidence.md`; current attempt is blocked by GitHub plan support for Pages on this private repository unless the owner enables supported Pages or approves an equivalent hosted publication.
- Open issue #2 tracks the remaining external evidence blockers; it has no P0/P1 labels as of the 2026-05-15 GitHub issue audit.

The actionable release-owner handoff for these external blockers lives at `docs/verification/v1-release-owner-handoff.md`.

## Latest Audit Refresh

- 2026-05-15 `pnpm identity:smoke`: command completed, but the only identity-provider test was skipped because no live OIDC/SCIM sandbox environment is configured; this is not final provider-readiness evidence.
- 2026-05-15 `pnpm docs:site:check`: passed locally.
- 2026-05-15 `git diff --check`: passed locally.
- 2026-05-15 GitHub issue audit: one open issue, #2 `Track remaining v1 external evidence blockers`, with no labels.
- 2026-05-15 GitHub PR audit: PR #1 remote head checks passed for Release Smoke and Docs Site build, but the local branch has additional unpushed commits, so final hosted evidence still needs refresh on the final release commit.

## Conclusion

The local implementation, browser evidence, and local release-smoke preflight now satisfy the current local v1 evidence threshold. The objective is still not complete because final acceptance requires hosted release-smoke evidence on the final release commit, live provider credentials for OIDC/SCIM, external GM validation, completed manual assistive-technology evidence, and live documentation publication or an owner-approved equivalent because GitHub Pages enablement is currently plan-blocked for this private repository.
