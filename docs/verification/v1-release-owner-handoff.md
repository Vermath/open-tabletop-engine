# v1 Release Owner Handoff

Status: final external-evidence checklist for the v1.0 release candidate. This is not completion evidence by itself.

The local implementation, browser coverage, release-smoke wiring, and docs renderer are covered by `docs/verification/v1-gap-closure-completion-audit.md`. The remaining v1 blockers require release-owner credentials, manual assistive-technology testing, or hosted publication support.

Use `docs/release/v1-release-checklist.md` as the release-owner preflight, publication, evidence, and rollback checklist.

Tracking issue: https://github.com/Vermath/open-tabletop-engine/issues/2 records the remaining external evidence blockers and had no P0/P1 labels in the 2026-05-15 audit.

For a command-line summary of the remaining owner-supplied evidence, run:

```powershell
pnpm v1:release:handoff
```

Rerun it after committing final evidence documents so the printed commit matches the verifier target.

To generate ready-to-fill evidence blocks with the current release commit prefilled, run:

```powershell
pnpm v1:evidence:templates
```

## Remaining Decisions

| Gate | Owner action | Evidence destination | Completion rule |
| --- | --- | --- | --- |
| Live OIDC/SCIM provider readiness | Provide a real Okta, Microsoft Entra ID, Google Workspace, or equivalent sandbox plus redacted smoke output | `docs/verification/identity-provider-smoke-evidence.md` | `pnpm identity:smoke` exits `0` without skipping, and the evidence block records the command, matching commit, passing OIDC discovery/test result, and passing SCIM ServiceProviderConfig result |
| Assistive-technology acceptance | Run or delegate Windows NVDA, Windows Narrator, macOS VoiceOver, iOS/iPadOS VoiceOver, and Android TalkBack passes | `docs/verification/accessibility-assistive-tech-pass.md` | Every required environment has pass evidence, or an explicit owner-approved substitution/descope is recorded |
| External GM validation | Have an unaffiliated or owner-approved GM run the v1 release-candidate flow | `docs/verification/external-gm-validation.md` | Matching commit, setup path, workflows completed, pass/fail outcome, and issue-reporting feedback are recorded |
| Hosted release-smoke refresh | Push the final release candidate and rerun `.github/workflows/release-smoke.yml` | `docs/verification/release-workflow-evidence.md` | `pnpm release:smoke` passes on the final release commit or owner-approved successor |
| Public docs publication | Enable GitHub Pages for the repo, make the repo/plan support Pages, or approve an equivalent hosted publication | `docs/verification/release-workflow-evidence.md` | Docs build and deploy complete for the release commit; run URL, commit SHA, and published URL are recorded |

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

Record whether the run targeted a deployed API or local sandbox, the provider label, the commit SHA, exit code, and redacted OIDC/SCIM readiness summaries in `docs/verification/identity-provider-smoke-evidence.md`.

## Assistive-Technology Pass

Use `docs/verification/accessibility-assistive-tech-pass.md` as the scenario script. Required environments:

- Windows with NVDA.
- Windows with Narrator.
- macOS with VoiceOver.
- iOS or iPadOS with VoiceOver.
- Android with TalkBack.

If a device or assistive technology is unavailable, record the omission and owner-approved substitute before final acceptance.
Placeholder override values such as `none`, `n/a`, `tbd`, `pending`, or `<approval summary>` do not satisfy `pnpm v1:evidence:check`.

## Docs Publication

Preferred path:

1. Enable GitHub Pages support for `Vermath/open-tabletop-engine`.
2. Publish from `.github/workflows/docs-site.yml` on `main` or `workflow_dispatch`.
3. Record the run URL, commit SHA, deployed URL, and pass summary in `docs/verification/release-workflow-evidence.md`.

Equivalent hosted publication is acceptable only if the owner records:

- Hosting provider and published URL.
- Release commit SHA.
- Exact command parity with `pnpm docs:site:check`.
- Confirmation that the public site exposes no secrets, local paths, provider tokens, or private evidence attachments.

## External GM Validation

The PRD's v1 release-candidate milestone calls for external GM validation in addition to dogfood. Use `docs/verification/external-gm-validation.md` to run and record the pass.

## Hosted Release-Smoke Refresh

The existing hosted release-smoke run proves the workflow shape, but it predates the current local-only commits. Before final acceptance, rerun hosted release smoke on the final pushed release commit and update `docs/verification/release-workflow-evidence.md` with the run URL, commit SHA, and result.

## Final Release Check

After the external gates above are satisfied, rerun the completion audit:

```powershell
pnpm v1:release:handoff
pnpm v1:evidence:templates
pnpm docs:site:test
pnpm docs:site:check
pnpm v1:evidence:check
pnpm identity:smoke
git diff --check
```

If the evidence documents were updated after the hosted workflow run, run the evidence verifier with `OTTE_RELEASE_COMMIT` set to the hosted release-smoke commit SHA.

Then update `docs/verification/v1-gap-closure-completion-audit.md` with the evidence links before declaring the v1 gap-closure objective complete.
