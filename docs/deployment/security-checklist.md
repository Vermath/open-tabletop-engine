# Security Checklist

Use this operator checklist with the [deployment threat model](./threat-model.md). The threat model defines assets, trust boundaries, deployment modes, abuse cases, controls, and residual risk; this checklist does not replace the independent review required for a public release.

## Auth

- [ ] Keep `OTTE_ALLOW_LEGACY_USER_HEADER=false` outside tests unless legacy `x-user-id` auth is explicitly needed for local compatibility.
- [ ] Configure `OTTE_ADMIN_USER_IDS`.
- [ ] Use OIDC or local password users with MFA for shared dogfood servers.
- [ ] Serve the browser and `/api` from one HTTPS origin where possible; set `OTTE_WEB_ORIGIN` and `OTTE_CORS_ALLOWED_ORIGINS` exactly, keep `OTTE_SESSION_COOKIE_SECURE=true`, and remove the loopback-only insecure-cookie exception.
- [ ] Set `OTTE_TRUSTED_PROXY_HOPS` to the exact right-most trusted proxy count. Do not trust forwarded client or host headers on direct API exposure.
- [ ] Keep account/network login throttles and bounded asynchronous password verification enabled; use a shared edge limiter as well when more than one API process or public traffic is in scope.
- [ ] Verify the CSP is present at the public web origin, browser storage contains no `ots_` session secret, cross-origin cookie mutations fail, logout clears the cookie, and revoked sessions no longer authorize API or realtime access.
- [ ] Configure OIDC providers to return the literal JSON boolean `email_verified: true` only for addresses whose ownership they verified; missing, false, or string-valued claims are never used to link an existing local account.
- [ ] Store secrets in the host secret manager, not in repository files.

## Content And Imports

- [ ] Accept only original, SRD, open, or user-provided private-table content.
- [ ] Do not scrape D&D Beyond, Roll20, or other services.
- [ ] Do not bypass third-party auth or access controls.
- [ ] Review source, provenance, license usage, and warnings before applying content imports.
- [ ] Roll back or delete test content imports that should not remain in the campaign.

## Background Workers

- [ ] Use a dedicated `OTTE_WORKER_TOKEN`; never give a worker a human or server-admin session.
- [ ] Set `OTTE_WORKER_PROFILE_ENABLED=true` only after the API has valid named `OTTE_WORKER_TOKEN_HASHES` and each worker has the matching plaintext token and stable `OTTE_WORKER_ID`.
- [ ] Keep plaintext worker tokens in the worker secret store only. Keep hashes in API configuration only, and verify neither value appears in logs, audits, images, or persisted campaign/job state.
- [ ] Rotate by overlapping old and new hashes for the same worker id, rolling every replica, then removing the old hash.
- [ ] Verify worker credentials are denied on user, plugin-admin, server-admin, and arbitrary campaign-read routes, and that dispatch is rejected after lease expiry or cancellation.
- [ ] Keep `OTTE_WORKER_ALLOW_LEGACY_SESSION_TOKEN=false`; deprecated session-token compatibility is non-production only and is hard-disabled in production.
- [ ] Set `OTTE_URL_SESSION_TOKEN_MODE=disabled` after confirming supported HTTP, asset and realtime clients use bearer headers, signed delivery URLs or the `otte.auth.*` WebSocket subprotocol; inspect the redacted `url_session_token` warning count first.

## Campaign Webhooks

- [ ] Limit webhook management to trusted campaign editors; every change is a confirmed `campaign.update` action. This checklist does not prescribe or restrict the existing AI agent behavior; plugin access remains governed by its installed campaign permissions.
- [ ] Store each one-time signing secret in the receiver's secret manager immediately. Never place it in source control, browser storage, logs, analytics, screenshots, or tickets.
- [ ] Verify HMAC-SHA256 against the exact raw body, reject timestamps outside a short replay window, compare fixed-length bytes in constant time, and deduplicate `eventId` before side effects. Use the [safe receiver example](../api/campaign-webhooks.md#safe-nodejs-verification-example).
- [ ] Rotate a lost or exposed secret and treat the old value as invalid immediately; update the receiver before testing.
- [ ] Keep production targets on HTTPS and review DNS/firewall/proxy paths. Do not weaken the server's block on credentials, query strings, fragments, redirects, or loopback/private/special-use network targets.
- [ ] Keep receiver body limits and timeouts bounded, return `2xx` quickly, and queue slow receiver work separately.
- [ ] Treat deliveries as at-least-once metadata notifications, not ordered campaign truth or authorization to mutate OpenTabletop.
- [ ] Confirm delivery logs and the OpenTabletop ledger contain only status/transport metadata, never request or response bodies, signature headers, or secrets.

## Plugins And Systems

- [ ] Use `OTTE_PLUGIN_TRUST_POLICY=require_trusted` before broad plugin distribution.
- [ ] Configure `OTTE_PLUGIN_TRUST_KEYS` outside the repository.
- [ ] Review pending plugin package versions before enabling `OTTE_PLUGIN_REVIEW_POLICY=require_approved`.
- [ ] Keep plugin permissions minimal and campaign-scoped.
- [ ] Keep `dnd-5e-srd` as the primary beta rules runtime unless the dogfood plan says otherwise.

## Assets

- [ ] Configure asset quota and retention.
- [ ] Store asset signing secrets such as `OTTE_ASSET_URL_SIGNING_SECRET` in the host secret manager.
- [ ] Keep asset trust scanning fail-closed in production.
- [ ] Keep external scanner destinations on HTTPS and public-address DNS only; redirects, credentials, query strings, fragments, loopback, private, link-local, and metadata-network targets must remain blocked by the shared outbound transport policy.
- [ ] Verify signed or CDN asset delivery does not expose storage credentials.
- [ ] Run asset storage/integrity checks before and after dogfood.

## Supply Chain

- [ ] Review weekly npm, Docker, and GitHub Actions update pull requests; keep lockfiles frozen and workflow actions pinned to immutable commits.
- [ ] Keep Compose images pinned to a reviewed release and multi-platform digest; never restore a floating `latest` image.
- [ ] Run the production advisory gate and archive both CycloneDX artifacts for every release candidate: the lockfile-derived API dependency SBOM and the Syft scan of the actual built API runtime image. Verify external Dockerfile bases and the scanner image remain digest pinned.

## Observability

- [ ] Keep `OTTE_OPERATIONS_METRICS=true` unless the host supplies equivalent instrumentation.
- [ ] Verify `GET /api/v1/admin/operations/metrics` is server-admin-only and contains fixed dimensions only: no campaign ids, user ids, credentials, request paths, private content, or other attacker-controlled labels.
- [ ] Keep logs and exported metrics redacted; correlate incidents by bounded UTC windows and existing audit ids rather than adding credentials or private tabletop data.
- [ ] Establish alert thresholds from measured hosted traffic and exercise the [Admin and Observability Checklist](./admin-observability-checklist.md) before release.
- [ ] Keep operational retention preservation-first. Require the exact dry-run target hash, bounded batch, idempotency key, and recorded reason; never prune canonical campaign state, audit, active idempotency, failed/retryable work, or archive recovery operations.

## AI

- [ ] AI tools remain permission-filtered.
- [ ] Preserve and verify both governed AI modes: `manual` leaves reviewable proposals and `auto` applies eligible work through the caller's permission, validation, revision, and audit path.
- [ ] Configure the enabled production policy with `OTTE_AI_CONTEXT_SCOPES`, `OTTE_AI_RETENTION_DAYS`, and `OTTE_AI_PROVIDER_TRANSMISSION_DISCLOSURE`; disabling the agent is an emergency/operator control, not the product baseline.
- [ ] Review every campaign's AI enablement and public/GM-private context scopes before production use.
- [ ] Confirm campaign/imported prose reaches the provider only as source-addressed `untrusted_data`, and prompt-injection tests still deny permission, validation, or execution-mode bypass.
- [ ] Confirm model citations are validated against structured advertised/returned source metadata; do not parse citation-looking prose.
- [ ] Exercise privacy preview before pruning, keep the 1,000-thread bound, and verify proposals, approved canon memory, and aggregate audit remain.
- [ ] Treat local retention and provider retention as separate controls; do not claim provider deletion without provider evidence.
- [ ] Review AI operation posture for failed/stale threads and proposal pressure.
- [ ] Do not store provider prompts, secrets, or proprietary content in verification artifacts.
