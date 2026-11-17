# Bounded campaign archive streaming verification

Date: 2026-07-13

Status: implemented and focused regression coverage passing.

## Public transport

- Media type: `application/vnd.open-tabletop.ottx-stream`
- Export: `GET /api/v1/campaigns/{campaignId}/export/stream`
- Import: `POST /api/v1/import/campaign/stream`
- The API contracts and generated OpenAPI surface describe both routes as binary transport operations.
- The TypeScript client exposes `exportCampaignStream(...)` as a raw `Response` for direct piping and `importCampaignStream(...)` for `BodyInit` sources, including browser or Node `ReadableStream` bodies.

The frame starts with `OTTXSTRM1\n`, followed by length-delimited JSON campaign metadata with `files` omitted. Each asset uses a bounded JSON header, raw asset bytes, and a 32-byte SHA-256 digest. A zero-length asset header terminates the stream.

## Exact limits and buffer envelope

| Boundary | Default | Configured range or hard cap |
| --- | ---: | ---: |
| JSON metadata | 64 MiB | `OTTE_CAMPAIGN_ARCHIVE_IMPORT_MAX_BYTES`, clamped to 2-256 MiB |
| One raw asset | 25 MiB | Same runtime upload limit (`maxAssetBytes`) |
| Aggregate raw assets | 48 MiB | `OTTE_CAMPAIGN_ARCHIVE_EMBEDDED_ASSET_MAX_BYTES`, clamped to 1-192 MiB |
| Asset header | 64 KiB | Hard protocol cap |
| Exported asset chunk | 64 KiB | Hard implementation cap |
| Parser consume/write chunk | 64 KiB | Hard implementation cap |
| Digest | 32 bytes | SHA-256 binary trailer |

The deterministic memory-envelope fixture moves a 4,194,321-byte asset through the encoder and parser. Instrumentation observes exactly 65,536 bytes for the largest exported asset chunk, imported asset chunk, parser input chunk, and parser-owned pending buffer. The asset is more than 64 times larger than each owned chunk. The storage test double throws if export attempts a whole-buffer `read()`, proving the path uses provider streaming.

Metadata is still parsed as bounded JSON; the bounded-memory requirement applies to the large asset payload that previously required a complete base64 string and joined encoded copy. Import writes verified raw chunks to a temporary file and never constructs an in-memory base64 asset.

## Compatibility and behavior preservation

- Existing `GET /api/v1/campaigns/{campaignId}/export` and `POST /api/v1/import/campaign` JSON/base64 behavior remains available and unchanged.
- Both transports share archive schema versions, scope/collection selection, conflict modes, optional ID regeneration, identity normalization, reference validation, permission checks, and result shape.
- Stream imports require `Idempotency-Key`; replay uses the stable SHA-256 digest of the framed request and returns `Idempotency-Replayed: true`.
- Existing-campaign stream imports require the exact `expectedUpdatedAt` query revision, reject multi-existing-campaign requests, and advance the imported campaign revision on commit, matching the JSON import contract.
- Export keeps backpressure by returning a Node readable stream. Import authentication runs before the custom content parser, so an anonymous invalid body returns `401` without parsing or staging.
- Every file is checked against declared size, asset metadata, aggregate limits, and both the frame digest and asset checksum before state or object mutation.
- Object writes use the existing compensating restore journal. Previous objects are snapshotted before the first write; state persistence failure or cancellation rolls objects back, and successful durable completion removes staging data.

No AI agent behavior, policy, prompt, tool execution, provider configuration, or proposal/apply flow was changed for this work.

## Regression evidence

Focused API stream suite:

```text
corepack pnpm --filter @open-tabletop/api exec vitest run src/archive-stream.test.ts
Test Files  1 passed (1)
Tests       4 passed (4)
```

Coverage includes:

1. Authentication occurs before parsing an invalid stream body.
2. Exact 64 KiB encoder/parser buffer instrumentation for a 4 MiB-plus asset.
3. A 2,097,149-byte near-limit asset exports below 110% of raw size, imports into a clean store, preserves SHA-256 bytes, supports ID regeneration, and replays idempotently.
4. A corrupted digest returns `400` before engine-state or object-storage mutation.

Legacy restore regression:

```text
corepack pnpm --filter @open-tabletop/api exec vitest run src/archive-recovery.test.ts
Test Files  1 passed (1)
Tests       8 passed (8)
```

Client regression:

```text
corepack pnpm --filter @open-tabletop/api-client exec vitest run src/index.test.ts
Test Files  1 passed (1)
Tests       21 passed (21)
```

Contract runtime regression:

```text
corepack pnpm --filter @open-tabletop/api exec vitest run src/openapi-runtime-validation.test.ts
Test Files  1 passed (1)
Tests       5 passed (5)
```

The API, API contracts, and API client packages were also built and typechecked successfully after the stream implementation.
