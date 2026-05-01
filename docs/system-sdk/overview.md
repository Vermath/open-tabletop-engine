# System SDK

Rules systems declare:

- `system.manifest.json`
- actor JSON schema
- item JSON schema
- sheet registrations
- dice formula registrations
- compendium entries for system-specific items, spells, talents, gear, and conditions
- condition automation for actor quick rolls
- optional server hooks

See `plugins/example-system-generic-fantasy` and `plugins/example-system-stellar-frontiers` for minimal installable systems. The built-in Generic Fantasy runtime provides a starter compendium with Longsword, Healing Word, Blessed, Poisoned, and Restrained entries. The built-in Stellar Frontiers runtime provides sci-fi gear, talents, strain-aware sheets, aptitude rolls, and conditions such as Locked In, Jammed, and Vacuum Exposed.

API callers can install a campaign's active system, list a system compendium, add item/spell/gear/talent entries to actors, apply or remove conditions, and retrieve actor sheets that include condition-aware quick rolls plus the system's inventory, spell, or talent surfaces.
