# Independent competitive critique: 2026-09-05

## Verdict

**Not yet.** At inspected commit `08e82dcadb61a7675b688cf321cdf7256cf2a469`, I do not believe OpenTabletop is better than the current Roll20 overall. Its self-hosted, portable, API-first design and permissioned extensions give it a plausible long-term advantage, but basic map preparation and GM confidence still have concrete defects. A large feature list and passing local tests do not outweigh those defects.

The user asked for a product that is better than Roll20 and a credible long-term competitive threat. A narrower claim about self-hosting is useful positioning, but does not replace that objective. Equally, matching every licensed book or every community sheet is not a sensible code acceptance criterion. The critic will judge complete GM/player workflows, their reliability, and whether the product demonstrates advantages substantial enough to overcome switching friction.

This is the initial competitive pass, not a release approval or an exhaustive future feature list. New fixes require independent reassessment. The findings below distinguish source-proven product defects from missing evidence and external factors; unknown does not mean broken.

## Evidence basis

- The latest repository gate reports 2,344 passing tests and one external OIDC/SCIM readiness skip across 383 files. The browser report records 79 distinct passing Chromium cases, zero browser skips, including successful targeted reruns after failures in the original batch. Those results support regression confidence, not a claim that the original default command passed without failures. See [repository gate](../../output/gauntlet/ux-final-gate-summary.md) and [browser evidence](../../output/gauntlet/ux-final-browser-summary.md).
- The browser journeys include clean bootstrap, a canonical GM/player journey with API restart, and a full level-three combat. New responsive cases exercise real disclosures, campaign switching, short-phone scene interaction, and inspector restoration. The text AI fixture is deterministic loopback; successful live image generation and live model task quality are not established by those passes.
- This critic inspected onboarding, browser-support and capacity documentation, current browser configuration, import surfaces, and rules-system boundaries. The map-specific source audit was independently supplied by `map_import_explorer`; exact anchors are recorded below. This report does not claim a new hands-on Roll20 session or a timed comparative benchmark.
- [The current Roll20 baseline](roll20-baseline-2026-09-05.md) uses official sources accessed on 2026-09-05. In particular, Roll20 shipped true Player View on July 15, native UVTT import on July 16, and relaunched guided grid alignment beta on August 26. Those are present-day comparators, not speculative roadmap items.

## Product rubric

The states below describe the evidence available at the inspected commit. There is no numeric aggregate score: ten thin implementations should not cancel one blocked core task.

| Dimension | Current assessment | Evidence that would change the assessment |
| --- | --- | --- |
| First usable table and invitation | Promising implementation; clean new-GM experience needs direct assessment, and the published first-run guide describes an older developer/demo path. | Clean application state to a named playable campaign, shareable invite, and independently joined player without console or undocumented knowledge. Record time, interventions, and failure recovery. |
| Session preparation | **Blocked by map fit/alignment defects and absent native UVTT ingestion.** Existing session/world/handout draft defects were fixed in the preceding audit. | Import an actual offset-grid map and a UVTT map, preserve their geometry, verify lighting, place actors, publish a handout, and start the session. |
| Live tabletop control | Real combat journey passes; current player-vision preview is not a faithful player view. | Side-by-side GM and actual player sessions agree with preview after token, ownership, light, door, and visibility changes; common actions stay usable during play. |
| Rules and characters | Substantial D&D SRD automation and character validation exist. Broad Roll20 system/content parity is not established and is not implied by a generic SDK. | A complete representative party workflow from legal character creation through encounter, rest, advancement, inventory, and homebrew exception, with rule outcomes checked independently of implementation. A second system must be usable through the public extension path. |
| Collaboration and recovery | Canonical local multiplayer/restart evidence exists; wider network conditions need measurement. | Independent GM/player contexts survive disconnect, reconnect, concurrent edits, scene changes, and host restart with correct visible state and no lost acknowledged action. |
| Import, export, and ownership | Portable archives and review/rollback affordances are a real potential advantage; UVTT is a concrete missing common input. | Move a user-owned campaign with embedded assets to a fresh installation and resume with correct relationships and permissions; malformed/conflicting imports leave no partial surprise. Document exactly which external formats are supported. |
| Extension development | Typed public SDKs and permission checks offer a potential advantage over a campaign-bound scripting sandbox. | Build and install a useful extension using only the published SDK/API, demonstrate its permission request and denial, then upgrade/rollback without an engine-source edit. Measure developer friction. |
| Responsiveness and scale | **Competitive responsiveness is unmeasured.** Existing capacity gate deliberately permits seconds of latency and omits browser rendering. | Reproducible browser and server measurements on representative loaded campaigns, including token drag, pan/zoom, initial load, event fanout, and reconnect. Fix measured failures before claiming speed. |
| Reliability and distribution | Extensive local coverage is valuable; dependency remediation and external release evidence remain separately tracked. | Current checks plus a real packaged-install/restore journey, accurate support boundaries, and clean external gates. A source build is not evidence that a new GM can successfully install a release. |
| Phone, keyboard, and accessibility | Short-phone Chromium geometry and automated keyboard/accessibility coverage improved. Firefox/WebKit and actual assistive technology remain unverified. | Representative GM/player browser journeys in Firefox and WebKit; phone/tablet interactions beyond layout; real screen-reader/device evidence recorded separately. |

## Code-addressable findings and acceptance

This is the complete material list identified in this pass. Order is sequencing, not a cap on the work. Evidence-only tasks should first measure existing behavior; they are not permission to invent a defect or perform a large speculative rewrite.

### C01 — An uploaded map can be cropped to unrelated scene dimensions

The server already computes image width and height, but the upload path assigns the background without adapting the scene dimensions. The renderer fills the old scene rectangle with `object-fit: cover`. A map whose aspect ratio differs from the existing scene can therefore lose meaningful edges. This is a core preparation defect, not cosmetic polish.

Source: `apps/api/src/asset-renditions.ts:45`, `apps/api/src/app.ts:4191`, `apps/api/src/app.ts:4199`, `apps/web/src/App.tsx:4741`, `apps/web/src/styles.css:1062`.

Acceptance: upload landscape, portrait, and square maps with visibly marked borders into differently shaped scenes; all map edges remain visible at their intended coordinates. The scene dimensions and scale chosen by the workflow must be explicit and recoverable. Existing scenes with placed entities must not silently move their content. Verify real images in a browser, not only stored numeric fields.

### C02 — Calibration cannot represent an offset grid, and snapping rounds fractional cell sizes

The scene model exposes grid size but no origin. Calibration computes distance/cells and saves only size; the grid overlay begins at zero. Maps with decorative borders or an offset printed grid cannot be accurately aligned. Separately, the canvas rounds cell size for snapping, creating drift when the calibrated size is fractional.

Source: `packages/core/src/types.ts:263`, `apps/web/src/grid-calibration.tsx:13`, `apps/web/src/App.tsx:3512`, `apps/web/src/scene-canvas.tsx:354`, `apps/web/src/scene-canvas.tsx:1461`.

Acceptance: an authored fixture with a visible 23-pixel left border, 17-pixel top border, and a 47.5-pixel printed grid aligns after the normal UI workflow. Near and far intersections, token snapping, measurement, zoom, save/reload, and archive round-trip agree to the documented tolerance. Cover every grid type the application advertises for calibration. Provide labelled keyboard/numeric alternatives to precise pointer selection.

The current N14 browser case uploads a blank 800-by-600 SVG, enters fabricated points, and checks `gridSize` and readiness. It proves control wiring, not alignment against artwork (`tests/e2e/final-browser-acceptance.spec.ts:402`). Replace or supplement it with a geometrically meaningful fixture.

Roll20 currently provides a guided anchor/scale/fine-tune workflow and explicit grid offsets. [Official grid-alignment documentation](https://blog.roll20.net/posts/align-to-grid-new/).

### C03 — Native UVTT input is absent

The audited `apps` and `packages` sources contain no UVTT, `.dd2vtt`, or `.df2vtt` ingestion. Map upload accepts raster/SVG images only (`apps/web/src/App.tsx:9936`). A GM bringing a prepared map must recreate its geometry and lighting by hand.

Acceptance: normal map upload accepts a documented subset of all three file extensions and imports image, scene scale/dimensions, walls, doors/windows, and lights through typed permission-checked commands. Show unsupported features and malformed geometry before applying; enforce size/type/coordinate limits, preserve provenance, and avoid partial state after rejection or failure. An imported fixture must render and behave correctly for an actual player, then survive archive restore. Do not merely parse JSON and count objects.

Roll20's native uploader already places the background and dynamic-lighting entities, with free uploads and tier-dependent active lighting. [Official UVTT release](https://blog.roll20.net/posts/page-menu-updates/).

### C04 — Player vision preview is only a mask preview, not the player's rendered scene

The preview response contains `VisionSnapshot` polygons, and the client swaps only `snapshot.vision`. `SceneCanvas` still receives GM tokens, actors, user identity, and the GM vitals flag. Token rendering filters only by scene; GM-layer tokens remain above fog. Thus the preview can show things the selected player cannot see. This finding concerns the GM preview; it is not evidence that actual player API responses leak those entities.

Source: `apps/api/src/app.ts:4368`, `packages/core/src/types.ts:580`, `apps/web/src/App.tsx:5538`, `apps/web/src/App.tsx:1355`, `apps/web/src/App.tsx:10322`, `apps/web/src/scene-canvas.tsx:525`, `apps/web/src/scene-canvas.tsx:1716`, `apps/web/src/styles.css:1342`, `apps/web/src/styles.css:1413`, `apps/web/src/styles.css:1488`.

Acceptance: a clearly identified player preview uses the same effective scene visibility rules as the selected actual player, including token layers, actor details/vitals, annotations, lighting, and ownership. Compare it with an independently authenticated player while the GM changes doors, lights, token ownership, and hidden entities. Preserve the GM workspace on exit, refresh or invalidate the preview on relevant changes, and do not expose private player-to-player communications. If a control remains a token-vision-only preview, label its narrower purpose accurately; that relabelling alone does not satisfy the competitive player-view task.

Roll20 now exposes a separate true player view with player-visible scene, Journal, and Chat surfaces, while keeping private player whispers hidden. [Official Player View release](https://blog.roll20.net/posts/player-view-is-here/).

### C05 — Published first-run and invite guidance is stale

`docs/dogfood/first-run-gm-guide.md` begins with dependency installation, the full repository check, and two development servers, then routes the GM through old Import/Actors/SDK/Content tabs and a beta demo. `docs/dogfood/invite-session-guide.md` describes pasting a token and a demo-session switcher. The current app has campaign setup, shareable invite links, and revised workspaces, so these documents no longer teach the product being assessed.

Acceptance: write and independently follow the current new-GM, invited-player, map-prep, and reconnect paths. Lead with the supported installation/access path, name real controls, and link developer setup separately. A fresh user must not need repository internals to understand the next action. Record and fix additional onboarding defects found by the root's fresh-browser pass.

### C06 — The performance gate cannot support a claim of competitive responsiveness

`docs/verification/small-group-capacity-envelope.json` covers one SQLite writer, one active campaign, six realtime connections, 200 tokens, 300 chat messages, and 60 journals. It permits p95 reads and mutations of 4 seconds, fanout of 6 seconds, and reconnect of 5 seconds. Its three short cycles and server-side timings do not measure sustained play, browser rendering, or large asset costs. The accompanying document correctly calls these loose compatibility budgets. This is missing measurement, not evidence that actual latency is that slow.

Acceptance: add a repeatable performance journey with measured hardware/browser/build, representative maps, six independent clients, a longer active-play interval, and a larger-history case. Record p50/p95 user-visible action latency, drag/pan frame times, memory, startup, reconnect, and errors. Proposed initial engineering targets are p95 local acknowledged action visibility below 250 ms and p95 drag/pan frame time below 33 ms on the recorded machine; these are target budgets, not measured Roll20 results. Establish network-shaped budgets separately and disclose unsupported scale. Optimize only where measurement fails.

### C07 — Cross-browser automation and actual mobile/AT evidence are missing

`playwright.config.ts` defines only the Chromium project. `docs/dogfood/supported-browsers.md` explicitly marks Firefox and Safari unverified, Edge expected but uncertified, and mobile as responsive smoke only. Automated accessible-name and keyboard assertions do not establish screen-reader comprehension.

Acceptance: add and execute a bounded Firefox/WebKit matrix for first-run/join, scene interaction, character action, chat, archive download/upload, and reconnect; fix failures. Keep real Safari/iOS, Android, NVDA/Narrator/VoiceOver/TalkBack passes as separately identified device/human evidence. A Playwright WebKit pass must not be presented as an actual iOS device test. Update support claims to the verified result.

### C08 — Claimed differentiators need outcome evidence

Portable archives, public APIs, typed extensions, and automatic AI execution are promising product capabilities. The current large regression suite does not by itself establish that a GM saves meaningful time using them, that an outside developer can integrate quickly, or that a live model completes useful work reliably.

Acceptance: record complete outcome journeys for (a) export/import into a fresh installation and resume, (b) a useful extension built solely against the public SDK/API with permission denial and upgrade/rollback, and (c) a configured real provider completing a multi-step preparation task in its existing automatic-execution mode, including correction/retry and final table state. Disclose fixture use, credentials, model, latency, and costs where relevant without exposing secrets. A provider-unavailable path is valuable recovery coverage but cannot count as successful generation. Do not redesign or restrict the existing AI behavior to make the demonstration easier.

### C09 — Network-disruption and sustained multiplayer recovery lack browser evidence

The current cases do not exercise browser offline/online transitions, packet loss or latency jitter, a dropped/reordered realtime stream, abrupt interruption during a write, mobile sleep/resume, or a long outage. Editor concurrency often uses a direct API call as the second writer. This is an evidence gap, not a claim that reconnect or conflict handling is absent.

A read-only inventory of the 79 cases found five cases with distinct simultaneous GM/player browsers. The full combat uses one GM browser controlling four sheets. Restart cases use a graceful local process restart; the canonical case then explicitly reloads both pages. Existing archive coverage includes a synthetic 4.26 MB asset and a mocked browser file-picker sink. These are useful bounded checks, not a six-player soak, abrupt-crash recovery, an operating-system save-dialog test, or a large-campaign migration.

Source: `tests/e2e/canonical-public-journey.spec.ts:707`, `tests/e2e/ai-provider-concurrency.spec.ts:87`, `tests/e2e/editor-concurrency.spec.ts:45`, and `tests/e2e/start-api.mjs:60` establish the existing bounded cases. The browser-suite inventory found no network-shaping/offline or sustained six-player case.

Acceptance: use independent GM and player browser identities for a longer session with chat, movement, rolls, scene changes, and simultaneous edits. Disconnect a player, continue acknowledged GM changes, reconnect without a manual reset, and verify state and hidden-entity boundaries. Exercise latency, interrupted in-flight requests, and host restart/crash against isolated test data; acknowledged actions must persist and uncertain actions must reconcile with useful feedback rather than silently duplicate or vanish. Measure recovery time. Offline editing is not required merely to satisfy this gate; the product must explain and correctly handle whatever offline behavior it actually supports.

## Comparative exercise and next tranche

Start by fixing C01-C04 as one cohesive map-preparation and GM-verification tranche, while collecting C05's fresh onboarding evidence. This is sequencing, not the final scope. The most convincing next demonstration is: bring a prepared map, get it accurately aligned and lit, place the party, verify each player's view, invite a new player, and start a real encounter.

For each comparative task, use the same legal map/content, equivalent account capability, a fresh campaign, and a declared browser/machine. Count completed outcomes, elapsed time, manual edits, documentation lookups, recoveries, and failures. Separate prior product familiarity from product friction. Record source-based competitor facts separately from firsthand observations; a help-page workflow is not a measured competitor result.

The critic will reassess when the material defects are closed and complete journeys show substantial benefits across preparation, live play, and ownership/extension workflows without regressions in invited-player experience, confidentiality, or reliability. A result can be a compelling overall product while acknowledging Roll20's content ecosystem advantage. Passing this initial map tranche alone is not sufficient for the requested verdict.

## External factors and evidence, kept separate

- Roll20 has an established licensed-content and community-sheet ecosystem, hosted convenience, and integration/distribution channels. Licenses, publisher relationships, actual adoption, and retention cannot be produced by editing this repository. Do not copy proprietary content or claim an equivalent catalog from an SDK alone.
- Hosted availability, real internet relay conditions, signing/notarization credentials, external identity providers, and actual device/assistive-technology passes require the corresponding environment. Local substitutes must be labelled honestly.
- The separately prepared dependency remediation was blocked by automatic approval review and remains unresolved; the critic cannot count it as fixed or reinterpret the rejection as an executed patch. See [the prepared remediation and validation plan](../../output/gauntlet/ux-pr67-dependency-remediation-proposal.md).
- No competitor employee reaction is predictable evidence. A credible long-term threat is an inference from demonstrated user value and a sustainable extension/ownership model, not a fabricated endorsement or a test-count comparison.
