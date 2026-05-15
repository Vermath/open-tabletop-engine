# v1 Release Owner Handoff

Status: final external-evidence checklist for the v1.0 release candidate. This is not completion evidence by itself.

The local implementation, browser coverage, release-smoke wiring, docs renderer, hosted release-smoke evidence, and public docs publication evidence are covered by `docs/verification/v1-gap-closure-completion-audit.md`. The remaining v1 blockers require OIDC/SCIM release-owner credentials, manual assistive-technology testing, and external GM validation.

Use `docs/release/v1-release-checklist.md` as the release-owner preflight, publication, evidence, and rollback checklist.

Tracking issue: https://github.com/Vermath/open-tabletop-engine/issues/2 records the remaining external evidence blockers and had no P0/P1 labels in the 2026-05-15 audit.

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
| Live OIDC/SCIM provider readiness | Provide a real Okta, Microsoft Entra ID, Google Workspace, or equivalent sandbox plus redacted smoke output | `docs/verification/identity-provider-smoke-evidence.md` | `pnpm identity:smoke` exits `0` without skipping, and the evidence block records exact command parity, matching commit, non-placeholder API host, provider, sandbox label, smoke target, passing OIDC discovery/test result, and passing SCIM ServiceProviderConfig result |
| Assistive-technology acceptance | Run or delegate Windows NVDA, Windows Narrator, macOS VoiceOver, iOS/iPadOS VoiceOver, and Android TalkBack passes | `docs/verification/accessibility-assistive-tech-pass.md` | Every required environment has its own pass or pass-with-issues evidence section tied to the verifier target commit with browser, assistive technology, input method, scenario data, and workflows completed, or an explicit owner-approved substitution/descope is recorded |
| External GM validation | Have an unaffiliated or owner-approved GM run the v1 release-candidate flow | `docs/verification/external-gm-validation.md` | Matching commit, tester role, relationship to project, setup path, scenario data, workflows completed, pass/pass-with-issues outcome, and issue-reporting feedback are recorded |
| Hosted release-smoke refresh | Covered by PR Release Smoke run `25915135921` for verifier target `eaefa345d2200d029a2d58af5a886d6d1b6f2a6d` | `docs/verification/release-workflow-evidence.md` | Recorded and passing; rerun only if the release verifier target changes |
| Public docs publication | Covered by equivalent hosted Vercel publication for verifier target `eaefa345d2200d029a2d58af5a886d6d1b6f2a6d` | `docs/verification/release-workflow-evidence.md` | Recorded and passing with HTTPS published URL `https://docs-site-seven-theta.vercel.app`; republish only if the release verifier target changes |

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
- Deployment evidence: https://vercel.com/treys-projects-52eabdbc/docs-site/GLk7UZT25WyiCyJ1LoEye4ajpLzX
- Verifier target: `eaefa345d2200d029a2d58af5a886d6d1b6f2a6d`
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

Hosted release-smoke evidence is recorded for verifier target `eaefa345d2200d029a2d58af5a886d6d1b6f2a6d` with run `25915135921`. If the release verifier target changes, rerun hosted release smoke and update `docs/verification/release-workflow-evidence.md` with the HTTPS run URL, commit SHA, result, and exact `pnpm release:smoke` command.

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

A skipped `pnpm identity:smoke` run is still only a local readiness signal; final identity-provider evidence must be the non-skipped pass recorded in `docs/verification/identity-provider-smoke-evidence.md`.

Then update `docs/verification/v1-gap-closure-completion-audit.md` with the evidence links before declaring the v1 gap-closure objective complete.
