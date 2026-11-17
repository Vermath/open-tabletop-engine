# AI safety, privacy, and citation verification — 2026-07-13

> Product-owner direction: this file records the existing AI implementation only. It does not impose a proposal-only requirement or authorize changes to the agent. The non-AI remediation program intentionally leaves AI behavior, permissions, providers, and autonomy modes unchanged.

## Shipped boundary

- Campaign prose and imported PDF text are sent to the supported Codex app-server adapter only inside source-addressed `contentBlocks` labelled `untrusted_data`. Provider instructions explicitly reject commands, role changes, permission claims, and tool requests found inside those blocks.
- Provider context is permission-filtered before source registration. A second campaign-policy scope filter removes sources outside `public` or `gm_private` before serialization.
- Retrieval results attach structured `aiSources`. Open-rules results preserve compendium provenance/version/license; journal, chat, roll, scene, actor, item, and handout results are labelled untrusted unless a journal revision was explicitly reviewed as canonical.
- Model citation claims are accepted only as structured metadata and validated against the exact source registry advertised or returned during that turn. Unknown source IDs and locator mismatches remain `unsupported`.
- A rules response following `read_compendium` receives a visible warning when it has no verified `official_open_rules` citation. Natural-language citation-looking text is not parsed or promoted.
- AI state changes continue through the existing permission-checked proposal or governed automatic-execution path selected by configuration. Malicious campaign content cannot add permissions, advertise hidden tools, change the configured autonomy mode, or disable revision and audit guards.

## Policy and local retention

- Installation controls: `OTTE_AI_ENABLED`, `OTTE_AI_CONTEXT_SCOPES`, `OTTE_AI_RETENTION_DAYS`, and `OTTE_AI_PROVIDER_TRANSMISSION_DISCLOSURE`.
- Production fails provider calls closed when enabled policy is incomplete or unsafe. An explicit `OTTE_AI_ENABLED=false` is a safe production posture.
- Campaign policy inspection is available to campaign readers. Mutation requires `campaign.update`, optimistic `expectedRevision`, and `Idempotency-Key`; changes are aggregate-audited and broadcast in realtime.
- Privacy preview returns only exact category counts. Pruning is campaign-bounded, limited to at most 1,000 threads per request, defaults to dry-run, and requires an explicit confirmation string for deletion.
- Pruning deletes local AI threads, their tool calls, and evaluations. It deliberately preserves proposals, AI memory (including approved canon), and aggregate audit logs.
- Local retention controls make no provider-deletion claim. Provider-side retention and deletion remain governed by the configured provider/account.

## Focused verification

The focused suites cover:

- malicious journal content remaining untrusted data;
- permission and autonomy-mode escalation attempts failing at the host tool boundary;
- exact-registry citation verification, unknown IDs, and locator mismatch;
- production fail-closed policy posture and public-only scope denial;
- revision-guarded campaign policy updates and player mutation denial;
- count-only privacy previews, explicit confirmation, bounded deletion, and canon/proposal preservation;
- accessible policy, retention, source, provenance, unsupported-citation, and existing execution-mode UI states.

Run:

```powershell
node_modules\.bin\vitest.cmd run packages/ai-core/src/index.test.ts apps/api/src/ai-safety.test.ts apps/api/src/ai-safety-routes.test.ts
node_modules\.bin\tsc.cmd -p packages/core/tsconfig.json --noEmit
node_modules\.bin\tsc.cmd -p packages/ai-core/tsconfig.json --noEmit
node_modules\.bin\tsc.cmd -p packages/api-contracts/tsconfig.json --noEmit
node_modules\.bin\tsc.cmd -p packages/api-client/tsconfig.json --noEmit
node_modules\.bin\tsc.cmd -p apps/web/tsconfig.json --noEmit
```
