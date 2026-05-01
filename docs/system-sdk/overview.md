# System SDK

Rules systems declare:

- `system.manifest.json`
- actor JSON schema
- item JSON schema
- sheet registrations
- dice formula registrations
- character creation templates
- compendium entries for system-specific items, spells, talents, gear, and conditions
- condition automation for actor quick rolls
- guided advancement options for leveling or rank progression
- optional server hooks

See `plugins/example-system-generic-fantasy` and `plugins/example-system-stellar-frontiers` for minimal installable systems. The built-in Generic Fantasy runtime provides Guardian and Mender character templates, level advancement, and a starter compendium with Longsword, Healing Word, Blessed, Poisoned, and Restrained entries. The built-in Stellar Frontiers runtime provides Freighter Pilot and Ship Tech templates, rank advancement, sci-fi gear, talents, strain-aware sheets, aptitude rolls, and conditions such as Locked In, Jammed, and Vacuum Exposed.

API callers can install a campaign's active system, list character templates, build actors from those templates with starting items, list a system compendium, add item/spell/gear/talent entries to actors, apply or remove conditions, advance actors through the system's guided progression, and retrieve actor sheets that include condition-aware quick rolls plus the system's inventory, spell, or talent surfaces.
