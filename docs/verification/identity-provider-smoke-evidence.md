# Identity Provider Smoke Evidence

Status: v1.0 candidate verification template. This document defines the release evidence required for the live OIDC/SCIM provider sandbox pass. It is not completed evidence by itself.

`pnpm identity:smoke` is optional in local development and skips when sandbox configuration is absent. A skipped run does not count as final identity-provider evidence.

## Required Environment

Run the smoke against one real release-owner identity-provider sandbox before final v1 acceptance. Prefer the provider expected for the first production deployment, such as Okta or Microsoft Entra ID.

Record the provider product and sandbox tenant, but redact tenant-specific secrets and any non-test identities.

## Prerequisites

For a deployed API smoke:

- A reachable API base URL.
- A server-admin bearer token for `OTTE_IDENTITY_SMOKE_ADMIN_TOKEN`.
- A SCIM bearer token for `OTTE_SCIM_BEARER_TOKEN`.
- Provider-side OIDC callback configured to `/api/v1/auth/oidc/callback`.
- Provider-side SCIM base URL configured to `/api/v1/scim/v2`.

For a local in-memory sandbox smoke:

- `OTTE_OIDC_ISSUER`.
- `OTTE_OIDC_CLIENT_ID`.
- `OTTE_OIDC_CLIENT_SECRET`.
- `OTTE_OIDC_REDIRECT_URI`.
- `OTTE_SCIM_BEARER_TOKEN`.
- `OTTE_WEB_ORIGIN` or `OTTE_OIDC_ALLOWED_RETURN_ORIGINS` when browser return-origin checks are in scope.

Do not commit `.env` files, bearer tokens, client secrets, provider private keys, or raw provider diagnostic exports.

## Commands

Deployed API:

```bash
OTTE_IDENTITY_SMOKE_BASE_URL=https://api.example.test \
OTTE_IDENTITY_SMOKE_ADMIN_TOKEN=<redacted-admin-token> \
OTTE_SCIM_BEARER_TOKEN=<redacted-scim-token> \
pnpm identity:smoke
```

Local sandbox:

```bash
OTTE_OIDC_ISSUER=https://issuer.example.test \
OTTE_OIDC_CLIENT_ID=<redacted-client-id> \
OTTE_OIDC_CLIENT_SECRET=<redacted-client-secret> \
OTTE_OIDC_REDIRECT_URI=http://localhost:4000/api/v1/auth/oidc/callback \
OTTE_SCIM_BEARER_TOKEN=<redacted-scim-token> \
pnpm identity:smoke
```

PowerShell operators can set the same variables with `$env:NAME = "value"` before running `pnpm identity:smoke`.

Hosted owner-triggered smoke:

1. Add the same values as GitHub repository secrets. For a deployed API, set `OTTE_IDENTITY_SMOKE_BASE_URL`, `OTTE_IDENTITY_SMOKE_ADMIN_TOKEN`, and `OTTE_SCIM_BEARER_TOKEN`. For a local-sandbox style hosted run, set `OTTE_OIDC_ISSUER`, `OTTE_OIDC_CLIENT_ID`, optional OIDC companion secrets, and `OTTE_SCIM_BEARER_TOKEN`.
2. Run `.github/workflows/identity-smoke.yml` with `workflow_dispatch` and choose `deployed-api` or `local-sandbox`.
3. Record the workflow run URL, commit SHA, exact `pnpm identity:smoke` command, exit code, and redacted pass summary in the evidence block below.
4. Do not paste secret values into the workflow summary, issue comments, or this document.

## Acceptance Criteria

The pass is acceptable only when:

- `pnpm identity:smoke` exits `0`.
- The run is not skipped.
- If run in GitHub Actions, `.github/workflows/identity-smoke.yml` completes successfully on the same checked release commit and does not fail the required-secret preflight.
- The evidence block's `App build or commit` matches the checked release commit, using either the full 40-character SHA or an unambiguous Git prefix of at least 7 characters.
- The redacted admin OIDC/SCIM test-connection route reports OIDC readiness against live provider discovery.
- The SCIM service-provider config endpoint succeeds with bearer authentication.
- Output and attached notes contain no bearer tokens, client secrets, auth codes, refresh tokens, identity claims for real users, or full tenant-specific diagnostic payloads.
- The evidence block below is attached to the release record.

## Evidence Template

Current verifier target for the latest hosted release-smoke/docs publication evidence: `def4f408a6c48cb297c9f08d04aee375d13fd382`.

Copy one block per provider sandbox into the release evidence log:

```md
## Identity Provider Smoke: <provider and sandbox>

- Date: 2026-05-15
- Operator:
- App build or commit: def4f408a6c48cb297c9f08d04aee375d13fd382
- API base URL host:
- Provider:
- Provider sandbox or tenant label:
- Smoke target: deployed API / local sandbox
- Command: pnpm identity:smoke
- Hosted workflow run, if used:
- Result: pass / fail / skipped
- Exit code:
- OIDC discovery/test result:
- SCIM ServiceProviderConfig result:
- SCIM Users/Groups provisioning check, if performed:
- Redacted output attached:
- Audit export attached, if performed:
- Issues filed:
- Blockers:
- Notes:
```

## Redaction Rules

Before attaching evidence:

- Replace bearer tokens, client secrets, auth codes, refresh tokens, and private keys with `<redacted>`.
- Replace real user emails, names, and subject identifiers with test-account labels unless the identity is already public release-owner metadata.
- Trim provider URLs to host or sandbox label when the path/query contains tenant ids, auth state, or diagnostic tokens.
- Keep environment variable names visible when useful, but do not include their values.
- Do not paste raw JWTs. If claim shape matters, record only the claim names and redacted test-account labels.

## Failure Handling

If the smoke fails or skips:

- Record the exact failing check.
- Keep skipped output separate from pass evidence.
- File or link the remediation issue.
- Do not mark the OIDC/SCIM provider-readiness blocker complete until a non-skipped pass is attached.

## Release Rule

The identity smoke harness verifies OpenTabletop's OIDC/SCIM integration posture against a configured provider sandbox. It does not replace provider-side production change review, IdP administrator approval, or a separate security review of secrets handling.
