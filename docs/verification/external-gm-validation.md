# External GM Validation Evidence

Status: v1.0 candidate verification template. This document defines the release evidence required for the external GM validation pass. It is not completed evidence by itself.

The v1 release-candidate milestone in `docs/prd-v1-gap-closure.md` requires clean install, upgrade, dogfood, and external GM validation. Local dogfood and automated smoke gates do not replace an external GM pass.

## Required Participant

Use an unaffiliated GM, prospective self-hosting operator, or owner-approved substitute who was not the primary implementer of the release candidate.

Record the tester role and relationship to the project. Do not record private personal details beyond what the tester approves for release evidence.

## Required Scenario

The validation pass should cover one of these setup paths:

- Clean local install from the release candidate.
- Self-hosted deployment following `docs/deployment/self-hosting.md`.
- Hosted preview or equivalent deployment explicitly approved by the release owner.

The tester should attempt the core v1 GM flow:

- Reach first-run setup or sign in to the provided release-candidate deployment.
- Create or import a campaign.
- Set up a scene with a map, token, actor, journal note, and player-visible state.
- Send chat, roll dice, and inspect roll history.
- Start combat, advance turns/rounds, and apply at least one HP/resource/condition change.
- Use content import or archive import/export.
- Review AI proposal and plugin/system surfaces if enabled for the deployment.
- Download a report bundle or confirm the documented issue-reporting path.
- Record blocking confusion, missing docs, errors, or workflow failures.

## Acceptance Criteria

The pass is acceptable only when:

- The tester can reach a campaign without source-code knowledge or hand-held repo internals.
- The tester can complete a representative GM prep/play loop.
- Any critical setup, data-loss, auth, permission, import/export, or recovery blocker is filed or explicitly accepted by the owner.
- The result is recorded as pass, pass with issues, or fail.
- The evidence block's `App build or commit` matches the checked release commit, using either the full 40-character SHA or an unambiguous Git prefix of at least 7 characters.
- Evidence does not expose secrets, private player identities, provider tokens, or proprietary game content.

## Evidence Template

Copy one block into the release evidence log:

```md
## External GM Validation: <tester/session label>

- Date:
- Tester role:
- Relationship to project:
- App build or commit:
- Setup path: clean local install / self-hosted deployment / hosted preview / owner-approved substitute
- API URL, if deployed:
- Web URL, if deployed:
- Scenario data:
- Workflows completed:
- Result: pass / pass with issues / fail
- Issues filed:
- Blockers:
- Owner acceptance notes:
- Redacted screenshots/logs attached:
- Notes:
```

When the release owner explicitly accepts a substitute for the external GM pass, copy this separate override block instead of adding a placeholder override field to a pass block:

```md
## External GM Owner-Approved Substitution: <substitution label>

- Date:
- App build or commit:
- Owner-approved substitution: Release owner accepted the documented substitute validation path for this release candidate.
- Substitution used:
- Reason:
- Notes:
```

## Failure Handling

If the pass fails:

- Record the exact blocking workflow.
- File or link the remediation issue.
- Re-run after the fix or record explicit owner acceptance.
- Do not mark external GM validation complete until pass evidence or owner-approved substitution is attached. If the owner approves a substitute for the external GM pass, record a release-evidence line using the exact form `- Owner-approved substitution: Release owner accepted ...` or `- Owner-approved substitution: Release owner approved ...` with the concrete approval context so `pnpm v1:evidence:check` can verify the override. The verifier rejects blank, placeholder, pending, ambiguous, or negative values such as `none`, `n/a`, `tbd`, `Internal GM substitute`, `<approval summary>`, or `<explicit owner approval summary>`.
