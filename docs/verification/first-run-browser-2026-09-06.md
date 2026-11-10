# First-run browser evidence — 2026-09-06

This is an observed local Chromium journey through the current application UI. It is not a packaged-install result or a timed comparison with Roll20.

## Completed journey

1. Registered a new synthetic GM account through the application. The account owned its workspace and initially had no campaign.
2. Used the empty-state campaign action and setup wizard to create **The Lantern Vault**, using **D&D 5.5e SRD** and a **First Session** starter scene.
3. Enabled a shareable player invitation and public welcome material in the wizard. The application completed setup and opened the invitation controls.
4. Opened that exact invitation in a separate browser session, created a distinct synthetic player account, and accepted the invitation.
5. Verified the independently authenticated player reached **The Lantern Vault → First Session**. The visible connection indicator showed **Connected · 2 online**. No developer console or manually constructed campaign API request was needed for campaign creation or joining.
6. As the GM, uploaded the authored 1020 × 760 raster map, calibrated its printed 47.5-pixel grid with origin **23, 17**, and observed the aligned artwork and grid. The detailed map acceptance test separately tracks precision, visibility, and drag behavior.

## Artifacts

- [Application entry](../../output/competitive/02-current-entry.png)
- [New GM empty state](../../output/competitive/03-new-gm-empty.png)
- [Campaign review](../../output/competitive/04-campaign-review.png)
- [Invitation ready](../../output/competitive/05-invite-ready.png)
- [Independently joined player](../../output/competitive/06-player-joined.png)
- [Calibration review](../../output/competitive/07-grid-calibration-review.png)
- [Applied offset grid](../../output/competitive/08-calibrated-map.png)

The entry, joined-player, calibration-review, applied-grid, corrected campaign-review, and corrected invitation-details captures were visually inspected. Screenshots supplement the live interaction; they are not proof of all underlying permissions or persistence.

## Findings and limits

- The new empty-campaign state originally lacked a clear next action. It now offers **Start your first table** and **Create campaign**, opening the campaign workflow.
- The invitation screen now shows **Accept Invite**, **The Lantern Vault**, and **Invited as Observer** before account credentials are entered. This was verified in a separate unauthenticated Chrome session using a newly created local open invite, with email and password fields empty. [Invitation details capture](../../output/competitive/10-invitation-details-fixed.png).
- The campaign wizard now includes the exact campaign name and rules system in its final review. The live browser retained **Review Summary Verification** and **Stellar Frontiers** after switching from the default system. This verification stopped at review without creating another campaign. [Review capture](../../output/competitive/09-campaign-review-fixed.png).
- At the original map zoom, floating controls could cover a corner. Hiding the inspector and zooming out exposed the edge landmarks. This is control occlusion, distinct from image cropping.
- A subsequent automated drag exposed an inspector-opening layout shift during the gesture. Selection is now deferred until the gesture completes; the unchanged native-coordinate regression passed with token position **260.5, 254.5** after persistence and reload. The final six-case map/player-view run also passed portrait, square, existing-geometry preservation, and inactive-new-scene checks. See the [browser run](../../output/competitive/map-preview/browser-run-post-fix.log) and [source stability record](../../output/competitive/map-preview/source-stability-post-fix.json).
- Local development server restarts and source changes interrupted an earlier wizard attempt; the saved wizard draft resumed. Those development interruptions are excluded from product reliability and timing claims.
- Synthetic accounts and local data were used. The invite token and account passwords are deliberately omitted from this report. No real mail, public deployment, live AI request, or external account mutation formed part of this journey.
- No end-to-end completion time is claimed: debugging, development restarts, and browser handoffs made the elapsed wall time unsuitable for a first-run timing benchmark.

Follow the revised [GM guide](../dogfood/first-run-gm-guide.md) and [invitation guide](../dogfood/invite-session-guide.md) for the supported workflows. Installation/distribution, assistive technology, native mobile devices, and live-provider outcomes remain separate evidence.
