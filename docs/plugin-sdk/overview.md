# Plugin SDK

Plugins declare a manifest, requested permissions, UI panels, optional chat commands, and optional event subscriptions. The runtime grants only declared capabilities, and plugin-authored campaign writes always enter the normal proposal review workflow.

See:

- `packages/plugin-sdk`
- `plugins/example-macro-plugin`
- [Extension package CI](../extension-ci.md)

## Packaged Plugins

Local plugin packages live under `plugins/{packageId}` and are discovered from `plugin.manifest.json`. The manifest must include a semver-like `version`, a `compatibleCore` range, relative entrypoints, and requested permissions from the plugin allowlist.

Multiple package directories can provide the same plugin id at different versions. The catalog returns the latest version by default plus distribution metadata with `availableVersions` and `latestVersion`. Campaign install accepts an optional `version`; installs persist the selected package id, version, checksum, and install time in the plugin grant metadata. Reinstalling another available version upgrades or rolls back the campaign to that package, and command execution uses the installed grant version instead of silently running the latest package.

Server chat-command and event entrypoints run as JavaScript inside the API VM sandbox. The loader rejects absolute paths, package escapes, missing server files, unsupported permissions, and undeclared command or event handlers. The API exposes package source metadata, sandbox mode, and a SHA-256 checksum with the plugin catalog so GMs can review what is being installed.

Plugin packages can include `plugin.signature.json` next to the manifest. The signature file supports `{ "keyId": "...", "algorithm": "hmac-sha256", "signature": "..." }`; the signature covers the plugin id, version, manifest checksum, and server-entrypoint checksum. `OTTE_PLUGIN_TRUST_POLICY=allow_unsigned` is the local-development default. Set `OTTE_PLUGIN_TRUST_POLICY=require_trusted` and provide `OTTE_PLUGIN_TRUST_KEYS` such as `trusted-local=secret` to block unsigned or tampered packages from installation and command execution. Catalog responses include `trust.status`, `trust.installable`, signature metadata, and any trust errors.

Campaign installation can grant all requested permissions or an explicit subset. Command execution checks both the human caller permission and the plugin grant before the sandbox receives context; token context is only passed when the plugin grant includes `token.read`.

Command return values and bridge calls do not mutate campaign state. The API converts the command's chat output and bounded plugin-storage writes into one pending proposal. The sandbox can also call `context.postChatMessage(...)` or `context.createProposal(...)`; each call returns a request receipt and becomes a separate pending proposal after server-side permission and campaign-scope validation. Nothing is posted, stored, or otherwise applied until an authorized user approves and applies the proposal.

## Event subscriptions and bridges

Declare each server event in `eventSubscriptions` and register the matching handler in the server entrypoint:

```json
{
  "permissions": ["token.read", "chat.write"],
  "eventSubscriptions": [
    { "type": "token.moved", "description": "Offer a reviewed movement note" }
  ]
}
```

```js
onEvent("token.moved", async (event, context) => {
  await context.postChatMessage({ body: `Token moved: ${event.targetId}` });
});
```

The manifest validator rejects unsupported or duplicate subscriptions and requires the read permission associated with the event family. At dispatch time the campaign grant must still contain that permission. Handlers receive only an immutable metadata envelope (`id`, `campaignId`, `type`, actor/target ids, timestamp, and causation/correlation ids); engine event payloads are deliberately withheld. Bridge output is bounded, JSON-validated, permission-checked (`chat.write` or `ai.proposeChanges`), scoped to the event campaign, audited, and routed through proposals.

The exported `PLUGIN_EVENT_TYPES` list is the authoritative supported surface. High-frequency AI token/reasoning deltas and board-capture requests are deliberately unsupported because they can expose sensitive or unbounded payloads; plugins can subscribe to the corresponding completed AI lifecycle events instead.

## Registry Distribution

Remote registries are server-allowlisted with `OTTE_PLUGIN_REGISTRY_URLS`. A GM with `plugin.install` can sync the configured registry set from the Runtime SDK marketplace panel, and a server admin can run the same sync from Admin Plugin Operations. Both flows write audit rows and refuse registries that are not configured on the server.

A registry catalog is a JSON document with a `plugins` array:

```json
{
  "plugins": [
    {
      "packageId": "example-macro-plugin-1",
      "packageUrl": "https://registry.example.test/example-macro-plugin-1.json",
      "checksum": "sha256:..."
    }
  ]
}
```

`packageUrl` may be relative to the catalog URL. `checksum` is optional for local development but should be present for shared registries. The downloaded package document contains a `files` object whose keys become files under the package directory:

```json
{
  "files": {
    "plugin.manifest.json": "{ \"id\": \"example-macro-plugin\", \"name\": \"Example Macro Plugin\", \"version\": \"1.0.0\", \"compatibleCore\": \">=0.1.0\", \"entrypoints\": { \"server\": \"./server.js\" }, \"runtime\": { \"apiVersion\": \"0.1\", \"sandbox\": \"vm\" }, \"permissions\": [\"chat.write\"], \"chatCommands\": [{ \"command\": \"/spark\", \"description\": \"Post a spark\" }] }",
    "server.js": "registerCommand('/spark', () => ({ body: 'Spark', visibility: 'public' }));"
  }
}
```

Registry-imported packages are loaded through the same manifest validation, VM sandbox, signature/trust policy, marketplace review, permission review, install, upgrade, rollback, and command-execution checks as local packages. Registry sync will not overwrite an existing local package directory unless that directory already carries matching registry provenance.

## Author Checklist

- Keep `id` stable across versions and publish each version as a distinct package id or package document.
- Set `compatibleCore` narrowly enough that unsupported server versions fail closed.
- Request only the permissions required by commands or UI surfaces.
- Include `plugin.signature.json` and publish package checksums for any registry beyond local development.
- Exercise install, subset permission grant, command execution, upgrade, rollback, rejected-review, and tampered-checksum paths before publishing.
- Treat every plugin-authored campaign write as a proposal; plugin grants authorize what may be proposed, never a direct state mutation.
- Run the [extension package CI](../extension-ci.md) checks for manifest validation, permission denial cases, signatures, checksums, and install smoke evidence before sharing a package.

## Public Alpha Smoke Path

The launch demo uses `plugins/example-macro-plugin` as the concrete plugin example. Its manifest requests only `chat.write` and `token.read`, exposes the VM-sandboxed `/spark` chat command, subscribes to `token.moved`, and is safe to install with a smaller permission grant.

After importing `docs/demo/ember-vault-public-alpha.ottx.json`, a GM can install it on the demo campaign with only chat output permission:

```http
POST /api/v1/campaigns/camp_public_alpha_ember_vault/plugins/example-macro-plugin/install
{
  "permissions": ["chat.write"]
}
```

Running the command:

```http
POST /api/v1/campaigns/camp_public_alpha_ember_vault/plugins/example-macro-plugin/chat-command
{
  "command": "/spark",
  "args": "public alpha flare"
}
```

creates a pending proposal containing the public plugin chat message. Because `token.read` was not granted, the sandbox receives no token context, the response does not include token names, and token-movement events are not delivered. The chat appears only after an authorized user approves and applies the proposal. The API regression `imports the public alpha demo archive with SRD play data and player permissions intact` covers this install, command execution, permission subset review, and plugin audit log.
