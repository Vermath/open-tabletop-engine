# Asset renditions and deduplication verification - 2026-07-13

## Delivered scope

- Raster uploads retain the original bytes as the authoritative asset and generate a bounded WebP thumbnail (maximum 320 px) plus an optimized WebP rendition (maximum 2048 px) when optimization produces an honest size reduction.
- Image decoding has a 40-megapixel safety ceiling. Unsupported or malformed images keep uploading as originals with a visible rendition warning instead of corrupting the asset transaction.
- Exact, clean, active uploads in the same campaign are deduplicated by checksum, size, and MIME type. Replays reuse the existing asset and can still assign it as a scene background without consuming duplicate storage quota.
- `GET /api/v1/assets/{assetId}/blob?variant=thumbnail|optimized` applies the same authentication, campaign permission, and signed-URL checks as the original. A missing derivative falls back to the original and returns `x-otte-rendition-fallback: original`.
- Campaign and admin storage reports count physical original and rendition bytes. Cleanup deletes rendition objects before the original.
- Scene, canvas, and content-import previews request thumbnails while full-resolution asset URLs remain available for the tabletop renderer.
- The OpenAPI contract describes image metadata, rendition metadata, upload deduplication/warnings, and the optional blob variant.

## Persistence and recovery behavior

Original bytes are the portable source of truth. Renditions are explicitly rebuildable caches: archive/export correctness does not depend on them, and a restored asset whose derivative object is absent safely serves the original. Storage-provider metadata remains attached to each rendition so cleanup and reads use the provider that actually owns the object.

## Focused evidence

```text
corepack pnpm --filter @open-tabletop/api test -- asset-renditions.test.ts
4 passed

corepack pnpm --filter @open-tabletop/api test -- asset-rendition-api.test.ts
2 passed

corepack pnpm --filter @open-tabletop/api test -- asset-renditions.test.ts asset-rendition-api.test.ts
6 passed

corepack pnpm --filter @open-tabletop/web test -- api.test.ts
17 passed

corepack pnpm --filter @open-tabletop/api-contracts test
28 passed

corepack pnpm --filter @open-tabletop/api-contracts test -- asset-rendition-contract.test.ts
2 passed

corepack pnpm --filter @open-tabletop/asset-edge test
9 passed

corepack pnpm --filter @open-tabletop/api typecheck
pass

corepack pnpm --filter @open-tabletop/web typecheck
pass

corepack pnpm --filter @open-tabletop/api-contracts typecheck
pass

corepack pnpm --filter @open-tabletop/asset-edge typecheck
pass
```

The asset pipeline uses `sharp` as a direct API dependency. It does not add remote image retrieval or proprietary content ingestion.
