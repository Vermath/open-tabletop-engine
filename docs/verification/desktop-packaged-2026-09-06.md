# Windows desktop verification — 2026-09-06

The final desktop source and unpacked build pass focused checks, but **the final executable journey is unverified**: Windows Code Integrity rejected the unsigned executable before startup. Earlier actual executable runs verified restoration, player permissions, browser sign-in, and restart persistence, while exposing the image-delivery defect corrected in the final source. A separate check of the current Node API/static-web runtimes in normal Chrome passed all 16 assertions, including image decoding and browser-fetched byte identity. All attempts remain available separately.

## Scope and outcome

This work built Windows x64 unpacked application directories with Electron 39.8.10 and electron-builder 26.15.3. It did not install an NSIS package, sign or publish a release, test a clean Windows machine or macOS, operate native dialogs, or connect a relay. Actual executable runs used the bundled API/static web server and renderer; public HTTP and Chromium debugging supplied observations.

Profiles, SQLite data, uploads, browser state, logs, and generated signing keys stayed in unique workspace directories under `output/competitive/desktop/runs`. The launcher removed inherited `OTTE_*` configuration, provided no signing key, and kept the desktop's existing disabled-AI/no-demo/local-storage defaults. Player recovery used a local outbox. No external email, model request, policy change, or certificate installation occurred.

| Attempt | Retained distribution | Result |
| --- | --- | --- |
| Baseline | `distribution` | Actual executable exited 1: missing production signing key; no database created. |
| Signing key and preload repairs | `fixed-distribution` | 23 checks and 23 harness HTTP requests completed, including import/restart/permissions. Renderer login failed at cookie confirmation with 403. |
| Browser-origin repair | `origin-fixed-distribution` | 26 checks and 23 harness HTTP requests passed; actual renderer login and normal restart succeeded. Visual review found blocked map/token/thumbnail images, which the original assertions did not check. |
| Image-delivery repair | `delivery-fixed-distribution` | Build and source checks passed. Windows rejected the new unsigned executable before any process, assertion, or HTTP request. |

The request counts above describe explicit harness requests; browser-generated traffic is additional.

## Retained failures and fixes

**Clean startup and preload.** The [baseline evidence](../../output/competitive/desktop/runs/baseline-2026-09-06T06-30-44-012Z/evidence.json) records executable PID 38756 exiting 1 at `2026-09-06T06:31:00.880Z` with `Production runtime configuration is incomplete: OTTE_ASSET_URL_SIGNING_SECRET`. The selected profile contained the startup error and no database. Independently, the [original packaged preload](../../output/competitive/desktop/baseline-preload-format.json) failed classic-script compilation with `Cannot use import statement outside a module`. Electron's [sandboxed preload documentation](https://www.electronjs.org/docs/latest/tutorial/esm#sandboxed-preload-scripts-cant-use-esm-imports) describes that restriction.

The desktop now generates one random 32-byte signing key on first use, exclusively creates `data/asset-url-signing.key`, and reuses it. Invalid/unreadable existing keys fail closed; explicit configured keys are honored without reading or replacing the local file. The preload uses Electron's supported `require` with TypeScript-only type queries. Sandbox, context isolation, disabled Node integration, privileged-renderer checks, and AI behavior remain intact. An explicitly handled absolute `--user-data-dir` confines application data before readiness; the normal OS data location remains the default.

**Cookie origin.** The [first repaired run](../../output/competitive/desktop/runs/restore-2026-09-06T14-03-57-661Z/evidence.json) reached browser login but the cookie-confirmation POST received 403. The API captured allowed origins before the web server had its assigned port. Desktop startup now binds the web server first, defaults blank `OTTE_WEB_ORIGIN` to that URL, adds only the exact URL to the preserved/deduplicated `OTTE_CORS_ALLOWED_ORIGINS`, starts the API, and attaches the API proxy target before loading the window. Explicit public-origin settings remain honored. API origin guards, Secure/HttpOnly cookies, and proxy trust were not weakened.

**Rendered images.** The [origin-fixed run](../../output/competitive/desktop/runs/restore-2026-09-06T14-22-57-803Z/evidence.json) passed its original 26 checks. The [retained screenshot](../../output/competitive/desktop/runs/restore-2026-09-06T14-22-57-803Z/02-restarted-packaged-renderer.png) and [separate visual-review failure](../../output/competitive/desktop/runs/restore-2026-09-06T14-22-57-803Z/renderer-image-review.json) show why that was insufficient: signed asset URLs used API port 57383 while the renderer used web port 57380. The existing `img-src 'self' data: blob: https:` policy blocked those requests before HTTP. Through-proxy asset retrieval had returned the exact original bytes.

The final source defaults blank `OTTE_PUBLIC_URL` to the bound web URL, using the existing signed-asset base setting. Explicit public URL/CDN settings remain honored. Signing, asset permissions, and CSP remain enforced. The strengthened journey requires a decoded 600×400 scene map, decoded token and thumbnail images, signed URLs on the renderer's own origin, and a screenshot. The [earlier harness](../../output/competitive/desktop/packaged-journey-before-image-checks.mjs) is retained. A separately reproduced repeated socket-listener warning was fixed by avoiding duplicate tracking of reused proxy sockets; the final executable has not yet verified that warning's absence.

## Verified restoration and focused checks

The origin-fixed executable imported the synthetic portable campaign, recovered its player through a local outbox, restored scene/actor/token links and handout audiences, denied direct GM handout access and hidden GM token mutation, and let the player move its token to `(225, 175)` and post chat. After normal close/restart it retained identities, ownership, movement, chat, exact image bytes, and the same signing key. Actual browser login then opened the imported scene with the owned token and without the hidden GM token. Both processes exited 0 without forced termination; [shutdown verification](../../output/competitive/desktop/origin-fixed-shutdown-verification.json) found no owned application processes or API/web/debug listeners.

The archive is 27,575 bytes, SHA-256 `fc7add5e7f10057c3619d7f895d8517217196d504fac9ce72c387e20e3db78a8`. Its embedded PNG and restored authorized downloads share SHA-256 `57f9d350ff34ae6115a1fb741b1c118780263895121543cd5741f00b03a4823d`.

Focused checks passed:

- [Desktop typecheck](../../output/competitive/desktop/delivery-typecheck.log) and [30 desktop tests](../../output/competitive/desktop/delivery-desktop-tests.log), including signing-key lifecycle, effective preload compilation, startup-time environment capture, explicit-origin/CDN preservation, and closing the already-bound web server after API startup failure.
- [Nine authentication integration tests](../../output/competitive/desktop/origin-auth-security-tests.log), including a production cookie flow with distinct API/web ports: the configured web origin confirms the Secure HttpOnly host cookie, while a third loopback port returns 403 without changing pending/legacy sessions.
- The strengthened evidence script passes Node syntax checking. Its final image assertions have **not** passed in the blocked executable.

## Build identity and Windows gate

The [build script](../../output/competitive/desktop/build-distribution.ps1) records app/package/lockfile hashes before and after each build and rejects changes. Each pair matched:

| Phase | Files | Aggregate SHA-256 |
| --- | ---: | --- |
| Baseline | 749 | `df0daa906d4f6a959e8c9101fd71e1198ddc63fe182f610d0b0d5f2412d5de63` |
| Fixed | 752 | `d9e62308335b78006edfc1c0dc165ea84cefa8dc9d74e2d73429c68fe21c64f9` |
| Origin-fixed | 753 | `cab0a4da1e50999040994d91475117c0da143d4587d36276c402096a9e3a68f0` |
| Delivery-fixed | 754 | `447f9227f82fcfc3945e69cdef756b45110b909527684becbe814d1b009c9ac4` |

The [final build log](../../output/competitive/desktop/delivery-fixed-build.log), [packaging log](../../output/competitive/desktop/delivery-fixed-package.log), [before manifest](../../output/competitive/desktop/delivery-fixed-before-source.json), and [after manifest](../../output/competitive/desktop/delivery-fixed-after-source.json) establish a successful stable-source build. The evidence build used the installed Electron distribution, disabled native dependency rebuilding, and skipped executable editing/signing. It does not validate every default release-tool or installer prerequisite.

Final artifact identities:

- `OpenTabletop.exe`: `d9ce231bb2baee67961d218259d0e4b067b86f342f9eceaaec4291ae586ee367`.
- `resources/app.asar`: `14fc68dfc6891bab54c9b23b6d01dfa655c5efeac15f6052c763f2440be50f00`.
- Web `index.html`: `76d7e918e9870d29239e30879c49acbc235ef6fc65ff125921fa7451330cebef`.

The [final attempted journey](../../output/competitive/desktop/runs/restore-2026-09-06T14-42-14-449Z/evidence.json) failed with `spawn UNKNOWN`. [Matching Windows evidence](../../output/competitive/desktop/runs/restore-2026-09-06T14-42-14-449Z/windows-launch-block.json) records Code Integrity events 3033 and 3077 at `14:42:24.970Z` and `14:42:26.377Z`, naming the exact final executable and policy `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`. The executable is `NotSigned`; Windows reported that it did not meet enterprise signing requirements. There were zero application launches, zero journey checks, zero HTTP requests, and no remaining owned application/debug listener. No retry through another execution path or trust-policy change was attempted.

## Independent Node/static-browser validation

The [separate public-runtime harness](../../output/competitive/desktop/public-runtime-delivery.mjs) ran current compiled API/static-web runtimes under Node and normal Chrome, using a new workspace profile and the same synthetic archive. It did not load or execute the blocked executable or launch Electron. Its [final evidence](../../output/competitive/desktop/public-runs/2026-09-06T14-54-53-242Z/evidence.json) records **16 passing assertions, 11 explicit HTTP requests, and 34 browser requests** from `14:54:53.243Z` through `14:54:59.620Z`.

The real browser decoded the 600×400 map, token image, and scene thumbnail from signed URLs on web origin `http://127.0.0.1:59132`, distinct from API port 56511. A browser fetch of the signed map matched the archive's exact PNG hash. CSP stayed unchanged with no violations. Player views omitted the hidden GM token; direct GM resource/mutation requests returned 404. A cookie mutation carrying another loopback origin returned 403. The [decoded scene screenshot](../../output/competitive/desktop/public-runs/2026-09-06T14-54-53-242Z/decoded-public-runtime-scene.png) was visually inspected and shows the restored map and images without broken placeholders.

An [earlier independent run](../../output/competitive/desktop/public-runs/2026-09-06T14-52-36-461Z/evidence.json) failed the cookie observer assertion after image, sign-in, and privacy checks passed. The final run establishes the distinction: `context.cookies()` contains the Secure HttpOnly `__Host-otte_session` cookie, while the URL-filtered `context.cookies("http://127.0.0.1:59132")` result is empty. The harness retained the security assertion and checked actual confirmation Set-Cookie attributes: Secure, HttpOnly, SameSite=Lax, Path=/, and no Domain. Two additional cookie-only browser session requests returned 200 for the expected player. No cookie or signing-key values appear in summarized evidence.

[Source manifests](../../output/competitive/desktop/public-runtime-before-source.json) remained identical before/after with the final build's aggregate `447f9227f82fcfc3945e69cdef756b45110b909527684becbe814d1b009c9ac4`. The [compiled runtime manifest](../../output/competitive/desktop/public-runs/2026-09-06T14-54-53-242Z/runtime-before.json) also matched its after-run counterpart: aggregate `da69df0c78b2de8b3af735b7fe70a8ae298593e859b627b7a58813adaf7133e5`. [Cleanup verification](../../output/competitive/desktop/public-runs/2026-09-06T14-54-53-242Z/cleanup-verification.json) found no remaining API/web/debug listener or owned Chrome/executable process. The independent run emitted no repeated socket-listener warning.

A policy-accepted release artifact is still required to complete the actual executable's image journey. This independent Node/static-browser pass does not substitute for Windows executable acceptance. Installer, signature, clean-machine, macOS, and relay evidence remain separate.
