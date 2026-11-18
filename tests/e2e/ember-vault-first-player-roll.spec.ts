import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { selectInspectorPanel } from "./inspector-navigation.js";

const budgetMs = 5 * 60_000;

async function openOwnerWorkspace(gm: Page) {
  await gm.goto("/");
  const createOwner = gm.getByRole("heading", { name: "Create Owner", exact: true });
  const demoGm = gm.getByRole("button", { name: "Demo GM", exact: true });
  await expect(createOwner.or(demoGm)).toBeVisible();
  if (await createOwner.isVisible()) {
    await gm.getByRole("textbox", { name: "Owner email" }).fill("first-roll-owner@example.test");
    await gm.getByRole("textbox", { name: "Owner display name" }).fill("First Roll GM");
    await gm.getByLabel("Owner password").fill("first roll owner password");
    await gm.getByRole("textbox", { name: "Initial campaign name" }).fill("Owner workspace");
    await gm.getByRole("button", { name: "Create", exact: true }).click();
  } else {
    await demoGm.click();
  }
  await expect(gm.getByLabel("Current campaign", { exact: true })).toBeVisible();
}

test("an Ember Vault GM brings an invited player to their first character roll in under five minutes", async ({ page: gm, browser }, testInfo) => {
  test.setTimeout(budgetMs + 90_000);
  await openOwnerWorkspace(gm);
  const manage = gm.getByRole("region", { name: "Manage workspace panel" });
  if (!await manage.isVisible()) await gm.getByRole("button", { name: "Manage", exact: true }).click();
  await manage.locator(".manage-category-button").filter({ hasText: "Campaign" }).click();
  const drawer = manage.locator("details.create-drawer").filter({ hasText: "New campaign" });
  await expect(drawer.locator("summary")).toBeVisible();

  const runId = randomUUID().slice(0, 8);
  const email = `player-${runId}@example.test`;
  const campaignName = `Ember Vault ${runId}`;
  // A second browser process has its own cookies, storage and realtime connection.
  const playerBrowser = await browser.browserType().launch();
  try {
    const player = await playerBrowser.newPage();
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    if (!await drawer.evaluate((element) => (element as HTMLDetailsElement).open)) await drawer.locator("summary").click();
    const setup = drawer.locator("form");
    await setup.getByRole("combobox", { name: "Starting adventure" }).selectOption({ label: "Play Ember Vault" });
    await setup.getByRole("textbox", { name: "Campaign name", exact: true }).fill(campaignName);
    await setup.getByRole("button", { name: "Next: Scene & map" }).click();
    await setup.getByRole("button", { name: "Next: Invitation" }).click();
    await setup.getByRole("checkbox", { name: "Create starter invite" }).check();
    await setup.getByRole("textbox", { name: "Setup invite email" }).fill(email);
    await setup.getByRole("button", { name: "Next: Review" }).click();
    await setup.getByRole("button", { name: "Create Campaign Setup" }).click();
    await expect(gm.getByLabel("Current campaign", { exact: true })).toHaveText(campaignName);
    const inviteLink = gm.getByRole("textbox", { name: "Invite link", exact: true });
    await expect(inviteLink).toHaveValue(/\/join\?invite=.+/);
    const inviteReadyMs = elapsed();

    await player.goto(await inviteLink.inputValue());
    await player.getByRole("textbox", { name: "Join email" }).fill(email);
    await player.getByRole("textbox", { name: "Display name" }).fill("Invited Adventurer");
    await player.getByLabel("Join password").fill("invited adventurer password");
    const joinedResponse = player.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/v1/invites/accept");
    await player.getByRole("button", { name: "Accept Invite", exact: true }).click();
    const joined = await joinedResponse;
    expect(joined.ok()).toBe(true);
    const { user, campaign, membership } = await joined.json();
    expect(user.email).toBe(email);
    expect(campaign.name).toBe(campaignName);
    expect(membership).toMatchObject({ campaignId: campaign.id, userId: user.id, role: "player" });
    await expect(player.getByLabel("Current campaign", { exact: true })).toHaveText(campaignName);
    const joinedMs = elapsed();

    const choices = player.getByRole("region", { name: "Choose your character" });
    const claimResponse = player.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/claim"));
    await choices.getByRole("button", { name: "Claim Valen Ash", exact: true }).click();
    const claimed = await claimResponse;
    expect(claimed.ok()).toBe(true);
    const { actorId, tokenId } = await claimed.json();
    const board = player.getByRole("group", { name: "Vault Entry interactive battle map", exact: true });
    const selectedToken = board.locator(`button[data-token-id="${tokenId}"]`);
    await expect(selectedToken).toHaveAttribute("aria-pressed", "true");
    const claimedMs = elapsed();

    await player.reload();
    await expect(selectedToken).toHaveAttribute("aria-pressed", "true");
    await expect(choices).toHaveCount(0);
    const strengthCheck = player.getByRole("button", { name: /Roll Strength check/ });
    await expect(strengthCheck).toBeVisible();
    const rollPath = `/api/v1/campaigns/${campaign.id}/systems/dnd-5e-srd/actors/${actorId}/roll`;
    const [confirmed] = await Promise.all([
      player.waitForResponse((response) => {
        const request = response.request();
        if (request.method() !== "POST" || new URL(response.url()).pathname !== rollPath) return false;
        const action = request.postDataJSON();
        return action.prepare !== true && action.commit !== false;
      }),
      strengthCheck.click(),
    ]);
    expect(confirmed.ok()).toBe(true);
    const { actor, chat, roll } = await confirmed.json();
    const firstRollMs = elapsed();
    expect(actor).toMatchObject({ id: actorId, name: "Valen Ash", ownerUserId: user.id });
    expect(roll).toMatchObject({ actorId, campaignId: campaign.id, userId: user.id, total: expect.any(Number) });
    expect(chat).toMatchObject({ campaignId: campaign.id, userId: user.id, rollId: roll.id });
    await testInfo.attach("time-to-first-player-roll", {
      contentType: "application/json",
      body: JSON.stringify({ budgetMs, inviteReadyMs, joinedMs, claimedMs, firstRollMs, campaignId: campaign.id, playerId: user.id, actorId, tokenId, rollId: roll.id }, null, 2),
    });
    expect(firstRollMs, "new campaign interaction to server-confirmed player roll").toBeLessThan(budgetMs);

    await gm.getByRole("button", { name: "Live Table", exact: true }).click();
    const showInspector = gm.getByRole("button", { name: "Show inspector", exact: true });
    if (await showInspector.isVisible()) await showInspector.click();
    await selectInspectorPanel(gm, "Chat");
    await expect(gm.locator(`article[id="campaign-search-chat-${chat.id}"]`)).toBeVisible();
  } catch (error) {
    const player = playerBrowser.contexts()[0]?.pages()[0];
    if (player && !player.isClosed()) {
      await testInfo.attach("player-view-at-failure", { contentType: "text/plain", body: await player.locator("body").ariaSnapshot() });
    }
    throw error;
  } finally {
    await playerBrowser.close();
  }
});
