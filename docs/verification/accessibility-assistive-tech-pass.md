# Assistive Technology Pass Plan

Status: v1.0 candidate verification plan. This document defines the required manual assistive-technology evidence that must supplement `tests/e2e/accessibility.spec.ts` before accessibility can be called complete.

Automated Playwright checks cover accessible names, landmark names, duplicate ids, visible focus, reduced motion, contrast samples, keyboard navigation, actor-sheet structure, and destructive-dialog keyboard behavior. They do not prove real screen-reader output, touch assistive workflows, or user comprehension.

## Required Environments

Run at least one pass in each environment before final v1 acceptance:

| Environment | Browser | Assistive technology | Purpose |
| --- | --- | --- | --- |
| Windows desktop | Firefox or Chrome | NVDA | Primary free screen-reader coverage for app navigation and forms. |
| Windows desktop | Edge | Narrator | Built-in Windows fallback and enterprise-user coverage. |
| macOS desktop | Safari | VoiceOver | WebKit and macOS screen-reader coverage. |
| iOS or iPadOS | Safari | VoiceOver | Touch-first screen-reader and rotor navigation coverage. |
| Android | Chrome | TalkBack | Touch-first Android coverage. |

If an environment is unavailable, record the omission explicitly with owner approval and substitute the closest available browser/assistive-technology pair.

## Scope

Each pass must use a clean or freshly seeded deployment and cover:

- First-run or sign-in flow.
- Campaign navigation and active workspace/campaign context.
- Scene canvas orientation, selected token summary, and token action controls.
- Chat history search/filter, whisper recipient selection, and message send.
- Dice formula entry, roll visibility, and roll history.
- Actor sheet tabs for stats, loadout, actions, resources, conditions, and full-sheet dialog.
- Content tab asset search, upload status, import validation report, and rollback controls.
- AI review queue, proposal diff/timeline, approve/apply, reject, memory approval/deletion, and recovery controls.
- SDK marketplace filters, permission review, install/upgrade/rollback controls, and blocked states.
- Admin production-readiness, storage backup/restore-drill, job ledger, audit export, auth setup, and plugin review controls.
- Mobile/tablet layout for navigation, canvas actions, and form controls.

## Acceptance Criteria

A pass is acceptable only when:

- Screen-reader navigation announces each page or panel with a useful landmark, heading, or region name.
- Form controls announce a label, value, required/disabled state where relevant, and error or status feedback after submit.
- Modal dialogs announce their title and description, trap focus, close with Escape where supported, and return focus predictably.
- Keyboard-only and screen-reader users can complete the covered workflows without pointer-only steps.
- Dynamic status updates are discoverable without relying on color, hover-only text, or visual placement.
- Canvas-adjacent controls expose enough nonvisual context to select tokens, inspect state, and perform common actions even if precise drag placement remains visual.
- No critical workflow has duplicate, misleading, or silent controls.
- The evidence block's `App build or commit` matches the checked release commit, using either the full 40-character SHA or an unambiguous Git prefix of at least 7 characters.

## Evidence Template

Copy one block per environment into the release evidence log:

```md
## Assistive Technology Pass: <environment>

- Date:
- Tester:
- App build or commit:
- API URL:
- Web URL:
- Browser:
- Assistive technology:
- Input method:
- Scenario data:
- Result: pass / pass with issues / fail
- Issues filed:
- Workflows completed:
- Blockers:
- Owner-approved descope: <explicit owner approval summary>
- Notes:
```

## Stop Conditions

Stop the pass and file a blocking issue if:

- A user cannot sign in or reach a campaign with the assistive technology enabled.
- The active campaign, active scene, or selected token cannot be identified nonvisually.
- A destructive action can be triggered without an announced confirmation context.
- A modal traps the user permanently or hides required controls from the accessibility tree.
- A core GM/player/admin workflow requires pointer-only input with no equivalent labelled control.

## Release Rule

The Playwright accessibility smoke is a regression gate, not a substitute for this manual pass. v1.0 final acceptance needs completed evidence for the required environments or an explicit owner-approved accessibility descoping note in `docs/prd-v1-gap-closure.md`.

If the owner explicitly descopes or substitutes part of the assistive-technology matrix, record a release-evidence line using the exact form `- Owner-approved descope: Release owner accepted ...` or `- Owner-approved descope: Release owner approved ...` with the concrete approval context. The `pnpm v1:evidence:check` gate only treats that explicit field as an override when the value itself says the owner accepted or approved it, and it rejects blank, placeholder, pending, ambiguous, or negative values such as `none`, `n/a`, `tbd`, `Temporary reduced matrix`, `<approval summary>`, or `<explicit owner approval summary>`.
