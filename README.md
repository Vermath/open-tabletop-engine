# Premium-feel review evidence

These captures use disposable local OpenTabletop Engine fixtures on Windows. Each folder records the source commit used for its captures. Viewport names refer to CSS pixels. Frame reports use the production Chromium board harness at 1440 × 900.

| Pull request | Evidence |
| --- | --- |
| [#83](https://github.com/Vermath/open-tabletop-engine/pull/83) | [Token portraits and initials](83) on dark and light maps at 50%, 100%, and 300% zoom in both themes |
| [#84](https://github.com/Vermath/open-tabletop-engine/pull/84) | [Baseline](main) and [design-token captures](84) |
| [#85](https://github.com/Vermath/open-tabletop-engine/pull/85) | [Inspector and chat](85) |
| [#86](https://github.com/Vermath/open-tabletop-engine/pull/86) | [Board chrome and rail](86) |
| [#87](https://github.com/Vermath/open-tabletop-engine/pull/87) | [Sign-in, workspace, and management](87) |
| [#88](https://github.com/Vermath/open-tabletop-engine/pull/88) | [Floating-panel and inspector-tab exit recording](88/floating-panel-and-tab-exit.webm) |
| [#89](https://github.com/Vermath/open-tabletop-engine/pull/89) | [Native form controls](89) |
| [#90](https://github.com/Vermath/open-tabletop-engine/pull/90) | [Dice casts](90) on desktop and phone at 450 ms and 2 s |
| [#92](https://github.com/Vermath/open-tabletop-engine/pull/92) | [Live Table and Prep inspector widths](92) at 1440, 1280, and 1024 CSS pixels |
| [#93](https://github.com/Vermath/open-tabletop-engine/pull/93) | [Empty states and the campaign loading shell](93) |
| [#94](https://github.com/Vermath/open-tabletop-engine/pull/94) | [Board before](94-before), [board after](94), and [before](94/perf-before.json) and [after](94/perf-after.json) frame reports |
| [#95](https://github.com/Vermath/open-tabletop-engine/pull/95) | [Animated-light board](95) and the [12-light frame report](95/perf.json) |
| [#96](https://github.com/Vermath/open-tabletop-engine/pull/96) | [Explore demo](96/explore-demo.png) |

The Chromium colour-contrast reports for [#84](84/contrast.json), [#85](85/contrast.json), [#86](86/contrast.json), and [#87](87/contrast.json) cover sign-in, Live Table, Actors, Chat, Compendium, Prep, and Manage on each theme at desktop and phone widths. The reports list elements that axe could measure and elements that require visual sampling. The Ember damage action measured 4.44:1 before its correction and passed the rerun.

The player empty-state captures include Adversaries, Chat, Handouts, and Journal. Asset library and encounter authoring are gated to users with the corresponding permissions.
