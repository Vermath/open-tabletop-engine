# Release Workflow Evidence

Status: v1.0 candidate verification template. This document defines the live hosted workflow evidence required before v1.0 can be declared ready. It is not completed hosted evidence by itself.

Local commands such as `pnpm release:smoke` and `pnpm docs:site:check` are useful preflight checks, but final release evidence needs successful hosted runs for the release smoke workflow and the GitHub Pages documentation workflow.

## Local Preflight Evidence

- 2026-05-15: `pnpm release:smoke` passed locally on Windows from the repository root for pre-evidence-commit candidate `aa3ebb01984da59467207d3eb8c6b7bf0bacb0b5`.
- Covered gates: `pnpm check`, seeded and clean-bootstrap Playwright E2E, `pnpm security:smoke`, `pnpm migration:smoke`, `pnpm deployment:smoke`, `pnpm perf:smoke`, `pnpm docs:site:test`, `pnpm v1:evidence:test`, `pnpm v1:issues:test`, and live `pnpm v1:issues:check`.
- Notes: This clears the local release-smoke blocker for the pre-evidence-commit candidate only. Final release acceptance still requires a hosted workflow run tied to the release candidate commit.

## Hosted Workflow Evidence: Release Smoke

- Date: 2026-05-14
- Operator: Codex
- Workflow file: `.github/workflows/release-smoke.yml`
- Trigger: pull_request
- Branch or ref: `v1-gap-closure-evidence`
- Commit SHA: `4ae5e1e1df3ed3ae751ce8a4aa8b49279d661b42`
- Run URL: https://github.com/Vermath/open-tabletop-engine/actions/runs/25871961476
- Job URL: https://github.com/Vermath/open-tabletop-engine/actions/runs/25871961476/job/76029272957
- Result: pass
- Release command or build command: `pnpm release:smoke`
- Duration: 8m 4s
- Required checks observed: `Run release smoke` completed successfully after dependency install and Playwright Chromium setup.
- Issues filed: none
- Blockers: none for hosted release-smoke CI on this PR run
- Notes: PR evidence for `https://github.com/Vermath/open-tabletop-engine/pull/1`.

## Hosted Workflow Evidence: Docs Site PR Build

- Date: 2026-05-14
- Operator: Codex
- Workflow file: `.github/workflows/docs-site.yml`
- Trigger: pull_request
- Branch or ref: `v1-gap-closure-evidence`
- Commit SHA: `4ae5e1e1df3ed3ae751ce8a4aa8b49279d661b42`
- Run URL: https://github.com/Vermath/open-tabletop-engine/actions/runs/25871961487
- Job URL: https://github.com/Vermath/open-tabletop-engine/actions/runs/25871961487/job/76029272961
- Result: build pass; deploy skipped
- Release command or build command: `pnpm docs:site:check`
- Duration: 21s
- Published URL, if docs-site deploy: not published from PR
- Required checks observed: `Build public docs site` completed successfully; `Deploy public docs site` skipped because publication is gated to `main`.
- Issues filed: none
- Blockers: live GitHub Pages publication still required after `main` publication or owner-approved equivalent
- Notes: This is hosted build evidence only, not public Pages deployment evidence.

## Hosted Workflow Evidence: Docs Site Publication Attempt

- Date: 2026-05-14
- Operator: Codex
- Workflow file: `.github/workflows/docs-site.yml`
- Trigger: configuration attempt before publication
- Branch or ref: `v1-gap-closure-evidence`
- Commit SHA: `cb6a033`
- Run URL: not created
- Result: blocked before workflow dispatch
- Release command or build command: `gh api --method POST repos/Vermath/open-tabletop-engine/pages -f build_type=workflow`
- Duration: immediate API response
- Published URL, if docs-site deploy: not published
- Required checks observed: GitHub API returned `422` with `Your current plan does not support GitHub Pages for this repository.`
- Issues filed: none
- Blockers: current GitHub plan does not support Pages for this private repository; final docs publication needs owner-supported Pages enablement, repo visibility/plan change by the owner, or an owner-approved equivalent hosted publication.
- Notes: `.github/workflows/docs-site.yml` now uploads and deploys the Pages artifact on either `main` push or explicit `workflow_dispatch` once Pages is available, while PR runs remain build-only.

## Latest PR Check Observation

- Date: 2026-05-15
- Operator: Codex
- PR: https://github.com/Vermath/open-tabletop-engine/pull/1
- Remote head SHA: `fe140d7bbe86526fbb45a3d288410f30b713175d`
- Release Smoke run: https://github.com/Vermath/open-tabletop-engine/actions/runs/25897361976
- Release Smoke job: https://github.com/Vermath/open-tabletop-engine/actions/runs/25897361976/job/76113166287
- Release Smoke result: pass
- Docs Site run: https://github.com/Vermath/open-tabletop-engine/actions/runs/25897361971
- Docs Site build result: pass
- Docs Site deploy result: skipped on PR
- Notes: This confirms the remote PR head checks were green, but the local branch has additional unpushed commits. Final acceptance still needs hosted release-smoke and docs evidence tied to the final verifier target commit.

## Hosted Workflow Evidence: Release Smoke

- Date: 2026-05-15
- Operator: Codex
- Workflow file: `.github/workflows/release-smoke.yml`
- Trigger: pull_request
- Branch or ref: `v1-gap-closure-evidence`
- Commit SHA: `87b0190b573302d7e5c2c3d503066c1f7b21ce30`
- Run URL: https://github.com/Vermath/open-tabletop-engine/actions/runs/25914505406
- Job URL: https://github.com/Vermath/open-tabletop-engine/actions/runs/25914505406/job/76167682085
- Result: pass
- Release command or build command: `pnpm release:smoke`
- Duration: 11m 53s
- Required checks observed: `Run release smoke` completed successfully after dependency install and Playwright Chromium setup, including the release-smoke issue audit step.
- Issues filed: none
- Blockers: none for hosted release-smoke CI on this PR run
- Notes: PR evidence for `https://github.com/Vermath/open-tabletop-engine/pull/1`. If this evidence document is committed after the hosted workflow run, set `OTTE_RELEASE_COMMIT=87b0190b573302d7e5c2c3d503066c1f7b21ce30` before running final acceptance gates.

## Required Hosted Runs

Collect evidence for both workflows before final v1 acceptance:

| Workflow | Required trigger | Required result | Evidence required |
| --- | --- | --- | --- |
| `.github/workflows/release-smoke.yml` | Pull request or `main` push for the release commit | `pnpm release:smoke` succeeds in GitHub Actions, including the live `pnpm v1:issues:check` open-issue audit | Run URL, commit SHA, branch/ref, completion time, and pass summary |
| `.github/workflows/docs-site.yml` | `main` push or `workflow_dispatch` after Pages is enabled, or an owner-approved equivalent publication run | Docs build succeeds and Pages deploy completes | Run URL, commit SHA, published Pages URL, completion time, and pass summary |

If the release owner intentionally accepts a different hosted CI provider, record the provider, run URL, and the exact command parity with the GitHub Actions workflow.

When the evidence documents are updated in a follow-up commit after the hosted workflow runs, check the workflow commit explicitly:

```powershell
$env:OTTE_RELEASE_COMMIT = "<full-40-character-hosted-run-commit-sha>"
pnpm v1:completion:audit
pnpm v1:evidence:check
```

Without `OTTE_RELEASE_COMMIT`, the aggregate audit and evidence verifier check the current local `HEAD`.

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
- Run URL: https://
- Result: pass / fail / skipped
- Release command or build command:
- Duration:
- Artifact URL, if any:
- Published URL, if docs-site deploy: https://
- Required checks observed: include whether `pnpm release:smoke`, `pnpm v1:evidence:test`, `pnpm v1:issues:test`, and `pnpm v1:issues:check` completed successfully for release-smoke evidence.
- Issues filed:
- Blockers:
- Notes:
```

## Acceptance Criteria

The release-smoke hosted pass is acceptable only when:

- The workflow run is tied to the release candidate commit checked by `pnpm v1:completion:audit` and `pnpm v1:evidence:check`, or by setting `$env:OTTE_RELEASE_COMMIT = "<full-40-character-hosted-run-commit-sha>"` before both commands if evidence docs are committed afterward.
- The run completes successfully without rerunning with uncommitted local changes.
- The `Run release smoke` step executes `pnpm release:smoke`.
- The hosted release-smoke output includes successful `pnpm v1:issues:test` and `pnpm v1:issues:check` steps, proving the live open-issue P0/P1 audit passed in CI.
- Any manually rerun job records the final HTTPS run attempt URL.

The docs-site publication pass is acceptable only when:

- The docs build runs `pnpm docs:site:check`.
- The Pages deployment completes successfully for the release docs commit.
- The HTTPS published URL is reachable by the release owner.
- The published documentation does not expose secrets, local filesystem paths, provider tokens, or non-public evidence attachments.
- The evidence block records the checked release commit SHA, using either the full 40-character SHA or an unambiguous Git prefix of at least 7 characters.
- Owner-approved equivalent publication evidence is recorded inside a non-template hosted workflow evidence block with an HTTPS published URL, commit SHA, result, and command parity.

## Failure Handling

If a workflow fails:

- Record the failing job and step name.
- Link the failing run URL.
- File or link the remediation issue.
- Re-run only after committing the fix or recording an explicit owner-approved infrastructure retry.
- Do not mark the release-smoke or docs-publication blocker complete until a successful hosted run is attached.

## Release Rule

The local docs renderer and local release smoke are preflight checks. v1.0 final acceptance still needs successful hosted evidence for both the release smoke workflow and the public documentation publication workflow, unless the release owner explicitly descopes or replaces a hosted workflow with an equivalent audited release gate.
