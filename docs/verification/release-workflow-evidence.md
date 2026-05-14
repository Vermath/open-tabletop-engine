# Release Workflow Evidence

Status: v1.0 candidate verification template. This document defines the live hosted workflow evidence required before v1.0 can be declared ready. It is not completed hosted evidence by itself.

Local commands such as `pnpm release:smoke` and `pnpm docs:site:check` are useful preflight checks, but final release evidence needs successful hosted runs for the release smoke workflow and the GitHub Pages documentation workflow.

## Local Preflight Evidence

- 2026-05-14: `pnpm release:smoke` passed locally on Windows from `D:\open_tabletop_engine`.
- Covered gates: `pnpm check`, seeded and clean-bootstrap Playwright E2E, `pnpm security:smoke`, `pnpm migration:smoke`, `pnpm deployment:smoke`, and `pnpm perf:smoke`.
- Notes: This clears the local release-smoke blocker only. Final release acceptance still requires a hosted workflow run tied to the release candidate commit.

## Required Hosted Runs

Collect evidence for both workflows before final v1 acceptance:

| Workflow | Required trigger | Required result | Evidence required |
| --- | --- | --- | --- |
| `.github/workflows/release-smoke.yml` | Pull request or `main` push for the release commit | `pnpm release:smoke` succeeds in GitHub Actions | Run URL, commit SHA, branch/ref, completion time, and pass summary |
| `.github/workflows/docs-site.yml` | `main` push after Pages is enabled, or an owner-approved equivalent publication run | Docs build succeeds and Pages deploy completes | Run URL, commit SHA, published Pages URL, completion time, and pass summary |

If the release owner intentionally accepts a different hosted CI provider, record the provider, run URL, and the exact command parity with the GitHub Actions workflow.

## Evidence Template

Copy one block per workflow into the release evidence log:

```md
## Hosted Workflow Evidence: <workflow name>

- Date:
- Operator:
- Workflow file:
- Trigger: pull_request / push to main / workflow_dispatch / equivalent hosted CI
- Branch or ref:
- Commit SHA:
- Run URL:
- Result: pass / fail / skipped
- Release command or build command:
- Duration:
- Artifact URL, if any:
- Published URL, if docs-site deploy:
- Required checks observed:
- Issues filed:
- Blockers:
- Notes:
```

## Acceptance Criteria

The release-smoke hosted pass is acceptable only when:

- The workflow run is tied to the release candidate commit or an owner-approved successor commit.
- The run completes successfully without rerunning with uncommitted local changes.
- The `Run release smoke` step executes `pnpm release:smoke`.
- Any manually rerun job records the final run attempt URL.

The docs-site publication pass is acceptable only when:

- The docs build runs `pnpm docs:site:check`.
- The Pages deployment completes successfully for the release docs commit.
- The published URL is reachable by the release owner.
- The published documentation does not expose secrets, local filesystem paths, provider tokens, or non-public evidence attachments.

## Failure Handling

If a workflow fails:

- Record the failing job and step name.
- Link the failing run URL.
- File or link the remediation issue.
- Re-run only after committing the fix or recording an explicit owner-approved infrastructure retry.
- Do not mark the release-smoke or docs-publication blocker complete until a successful hosted run is attached.

## Release Rule

The local docs renderer and local release smoke are preflight checks. v1.0 final acceptance still needs successful hosted evidence for both the release smoke workflow and the public documentation publication workflow, unless the release owner explicitly descopes or replaces a hosted workflow with an equivalent audited release gate.
