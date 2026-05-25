# OpenTabletop Public Documentation

Status: public documentation index for the v1.0 release candidate.

This page is the Markdown source for the public documentation site. `pnpm docs:site:check` renders the site to `dist/docs-site`, and `.github/workflows/docs-site.yml` publishes that artifact to GitHub Pages from `main` when Pages is enabled for the repository. The canonical source remains versioned in this repository.

## Start Here

- [README](../../README.md): product scope, local development, release tracks, content safety, and licensing.
- [Roadmap](../ROADMAP.md): release tracks from public alpha through v1.0.
- [Changelog](../../CHANGELOG.md): versioned release history and upgrade notes.
- [v1.0 Release Notes](../release/v1.0.md): v1.0 candidate highlights, compatibility guarantees, known limitations, and release gate.
- [v1 Release Checklist](../release/v1-release-checklist.md): release-owner preflight, publication, evidence, and rollback plan.

## GM and Player Guides

- [First-run GM guide](../dogfood/first-run-gm-guide.md)
- [Invite and session guide](../dogfood/invite-session-guide.md)
- [Player guide](../dogfood/player-guide.md)
- [Run your first session checklist](../dogfood/run-your-first-session-checklist.md)
- [Troubleshooting](../dogfood/troubleshooting.md)
- [Issue reporting](../dogfood/issue-reporting.md)

## Operator Guides

- [Self-hosting](../deployment/self-hosting.md)
- [Hosted deployment recipes](../deployment/hosted-deployment-recipes.md)
- [Railway persistence](../deployment/railway-persistence.md)
- [Upgrade guide](../deployment/upgrade-guide.md)
- [Backup and restore](../deployment/backup-restore.md)
- [Identity provider setup](../deployment/identity-providers.md)
- [Audio and video integrations](../deployment/audio-video-integrations.md)
- [Security checklist](../deployment/security-checklist.md)
- [Admin observability checklist](../deployment/admin-observability-checklist.md)

## Developer and Extension Guides

- [REST API](../api/rest.md)
- [API Client](../api-client.md)
- [Plugin SDK](../plugin-sdk/overview.md)
- [System SDK](../system-sdk/overview.md)
- [Extension package CI](../extension-ci.md)
- [AI overview](../ai/overview.md)
- [Architecture overview](../architecture/overview.md)

## Verification and Release Evidence

- [v1.0 gap closure PRD](../prd-v1-gap-closure.md)
- [v1 gap closure completion audit](../verification/v1-gap-closure-completion-audit.md)
- [v1 release owner handoff](../verification/v1-release-owner-handoff.md)
- [External GM validation evidence](../verification/external-gm-validation.md)
- [Identity provider smoke evidence](../verification/identity-provider-smoke-evidence.md)
- [Release workflow evidence](../verification/release-workflow-evidence.md)
- [Assistive technology pass plan](../verification/accessibility-assistive-tech-pass.md)
- [v0.3 dogfood readiness](../verification/v0.3-dogfood-readiness.md)

## Publication Requirements

- Keep documentation in `docs/` and release history in `CHANGELOG.md` before publishing a hosted site.
- Run `pnpm docs:site:check` before changing the hosted documentation workflow.
- Run `pnpm release:smoke` and `pnpm v1:completion:audit` against the verifier target commit from a clean worktree before declaring v1.0 ready. The completion audit wraps `pnpm v1:worktree:check`, `pnpm v1:evidence:check`, `pnpm v1:issues:check`, and `pnpm docs:site:check`.
- Link each released version to its release notes and verification artifact.
- Do not publish v1.0 documentation as final until `docs/prd-v1-gap-closure.md` release gates are satisfied or explicitly descoped.
- Keep public docs free of secrets, provider tokens, proprietary content, and internal filesystem paths.
