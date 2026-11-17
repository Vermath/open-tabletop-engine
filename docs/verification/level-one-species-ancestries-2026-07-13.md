# Level-one SRD species ancestry verification

The guided `level-one-srd` creator implements the ancestry choices in the official [System Reference Document 5.2.1](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf). Dragonborn Draconic Ancestry is on printed page 84 (PDF page 83); Goliath Giant Ancestry is on printed pages 85–86 (PDF pages 84–85).

## Exact published choices

Dragonborn supports all ten published ancestors and their exact damage type: Black/Acid, Blue/Lightning, Brass/Fire, Bronze/Lightning, Copper/Acid, Gold/Fire, Green/Poison, Red/Fire, Silver/Cold, and White/Cold. The selected type controls both Breath Weapon damage and Damage Resistance.

Goliath supports exactly one of the six published benefits:

- Cloud's Jaunt (Cloud Giant): Bonus Action teleport up to 30 feet to a visible unoccupied space.
- Fire's Burn (Fire Giant): 1d10 extra Fire damage after an attack hits and deals damage.
- Frost's Chill (Frost Giant): 1d6 extra Cold damage and a 10-foot Speed reduction until the start of the Goliath's next turn after an attack hits and deals damage.
- Hill's Tumble (Hill Giant): apply Prone to a Large or smaller target after an attack hits and deals damage.
- Stone's Endurance (Stone Giant): Reaction to reduce incoming damage by 1d12 plus Constitution modifier.
- Storm's Thunder (Storm Giant): Reaction after a creature within 60 feet deals damage, dealing 1d8 Thunder damage to it.

## Validation and persistence

The origins endpoint publishes typed metadata for both catalogs. Strict creation requires one matching choice for Dragonborn or Goliath, rejects unknown or malformed identifiers, and rejects either field on any other species before an actor is written. Accepted actors persist normalized identifiers, display provenance, and the controlling damage/type data under `data.origin`.

Dragonborn also persists the selected damage type in `data.resistances`; the existing damage-defense model therefore applies it. Breath Weapon keeps its proficiency-bonus uses, Long Rest recovery, level-one `1d10` formula, Dexterity save DC, shapes, and selected damage type.

Goliath keeps one proficiency-bonus-use, Long Rest resource. Its selected quick roll exposes the relevant die or reduction formula and structured benefit metadata. Legacy direct/template creation remains accepted without inventing a choice; legacy Goliath actors retain the generic six-option metadata.

## Deliberate manual and deferred boundaries

Goliath benefit resolution is deliberately marked manual. The engine does not infer whether an attack trigger qualified, choose a target, move a token for Cloud's Jaunt, impose Prone for Hill's Tumble, apply Frost's Chill's temporary Speed change, reverse already-applied damage for Stone's Endurance, or automatically retaliate for Storm's Thunder. It tracks uses and provides the exact roll/metadata without silently mutating ambiguous state.

Draconic Flight and Large Form start at level 5. They are not granted or newly automated by this level-one creator slice. No later-level ancestry effects were added.

## Focused verification

On 2026-07-13, focused verification passed:

- system SDK: 8 creator tests plus typecheck/build;
- API: 3 creator API tests;
- web: 11 creator tests plus typecheck;
- API contracts: 22 tests plus typecheck.

Coverage includes the exact catalogs, missing/unknown/malformed/cross-species rejection, no-write behavior for forged requests, provenance, Dragonborn resistance and Breath Weapon metadata, selected Goliath formulas/manual metadata, accessible species-gated selectors, OpenAPI schemas, and legacy compatibility.

The API package typecheck now passes. The earlier concurrent tactical-scene guard diagnostic was resolved without changing the ancestry route contract.
