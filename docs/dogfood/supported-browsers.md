# Supported Browsers

Status: compatibility statement for the 2026-09-06 working tree.

## Current support boundary

| Environment | Status | Evidence boundary |
| --- | --- | --- |
| Current desktop Chromium / Google Chrome | Supported automated baseline | Playwright core, realtime, accessibility, and bootstrap journeys run with the repository's pinned Chromium |
| Current Microsoft Edge | Expected compatible, not separately certified | Edge uses Chromium, but no separate release matrix is recorded |
| Firefox 151.0 on Windows | Bounded automated coverage | Five scenarios passed: owner bootstrap, private-session join/chat/character action, scene token selection/dragging, archive download/upload, and API restart followed by reload |
| Playwright WebKit 26.5 on Windows | Bounded automated engine coverage | The same five scenarios passed; this is WebKit automation, not an installed Safari or iOS device test |
| Safari desktop on macOS | Actual browser unverified | The Windows WebKit results do not certify Safari on macOS |
| iOS/iPadOS Safari and Android browsers | Responsive layout smoke only; real devices unverified | Automated viewport/touch checks do not replace real-device browser or assistive-technology evidence |

The [2026-09-06 cross-browser report](../verification/crossbrowser-2026-09-06.md) records the ten Firefox/WebKit engine/scenario cases, exact versions, commands, passing invocations, and test corrections. Its reconnect coverage is API restart followed by page reload; in-place offline recovery was not established by this matrix.

“Supported” means the desktop Chromium baseline is covered by automated tests. Firefox and WebKit have the narrower recorded scenario coverage above. These results do not certify every application surface, extension, GPU/driver combination, or older browser release. Users should enable JavaScript, WebSocket connections, IndexedDB/local storage, and WebGL for the complete tabletop experience.

## Reporting compatibility defects

Include the browser name and exact version, operating system, input method, whether hardware acceleration is enabled, the affected campaign/scene, and whether reload or reconnect recovered the table. Do not include session tokens, invite secrets, private campaign content, or signed asset URLs.

Broader Firefox release certification, actual Safari and Edge certification, real mobile devices, NVDA, Narrator, VoiceOver, and TalkBack remain explicit release-evidence work. No assistive-technology or physical-device certification follows from the Firefox/WebKit automation. See the [assistive-technology pass plan](../verification/accessibility-assistive-tech-pass.md).
