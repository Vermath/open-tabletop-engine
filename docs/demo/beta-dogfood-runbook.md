# Beta Dogfood Runbook

Use `docs/demo/ember-vault-beta-dogfood.ottx.json` to exercise a real three-session campaign path. The fixture is original, SRD-compatible content and uses the `dnd-5e-srd` system only.

## Import

1. Start the API and web clients from a clean checkout.
2. Sign in as `Demo GM`.
3. Import `docs/demo/ember-vault-beta-dogfood.ottx.json` from the web sidebar or through `POST /api/v1/import/campaign`.
4. Open `The Ember Vault: Beta Dogfood Campaign`.

Expected campaign members:

- `Demo GM` as owner.
- `Demo Player` controlling Valen Ash.
- `Beta Player Two` controlling Nia Reed.
- `Beta Player Three` controlling Orren Vale.

## Session Walkthrough

| Session | GM steps | Player/realtime checks | Export checkpoint |
| --- | --- | --- | --- |
| Prep | Review `Prep: Ember Vault Beta Arc`, confirm `dnd-5e-srd`, inspect the two maps, review plugin/system status. | Confirm players cannot see GM-only prep notes or hidden scout details. | Export before play and keep the archive as `session-0-prep`. |
| Session 1 | Show `Asterite Cipher`, use the camp scene, post the opening chat, resolve Orren's detect magic roll, apply the long rest state. | All three players can read the public handout, chat, and their owned character data. | Export, import into a fresh runtime, and confirm `jnl_beta_session_1` plus updated resources survive. |
| Session 2 | Activate `Ember Vault Crossing`, reveal fog, move tokens, start `Ember Warden Crossing`, advance combat to round 3, apply damage/healing and a short rest. | 1 GM + 3 players see token movement, dice, chat, combat order, and reconnect without hidden scout disclosure. | Export, import into a fresh runtime, and confirm combat, rolls, HP/resources, fog, and token positions survive. |
| Session 3 | Resolve the hidden scout reveal, assign `Asterite Shard Cache`, approve or reject the AI memory proposal, and post the final recap. | Players see loot, public recap, and approved memory only after GM approval. | Export, import into a fresh runtime, and confirm loot, recap, memory, proposal status, and audit entries survive. |

## Required Beta Evidence

- Import returns campaign `camp_beta_ember_vault` with 4 users, 4 members, 2 scenes, 5 tokens, 6 actors, 4 items, 5 journals, 2 handouts, 6 chat messages, 4 rolls, 1 encounter, 1 combat, 1 AI eval, 1 proposal, 1 memory, 3 AI tool calls, 1 plugin storage record, and 4 audit logs.
- Export/import round trip preserves all three session recap journals, actor HP/resources, combat round, loot, AI memory, plugin storage, and export checkpoint audit entries.
- Player views hide GM-only prep and the hidden scout until the GM reveals it.
- The fixture starts with `prop_beta_ai_recap_memory` pending so proposal review can be exercised; the product also supports governed automatic execution.
- No Roll20, proprietary D&D, D&D Beyond, scraping, or auth bypass content is part of the fixture.
