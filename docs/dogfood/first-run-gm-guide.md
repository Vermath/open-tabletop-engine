# First-Run GM Guide

Use this guide to take a new campaign from account setup to a playable table. Check the [supported browser statement](./supported-browsers.md): desktop Chromium is the automated compatibility baseline, and Firefox 151.0/WebKit 26.5 on Windows have [bounded owner-setup and play evidence](../verification/crossbrowser-2026-09-06.md). Actual Safari, mobile-device, and assistive-technology certification remain separate.

## Open your table

Choose the access path you have:

- **A server already exists:** open the web address supplied by its administrator. Use **Login** with your account or follow a GM invitation. **Register** appears only when that server allows public registration.
- **You have a desktop installer/build:** install and launch the supplied OpenTabletop desktop app. It starts its local server and opens the table. See [Desktop Hosting](../deployment/desktop-hosting.md) and the [desktop release/build instructions](../../README.md#desktop-releases) for packaging details; this guide does not assume a published installer is available.
- **You are setting up the server yourself:** complete [Self-Hosting](../deployment/self-hosting.md), then return here. Contributors running from source can use the separate [Development instructions](../../README.md#development).

A remote player needs your reachable table address. A `localhost` address opens that player's own computer; it does not connect to your table. Desktop internet sharing is covered in the [invite guide](./invite-session-guide.md#desktop-hosts).

## Create your account and campaign

On a completely new installation, **Create Owner** asks for **Email**, **Name**, **Password** (at least eight characters), and **Campaign**. Choose **Create**. This creates the owner account, an initial campaign and scene, and opens **Prep**. Keep these account credentials for your next visit.

If the installation already has accounts, use **Login**, **Register** when available, or your GM invitation. Registering an account does not by itself create a campaign. Verify your name and email under **Manage → Account**. Select an existing campaign from the campaign selector, or create one:

1. Open **Manage → Campaign → New campaign**.
2. In **Campaign**, enter a name, choose the rules system and visibility, then select **Next: Scene & map**.
3. Leave **Include starter content** selected for the supplied **First Session** scene and welcome notes. Turn it off to choose your own opening scene and optional advanced settings. Map art and character tokens are added after creation.
4. In **Invitation**, optionally enable **Create starter invite**, enter the player's email, and select **Player**. You can also use **Skip for now** and invite people later.
5. Review the settings and choose **Create Campaign Setup**. If setup reports that the campaign already exists but a later step failed, use **Retry Campaign Setup** to finish it, or **Keep campaign as-is** to continue with the existing campaign.

If **Campaign** is unavailable, ask the server administrator to confirm your workspace or GM access. Do not use a demo identity to gain access to a real campaign.

## Invite one player

Select the campaign, then open **Manage → People → Invites**. Enter the player's email, select **Player**, choose **Invite**, then **Copy link**. Share the link yourself and ask the player to complete **Accept Invite**. Create a separate invitation for each player.

Check that the player appears in the campaign members list. The [invite and session guide](./invite-session-guide.md) explains existing accounts, desktop sharing, expired invites, and returning to the table.

## Prepare the first scene

The **First-session steps** card under **Manage → Campaign** links to character creation, invitations, scene preparation, encounters, and play. You can return to it as you prepare.

1. Open **Prep** and select the scene you want to prepare. To create another scene, use **Manage → Scenes → New scene**.
2. In **Manage → Scenes**, confirm the selected scene's name, then choose **Upload map to [scene name] & calibrate** and select your map image. An empty scene takes the image's dimensions when they can be read. If the scene already has a map or prepared content, review the preview: **Keep canvas and replace map** preserves the canvas and placed content; **Create new scene at image size** prepares a separate scene; **Keep image in library only** leaves scene content alone. Wait for the upload and chosen placement to finish, then check the intended scene.
3. For a square-grid map, use **Calibrate grid** in **Prep**. Select two printed grid intersections on the same row or column, enter the number of cells between them, and choose **Apply square grid**. Check alignment across the map. For gridless play, choose **Gridless** in the scene's grid settings and save instead.
4. Use **Open character creator** in the **Party** rail or **Create a character** in the first-session card. Complete the creator, choose the player under **Played by** on **Finish**, and select **Create character**. The player must already be a campaign member to appear in that selector.
5. Open **Actors → Place actors**, then click the character to place a token on the selected scene, or drag the character to a specific map position. Select the token and check its **Owners** in the token controls. Make sure the intended player can see it and it is unlocked for movement.
6. In **Manage → Scenes**, save any scene edits and choose **Activate** for the opening scene. Selecting a different prep scene is separate from activating the scene for players.

You can add encounters and handouts later. For the first check, one scene, one player character, and one controllable token are enough.

## Play and confirm the shared table

Open **Live**. Have the invited player open the same campaign using their own account and confirm:

- Both of you see the active scene and the player's token.
- The player can move that token and you see the move without reloading.
- A message in **Chat** and a roll from the dice tray appear for both of you.
- The player can open the intended character sheet and shared handouts; private GM material stays private.

If a player cannot move a token, check its owner, lock, visibility, and active scene before changing their campaign role. Invite roles and character/token ownership are separate settings.

## Save a backup and return next time

Before the first session and after play, open **Manage → Archives**. Under **Archive Export**, select **Current campaign** and choose **Export Large Archive (.ottx)**. **Export JSON (small archives)** is available for small campaigns and older tooling. Keep the completed file somewhere you can find outside the table's data folder.

To check an archive without applying it, select **Dry run validation** and **All records** under **Archive Import**, then choose **Validate Archive** and your saved file. Read the validation result. Applying an archive is a deliberate import/restore operation; it is not a reconnect step. Server owners should also follow [Backup and Restore](../deployment/backup-restore.md) for installation recovery.

Next time, start the desktop app or ensure the server is running, open the same table address, and use **Login** if needed. Select your campaign and opening scene. For a connection interruption, wait through **Reconnecting** and **Syncing** until **Connected**; the app reloads shared state automatically. If it stays disconnected, check the host and network, then reload and sign in with the same account. See [session recovery](./invite-session-guide.md#reconnect-or-return-for-the-next-session).

If something blocks play, export **Report Bundle** from **Manage → Archives** and include the steps, expected result, and actual result using [Issue Reporting](./issue-reporting.md). Review the bundle before sharing it.
