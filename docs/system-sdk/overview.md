# System SDK

Rules systems declare:

- `system.manifest.json`
- actor JSON schema
- item JSON schema
- sheet registrations
- dice formula registrations
- character creation templates
- character import normalizers
- compendium entries for system-specific items, spells, talents, gear, and conditions
- condition automation for actor quick rolls
- guided advancement options for leveling or rank progression
- encounter threat catalogs and budgeted encounter planning
- optional server hooks

See `plugins/example-system-generic-fantasy` and `plugins/example-system-stellar-frontiers` for minimal installable systems. The built-in Generic Fantasy runtime provides Guardian and Mender character templates, level advancement, encounter threats such as Skeletal Guard and Ogre Brute, and a starter compendium with Longsword, Healing Word, Blessed, Poisoned, and Restrained entries. The built-in Stellar Frontiers runtime provides Freighter Pilot and Ship Tech templates, rank advancement, sci-fi gear, talents, strain-aware sheets, aptitude rolls, encounter threats such as Boarding Drone and Void Raider, and conditions such as Locked In, Jammed, and Vacuum Exposed.

API callers can install a campaign's active system, list character templates, build actors from those templates with starting items, import normalized character data, list a system compendium, add item/spell/gear/talent entries to actors, apply or remove conditions, advance actors through the system's guided progression, plan encounters from system threat budgets, optionally persist planned encounters, and retrieve actor sheets that include condition-aware quick rolls plus the system's inventory, spell, or talent surfaces.
