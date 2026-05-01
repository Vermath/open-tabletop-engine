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
- guided advancement options for leveling or rank progression
- encounter threat catalogs and budgeted encounter planning
- optional server hooks

See `plugins/example-system-generic-fantasy`, `plugins/example-system-stellar-frontiers`, and `plugins/example-system-mystic-noir` for minimal installable systems. The built-in Generic Fantasy runtime provides Guardian and Mender character templates, level advancement, encounter threats such as Skeletal Guard and Ogre Brute, and a starter compendium with Longsword, Healing Word, Blessed, Poisoned, and Restrained entries. Longsword and Healing Word produce actor-aware damage/healing quick-roll formulas when attached to a sheet. The built-in Stellar Frontiers runtime provides Freighter Pilot and Ship Tech templates, rank advancement, sci-fi gear, talents, strain-aware sheets, aptitude rolls, encounter threats such as Boarding Drone and Void Raider, and conditions such as Locked In, Jammed, and Vacuum Exposed. Laser Carbine, Med Patch, and Overclock produce actor-aware gear/talent action quick rolls. The built-in Mystic Noir runtime provides Field Investigator and Occult Scholar templates, case-breakthrough advancement, investigation threat budgets, clues, rituals, composure-aware sheets, skill rolls, and conditions such as Focused, Shaken, and Marked. Case Notebook and Warding Rite produce actor-aware clue/ritual action quick rolls.

API callers can install a campaign's active system, list character templates, build actors from those templates with starting items, import normalized character data, list a system compendium, add item/spell/gear/talent/clue/ritual entries to actors, apply or remove conditions, advance actors through the system's guided progression, plan encounters from system threat budgets, optionally persist planned encounters, and retrieve actor sheets that include condition-aware ability/aptitude/skill quick rolls, compendium-backed action formulas, and the system's inventory, spell, talent, clue, or ritual surfaces. The system roll endpoint can post those action formulas into chat by roll id.
