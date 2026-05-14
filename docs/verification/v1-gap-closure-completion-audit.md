# v1 Gap Closure Completion Audit

Date: 2026-05-14
Status: incomplete; do not mark the v1 gap-closure objective complete yet.

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
| SDK/plugin/system marketplace and actor rules-action paths | Seeded tabletop Playwright smoke covers source/status filters, player read-only posture, system activation, D&D Fighter Second Wind, and Action Surge guardrails | Covered locally |
| Mobile/tablet live-play smoke | Mobile Playwright smoke covers viewport fit, touch token creation/drag, footer dice, and chat | Covered locally |
| Local public documentation renderer | `pnpm docs:site:check` | Covered locally |
| Local release-smoke gate | `pnpm release:smoke` on 2026-05-14, covering `pnpm check`, E2E, security, migration, deployment, and performance smoke checks | Covered locally |
| Release smoke CI workflow exists | `.github/workflows/release-smoke.yml`, root `pnpm release:smoke` wiring, and `docs/verification/release-workflow-evidence.md` evidence template | Workflow present; live green CI run still required |
| Docs-site publication workflow exists | `.github/workflows/docs-site.yml`, `pnpm docs:site:check`, and `docs/verification/release-workflow-evidence.md` evidence template | Workflow/local check present; live GitHub Pages run still required |
| OIDC/SCIM provider readiness | `pnpm identity:smoke` harness and `docs/verification/identity-provider-smoke-evidence.md` evidence template exist | Incomplete until run against real provider sandbox credentials with pass output |
| Assistive technology acceptance | `docs/verification/accessibility-assistive-tech-pass.md` plan exists | Incomplete until NVDA/Narrator/VoiceOver/TalkBack pass evidence is attached |

## Remaining Blockers

- Live provider-specific OIDC/SCIM sandbox pass using real release-owner credentials, recorded with `docs/verification/identity-provider-smoke-evidence.md`.
- Completed assistive-technology pass evidence for the required screen-reader/device matrix.
- Live green release-smoke CI run for `.github/workflows/release-smoke.yml`, recorded with `docs/verification/release-workflow-evidence.md`.
- Live successful GitHub Pages docs-site publication run, recorded with `docs/verification/release-workflow-evidence.md`.

## Conclusion

The local implementation, browser evidence, and local release-smoke preflight have expanded substantially, but the objective is not complete. The remaining blockers require external credentials, manual assistive-technology execution, or live hosted CI/publication runs.
