# Web lazy-boundary verification — 2026-07-15

## Scope

T13 moves non-core administration, AI Studio, campaign canon memory, actor and advanced configuration panels behind accessible lazy boundaries. Board image export loads `html-to-image` only when capture is requested. The rules, permission, session and AI execution contracts are unchanged.

## Production evidence

`pnpm --filter @open-tabletop/web build` passed with the aggregate initial-static-graph gate tightened from 1,800,000 to 1,600,000 bytes.

| Artifact | Minified bytes | Initial route |
| --- | ---: | --- |
| Main entry | 776,847 | Yes |
| React vendor | 193,685 | Yes |
| Icon vendor | 38,156 | Yes |
| Dice runtime | 557,367 | Yes |
| Aggregate static graph | 1,566,055 | Yes |
| Admin panel | 210,400 | Deferred |
| Actor panel | 98,589 | Deferred |
| AI panel | 35,741 | Deferred |
| Image export | 13,750 | Deferred |
| Campaign canon memory | 12,077 | Deferred |

The directly comparable main entry is below T13's 800 kB acceptance limit and is about 21.4% smaller than the recorded 988.83 kB baseline.

## Automated verification

- Web TypeScript: passed.
- Web suite: 109 files, 523 tests passed.
- Production web build: passed under the tightened 1.6 MB initial-graph gate.
- E2E TypeScript: passed.
- Chromium deferred-workspace journey: 1/1 passed in 7.5 seconds. It delayed the admin module, observed the accessible loading status, forced one module failure, observed the alert and recovery action, reloaded, retained the authenticated Ember Vault campaign, and reopened Server Admin successfully.

## Manual boundary

Keyboard and semantic status/alert behavior are automated. A physical screen-reader announcement-quality pass and browser performance trace remain external/manual evidence rather than code completion claims.
