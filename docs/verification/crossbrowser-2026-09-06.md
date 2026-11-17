# Cross-browser evidence — 2026-09-06

Five existing scenarios have passing evidence in Firefox and WebKit: **10 distinct engine/scenario cases, with no automated retries**. The WebKit evidence combines three successful cases from the source-stable matrix and a focused passing rerun of the corrected private-session test. This is bounded C07 desktop browser automation evidence.

## Results

Elapsed times are diagnostic test durations, not browser performance comparisons.

| Existing scenario                                                           | Firefox 151.0 | WebKit 26.5   |
| --------------------------------------------------------------------------- | ------------- | ------------- |
| Clean deployment owner bootstrap and starter campaign                       | Pass, 73.6 s  | Pass, 141.4 s |
| Box-select and drag multiple scene tokens                                   | Pass, 10.9 s  | Pass, 9.4 s   |
| Archive download, import recovery, conflict modes, and rollback             | Pass, 13.6 s  | Pass, 23.5 s  |
| Private-session invite, chat, dice, character action, and token permissions | Pass, 29.3 s  | Pass, 74.0 s  |
| Reviewed character state, API restart/reload, and archive round trip        | Pass, 47.0 s  | Pass, 178.5 s |

`pnpm e2e:typecheck` passed after the final test changes. The new configuration is included in `tsconfig.e2e.json`.

The machine-readable [matrix summary](../../output/competitive/crossbrowser/matrix-summary.json) identifies the exact passing invocation, source test, line, time, and retry count for every row. Raw reports:

- [Firefox representative](../../output/competitive/crossbrowser/firefox-representative/results.json): four passed.
- [Firefox bootstrap](../../output/competitive/crossbrowser/firefox-bootstrap/results.json): one passed.
- [WebKit source-stable representative](../../output/competitive/crossbrowser/webkit-representative-before-roll-assertion/results.json): box selection, archive, and restart passed; the private-session status assertion failed and was corrected below.
- [WebKit private-session focused rerun](../../output/competitive/crossbrowser/webkit-private-join/results.json): one passed after the correction.
- [WebKit bootstrap](../../output/competitive/crossbrowser/webkit-bootstrap/results.json): one passed.

## Environment and method

- Windows x64, OS release 10.0.26200; 16 logical CPUs; 64 GiB RAM; Node v24.18.0; installed Playwright 1.61.1.
- Firefox 151.0, Playwright revision 1532; WebKit 26.5, Playwright revision 2311. Matching binaries were downloaded to `storage/competitive-browsers`; no package upgrade or global browser configuration change.
- HEAD at collection start: `08e82dcadb61a7675b688cf321cdf7256cf2a469`, with local changes present. This is local working-tree evidence, not a release certification of that commit.
- One engine and one suite per invocation; one worker; no retries; fresh local SQLite store. API 4240, web 5314, API control 6240, bootstrap email webhook 4242. Existing development and multiplayer ports were untouched.
- The representative suite reuses four existing tests; bootstrap reuses the existing clean-deployment owner test. Fixtures may use direct API setup, but the asserted user actions run in actual browser engines. Archive download/upload uses actual browser download and file-input paths.
- Application source was frozen for final runs. Recorded API entry, web application, and stylesheet hashes matched after all runs. Environment, source hashes, install output, and console logs are retained under `output/competitive/crossbrowser/`.
- The restart scenario restarts the API, reloads the page, and checks persisted state. It covers reconnect after reload; it does not claim an in-place offline/reconnect test or network-shaped recovery.

## Reproduce

Run sequentially from the repository root:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) 'storage/competitive-browsers'
pnpm exec playwright install firefox webkit
foreach ($engine in @('firefox', 'webkit')) {
  foreach ($suite in @('representative', 'bootstrap')) {
    $env:OTTE_CROSSBROWSER_BROWSER = $engine
    $env:OTTE_CROSSBROWSER_SUITE = $suite
    pnpm exec playwright test -c playwright.crossbrowser.config.ts
    if ($LASTEXITCODE -ne 0) { throw "$engine $suite failed" }
  }
}
pnpm e2e:typecheck
```

The config writes JSON reports and failure artifacts under `output/competitive/crossbrowser/<engine>-<suite>/`. A focused rerun can add `-g 'player can accept an invite from a private browser session'`. Preserve earlier output before rerunning if it is needed for diagnosis. Keep application source stable during each invocation: Vite source fingerprint changes while an older API process is alive intentionally stop the UI from connecting.

## Exercised behavior

| Existing test                                                                                   | User-visible coverage                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bootstrap.spec.ts`: clean deployment routes to owner bootstrap and opens the starter campaign  | Empty deployment owner creation and starter campaign; broader existing account/admin coverage remains part of this reused test.                                                                                                                                              |
| `auth-tabletop.spec.ts`: GM can box-select and drag multiple scene tokens                       | Box selection and moving the selected token group.                                                                                                                                                                                                                           |
| `auth-tabletop.spec.ts`: GM can export and safely re-import a campaign archive                  | Download, upload, invalid archive retry, conflict modes, selected-collection import, and rollback.                                                                                                                                                                           |
| `auth-tabletop.spec.ts`: player can accept an invite from a private browser session             | Private-context join, GM broadcast, player whisper, dice, character action, owned-token drag, and denial of unowned-token movement. Public and GM-only dice responses are matched by roll ID to their visible chat messages; the player roll-list privacy assertion remains. |
| `browser-evidence.spec.ts`: reviewed D&D core state survives API restart and archive round trip | Creator, advancement, reviewed action and rest, API restart plus browser reload, saved state, archive download/upload restoring character state.                                                                                                                             |

## Diagnosed failures and test corrections

The first Firefox representative run passed all four cases. The initial WebKit run passed the archive case and failed three cases; its [report](../../output/competitive/crossbrowser/webkit-representative-initial/results.json), failure traces, screenshots, and console log are retained.

1. The box-selection trace showed a test geometry race after the layer panel opened: the board resized between separate endpoint calculations, turning an intended rightward drag into browser x701.6 to x596.8. The existing test now waits for stable board geometry and derives both endpoints from one bounding box. WebKit and Firefox then passed the same gesture. No application pointer change was needed.
2. The initial join and restart cases stopped on an explicit API source fingerprint mismatch after concurrent application edits. Those failures are invalid evidence of WebKit compatibility. Fresh servers and source-stable runs resolved that environment mismatch.
3. The source-stable private-session run completed both dice commands with HTTP 200 and visible chat results, but its transient `Rolled` status was replaced by `Realtime connected and synced`. The test now matches each acknowledged `DiceRoll.id` to `ChatMessage.rollId` and its exact visible result, using the player view for the public roll and GM view for the GM-only roll. The original player roll-list privacy check is retained. The focused WebKit rerun and full Firefox representative rerun passed.

These were test timing/assertion corrections and an execution-environment mismatch. This work changed no application runtime or AI behavior.

## Support boundary

A WebKit automation pass on Windows is not a real Safari or iOS device pass. This matrix does not establish Android, touch-device, phone/tablet, NVDA, Narrator, VoiceOver, or TalkBack support. Those remain separately identified device/human evidence. It also does not establish sustained multiplayer capacity or production deployment performance.
