# v1 Release Checklist

Status: release-owner checklist for the v1.0 release candidate. This checklist is not completion evidence by itself; attach pass/fail output to the linked verification documents.

## Preflight

- Confirm the release commit is the intended final candidate and has no uncommitted product or documentation changes.
- Run `pnpm install --frozen-lockfile`.
- Run `pnpm release:smoke`.
- Run `pnpm docs:site:test` if verifying publication guards outside the full release smoke run.
- Run `pnpm docs:site:check`.
- Run `pnpm identity:smoke` only when real OIDC/SCIM sandbox variables are configured; skipped output does not satisfy provider readiness.
- Run `pnpm v1:release:handoff` to print the current release-evidence destinations and checked commit.
- Run `pnpm v1:evidence:templates` if release owners need ready-to-fill evidence blocks with the checked commit prefilled. If evidence is committed after the hosted run, set `OTTE_RELEASE_COMMIT` to the hosted workflow commit SHA when generating templates.
- Run `pnpm v1:evidence:check`; it must pass before v1.0 is declared ready. If evidence is committed after the hosted run, set `OTTE_RELEASE_COMMIT` to the hosted workflow commit SHA when running the verifier.
- Confirm `docs/verification/v1-gap-closure-completion-audit.md` has no unowned local/code gaps.
- Confirm open GitHub issues have no P0/P1 labels, or record explicit owner approval for any accepted risk.

## External Evidence

- Record live OIDC/SCIM sandbox evidence in `docs/verification/identity-provider-smoke-evidence.md`, including exact `pnpm identity:smoke` command parity, exit code `0`, matching commit, non-placeholder API host/provider/sandbox/smoke-target details, and passing OIDC plus SCIM readiness summaries.
- Record assistive-technology pass evidence in `docs/verification/accessibility-assistive-tech-pass.md`, using one pass or pass-with-issues section per required environment.
- Record external GM validation in `docs/verification/external-gm-validation.md`, including tester role, relationship to project, setup path, scenario data, workflows completed, matching commit, and pass or pass-with-issues result.
- Record hosted release-smoke and docs-publication evidence in `docs/verification/release-workflow-evidence.md`, including matching commit, exact command parity, pass result, and concrete hosted run URLs.
- If GitHub Pages is unavailable, record the owner-approved equivalent hosted publication provider, URL, release commit SHA, concrete run URL, command parity with `pnpm docs:site:check`, and public-site secret review.

## Publication

- Publish release notes from `docs/release/v1.0.md`.
- Publish public docs from `docs/site/index.md`.
- Confirm the published docs expose no secrets, local filesystem paths, provider tokens, private evidence attachments, or sandbox credentials.
- Tag the release only after the hosted release-smoke pass and public documentation publication are recorded for the verifier target commit.

## Rollback Plan

- Keep the previous release artifact, previous container image or deployment revision, SQLite backup, asset-storage backup, and current release commit SHA available before promotion.
- If release smoke fails before promotion, stop the release, keep the candidate untagged, file or link the blocker, and rerun only after committing a fix or recording an owner-approved infrastructure retry.
- If docs publication fails, leave the product release blocked unless the owner records an equivalent hosted publication.
- If hosted deployment fails after promotion, roll traffic back to the previous deployment revision and record the failed revision, rollback time, and user-visible impact.
- If storage migration or integrity checks fail, stop the app, restore the most recent verified SQLite backup and asset-storage backup, rerun the restore drill, and keep the failed store copy for investigation.
- If OIDC/SCIM readiness fails, disable the affected provider integration or keep local-account access as the supported path until a clean provider smoke is recorded.
- If external GM or assistive-technology evidence fails, keep v1.0 in candidate status and file issues for each failed scenario before another release decision.

## Final Decision

Only declare v1.0 ready when every required evidence document has a pass result or an explicit owner-approved substitution/descope, `pnpm v1:evidence:check` passes, and `docs/verification/v1-gap-closure-completion-audit.md` no longer lists incomplete blockers. Placeholder or template-choice override values such as `none`, `n/a`, `tbd`, `pending`, `<approval summary>`, or `approved / not approved` do not count as owner approval.
