import { expect, test, type Page } from "@playwright/test";
import type { Actor, Campaign, Scene, Token } from "../../packages/core/src/types.js";

const apiBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}`;
const webBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_WEB_PORT ?? 5174}`;
const campaignId = "camp_demo";

interface AdvancementResponse {
  actorId: string;
  options: Array<{ id: string; name: string }>;
  xp: { xp: number; nextLevelXp: number; readyToLevel: boolean };
}

async function api<T>(page: Page, method: "GET" | "POST" | "PATCH", path: string, data?: unknown): Promise<T> {
  const response = await page.request.fetch(`${apiBaseUrl}${path}`, {
    method, data,
    headers: {
      authorization: "Bearer otte-cookie-session",
      origin: webBaseUrl,
      ...(method === "GET" ? {} : { "idempotency-key": `advancement-visibility:${crypto.randomUUID()}` }),
    },
  });
  const body = await response.text();
  expect(response.ok(), `${method} ${path}: ${body}`).toBe(true);
  return JSON.parse(body) as T;
}

async function settleBrowserUpdates(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

test("competitive advancement loads for visible actor Stats, not Chat token interaction or a hidden inspector", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM", exact: true }).click();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");

  const created = await api<{ actor: Actor }>(page, "POST", `/api/v1/campaigns/${campaignId}/systems/dnd-5e-srd/characters`, {
    templateId: "fighter", name: "Advancement visibility fighter", ownerUserId: "usr_demo_gm",
  });
  let actor = await api<Actor>(page, "PATCH", `/api/v1/actors/${created.actor.id}`, {
    data: { ...created.actor.data, xp: 300 },
    expectedUpdatedAt: created.actor.updatedAt,
    manualOverrideReason: "Set earned XP for the advancement visibility browser regression",
  });
  const campaign = await api<Campaign>(page, "GET", `/api/v1/campaigns/${campaignId}`);
  const scene = await api<Scene>(page, "POST", `/api/v1/campaigns/${campaignId}/scenes`, {
    name: "Advancement visibility scene", width: 800, height: 600, gridType: "square", gridSize: 50,
    active: true, expectedUpdatedAt: campaign.updatedAt,
  });
  const token = await api<Token>(page, "POST", `/api/v1/scenes/${scene.id}/tokens`, {
    name: "Advancement visibility token", actorId: actor.id, x: 200, y: 200,
    ownerUserIds: ["usr_demo_gm"], expectedUpdatedAt: scene.updatedAt,
  });

  await page.reload();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");
  await page.getByRole("button", { name: "Live Table", exact: true }).click();
  await page.locator(".scene-tab").filter({ hasText: scene.name }).click();
  const showInspector = page.getByRole("button", { name: "Show inspector", exact: true });
  if (await showInspector.isVisible()) await showInspector.click();
  const inspectorTabs = page.getByRole("tablist", { name: "Inspector panels", exact: true });
  await inspectorTabs.getByRole("tab", { name: "Chat", exact: true }).click();
  const chatTab = inspectorTabs.getByRole("tab", { name: "Chat", exact: true });
  await expect(chatTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "Chat", exact: true })).toBeVisible();

  const advancementPath = `/api/v1/campaigns/${campaignId}/systems/${actor.systemId}/actors/${actor.id}/advancement`;
  const unexpectedRequests: string[] = [];
  let phase: "chat" | "visible" | "hidden" = "chat";
  page.on("request", (request) => {
    if (request.method() === "GET" && new URL(request.url()).pathname === advancementPath && phase !== "visible") {
      unexpectedRequests.push(phase);
    }
  });
  const board = page.getByRole("group", { name: `${scene.name} interactive battle map`, exact: true });
  const tokenButton = board.getByRole("button", { name: `Player Objects & Tokens token ${token.name}`, exact: true });
  await tokenButton.click();
  await expect(tokenButton).toHaveAttribute("aria-pressed", "true");
  await expect(chatTab).toHaveAttribute("aria-selected", "true");
  const movedResponse = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/v1/scenes/${scene.id}/tokens/move`);
  const visionResponse = page.waitForResponse((response) => response.request().method() === "GET" && new URL(response.url()).pathname === `/api/v1/scenes/${scene.id}/vision`);
  await tokenButton.press("ArrowRight");
  const movedHttp = await movedResponse;
  expect(movedHttp.ok()).toBe(true);
  const moved = (await movedHttp.json() as { tokens: Token[] }).tokens.find((candidate) => candidate.id === token.id);
  expect(moved).toMatchObject({ x: token.x + scene.gridSize, y: token.y });
  expect((await visionResponse).ok()).toBe(true);
  await settleBrowserUpdates(page);
  await expect(chatTab).toHaveAttribute("aria-selected", "true");
  expect(unexpectedRequests, "Chat token selection, movement, and vision reconciliation must not fetch advancement").toEqual([]);

  phase = "visible";
  const advancementResponse = page.waitForResponse((response) => response.request().method() === "GET" && new URL(response.url()).pathname === advancementPath);
  await inspectorTabs.getByRole("tab", { name: "Actors", exact: true }).click();
  const advancementHttp = await advancementResponse;
  expect(advancementHttp.ok()).toBe(true);
  const advancement = await advancementHttp.json() as AdvancementResponse;
  expect(advancement.actorId).toBe(actor.id);
  expect(advancement.xp).toMatchObject({ xp: 300, nextLevelXp: 300, readyToLevel: true });
  expect(advancement.options.length).toBeGreaterThan(0);
  const inspector = page.getByRole("complementary", { name: "Inspector", exact: true, includeHidden: true });
  const stats = inspector.getByRole("region", { name: "Actor stats sheet", exact: true });
  await expect(stats.getByRole("meter")).toHaveAttribute("aria-valuenow", String(advancement.xp.xp));
  await expect(stats.getByRole("meter")).toHaveAttribute("aria-valuemax", String(advancement.xp.nextLevelXp));
  await expect(stats.getByRole("button", { name: "Level Up", exact: true })).toBeEnabled();
  await stats.getByRole("button", { name: "Level Up", exact: true }).click();
  const advancementDialog = page.getByRole("dialog", { name: "Level up actor", exact: true });
  await expect(advancementDialog.getByRole("combobox", { name: "Advancement option", exact: true })).toContainText(advancement.options[0]!.name);
  await advancementDialog.getByRole("button", { name: "Close level up", exact: true }).click();

  await page.getByRole("button", { name: "Hide inspector", exact: true }).click();
  await expect(inspector).toBeHidden();
  await settleBrowserUpdates(page);
  phase = "hidden";
  actor = await api<Actor>(page, "PATCH", `/api/v1/actors/${actor.id}`, {
    name: `${actor.name} updated while hidden`, expectedUpdatedAt: actor.updatedAt,
  });
  // Confirm the realtime revision reached the mounted, hidden actor panel before checking the fetch boundary.
  await expect(inspector.getByRole("heading", { name: actor.name, exact: true, includeHidden: true })).toHaveCount(1);
  await settleBrowserUpdates(page);
  expect(unexpectedRequests, "A hidden Actors inspector must not fetch advancement after an actor revision").toEqual([]);

  phase = "visible";
  const reopenedResponse = page.waitForResponse((response) => response.request().method() === "GET" && new URL(response.url()).pathname === advancementPath);
  await showInspector.click();
  expect((await reopenedResponse).ok()).toBe(true);
  await expect(inspector.getByRole("heading", { name: actor.name, exact: true })).toBeVisible();
  await expect(stats.getByRole("meter")).toHaveAttribute("aria-valuenow", "300");
  await expect(stats.getByRole("button", { name: "Level Up", exact: true })).toBeEnabled();
  expect(unexpectedRequests).toEqual([]);
});
