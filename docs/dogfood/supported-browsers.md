# Supported Browsers

Status: compatibility statement for the 2026-07-13 working tree.

## Current support boundary

| Environment | Status | Evidence boundary |
| --- | --- | --- |
| Current desktop Chromium / Google Chrome | Supported automated baseline | Playwright core, realtime, accessibility, and bootstrap journeys run with the repository's pinned Chromium |
| Current Microsoft Edge | Expected compatible, not separately certified | Edge uses Chromium, but no separate release matrix is recorded |
| Firefox desktop | Unverified | No complete Firefox release run is recorded |
| Safari desktop | Unverified | No WebKit/Safari release run is recorded |
| iOS/iPadOS Safari and Android browsers | Responsive layout smoke only | Automated viewport/touch checks do not replace real-device browser or assistive-technology evidence |

“Supported” means the current desktop Chromium baseline is covered by automated tests; it is not a promise that every extension, GPU/driver combination, or old browser release works. Users should enable JavaScript, WebSocket connections, IndexedDB/local storage, and WebGL for the complete tabletop experience.

## Reporting compatibility defects

Include the browser name and exact version, operating system, input method, whether hardware acceleration is enabled, the affected campaign/scene, and whether reload or reconnect recovered the table. Do not include session tokens, invite secrets, private campaign content, or signed asset URLs.

Firefox, Safari, Edge certification, real mobile devices, NVDA, Narrator, VoiceOver, and TalkBack remain explicit release-evidence work until their matrix entries are recorded. See the [assistive-technology pass plan](../verification/accessibility-assistive-tech-pass.md).
