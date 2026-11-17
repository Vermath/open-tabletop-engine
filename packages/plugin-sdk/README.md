# OpenTabletop Plugin SDK

The package provides manifest validation, plugin contracts, and VM command authoring types. Import its public root with `@open-tabletop/plugin-sdk`. The package ships compiled JavaScript and declarations with no platform-core dependency; consumers do not inherit the repository tsconfig or run the package's source build scripts.

## Standalone typechecked command

Copy `examples/command-consumer.ts` and `examples/tsconfig.json` from this package's source checkout into a new directory outside the monorepo. Deliver the prebuilt SDK and optional offline compiler tarballs into its `vendor/` directory. The example itself imports only the public SDK package.

Create this consumer `package.json`:

```json
{
  "name": "standalone-plugin-author",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": { "typecheck": "tsc -p tsconfig.json" },
  "dependencies": {
    "@open-tabletop/plugin-sdk": "file:./vendor/open-tabletop-plugin-sdk-0.3.0.tgz"
  },
  "devDependencies": { "typescript": "file:./vendor/typescript-5.9.3.tgz" }
}
```

```sh
pnpm --ignore-workspace install --offline --ignore-scripts --store-dir ./pnpm-store
pnpm --ignore-workspace run typecheck
```

The compiler tarball is optional transport for an offline example; a connected author can install a pinned compiler normally. No core package, dependency override, repository-relative tsconfig, source alias, or API implementation import is needed.

`PluginRegisterCommand` types the global supplied inside the VM; it is not a runtime function exported by the SDK. The second handler argument is the existing `PluginBridgeContext`, including `createProposal`, `postChatMessage`, and `moveTokens`. A one-argument handler is also assignable. The example uses `noEmit`: do not execute it in Node. A deployable server entrypoint must be bundled as plain VM-compatible JavaScript rather than ordinary ESM emitted by TypeScript.

The live chat-command path awaits async handlers. Token input is controlled by the plugin's `token.read` grant and is campaign-scoped; the type does not promise active-scene or per-record visibility filtering. Storage input requires `plugin.configure` and is campaign/plugin-scoped. Returned chat and optional storage changes follow the existing proposal flow. Types do not change runtime permissions or the behavior of other bridges.


## Protocol compatibility

`PluginPermissionName` is the exact existing 18-name plugin allowlist. It is narrower than the platform's general permission type: callers passing unsupported names such as `campaign.update` now fail typechecking, matching the manifest validator's existing rejection. Valid manifests and runtime grants keep the same behavior.

The SDK owns its event metadata, proposal, and token-move request declarations. Actor and item proposal changes remain rename-only; other rules changes use typed system transactions. API-owned compile-time checks keep these wire shapes aligned with the host without importing platform types into the SDK.

## Package maintenance

Run package builds/packing from the repository. `prepack` builds current output; the exact `files` allowlist excludes source/config and compiled tests. Add every emitted production JavaScript/declaration pair when introducing a new production module. Installed consumers use the shipped declarations without rebuilding this package.

After changing author contracts, build the package and run the API's compile-only conformance fixture:

```sh
pnpm --filter @open-tabletop/plugin-sdk build
pnpm --filter @open-tabletop/api exec tsc -p type-tests/tsconfig.plugin-sdk.json
```

The package metadata remains `private: true`, version `0.3.0`, license `MIT`. Its production JavaScript and public declarations have no dependency on `@open-tabletop/core`. Packaging and local tarball consumption do not establish registry publication.
