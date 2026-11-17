# Desktop Hosting

The desktop app packages the API and built web client into Electron. It starts the API and web static server on `127.0.0.1` ephemeral ports, stores SQLite and files under the OS app data directory, and exposes games to remote players only when the host starts the managed relay.

The web server binds before API startup so the desktop can configure its exact browser origin. Blank `OTTE_WEB_ORIGIN` and `OTTE_PUBLIC_URL` values default to that address; explicitly configured values and CDN settings remain honored. The assigned browser origin is added to the existing `OTTE_CORS_ALLOWED_ORIGINS` list. Default signed image URLs use the bundled web proxy, while cookie origin checks and the content security policy remain enforced.

Consumer desktop defaults:

```bash
OTTE_ASSET_STORAGE=local
OTTE_AI_PROVIDER=disabled
OTTE_DEMO_SEED=false
NODE_ENV=production
```

Data layout under Electron `userData`:

- `data/opentabletop.sqlite`
- `data/asset-url-signing.key` (generated once on first start and reused)
- `uploads/`
- `plugins/`
- `logs/`
- `backups/`

The desktop generates its own cryptographically random asset URL signing key when `OTTE_ASSET_URL_SIGNING_SECRET` is not configured. Keep the key with the installation data; an invalid existing key fails startup instead of silently rotating it. Explicitly configured keys remain honored. The generated file uses mode `0600` on POSIX; Windows protects it through the data directory ACL. The key is never included in desktop status or exported diagnostics.

For a separate data directory, pass an absolute path when starting the executable:

```powershell
.\OpenTabletop.exe --user-data-dir="D:\OpenTabletopData"
```

The selected directory contains both campaign data and Electron browser state. Relative or empty paths are rejected. Omitting the flag preserves the normal OS userData location.

The relay stores table slug metadata and host-token hashes only. Campaign state, assets, plugins, and backups remain on the host computer. The host desktop keeps an outbound WebSocket tunnel to the relay, and players join through `https://share.open-tabletop.org/t/{slug}/join?invite=oti_...`.

Build locally:

```bash
pnpm install
pnpm --filter @open-tabletop/desktop build
pnpm --filter @open-tabletop/desktop dist --publish never
```

For an unpacked application directory without an installer, use `pnpm --filter @open-tabletop/desktop dist --dir --publish never`. Pass build flags directly after `dist`; an extra `--` separator reaches electron-builder as an end-of-options marker.

`.github/workflows/desktop-release.yml` builds unsigned installers for manual runs by default; tagged releases require valid signatures. If signing credentials are present, electron-builder can sign the artifacts. Set repository variable `REQUIRE_DESKTOP_SIGNING=true` to require signing on manual runs as well.

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
