# Extension Package CI

Plugin and system packages should run the same checks locally and in CI before they are shared with a GM or registry. The SDK packages are MIT-licensed and reusable, but extension packages still need to prove that their manifests, permissions, compatibility ranges, and runtime hooks fail closed.

Use this workflow as the minimum CI template for a repository that builds against OpenTabletop packages:

```yaml
name: Extension Package CI

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  validate-extension:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 8.7.0

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck SDK surface
        run: pnpm typecheck

      - name: Run extension tests
        run: pnpm test

      - name: Build distributable package
        run: pnpm build
```

For packages kept inside this monorepo, scope the same checks to the package being changed:

```bash
pnpm --filter @open-tabletop/plugin-sdk typecheck
pnpm --filter @open-tabletop/plugin-sdk test
pnpm --filter @open-tabletop/plugin-sdk build

pnpm --filter @open-tabletop/system-sdk typecheck
pnpm --filter @open-tabletop/system-sdk test
pnpm --filter @open-tabletop/system-sdk build
```

## Plugin Gates

- Validate `plugin.manifest.json` in tests, including `id`, `version`, `compatibleCore`, entrypoint paths, command declarations, UI panels, and requested permissions.
- Exercise installation with the full requested permission set and at least one reduced permission set.
- Cover every chat command, storage call, and proposed campaign mutation path with tests that assert undeclared permissions are rejected.
- Include signature and checksum generation in the release job for any registry-published package.
- Run an install or registry-sync smoke against a disposable campaign before marking a plugin package ready for shared use.

## System Gates

- Validate `system.manifest.json`, actor schema, item schema, compendium entries, condition metadata, and migration-impact notes together.
- Exercise character creation, compendium import, action rolls, resource consumption, rest recovery, advancement, encounter planning, activation, and deactivation.
- Include at least one backwards-compatibility fixture for older actor and item records whenever schemas change.
- Keep legal and source metadata checked in for reusable rules content; do not publish proprietary material through the package artifact.
- Run a browser or API smoke that activates the system on a disposable campaign and verifies the registry capability summary before release.

## Release Evidence

For each package release, keep the CI run URL, package version, manifest checksum, package checksum, compatible core range, and registry target with the package release notes. If any gate is intentionally skipped, record the owner-approved reason and the compensating validation that was run instead.
