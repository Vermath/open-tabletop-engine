# Invite And Session Guide

Players need a browser and the table address from their GM. They do not need to install the API, run developer checks, or use a demo account. Check the [supported browser statement](./supported-browsers.md) before the session.

## GM: create and share an invitation

1. Select the intended campaign and open **Manage → People**.
2. Under **Invites**, enter the player's email. Choose **Player** for an ordinary participant. **Observer**, **Assistant GM**, and **GM** grant different access; choose them only for those table roles.
3. Choose **Invite**, then **Copy link**. Send the copied link to that player yourself. Creating a link does not mean the player has received or accepted it.
4. Create a separate invitation for each player. After acceptance, check the campaign members list and the player's role.

Use the address of your running server. A link beginning with `localhost` or `127.0.0.1` works only on the computer hosting that address. Ask the server administrator for its player-facing address if the copied link is local.

### Desktop hosts

In the desktop app, create the campaign invitation first. Under **Desktop Host**, select **Share**, wait for **Connected**, then use **Copy** for the public table link. The desktop sharing link can include the invitation that was selected when sharing started. Keep the desktop app running and internet sharing active while remote players are using the table.

For additional players, create a new invitation for each person. If the copied desktop link contains an earlier person's invite, share the public table address and the new **Invite token** separately; the player can use **Have an invite token?** on the sign-in screen. Do not send a local desktop address to a remote player. If sharing reports an error, resolve it with the host before expecting the invite to open. See [Desktop Hosting](../deployment/desktop-hosting.md) for host setup.

## Player: accept your invitation

1. Open the link your GM sent. The **Accept Invite** form uses the invitation from the link. If you received a table address and token separately, open the address, choose **Have an invite token?**, and paste the token into **Invite Token**.
2. Enter the email used for your invitation. An email-restricted invite cannot be accepted with a different address.
3. If this is a new account on that server, enter your name and choose a password of at least eight characters. If you already have an account there, use its existing password; the name field is for new accounts.
4. Choose **Accept Invite**. If prompted, enter your MFA code or recovery code and try again.
5. Confirm the campaign opens. Under **Manage → Account**, check your name and email, then return to **Live**. Keep the table address for next time.

If a different account is already open, use **Manage → Account → Logout**, then open the invitation again. GMs who already have access to **Manage → People** can also expand **Join with an invite token** and use its **Join** form.

An expired, revoked, or invalid invitation needs a new link from the GM. If the invitation says it has already been accepted, use **Login** with the account that accepted it and select the campaign. Accepting an invitation is a one-time step.

## Player: get ready to play

The GM activates the scene for the table. In **Live**, confirm you can see the expected scene and your token. Select your character in **Party** to open its sheet, and ask the GM to assign your character if none appears.

Before play, make one token move, send a short **Chat** message, and make a roll from the dice tray. Ask the GM to confirm all three appear on their screen. Use **Handouts** or **Journal** for material the GM has shared.

Your campaign role does not automatically give you control of every token. If your token is missing or cannot move, tell the GM which character and scene you expect. They should check the token's **Owners**, lock, visibility, and the active scene. Private GM content is not part of the player view.

## Reconnect or return for the next session

- **Brief connection loss:** the app retries automatically. Wait through **Reconnecting** and **Syncing** for **Connected**, then check the current scene, chat, and token position before repeating an action.
- **Still disconnected:** check your connection and ask the GM whether the server is running. A desktop host must keep the app open and **Desktop Host** sharing connected. Once the host is available, reload the page.
- **Sign-in requested:** use **Login** with the same account and select the campaign. You do not need a fresh invitation for every session. Use **Forgot password?** if needed; contact the server administrator if the reset message does not arrive.
- **Wrong account or campaign:** check **Manage → Account**, log out if necessary, and sign in with the account that joined. If your membership was removed, ask the GM to restore access.
- **State still looks wrong after reconnect:** stop repeating the failed action and tell the GM what you last did and what the screen shows. The GM can export a **Report Bundle** under **Manage → Archives** for [Issue Reporting](./issue-reporting.md).

The GM should save a campaign archive before the first session and after play using the [backup steps in the GM guide](./first-run-gm-guide.md#save-a-backup-and-return-next-time). Refreshing or signing back in should use the server's current campaign; restoring an archive is a separate recovery decision.
