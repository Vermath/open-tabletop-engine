# v0.3 Outside Dogfood Known Issues

## Current

- Full browser proof for the v0.3 Content tab is pending final acceptance.
- v0.3 still uses archive schema `0.2.0`; the dogfood report bundle has its own `0.3.0` format.
- Marketplace-scale plugin distribution, payments, and broad third-party content moderation remain out of scope.
- Rules-system depth beyond the documented `dnd-5e-srd` beta slice remains incomplete.
- D&D Beyond is only an adapter boundary. Scraping, auth bypass, and proprietary imports remain blocked.

## Report As Bugs

- Campaign import/export data loss.
- Player visibility leaks for GM-only notes, hidden tokens, private actor data, or pending AI proposals.
- AI/plugin state mutation without proposal approval and audit evidence.
- Content import apply failures that leave partial records after rollback.
- Realtime failures that do not recover after page refresh.
