# Desktop Hosting

The desktop app packages the API and built web client into Electron. It starts the API and web static server on `127.0.0.1` ephemeral ports, stores SQLite and files under the OS app data directory, and exposes games to remote players only when the host starts the managed relay.

Consumer desktop defaults:

```bash
OTTE_ASSET_STORAGE=local
OTTE_AI_PROVIDER=disabled
OTTE_DEMO_SEED=false
NODE_ENV=production
```

Data layout under Electron `userData`:

- `data/opentabletop.sqlite`
- `uploads/`
- `plugins/`
- `logs/`
- `backups/`

The relay stores table slug metadata and host-token hashes only. Campaign state, assets, plugins, and backups remain on the host computer. The host desktop keeps an outbound WebSocket tunnel to the relay, and players join through `https://share.open-tabletop.org/t/{slug}/join?invite=oti_...`.

Build locally:

```bash
pnpm install
pnpm --filter @open-tabletop/desktop build
pnpm --filter @open-tabletop/desktop dist
```

`.github/workflows/desktop-release.yml` builds unsigned installers by default. If signing credentials are present, electron-builder can sign the artifacts. Set repository variable `REQUIRE_DESKTOP_SIGNING=true` only when CI should fail unsigned builds.

Optional signing secrets are the electron-builder signing inputs for each platform:

- macOS: Developer ID certificate, Apple team id, and either app-specific notarization credentials or App Store Connect API key credentials.
- Windows: Authenticode certificate inputs or Azure Trusted Signing credentials.

Manual signature checks:

```powershell
Get-AuthenticodeSignature .\OpenTabletop*.exe
```

```bash
codesign --verify --deep --strict OpenTabletop.app
spctl --assess --type execute OpenTabletop.app
```
