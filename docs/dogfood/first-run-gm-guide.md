# First-Run GM Guide

Use a browser in the [supported browser statement](./supported-browsers.md) for the table and ask players to do the same. Current desktop Chromium is the automated compatibility baseline.

## Setup

1. Install dependencies with `pnpm install --frozen-lockfile`.
2. Run `pnpm check`.
3. Start the API with `pnpm --filter @open-tabletop/api dev`.
4. Start the web client with `pnpm --filter @open-tabletop/web dev`.
5. Open `http://localhost:5173`.

## Start A Campaign

1. Use `Import` and choose `docs/demo/ember-vault-beta-dogfood.ottx.json`.
2. Select `The Ember Vault: Beta Dogfood Campaign` from the campaign list.
3. Use the scene tabs to confirm `Ember Vault` and the follow-up scene load.
4. Open the Actors, Journal, Combat, AI, SDK, and Content tabs once before inviting players.
5. Use `Export` after setup. Keep the `.ottx.json` file as the session-zero backup.

## Run Sessions

Use `docs/demo/beta-dogfood-runbook.md` for the three-session script. After each session:

- Export the campaign archive.
- Export the redacted Report Bundle if anything felt broken.
- Record any issue with the v0.3 outside dogfood template.
- Use the AI agent's configured proposal or automatic-execution mode as intended. Review plugin-originated changes through the normal permissioned application flow.

## Content Import

Use the Content tab for private table notes or legally reusable content. Preview first, apply only the selected preview, and use rollback before delete if applied records need to be removed.
