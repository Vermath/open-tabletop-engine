# Security Checklist

## Auth

- [ ] Keep `OTTE_ALLOW_LEGACY_USER_HEADER=false` outside tests unless legacy `x-user-id` auth is explicitly needed for local compatibility.
- [ ] Configure `OTTE_ADMIN_USER_IDS`.
- [ ] Use OIDC or local password users with MFA for shared dogfood servers.
- [ ] Store secrets in the host secret manager, not in repository files.

## Content And Imports

- [ ] Accept only original, SRD, open, or user-provided private-table content.
- [ ] Do not scrape D&D Beyond, Roll20, or other services.
- [ ] Do not bypass third-party auth or access controls.
- [ ] Review source, provenance, license usage, and warnings before applying content imports.
- [ ] Roll back or delete test content imports that should not remain in the campaign.

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
- [ ] Verify signed or CDN asset delivery does not expose storage credentials.
- [ ] Run asset storage/integrity checks before and after dogfood.

## AI

- [ ] AI tools remain permission-filtered.
- [ ] AI changes remain proposal based and require review.
- [ ] Review AI operation posture for failed/stale threads and proposal pressure.
- [ ] Do not store provider prompts, secrets, or proprietary content in verification artifacts.
