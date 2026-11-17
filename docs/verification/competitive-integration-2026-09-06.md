# Competitive changes: integration verification, 2026-09-06

`pnpm check` completed successfully from 13:52:06 to 13:59:34 UTC on Windows. It runs lint, package typechecks, E2E TypeScript checking, package tests, and production builds. The test summaries report **2,483 passed and one skipped across 397 files**. This command does not run browser journeys or the production dependency audit.

The [result record](../../output/competitive/integration-check-result.json), [complete log](../../output/competitive/integration-check.log), and [before](../../output/competitive/integration-check-before-source.json)/[after](../../output/competitive/integration-check-after-source.json) inventories are retained. All 821 recorded inputs stayed unchanged, with SHA-256 `70291dbc22281e1afefd71e38009b0edd3d393cc489bdb401bb5b33c2c853a6b` before and after. The inventory covers app/package/plugin source and package metadata, scripts, tests, selected root configurations, and the desktop release workflow. It excludes generated outputs and evidence directories. Turbo reused valid cached tasks; this is not a cold release-gate pair or certification of a published artifact.

| Package | Passed | Skipped |
| --- | ---: | ---: |
| API | 891 | 1 |
| Web | 889 | 0 |
| System SDK | 315 | 0 |
| Core | 87 | 0 |
| API contracts | 86 | 0 |
| API client | 53 | 0 |
| Desktop | 27 | 0 |
| Worker | 27 | 0 |
| Dice engine | 26 | 0 |
| Codex app-server provider | 24 | 0 |
| Relay | 22 | 0 |
| Plugin SDK | 15 | 0 |
| Asset edge | 9 | 0 |
| AI core | 7 | 0 |
| Tunnel protocol | 5 | 0 |

Earlier unsuccessful integration runs remain in [run 1](../../output/competitive/integration-run-1), [run 2](../../output/competitive/integration-run-2), and [run 3](../../output/competitive/integration-run-3). They exposed a missing public API-client wrapper for player preview, stale UI wiring assertions after the map/preview changes, the App component's existing size limit, and missing authorization/route classification coverage for the new preview endpoint. The API client now exposes the route and typed response. Tests follow the current guarded helpers; moving keyboard shortcuts, toast markup, and sync status into the existing overlay module preserved the size budget. The observer matrix expects the preview route's actual GM-only 403 response. Its MCP classification is test-only and preserves the existing tool surface.

The passing integration gate does not close the [independent competitive verdict](competitive-critic-2026-09-06.md). Browser map/preview and first-run evidence have their own reports. The repaired packaged application and measured responsiveness still require their retained executable/browser outcomes. Pending dependency remediation, native UVTT/private annotation work, third-party system execution, and real-provider AI evidence remain separately tracked; no successful audit, deployment, or live AI result is implied by this check.
