# Board-capture cost investigation

Date: 2026-07-17

Backlog: T45

## Finding

The audit's 30-second external CDP screenshot timeout is not the same path as the product's AI board capture. The product listens for `agent.boardCaptureRequested` and rasterizes only the mounted element marked `data-agent-board-root="true"`; it does not request a browser full-page or scene-coordinate-sized screenshot. The board element is sized from the current viewport and zoom rather than directly from the map's source dimensions.

The live path did retain one avoidable cost multiplier: `html-to-image` used the lesser of `2` and the device pixel ratio without a total-pixel ceiling, and `cacheBust: true` forced image refetches. A high-DPI client with a zoomed board could therefore rasterize several times the visible CSS pixel area and repeat asset work.

## Remediation and regression boundary

- Live board capture now derives its pixel ratio from a 4,000,000-raster-pixel ceiling, with a quality ceiling of 2x.
- Capture reuses the images already loaded by the board instead of cache-busting every asset.
- Unit coverage proves ordinary captures retain 2x quality and large/high-DPI boards remain inside the pixel budget.
- The existing server request remains bounded to 15 seconds by default and returns `board_capture_unavailable` rather than blocking an AI turn indefinitely.

This exonerates scene source dimensions as the cause of the reported external CDP timeout and closes T45 without a separate product follow-up. Reopen only if an end-to-end `capture_board_view` observation exceeds the server's bounded window on a supported browser; preserve the request id, board CSS dimensions, chosen pixel ratio, elapsed render time, token count, and background asset size for that report.
