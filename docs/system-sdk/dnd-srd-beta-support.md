# D&D SRD Beta Support

OpenTabletop Engine beta v0.2 uses `dnd-5e-srd` as the primary rules runtime. The runtime is intended for SRD/open-content dogfood, not proprietary D&D Beyond or marketplace content.

## Supported In Beta

- SRD character templates, origins, background/species metadata, and normalized character import.
- Level advancement through the system advancement endpoint.
- Short and long rests with HP, hit dice, spell slots, and class resource recovery where modeled.
- Conditions from the SRD condition catalog, including apply/remove endpoints.
- SRD spells, magic items, equipment purchase, currency, armor/shield AC, and actor inventory surfaces.
- SRD monster threat catalog, monster actor creation, monster action formulas, CR/XP metadata, and encounter math.
- Actor sheets with quick rolls for checks, saves, attacks, damage/healing, class features, and monster actions.
- Campaign archive export/import of actors, items, rolls, combats, journals, AI memory, plugin storage, and content import preview records.
- Character export/import as OpenTabletop-normalized JSON for user-provided data.

## Verified Beta Slice

- `docs/demo/ember-vault-beta-dogfood.ottx.json` includes three level-3 SRD characters, NPC/monster actors, rests, conditions, spells/items, loot, encounter math evidence, combat, recaps, AI memory, and export checkpoints.
- `apps/api/src/app.test.ts` imports the beta dogfood archive, verifies player-safe visibility, three player-owned token moves, combat order, pending AI proposal, AI quality gate, plugin smoke, system install/restore, and export/import round trip.

## Unsupported Or Post-Beta

- Proprietary D&D content, D&D Beyond account data, D&D Beyond scraping, auth bypass, marketplace books, and non-SRD assets.
- Full character-builder parity with any commercial product.
- Exhaustive automation for every optional or table-specific rule.
- Paid marketplace distribution or content entitlement management.
- Automated import from third-party services unless a documented permitted API or user-provided export path exists and the imported payload is legal to use.

## Dogfood Expectations

Use the runtime for real table flow: prepare a session, run combat, update actors, apply rests, assign loot, write recaps, export after every session, and import the archive into a fresh runtime. Record unsupported edge cases as beta dogfood issues instead of extending the fixture with proprietary content.
