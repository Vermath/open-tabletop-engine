import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const apiBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}`;

const viewportCases = [
  { label: "phone", width: 390, height: 844, isMobile: true },
  { label: "tablet", width: 820, height: 1180, isMobile: false }
];

async function expectAndDeleteTokensByName(page: Page, name: string) {
  const deletedCount = await deleteTokensByName(page, name, { requireFound: true });
  expect(deletedCount).toBeGreaterThan(0);
}

async function deleteTokensByName(page: Page, name: string, options: { requireFound?: boolean } = {}) {
  return page.evaluate(
    async ({ apiBaseUrl, name }) => {
      const bearer = localStorage.getItem("otte:sessionToken");
      if (!bearer) throw new Error("No browser session token available for token cleanup");
      const headers = { authorization: `Bearer ${bearer}` };
      const getJson = async (path: string) => {
        const response = await fetch(`${apiBaseUrl}${path}`, { headers });
        if (!response.ok) throw new Error(await response.text());
        return response.json();
      };
      const campaigns = await getJson("/api/v1/campaigns");
      const campaign = campaigns.find((item: { name?: string }) => item.name === "The Ember Vault") ?? campaigns[0];
      if (!campaign) throw new Error("No campaign available for token cleanup");
      const scenes = await getJson(`/api/v1/campaigns/${campaign.id}/scenes`);
      const scene = scenes.find((item: { name?: string }) => item.name === "Vault Entry") ?? scenes.find((item: { active?: boolean }) => item.active) ?? scenes[0];
      if (!scene) throw new Error("No scene available for token cleanup");
      const tokens = await getJson(`/api/v1/scenes/${scene.id}/tokens`);
      const matchingTokens = tokens.filter((item: { name?: string }) => item.name === name);
      for (const token of matchingTokens) {
        const response = await fetch(`${apiBaseUrl}/api/v1/tokens/${token.id}`, { method: "DELETE", headers });
        if (!response.ok) throw new Error(await response.text());
      }
      return matchingTokens.length;
    },
    { apiBaseUrl, name }
  );
  if (options.requireFound && deletedCount === 0) throw new Error(`No token named ${name} found after touch create`);
  return deletedCount;
}

async function expectSceneTokenByName(page: Page, name: string) {
  return page.evaluate(
    async ({ apiBaseUrl, name }) => {
      const bearer = localStorage.getItem("otte:sessionToken");
      if (!bearer) throw new Error("No browser session token available for token lookup");
      const headers = { authorization: `Bearer ${bearer}` };
      const getJson = async (path: string) => {
        const response = await fetch(`${apiBaseUrl}${path}`, { headers });
        if (!response.ok) throw new Error(await response.text());
        return response.json();
      };
      const campaigns = await getJson("/api/v1/campaigns");
      const campaign = campaigns.find((item: { name?: string }) => item.name === "The Ember Vault") ?? campaigns[0];
      if (!campaign) throw new Error("No campaign available for token lookup");
      const scenes = await getJson(`/api/v1/campaigns/${campaign.id}/scenes`);
      const scene = scenes.find((item: { name?: string }) => item.name === "Vault Entry") ?? scenes.find((item: { active?: boolean }) => item.active) ?? scenes[0];
      if (!scene) throw new Error("No scene available for token lookup");
      const tokens = await getJson(`/api/v1/scenes/${scene.id}/tokens`);
      const matchingToken = tokens.find((item: { id: string; name?: string; x: number; y: number }) => item.name === name);
      if (!matchingToken) throw new Error(`No token named ${name} found`);
      return { id: matchingToken.id as string, x: matchingToken.x as number, y: matchingToken.y as number };
    },
    { apiBaseUrl, name }
  );
}

async function openInspectorPanel(page: Page, panelName: string) {
  await page.locator(".inspector-tabs").getByRole("button", { name: panelName, exact: true }).click();
}

async function submitChatCommand(page: Page, command: string) {
  await openInspectorPanel(page, "Chat");
  const commandLine = page.getByRole("textbox", { name: "Chat message" });
  await expect(commandLine).toBeVisible();
  await commandLine.fill(command);
  await page.getByRole("button", { name: "Send chat command" }).click();
}

async function dragTokenOnBoard(page: Page, tokenName: string) {
  const token = page.getByRole("button", { name: `Token ${tokenName}` });
  await expect(token).toBeVisible();
  const tokenBox = await token.boundingBox();
  const boardBox = await page.locator(".scene-board").boundingBox();
  if (!tokenBox || !boardBox) throw new Error("Token or scene board box was not available for touch drag");
  const start = { x: tokenBox.x + tokenBox.width / 2, y: tokenBox.y + tokenBox.height / 2 };
  const end = {
    x: Math.min(boardBox.x + boardBox.width - 24, start.x + Math.max(54, boardBox.width * 0.12)),
    y: Math.min(boardBox.y + boardBox.height - 24, start.y + Math.max(54, boardBox.height * 0.12))
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 4 });
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.mouse.up();
}

for (const viewport of viewportCases) {
  test.describe(`${viewport.label} viewport`, () => {
    test.use({
      hasTouch: true,
      isMobile: viewport.isMobile,
      viewport: { width: viewport.width, height: viewport.height }
    });

    test(`demo GM can reach core tabletop rails on a ${viewport.label} viewport`, async ({ page }) => {
      await page.goto("/");

      await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
      await page.getByRole("button", { name: "Demo GM" }).click();

      const workspaceBox = await page.getByRole("main", { name: "OpenTabletop workspace" }).boundingBox();
      expect(workspaceBox).not.toBeNull();
      await expect(page.locator(".topbar")).toContainText("The Ember Vault");
      const tableAreaBox = await page.locator(".table-area").boundingBox();
      const addToken = page.getByRole("button", { name: "Add token" });
      await expect(addToken).toBeVisible();
      const addTokenBox = await addToken.boundingBox();
      const minimumToolTarget = viewport.isMobile ? 40 : 44;
      expect(addTokenBox?.height ?? 0).toBeGreaterThanOrEqual(minimumToolTarget);
      expect(addTokenBox?.width ?? 0).toBeGreaterThanOrEqual(minimumToolTarget);
      expect(addTokenBox?.y ?? 0).toBeGreaterThan((tableAreaBox?.y ?? 0) + (tableAreaBox?.height ?? 0) * 0.45);
      await openInspectorPanel(page, "Chat");
      await expect(page.getByRole("textbox", { name: "Chat message" })).toBeVisible();
      const controlsFitViewport = await page.locator(".topbar").evaluate(() => {
        const viewportWidth = window.innerWidth;
        const controls = Array.from(document.querySelectorAll(".scene-filter-panel input, .scene-filter-panel select, .scene-filter-panel button, .quick-create-form input, .quick-create-form select, .quick-create-form button"));
        return controls.every((control) => {
          const box = control.getBoundingClientRect();
          return box.left >= -1 && box.right <= viewportWidth + 1;
        });
      });
      expect(controlsFitViewport).toBe(true);

      const tokenName = `Mobile ${viewport.label} Probe`;
      await deleteTokensByName(page, tokenName);
      await page.getByRole("textbox", { name: "Token name" }).fill(tokenName);
      await addToken.tap();
      await expect(page.locator(".rail > .status")).toContainText(`${tokenName} created`);
      const createdToken = await expectSceneTokenByName(page, tokenName);

      const chatMessage = `Mobile ${viewport.label} live-play check`;
      await submitChatCommand(page, "/roll 1d4");
      await expect(page.locator(".rail > .status")).toContainText(/Rolled \d+/);
      await submitChatCommand(page, chatMessage);
      await expect(page.locator(".chat-message", { hasText: chatMessage })).toBeVisible();

      await openInspectorPanel(page, "Chat");
      await expect(page.locator('[aria-label="Chat messages"]')).toContainText(chatMessage);
      await expect(page.getByRole("textbox", { name: "Chat message" })).toBeVisible();

      await page.getByRole("button", { name: "Prep", exact: true }).click();
      await page.getByRole("button", { name: "Content" }).click();
      await expect(page.getByText("Asset Library")).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Asset search" })).toBeVisible();

      await page.getByRole("button", { name: "Live Table", exact: true }).click();
      await openInspectorPanel(page, "Actors");
      await expect(page.getByRole("combobox", { name: "Token actor" })).toBeVisible();

      if (!viewport.isMobile) {
        await dragTokenOnBoard(page, tokenName);
        await expect.poll(async () => {
          const movedToken = await expectSceneTokenByName(page, tokenName);
          return Math.abs(movedToken.x - createdToken.x) + Math.abs(movedToken.y - createdToken.y);
        }).toBeGreaterThan(0);
      }
      await expectAndDeleteTokensByName(page, tokenName);

      await page.getByRole("button", { name: "Manage", exact: true }).click();
      await expect(page.getByLabel("Session user")).toBeVisible();
      await page.getByLabel("Session user").selectOption("usr_demo_player");
      await expect(page.getByLabel("Session user")).toHaveValue("usr_demo_player");
      await page.getByRole("region", { name: "Manage workspace panel" }).getByRole("button", { name: "Close", exact: true }).click();
      await expect(page.locator(".topbar")).toContainText("The Ember Vault");
      await page.reload();
      await expect(page.locator(".topbar")).toContainText("The Ember Vault");
      await expect(page.getByRole("heading", { name: "No campaign" })).toHaveCount(0);
    });
  });
}
