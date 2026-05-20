# Identity Provider Setup

OpenTabletop supports local password users, optional OIDC single sign-on, and optional SCIM 2.0 user/group provisioning. The runtime and Admin Auth Setup panel report only readiness booleans and affected environment variable names; do not paste provider secrets into logs, issues, or campaign notes.

Common OpenTabletop values:

- OIDC callback path: `/api/v1/auth/oidc/callback`
- SCIM base path: `/api/v1/scim/v2`
- SCIM service provider config: `/api/v1/scim/v2/ServiceProviderConfig`
- SCIM users endpoint: `/api/v1/scim/v2/Users`
- SCIM groups endpoint: `/api/v1/scim/v2/Groups`
- Browser return origin: `OTTE_WEB_ORIGIN` or `OTTE_OIDC_ALLOWED_RETURN_ORIGINS`

## Okta

OIDC:

1. Create an OIDC web application integration.
2. Add the externally reachable API callback URL, for example `https://api.example.com/api/v1/auth/oidc/callback`.
3. Enable authorization-code flow.
4. Set `OTTE_OIDC_ISSUER` to the Okta authorization server issuer.
5. Set `OTTE_OIDC_CLIENT_ID`, `OTTE_OIDC_CLIENT_SECRET`, and `OTTE_OIDC_REDIRECT_URI`.
6. Set `OTTE_WEB_ORIGIN` or `OTTE_OIDC_ALLOWED_RETURN_ORIGINS` to the web app origin.

SCIM:

1. Create a SCIM 2.0 app integration.
2. Set the SCIM base URL to `https://api.example.com/api/v1/scim/v2`.
3. Use bearer token authentication with `OTTE_SCIM_BEARER_TOKEN`.
4. Push groups from Okta, then map group display names or external ids to campaign roles in Admin Auth Setup.

## Microsoft Entra ID

OIDC:

1. Register a web application.
2. Add the API callback URL as a web redirect URI.
3. Create a client secret.
4. Use the tenant v2.0 issuer for `OTTE_OIDC_ISSUER`.
5. Set `OTTE_OIDC_CLIENT_ID`, `OTTE_OIDC_CLIENT_SECRET`, `OTTE_OIDC_REDIRECT_URI`, and the allowed browser return origin.

SCIM:

1. Create or select an Enterprise Application with provisioning.
2. Set tenant URL to `https://api.example.com/api/v1/scim/v2`.
3. Use bearer token authentication with `OTTE_SCIM_BEARER_TOKEN`.
4. Provision selected users and groups, then map groups to campaign roles by display name, external id, or group id.

## Google Workspace

OIDC:

1. Create an OAuth web client.
2. Add the API callback URL.
3. Use Google's accounts issuer for `OTTE_OIDC_ISSUER`.
4. Set `OTTE_OIDC_CLIENT_ID`, `OTTE_OIDC_CLIENT_SECRET`, `OTTE_OIDC_REDIRECT_URI`, and the browser return origin.

SCIM:

Google Workspace does not provide generic SCIM provisioning for all editions. Use a SCIM-capable identity bridge or a directory that can push users and groups to the OpenTabletop SCIM base path.

## Generic OIDC And SCIM

OIDC providers must support issuer discovery and authorization-code login. Configure the provider callback to the API callback path and ensure the browser return origin matches the deployed web app.

SCIM clients should call the service-provider config first, then provision users and groups through the Users and Groups endpoints. Group-to-campaign role mapping is intentionally explicit: provisioning a group creates directory inventory, while Admin Auth Setup decides which campaign role that group receives.

## Verification

After changing identity provider configuration:

1. Refresh the Admin tab.
2. Check the Auth Setup OIDC and SCIM readiness tiles.
3. Run **Test OIDC** and **Test SCIM**. Results are redacted and should show pass/block/fail checks without provider URLs, client secrets, bearer tokens, or returned identity claims.
4. Export redacted audit logs if you need an incident or compliance record.

For release evidence against a real sandbox, run the optional identity smoke and record the pass with `docs/verification/identity-provider-smoke-evidence.md`:

```bash
pnpm identity:smoke
```

For a deployed API, set `OTTE_IDENTITY_SMOKE_BASE_URL`, `OTTE_IDENTITY_SMOKE_ADMIN_TOKEN`, and `OTTE_SCIM_BEARER_TOKEN`. The smoke posts to the redacted admin OIDC/SCIM test-connection route and checks the SCIM service-provider config endpoint with bearer auth. For a local sandbox app, set the normal `OTTE_OIDC_*` values plus `OTTE_SCIM_BEARER_TOKEN`; the smoke starts an in-memory API and verifies live OIDC issuer discovery plus SCIM readiness. With no sandbox variables configured, the smoke is reported as skipped and does not count as live IdP evidence.

Release owners can also run `.github/workflows/identity-smoke.yml` with `workflow_dispatch` after storing those values as repository secrets. Use the `deployed-api` target for a reachable release-candidate API and the `local-sandbox` target for a hosted run that starts the in-memory API against live OIDC/SCIM sandbox settings. The workflow fails before running the smoke if the required secrets for the selected target are missing.
