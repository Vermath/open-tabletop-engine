# v1 Release Owner Handoff

> Historical evidence notice (2026-07-13): this handoff describes the May candidate and verifier target below. It is not evidence for the current dirty working tree and its three-item blocker list is superseded by the July audit set. Use `docs/FEATURE_AUDIT.md`, `docs/PRODUCT_ASSESSMENT.md`, `docs/PRODUCT_ROADMAP.md`, `docs/IMPLEMENTATION_BACKLOG.md`, and `docs/verification/implementation-2026-07-13.md` for the current implementation and full external/manual release queue.

Status: final external-evidence checklist for the v1.0 release candidate. This is not completion evidence by itself.

The local implementation, browser coverage, release-smoke wiring, docs renderer, hosted release-smoke evidence, and public docs publication evidence are covered by `docs/verification/v1-gap-closure-completion-audit.md`. The remaining v1 blockers require OIDC/SCIM release-owner credentials, manual assistive-technology testing, and external GM validation.

Use `docs/release/v1-release-checklist.md` as the release-owner preflight, publication, evidence, and rollback checklist.

Tracking issue: https://github.com/Vermath/open-tabletop-engine/issues/2 records the remaining external evidence blockers. The issue tracker audit on 2026-05-15 covered the parent issue plus the child evidence trackers below and found no P0/P1 labels.

Child evidence trackers:

- Live OIDC/SCIM provider smoke: https://github.com/Vermath/open-tabletop-engine/issues/3
- Assistive-technology matrix: https://github.com/Vermath/open-tabletop-engine/issues/4
- External GM validation: https://github.com/Vermath/open-tabletop-engine/issues/5

Current verifier target for the hosted release-smoke and public-docs evidence is `def4f408a6c48cb297c9f08d04aee375d13fd382`. Keep that value in the three owner-supplied evidence files unless release-smoke and public-docs publication are refreshed for a newer release target.

## Release-Owner Evidence Packet

Copy the matching template from each file below, fill it with real evidence, then commit the updated file and rerun the final release check.

| Evidence gate | Fill this file | Mirror or link in GitHub issue | Required proof |
| --- | --- | --- | --- |
| Live OIDC/SCIM provider smoke | `docs/verification/identity-provider-smoke-evidence.md` | https://github.com/Vermath/open-tabletop-engine/issues/3 | Non-skipped `pnpm identity:smoke` pass against a real provider sandbox, exit code `0`, exact command parity, matching verifier target, non-placeholder API host/provider/sandbox/smoke-target details, passing OIDC discovery/test, and passing SCIM ServiceProviderConfig |
| Assistive-technology matrix | `docs/verification/accessibility-assistive-tech-pass.md` | https://github.com/Vermath/open-tabletop-engine/issues/4 | One pass or pass-with-issues block for Windows NVDA, Windows Narrator, macOS VoiceOver, iOS/iPadOS VoiceOver, and Android TalkBack with browser, assistive technology, input method, scenario data, and workflows completed, or an explicit release-owner-approved descope |
| External GM validation | `docs/verification/external-gm-validation.md` | https://github.com/Vermath/open-tabletop-engine/issues/5 | Unaffiliated or owner-approved GM validation with matching verifier target, tester role, relationship to project, setup path, scenario data, workflows completed, result, and issue-reporting feedback, or an explicit release-owner-approved substitution |

Run `pnpm v1:issues:check` before final acceptance to verify the live open-issue list still has no P0/P1 labels.

For a command-line summary of the remaining owner-supplied evidence, run:

```powershell
pnpm v1:release:handoff
```

Rerun it after committing final evidence documents so the printed commit matches the verifier target.

To generate ready-to-fill evidence blocks with the current release commit prefilled, run:

```powershell
pnpm v1:evidence:templates
```

If evidence documents are committed after the hosted workflow run, generate the blocks against the hosted run commit:

```powershell
$env:OTTE_RELEASE_COMMIT = "<full-40-character-hosted-run-commit-sha>"
pnpm v1:evidence:templates
```

## Remaining Decisions

| Gate | Owner action | Evidence destination | Completion rule |
| --- | --- | --- | --- |
| Live OIDC/SCIM provider readiness | Provide a real Okta, Microsoft Entra ID, Google Workspace, or equivalent sandbox plus redacted smoke output | `docs/verification/identity-provider-smoke-evidence.md` and issue #3 | `pnpm identity:smoke` exits `0` without skipping, and the evidence block records exact command parity, matching commit, non-placeholder API host, provider, sandbox label, smoke target, passing OIDC discovery/test result, and passing SCIM ServiceProviderConfig result |
| Assistive-technology acceptance | Run or delegate Windows NVDA, Windows Narrator, macOS VoiceOver, iOS/iPadOS VoiceOver, and Android TalkBack passes | `docs/verification/accessibility-assistive-tech-pass.md` and issue #4 | Every required environment has its own pass or pass-with-issues evidence section tied to the verifier target commit with browser, assistive technology, input method, scenario data, and workflows completed, or an explicit owner-approved substitution/descope is recorded |
| External GM validation | Have an unaffiliated or owner-approved GM run the v1 release-candidate flow | `docs/verification/external-gm-validation.md` and issue #5 | Matching commit, tester role, relationship to project, setup path, scenario data, workflows completed, pass/pass-with-issues outcome, and issue-reporting feedback are recorded |
| Hosted release-smoke refresh | Covered by PR Release Smoke run `25928669881` for verifier target `def4f408a6c48cb297c9f08d04aee375d13fd382` | `docs/verification/release-workflow-evidence.md` | Recorded and passing; rerun only if the release verifier target changes |
| Public docs publication | Covered by equivalent hosted Vercel publication for verifier target `def4f408a6c48cb297c9f08d04aee375d13fd382` | `docs/verification/release-workflow-evidence.md` | Recorded and passing with HTTPS published URL `https://docs-site-seven-theta.vercel.app`; republish only if the release verifier target changes |

## Identity Provider Smoke

Use real sandbox values only in the local shell or hosted CI secrets. Do not commit env files or command output that contains secrets.

PowerShell setup shape:

```powershell
$env:OTTE_OIDC_ISSUER = "https://issuer.example.test"
$env:OTTE_OIDC_CLIENT_ID = "<redacted-client-id>"
$env:OTTE_OIDC_CLIENT_SECRET = "<redacted-client-secret>"
$env:OTTE_OIDC_REDIRECT_URI = "http://localhost:4000/api/v1/auth/oidc/callback"
$env:OTTE_SCIM_BEARER_TOKEN = "<redacted-scim-token>"
pnpm identity:smoke
```

Hosted owner-triggered setup shape:

1. Store the same values as GitHub repository secrets.
2. Confirm GitHub lists `.github/workflows/identity-smoke.yml` as an available workflow. If GitHub only lists the already-published workflows, merge or otherwise publish the workflow file into the repository workflow context first, or use the local `pnpm identity:smoke` command instead.
3. Run `.github/workflows/identity-smoke.yml` with `workflow_dispatch`.
4. Choose `deployed-api` when `OTTE_IDENTITY_SMOKE_BASE_URL`, `OTTE_IDENTITY_SMOKE_ADMIN_TOKEN`, and `OTTE_SCIM_BEARER_TOKEN` point at a reachable release-candidate API.
5. Choose `local-sandbox` when the workflow should start the in-memory API using `OTTE_OIDC_*` plus `OTTE_SCIM_BEARER_TOKEN`.
6. Copy the successful hosted workflow URL into `docs/verification/identity-provider-smoke-evidence.md`.

Record whether the run targeted a deployed API or local sandbox, the API base URL host, provider label, sandbox or tenant label, commit SHA, exit code, and redacted OIDC/SCIM readiness summaries in `docs/verification/identity-provider-smoke-evidence.md`.

## Assistive-Technology Pass

Use `docs/verification/accessibility-assistive-tech-pass.md` as the scenario script. Required environments:

- Windows with NVDA.
- Windows with Narrator.
- macOS with VoiceOver.
- iOS or iPadOS with VoiceOver.
- Android with TalkBack.

Record each environment as its own `## Assistive Technology Pass: ...` block. A combined summary that mentions multiple environments does not satisfy `pnpm v1:evidence:check`.

If a device or assistive technology is unavailable, record the omission and owner-approved substitute before final acceptance.
Override values must explicitly say the release owner accepted or approved the substitution/descope. Placeholder or ambiguous values such as `none`, `n/a`, `tbd`, `pending`, `<approval summary>`, `<explicit owner approval summary>`, `Temporary reduced matrix`, or `Internal GM substitute` do not satisfy `pnpm v1:evidence:check`.

## Docs Publication

Current evidence:

- Published URL: https://docs-site-seven-theta.vercel.app
- Deployment evidence: https://vercel.com/treys-projects-52eabdbc/docs-site/4kwvC4RDU64YXcdrEhB7js1AYpWe
- Verifier target: `def4f408a6c48cb297c9f08d04aee375d13fd382`
- Command parity: `pnpm docs:site:check`
- Final evidence gate: docs-publication

If the release verifier target changes, republish from `dist/docs-site` after `pnpm docs:site:check` or publish from `.github/workflows/docs-site.yml` once GitHub Pages support is available. Any replacement publication evidence must record:

- Hosting provider and HTTPS published URL.
- Release commit SHA.
- Exact command parity with `pnpm docs:site:check`.
- Confirmation that the public site exposes no secrets, local paths, provider tokens, or private evidence attachments.

## External GM Validation

The PRD's v1 release-candidate milestone calls for external GM validation in addition to dogfood. Use `docs/verification/external-gm-validation.md` to run and record the pass.

## Hosted Release-Smoke Refresh

Hosted release-smoke evidence is recorded for verifier target `def4f408a6c48cb297c9f08d04aee375d13fd382` with run `25928669881`. If the release verifier target changes, rerun hosted release smoke and update `docs/verification/release-workflow-evidence.md` with the HTTPS run URL, commit SHA, result, and exact `pnpm release:smoke` command.

## Final Release Check

After the external gates above are satisfied, rerun the completion audit:

```powershell
pnpm v1:release:handoff
pnpm v1:evidence:templates
pnpm v1:completion:audit
pnpm docs:site:test
pnpm docs:site:check
pnpm v1:evidence:check
pnpm identity:smoke
git diff --check
```

If the evidence documents were updated after the hosted workflow run, run the aggregate audit and evidence verifier with `OTTE_RELEASE_COMMIT` set to the hosted release-smoke commit SHA:

```powershell
$env:OTTE_RELEASE_COMMIT = "<full-40-character-hosted-run-commit-sha>"
pnpm v1:completion:audit
pnpm v1:evidence:check
```

Hosted owner-triggered final audit:

1. Confirm GitHub lists `.github/workflows/v1-completion-audit.yml` as an available workflow. If GitHub only lists the already-published workflows, merge or otherwise publish the workflow file into the repository workflow context first, or use the local `pnpm v1:completion:audit` command instead.
2. Run `.github/workflows/v1-completion-audit.yml` with `workflow_dispatch`.
3. Enter the full hosted release-smoke commit SHA in `release_commit`.
4. The workflow validates the SHA shape, sets `OTTE_RELEASE_COMMIT`, runs `pnpm v1:completion:audit`, and uses `GH_TOKEN` with `issues: read` so the live P0/P1 issue audit is included.
5. A passing hosted completion-audit run is acceptable only after the three owner-supplied evidence gates above have already been recorded.

A skipped `pnpm identity:smoke` run is still only a local readiness signal; final identity-provider evidence must be the non-skipped pass recorded in `docs/verification/identity-provider-smoke-evidence.md`.

Then update `docs/verification/v1-gap-closure-completion-audit.md` with the evidence links before declaring the v1 gap-closure objective complete.
