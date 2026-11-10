# Differentiator outcome evidence — 2026-09-06

C08 now has executed local API evidence for portable campaign recovery and a standalone public SDK consumer. These are actual HTTP journeys against running application processes with retained exports, restored asset bytes, application records, package tarballs, and lifecycle responses. They are not conclusions inferred from regression-test counts.

## Scope and provenance

- Base HEAD: `08e82dcadb61a7675b688cf321cdf7256cf2a469`, with concurrent working-tree changes. [Source manifest](../../output/competitive/differentiators/runtime-source-manifest.json) records relevant file hashes and modification times at reporting time; it is not a claim of an immutable packaged release.
- Windows host, Node/tsx production server entrypoint `apps/api/src/server.ts`, `NODE_ENV=development`. Neither instance injects the E2E loopback provider. No application AI policy or execution behavior was changed.
- [Instance manifest](../../output/competitive/differentiators/instances.json): source HTTP port 4250/PID 38396 and destination HTTP port 4251/PID 37076, each with its own SQLite database, upload directory, and process under `output/storage/c08-2026-09-06T05-33-12-849Z`.
- Both processes were observed through `/api/v1/auth/bootstrap` with zero users and zero campaigns before first-owner creation. Fixtures were created entirely through public HTTP APIs.
- All timings below measure a prepared local harness, not human onboarding, development time, or a competitor comparison.

## Campaign ownership and fresh recovery

**Passed: 23 outcome assertions across 47 HTTP requests in 1,752 ms**, from `2026-09-06T05:33:37.234Z` to `05:33:38.989Z`. [Full request/status/check record](../../output/competitive/differentiators/restore-evidence.json).

The source owner created a private campaign, invited a password-backed player, and uploaded an authored 600×400 PNG map. The player-owned actor and token referenced that asset. A second token was hidden on the GM layer. A handout addressed to the player referenced the image; another handout and chat message were GM-only. The source campaign was exported to a real portable archive and imported into the separate destination database after destination-owner bootstrap.

| Retained artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| [Portable campaign](../../output/competitive/differentiators/source-campaign.ottx.json) | 27,575 | `fc7add5e7f10057c3619d7f895d8517217196d504fac9ce72c387e20e3db78a8` |
| [Source PNG](../../output/competitive/differentiators/portable-expedition-map.png) | 9,686 | `57f9d350ff34ae6115a1fb741b1c118780263895121543cd5741f00b03a4823d` |
| [Restored PNG](../../output/competitive/differentiators/restored-map.png) | 9,686 | `57f9d350ff34ae6115a1fb741b1c118780263895121543cd5741f00b03a4823d` |

The archive's embedded image and destination blob were identical by byte hash. The scene background, token-to-actor/image links, actor HP/owner, and handout asset/audience links persisted. Corrupt embedded bytes were rejected before creating an imported campaign. A later conflicting import was rejected without changing the player's resumed token position. Retained file lengths/hashes were recomputed independently after the journey and matched the evidence record.

The destination owner became owner of the imported campaign. The returning player's identity, membership, actor/token ownership, and addressed handout audience persisted. Passwords and sessions were deliberately absent from the archive; the imported account required the existing password-reset flow. The destination owner issued that reset through the public administration API, and the harness consumed its synthetic reset credential from the local outbox in memory. Email delivery was unconfigured; no external email was sent.

After recovery, a separate player session saw the same visible token IDs, read the addressed handout, and could not read the GM handout, GM chat, or hidden token. The player moved their restored token, rolled `1d20+2` (observed total 19), and posted chat that the destination GM retrieved. [Final table snapshot](../../output/competitive/differentiators/restored-table-snapshot.json) and [import response](../../output/competitive/differentiators/import-result.json) retain the outcomes.

Current destination campaign: `camp_mtpdm2uaixfzqi1p` (C08 Portable Expedition); scene: `scn_mtpdm2uaao8hdtdl` (First Scene).

Two harness-development attempts were retained: [attempt 1](../../output/competitive/differentiators/restore-attempt-1.json) omitted the public actor-create revision, and [attempt 2](../../output/competitive/differentiators/restore-attempt-2.json) omitted the known revision on a hidden-token denial probe. Both correctly received HTTP 400. The harness was corrected and both API databases were freshly recreated before the successful final run; no runtime fix was needed.

This establishes bounded fresh-database API portability and resume. It does not establish a packaged installer, browser import/download usability, operating-system save dialog, large-campaign migration, or off-host disaster recovery.

## Standalone public SDK lifecycle

**Passed: strict standalone TypeScript compilation, then 22 outcome assertions across 49 HTTP requests in 1,818 ms.** SDK report and replay instructions (local report: `output/competitive/differentiators/sdk/README.md`, not published with this site), [compact result](../../output/competitive/differentiators/sdk/summary.json), [full lifecycle response evidence](../../output/competitive/differentiators/sdk/lifecycle-evidence.json).

A consumer outside the engine source imports `@open-tabletop/plugin-sdk` by package name from locally packed tarballs. It generates two useful scene-briefing packages: v1 drafts an objective and roster; v2 sorts/counts the roster and adds a preparation checklist. Plugin code and the lifecycle harness do not import server internals or write campaign storage.

The real API rejected an undeclared capability (400), denied command execution after an empty permission grant (403), and omitted token names with a chat-only grant. Full grants produced v1 output, a version change produced v2 output, and rollback reproduced the exact original v1 output. Each of the four successful executions used the product's existing plugin proposal approval/apply path, with no chat before apply and exactly one matching chat afterward. Audit records contain install, permission review, upgrade, and rollback operations.

Current source campaign: `camp_mtpdmyxcgfhptfcj` (SDK scene briefing lifecycle evidence). Installed package is `scene-briefing-v1` version 1.0.0, with latest catalog version 2.0.0.

The local consumer install was offline. Its initially empty confined pnpm store lacked the compiler, so the already-installed compiler was packed locally. The package build, lockfile, installed package resolution, generated plugin source, checksums, and retained first successful lifecycle run are linked by the SDK report.

This is local-tarball/public-import evidence by a repository-aware agent, using the existing unsigned development policy. It is not npm publication, trusted registry distribution, or an independent developer-onboarding result. Concrete code-addressable distribution gaps remain: both package manifests are private, public SDK declarations reference core types from the AGPL-labeled core package, tarballs contain repository-oriented source/test/config files, and the VM command input type is not exported. The consumer's small local command-input declaration and metadata observations are documented; this run makes no licensing conclusion. The pending packaging proposal (local report: `output/competitive/differentiators/sdk/pending-packaging-patch.md`, not published with this site) contains exact packfile/export changes, public command authoring types, and a standalone consumer recipe. It is an output-only proposal, not an applied fix; core-type ownership/decoupling and publication settings remain code work for review. No package license, dependency, or publication was changed.

## Configured live AI

**Not executed: automatic approval review blocked the prepared real-provider command before process start.** Preflight and prepared-action report (local report: `output/competitive/differentiators/ai/README.md`, not published with this site), [recorded rejection](../../output/competitive/differentiators/ai/execution-blocker.json). Read-only preflight found selected/active provider `codex-app-server`, transport `app-server`, the locally bundled Codex launcher, an existing default auth file, and an enabled campaign policy with no readiness issues. The dedicated synthetic campaign is `camp_mtpdtzjpiy1m4ptq` (C08 Live-provider Preparation). No auth-file contents or secret values were read. No model request or AI table mutation occurred, so authentication, quota, model access, latency, cost, and task quality remain unverified. This is not evidence that the provider is unavailable.

The prepared command was `node output/competitive/differentiators/ai/live-journey.mjs --run`. It requests the existing automatic API mode to create an inactive Lantern Annex scene, two named NPCs with linked token placements, and one public handout, followed by a bounded correction if the initial outcome succeeds. Automatic approval review rejected the command because the trusted transcript did not establish user authorization for that provider destination and campaign-context payload. The action was not retried indirectly. The review rejection requires explicit authorization evidence or a user approval before this part can proceed.

The adapter's internal `approvalMode: proposal` is distinct from the public thread's existing `approvalMode: auto` execution path. No policy was changed or converted to a proposal-only demonstration. Current cost rates are absent; missing cost is not zero cost.

The standard `tests/e2e/api-entry.ts` always injects a loopback transport; changing its environment selector cannot turn it into live-provider evidence. This report's two API processes instead use the ordinary server entrypoint with its existing behavior.

## Reproduction

From the repository root, run the instance launcher once in its own terminal, then the restore harness in another:

```powershell
node output/competitive/differentiators/start-instances.mjs
node output/competitive/differentiators/restore-journey.mjs
```

The launcher creates unique owned storage directories and expects ports 4250/4251 to be unused. Stop its owned processes before replaying; do not point it at an existing campaign database. It logs owned process IDs and paths in the manifest. The restore harness intentionally requires a fresh bootstrap and retains no session/reset tokens in evidence. Source accounts and credentials are synthetic fixtures.

Follow the linked SDK instructions for the standalone consumer build and lifecycle. The running source plugin root is `output/competitive/differentiators/sdk/plugins`. The two API instances remain available for follow-up observation until their owner stops them; they do not serve the web frontend.
