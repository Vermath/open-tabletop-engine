# Beta Deployment Checklist

Use this checklist before an outside dogfood group runs beta v0.2.

## Build And Runtime

- [ ] `pnpm install --frozen-lockfile` passes from a clean checkout.
- [ ] `pnpm check` passes.
- [ ] API starts on the intended host/port.
- [ ] Web client starts and points at the intended API origin.
- [ ] Realtime WebSocket connection succeeds through the web proxy or deployment edge.
- [ ] Worker jobs can authenticate with `OTTE_SESSION_TOKEN`.

## Persistence

- [ ] SQLite path or managed database path is documented.
- [ ] Asset storage provider is documented.
- [ ] Backup and restore procedure has been run once.
- [ ] A campaign export/import round trip has been tested.
- [ ] Alpha `0.1.0` archives import and re-export as `0.2.0`.

## Dogfood Campaign

- [ ] Import `docs/demo/ember-vault-beta-dogfood.ottx.json`.
- [ ] Run `docs/demo/beta-dogfood-runbook.md` through the three-session path.
- [ ] Verify 1 GM + 3 players for token movement, dice, chat, combat, journals, and reconnect.
- [ ] Export after every session and import each export into a fresh runtime.

## Release Boundaries

- [ ] No Roll20 UI, brand, assets, sheets, marketplace data, or proprietary workflows are included.
- [ ] No proprietary D&D or D&D Beyond content is included.
- [ ] D&D Beyond and other external services remain safe adapter boundaries only.
- [ ] AI/plugins create proposals or permissioned storage records instead of secret state mutation.
