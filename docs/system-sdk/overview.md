# System SDK

Rules systems declare:

- `system.manifest.json`
- actor JSON schema
- item JSON schema
- sheet registrations
- dice formula registrations
- compendium entries for items, spells, and conditions
- condition automation for actor quick rolls
- optional server hooks

See `plugins/example-system-generic-fantasy` for a minimal installable system. The built-in Generic Fantasy runtime also provides a starter compendium with Longsword, Healing Word, Blessed, Poisoned, and Restrained entries. API callers can add item and spell entries to actors, apply or remove conditions, and retrieve actor sheets that include condition-aware quick rolls plus inventory and spell lists.
