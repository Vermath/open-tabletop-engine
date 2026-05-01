# Plugin SDK

Plugins declare a manifest, requested permissions, UI panels, and optional chat commands. The runtime grants only declared capabilities.

See:

- `packages/plugin-sdk`
- `plugins/example-macro-plugin`

## Packaged Plugins

Local plugin packages live under `plugins/{packageId}` and are discovered from `plugin.manifest.json`. The manifest must include a semver-like `version`, a `compatibleCore` range, relative entrypoints, and requested permissions from the plugin allowlist.

Multiple package directories can provide the same plugin id at different versions. The catalog returns the latest version by default plus distribution metadata with `availableVersions` and `latestVersion`. Campaign install accepts an optional `version`; installs persist the selected package id, version, checksum, and install time in the plugin grant metadata. Reinstalling another available version upgrades or rolls back the campaign to that package, and command execution uses the installed grant version instead of silently running the latest package.

Server chat-command entrypoints run as JavaScript inside the API VM sandbox. The loader rejects absolute paths, package escapes, missing server files for chat commands, unsupported permissions, and undeclared command handlers. The API exposes package source metadata, sandbox mode, and a SHA-256 checksum with the plugin catalog so GMs can review what is being installed.

Plugin packages can include `plugin.signature.json` next to the manifest. The signature file supports `{ "keyId": "...", "algorithm": "hmac-sha256", "signature": "..." }`; the signature covers the plugin id, version, manifest checksum, and server-entrypoint checksum. `OTTE_PLUGIN_TRUST_POLICY=allow_unsigned` is the local-development default. Set `OTTE_PLUGIN_TRUST_POLICY=require_trusted` and provide `OTTE_PLUGIN_TRUST_KEYS` such as `trusted-local=secret` to block unsigned or tampered packages from installation and command execution. Catalog responses include `trust.status`, `trust.installable`, signature metadata, and any trust errors.

Campaign installation can grant all requested permissions or an explicit subset. Command execution checks both the human caller permission and the plugin grant before the sandbox receives context; token context is only passed when the plugin grant includes `token.read`.

Plugin state mutation should happen through proposals unless the permission grant explicitly allows a direct API call.
