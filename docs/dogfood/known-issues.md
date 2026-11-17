# v0.3 Outside Dogfood Known Issues

## Current

- v0.3 Content tab acceptance proof is recorded in `docs/verification/v0.3-dogfood-acceptance.md`; rerun it when the release-candidate commit changes.
- v0.3 campaign archives intentionally use portable archive schema `0.2.0`; the dogfood report bundle has its own redacted `0.3.0` report format.
- Community-scale plugin distribution and broad third-party content moderation remain out of scope; the project is free OSS and does not need commercial marketplace rails.
- Rules-system depth beyond the documented `dnd-5e-srd` beta slice remains incomplete.
- D&D Beyond is only an adapter boundary. Scraping, auth bypass, and proprietary imports remain blocked.

## Report As Bugs

- Campaign import/export data loss.
- Player visibility leaks for GM-only notes, hidden tokens, private actor data, or pending AI proposals.
- AI or plugin state mutation that bypasses the configured autonomy mode, permissions, revisions, validation, or audit evidence.
- Content import apply failures that leave partial records after rollback.
- Realtime failures that do not recover after page refresh.
