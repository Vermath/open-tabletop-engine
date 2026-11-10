# OpenTabletop Core

Shared platform domain types and engine helpers. Import the public package root with `@open-tabletop/core`.

This tarball is a precompiled package: `dist/index.js` and `dist/index.d.ts` expose the current production module graph. Consumers use the shipped declarations with their own TypeScript configuration and do not inherit the repository tsconfig or run repository build scripts.

Repository maintenance: build/pack core before dependent SDK packages. `prepack` builds current output. The exact `files` list excludes test output and repository-dependent source/config; add the emitted JavaScript/declaration pair when introducing another production module.

Package metadata remains `private: true`, version `0.3.0`, and license `AGPL-3.0-only`; the existing license text is unchanged. This packaging change does not publish the package or change its license.
