# v1 Release Owner Handoff

Status: final external-evidence checklist for the v1.0 release candidate. This is not completion evidence by itself.

The local implementation, browser coverage, release-smoke wiring, and docs renderer are covered by `docs/verification/v1-gap-closure-completion-audit.md`. The remaining v1 blockers require release-owner credentials, manual assistive-technology testing, or hosted publication support.

## Remaining Decisions

| Gate | Owner action | Evidence destination | Completion rule |
| --- | --- | --- | --- |
| Live OIDC/SCIM provider readiness | Provide a real Okta, Microsoft Entra ID, Google Workspace, or equivalent sandbox plus redacted smoke output | `docs/verification/identity-provider-smoke-evidence.md` | `pnpm identity:smoke` exits `0` without skipping and the evidence block is attached |
| Assistive-technology acceptance | Run or delegate NVDA, Narrator, VoiceOver, iOS/iPadOS VoiceOver, and TalkBack passes | `docs/verification/accessibility-assistive-tech-pass.md` | Every required environment has pass evidence, or an explicit owner-approved substitution/descope is recorded |
| Public docs publication | Enable GitHub Pages for the repo, make the repo/plan support Pages, or approve an equivalent hosted publication | `docs/verification/release-workflow-evidence.md` | Docs build and deploy complete for the release commit and the published URL is recorded |

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

## Final Release Check

After the three external gates above are satisfied, rerun the completion audit:

```powershell
pnpm docs:site:check
pnpm identity:smoke
git diff --check
```

Then update `docs/verification/v1-gap-closure-completion-audit.md` with the evidence links before declaring the v1 gap-closure objective complete.
