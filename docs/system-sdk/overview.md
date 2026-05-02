# System SDK

Rules systems declare:

- `system.manifest.json`
- actor JSON schema
- item JSON schema
- sheet registrations
- dice formula registrations
- character creation templates
- character import normalizers
- compendium entries for system-specific items, spells, talents, gear, clues, rituals, and conditions
- condition and compendium action automation for actor quick rolls
- action-use consumption for spell slots, resources, strain, and consumable quantities
- guided advancement options for leveling or rank progression
- rest and recovery automation for pools, resources, spell slots, and rest-clearing conditions
- encounter threat catalogs and budgeted encounter planning
- optional server hooks

See `plugins/example-system-generic-fantasy`, `plugins/example-system-stellar-frontiers`, and `plugins/example-system-mystic-noir` for minimal installable systems. The primary built-in rules runtime is `dnd-5e-srd`, targeting SRD 5.2.1 / 5.5e-compatible play with Fighter, Cleric, and Wizard templates, SRD-oriented character import, level advancement, hit dice, spell slots, saving throw quick rolls, class save proficiencies, skill and tool check quick rolls, class/template skill and tool proficiencies, rest recovery, SRD threat planning, and compendium-backed Longsword, Healing Word, Fire Bolt, Cure Wounds, Shield, Magic Initiate, Savage Attacker, Blessed, Poisoned, and Restrained entries. Longsword, Healing Word, Fire Bolt, Cure Wounds, and Shield produce actor-aware action formulas when attached to a sheet; SRD Healing Word and Cure Wounds also support `spellSlotLevel` upcasting formulas and matching spell-slot consumption. The older Generic Fantasy, Stellar Frontiers, and Mystic Noir runtimes remain available as demo systems for later expansion.

API callers can install a campaign's active system, list character templates, build actors from those templates with starting items, import normalized character data, list a system compendium, add item/spell/gear/talent/clue/ritual entries to actors, apply or remove conditions, advance actors through the system's guided progression, apply short or long rest recovery, plan encounters from system threat budgets, optionally persist planned encounters, and retrieve actor sheets that include condition-aware ability/aptitude/skill quick rolls, SRD saving throw quick rolls with class proficiency bonuses, SRD skill and tool checks with proficiency/expertise bonuses, compendium-backed action formulas, and the system's inventory, spell, talent, clue, ritual, and resource surfaces. The system rest endpoint updates HP/strain/composure, hit dice, resource pools, spell slots where applicable, and rest-clearing conditions. The system roll endpoint can post action formulas into chat by roll id, including SRD `skill-*`, `tool-*`, and `save-*` roll ids. `spellSlotLevel` can upcast supported leveled spell formulas, `consumeResources: true` spends the matching spell slot, actor resource, strain, or consumable quantity before the roll is posted, and `applyEffect: true` applies supported damage/healing totals to target actor pools with target edit permission.

SRD attribution: OpenTabletop includes SRD-compatible material from Wizards of the Coast LLC's System Reference Document 5.2, available at https://www.dndbeyond.com/srd and licensed under CC-BY-4.0.
