# D&D character validation, review, and approval verification

Verified: 2026-07-13

## Delivered surface

- Shared, archive-portable types for campaign review policy, validation snapshots, submissions, decisions, statuses, stale evidence, and request payloads.
- A permission-filtered queue for every visible D&D character.
- Player/owner submission and resubmission with exact actor and owned-item revision guards.
- DM approval or requested changes, including required reasons for changes and validation overrides.
- Explicit campaign policy configuration. An absent policy resolves to optional, preserving existing campaign behavior.
- Required-policy gates before linked D&D character token placement and combat entry.
- Build fingerprints that ignore ordinary play-state churn while becoming stale after build-defining changes.
- Strict replay of persisted guided level-one choices. Imported, legacy, and homebrew actors without that provenance are not charged with unreconstructable creator choices.
- A Compendium-inspector workflow with loading, error, retry, stale, validation-detail, policy, submission, approval, requested-changes, and override states.
- Typed OpenAPI route helpers/specifications and `@open-tabletop/api-client` methods for the four endpoints.

## Safety invariants

- Character-review policy is opt-in and campaign-scoped.
- Submission requires the actor owner or explicit actor-update permission.
- Decisions require `campaign.update`.
- Every mutation requires an `Idempotency-Key` and current revisions.
- A decision applies only to a still-current submitted fingerprint.
- Validation errors cannot be approved without an explicit override and reason.
- Token/combat gates run before state mutation and return `409 character_approval_required`.
- Review state and manual exceptions survive campaign archive export/import.
- Review endpoints are classified as human-confirmed workflow and are not direct MCP/AI mutation tools.

## Executed verification

- `@open-tabletop/api`: `dnd-character-review.test.ts` — 4/4 passing.
- `@open-tabletop/api`: `dnd-character-review-api.test.ts` — 2/2 passing.
- `@open-tabletop/api-contracts`: focused contract plus central contract tests — 27/27 passing.
- `@open-tabletop/api-client`: focused client plus central route-coverage tests — 21/21 passing.
- `@open-tabletop/web`: `dnd-character-review-panel.test.tsx` — 3/3 passing.
- Core, API, contracts, client, and web TypeScript checks passed at the focused verification boundaries.

The integration suite proves the legacy optional default, player submission, clean approval, explicit policy activation, approved token placement, stale token/combat rejection without partial writes, resubmission, requested-changes reasons, audit actions, and archive portability. A separate forged-choice case tampers with persisted guided Fighter options, confirms a `creation.invalid_choice` validation error, proves ordinary approval is blocked, proves an override without a reason is rejected, and proves a reasoned override is portable.
