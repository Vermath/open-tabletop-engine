# Deployment Threat Model

Status: engineering threat model for the supported single-writer v1 architecture. Last reviewed against the working tree on 2026-07-13. An independent security review remains release-owner evidence, not something this document claims to replace.

## Scope and deployment modes

This model covers the web client, API, SQLite state, local or S3-compatible asset storage, background workers, installed rules systems/plugins, optional OIDC/SCIM, the Codex app-server AI agent, and outbound operational or campaign webhooks.

- **Local self-host:** one trusted operator, usually a trusted LAN or loopback boundary. Internet-origin attacks still matter if the service is exposed or if it fetches remote content.
- **Private hosted:** invited users and a trusted operator behind TLS. Members are not assumed to trust each other with private actor, GM, or administrative data.
- **Public hosted:** untrusted registration/invite traffic and hostile internet input. TLS, shared edge rate limiting, secret management, external asset scanning, monitoring, and incident response are required compensating controls.

The supported persistence boundary is one API writer per SQLite file. Multi-writer or multi-region operation is outside this threat model.

## Assets and security objectives

Protect:

- account credentials, bearer sessions, MFA material, OIDC/SCIM secrets, worker credentials, signing keys, and webhook secrets;
- private campaign, actor, journal, chat, AI-context, and asset data;
- the integrity and availability of SQLite state, uploaded objects, plugin packages, backups, and recovery manifests;
- permission, revision, idempotency, audit, proposal-review, and rules-preview boundaries;
- users' ability to export and restore their campaign without silent loss or cross-campaign disclosure.

Security objectives are least privilege, explicit authorization, confidentiality by visibility policy, reviewed consequential mutation, durable and attributable writes, bounded resource use, and recoverable state.

## Trust boundaries and data flow

1. The browser crosses the public network boundary to the API using a bearer session and WebSocket authentication. The browser is untrusted input, even for a GM.
2. The API is the authorization and campaign-state authority. Neither the browser, AI, plugins, nor workers may bypass its permission checks.
3. SQLite and asset storage form one recoverable campaign data set. Provider snapshots are operator-created and must be paired with the exact database recovery manifest.
4. A worker is a scoped service principal. Its lease authorizes one method, path, body, and time window; it is not a user or administrator.
5. Plugin/system packages and imported campaign prose are untrusted. Plugins run with explicit campaign grants; AI receives source-addressed untrusted data and may use either proposal review or governed automatic execution according to campaign policy. Both modes remain inside typed tools, permissions, revisions, validation, attribution, audit, and recovery controls.
6. OIDC/SCIM providers, Codex app-server, mail bridges, asset scanners, CDNs, and webhook receivers are external processors. Data disclosure to each is limited to the documented contract and requires operator configuration.

## Threats and required controls

| Threat | Required controls | Residual risk / operator action |
| --- | --- | --- |
| Credential theft, session replay, or account takeover | Hashed password/session storage, short opaque bearer tokens, MFA, verified OIDC subject first, literal-boolean verified-email linking, TLS, redacted logs | Configure provider MFA, rotate exposed credentials, review session-risk and login-failure operations |
| Broken object authorization or privilege escalation | Campaign membership plus explicit permission checks on direct-object routes, private-actor filtering, server-admin separation, negative authorization tests | Review custom role/grant changes and audit exports |
| Cross-site request or token leakage | Bearer auth rather than ambient cookies, allowlisted OIDC return origins, no session tokens in media URLs, signed short-lived asset URLs, request/log redaction | A compromised browser or extension can still act as that user |
| Stale, duplicate, or unreviewed state mutation | Exact revisions, idempotency keys, prepared previews for consequential D&D changes, atomic persistence, existing AI execution modes, permissioned plugin commands, auditable GM overrides | Manual GM edits remain authoritative overrides and must be reviewed in audit history |
| Prompt injection or malicious imported content | Source-addressed `untrusted_data`, scoped context, citation validation, permission-filtered typed tools, configured autonomy policy, local retention controls, and auditable recovery | Upstream provider retention and model behavior remain provider risks |
| Malicious plugin/system package | Root-confined package loading, checksums/signatures, trust and review policy, VM isolation, explicit campaign grants, and typed permission-checked application commands instead of direct storage writes | Public hosting should require trusted and approved versions; sandbox escape requires emergency disable/rotation |
| Malicious upload, archive, decompression, or storage exhaustion | MIME/signature checks, active-content rejection, optional fail-closed external scan, body and archive bounds, checksums, quotas, rendition limits, atomic staged import/rollback | Public hosting should use an external scanner and edge request limits |
| SSRF, DNS rebinding, webhook replay, or data exfiltration | HTTPS production targets, credential/query/fragment/redirect rejection, public-address validation and pinned delivery, HMAC timestamps/event ids, metadata-only campaign allowlist, absolute timeouts and bounded queues | Receivers must verify signatures and deduplicate events; operational webhooks still disclose documented metadata |
| Worker compromise or confused deputy | Dedicated hashed worker identities, exact leases, expiry/cancellation heartbeat, route/body binding, denial on user/admin/arbitrary reads | Rotate worker tokens and inspect job/audit posture after compromise |
| Denial of service | Edge plus in-process rate limits, payload/time/concurrency bounds, campaign quotas, bounded queues/ledgers, single-group capacity envelope | The in-process limiter is not globally shared; public hosting requires an edge limiter and monitoring |
| Data corruption, ransomware, or partial restore | Durable acknowledgements, SQLite backups/integrity checks, paired recovery manifests and asset snapshots, archive checksums, strict restore drills, retention | Backups sharing the same trust domain can be destroyed; keep access-controlled off-host snapshots and test restores |
| Secret or private-data disclosure through logs/exports | Structured redaction, safe audit summaries, archive/report exclusions, one-time secret display, no webhook bodies | Operators must secure logs, support bundles, backups, and downstream processors |
| Supply-chain compromise | Frozen lockfile, production dependency audit, SBOM generation, reviewed images/packages, plugin trust policy | Monitor advisories and rebuild from a trusted source after updates |

## Abuse cases by role

- A player attempts to read a private actor, hidden token, GM journal, another campaign, or server-admin route: deny and avoid disclosing object existence where practical.
- A player forges item price/provenance, revisions, prepared preview keys, or idempotency replays: validate trusted provenance and bind commits to current server state.
- A campaign editor configures an internal webhook target: reject private/special-use destinations before and at connection time.
- A malicious note instructs AI to reveal secrets or exceed its authority: treat it as untrusted context and enforce the same readable scope, typed-tool permissions, revisions, validation, audit, and recovery in both proposal and automatic modes.
- A worker or plugin reuses authority on a different route/campaign: reject because the lease/grant and human permission are both scoped.
- An operator restores a database with the wrong asset snapshot: strict recovery validation fails before replacement.

## Deployment requirements

Local self-hosting may accept loopback HTTP and the permissive development plugin policy. Private hosted deployments require TLS, durable coordinated backups, production auth posture, secret storage, and reviewed plugin/AI policies. Public hosted deployments additionally require a shared edge rate limiter, external upload scanning, alerting, off-host recovery points, routine dependency/SBOM review, and an independent security review.

Before release or a material architecture change, review this model alongside the [security checklist](./security-checklist.md), [hosted deployment recipes](./hosted-deployment-recipes.md), and [backup and restore guide](./backup-restore.md). Update it when a new external processor, credential class, direct mutation path, storage provider, or multi-node design is introduced.

## Explicit non-claims

This is not a penetration-test report, compliance certification, guarantee against compromised hosts/browsers/providers, or authorization for multi-node SQLite. Real identity-provider smoke tests, independent review, public load observations, incident exercises, and operator restore drills remain separate evidence gates.
