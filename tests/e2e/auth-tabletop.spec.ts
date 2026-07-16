import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { APIResponse, Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const apiBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}`;
const gmApiHeaders = { "x-user-id": "usr_demo_gm" };

function gmMutationHeaders(scope: string) {
  return { ...gmApiHeaders, "idempotency-key": `e2e-${scope}:${randomUUID()}` };
}

function expectedUpdatedAtUrl(url: string, updatedAt: string) {
  return `${url}?expectedUpdatedAt=${encodeURIComponent(updatedAt)}`;
}

async function mockInvitePreview(page: Page) {
  await page.route("**/api/v1/invites/preview?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ expectedUpdatedAt: "2026-07-14T12:00:00.000Z" })
    });
  });
}

interface E2EToken {
  id: string;
  name: string;
  sceneId: string;
  updatedAt: string;
  actorId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  conditions?: Array<{ id: string; name: string }>;
}

interface E2EActor {
  id: string;
  name: string;
  data: Record<string, unknown>;
}

const e2eSubclassByClass: Record<string, string> = {
  barbarian: "path-of-the-berserker",
  bard: "college-of-lore",
  cleric: "life-domain",
  druid: "circle-of-the-land",
  fighter: "champion",
  monk: "warrior-of-the-open-hand",
  paladin: "oath-of-devotion",
  ranger: "hunter",
  rogue: "thief",
  sorcerer: "draconic-sorcery",
  warlock: "fiend-patron",
  wizard: "evoker"
};

const e2eWeaponMasteriesByClass: Record<string, string[]> = {
  barbarian: ["club", "dagger", "greatclub"],
  fighter: ["club", "dagger", "greatclub", "handaxe"],
  paladin: ["club", "dagger"],
  ranger: ["club", "dagger"],
  rogue: ["club", "dagger"]
};

function e2eAdvancementChoices(className: string, nextClassLevel: number) {
  const normalizedClass = className.toLowerCase();
  const availableMasteries = e2eWeaponMasteriesByClass[normalizedClass] ?? [];
  const masteryCount = normalizedClass === "barbarian"
    ? (nextClassLevel >= 4 ? 3 : 2)
    : normalizedClass === "fighter"
      ? (nextClassLevel >= 4 ? 4 : 3)
      : availableMasteries.length;
  const masteryChoiceLevel = nextClassLevel === 2 || (nextClassLevel === 4 && (normalizedClass === "barbarian" || normalizedClass === "fighter"));
  const weaponMasteryChoices = masteryChoiceLevel && masteryCount > 0 ? availableMasteries.slice(0, masteryCount) : undefined;
  return {
    ...(nextClassLevel === 3 ? { subclassId: e2eSubclassByClass[normalizedClass] } : {}),
    ...(weaponMasteryChoices ? { weaponMasteryChoices } : {}),
    ...(nextClassLevel === 4 ? { featId: "ability-score-improvement", abilityChoices: { strength: 2 } } : {})
  };
}

async function openManageCategory(page: Page, categoryName: string) {
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  const panel = page.getByRole("region", { name: "Manage workspace panel" });
  await expect(panel).toBeVisible();
  await panel.locator(".manage-category-button", { hasText: categoryName }).click();
  return panel;
}

async function closeManage(page: Page) {
  const panel = page.getByRole("region", { name: "Manage workspace panel" });
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  await expect(panel).toBeHidden();
}

async function openInspectorPanel(page: Page, panelName: string) {
  const visiblePanelName = panelName === "SDK" ? "Plugins" : panelName === "Content" ? "Assets" : panelName;
  await page.locator(".inspector-tabs").getByRole("tab", { name: visiblePanelName, exact: true }).click();
}

function selectedActorPanel(page: Page) {
  return page.locator(".inspector");
}

function sdkRuntimePanel(page: Page) {
  return page.locator(".inspector .panel-stack", { hasText: "Runtime SDK" });
}

function combatTrackerPanel(page: Page) {
  return page.locator(".inspector .panel-stack").filter({ has: page.locator(".combat-hero") });
}

async function openActorDisclosure(root: Locator, summaryText: string) {
  const details = root.locator("details.actor-detail-disclosure").filter({ hasText: summaryText }).first();
  await expect(details.locator("summary")).toBeVisible();
  const isOpen = await details.evaluate((element) => (element as HTMLDetailsElement).open);
  if (!isOpen) {
    await details.evaluate((element) => {
      (element as HTMLDetailsElement).open = true;
      element.scrollIntoView({ block: "nearest" });
    });
  }
}

async function openDetails(details: Locator) {
  await expect(details.locator("summary")).toBeVisible();
  const isOpen = await details.evaluate((element) => (element as HTMLDetailsElement).open);
  if (!isOpen) {
    await details.evaluate((element) => {
      (element as HTMLDetailsElement).open = true;
      element.scrollIntoView({ block: "nearest" });
    });
  }
}

async function openCreateDrawer(page: Page, label: string) {
  await openDetails(page.locator("details.create-drawer").filter({ hasText: label }).first());
}

async function openTokenQuickCreate(page: Page) {
  const tokenName = page.getByRole("textbox", { name: "Token name" });
  if (await tokenName.isVisible().catch(() => false)) return;
  await page.getByRole("button", { name: "Token", exact: true }).click();
  await expect(tokenName).toBeVisible();
}

async function expectJsonResponse<T>(response: Pick<APIResponse, "ok" | "text">): Promise<T> {
  const body = await response.text();
  expect(response.ok(), body).toBeTruthy();
  return JSON.parse(body) as T;
}

async function expectAiAssetGenerationResult(response: APIResponse) {
  const body = await response.text();
  if (response.ok()) {
    expect(body).toContain("proposalId");
  } else {
    expect(body).toContain("codex app-server");
  }
}

async function openAiAgent(page: Page) {
  const toggle = page.getByRole("button", { name: "AI Agent", exact: true });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
  const panel = page.getByRole("complementary", { name: "AI Agent" });
  await expect(panel).toBeVisible();
  return panel;
}

async function approveAgentProposal(page: Page, proposalTitle: string) {
  const aiAgent = await openAiAgent(page);
  const proposal = aiAgent.locator(".ai-agent-proposal-row", { hasText: proposalTitle }).first();
  await expect(proposal).toContainText("pending");
  await proposal.getByRole("button", { name: "Approve and apply" }).click();
  await expect(proposal).toBeHidden();
  await expect(statusMessage(page, "Proposal applied")).toBeVisible();
  await aiAgent.getByRole("button", { name: "Close AI Agent" }).click();
  await expect(aiAgent).toBeHidden();
}

async function clickElement(locator: Locator) {
  await expect(locator).toBeVisible();
  await locator.evaluate((element) => (element as HTMLElement).click());
}

async function clickAndConfirmPreparedDndAction(locator: Locator) {
  await Promise.all([
    (async () => {
      const dialog = await locator.page().waitForEvent("dialog");
      expect(dialog.type()).toBe("confirm");
      expect(dialog.message()).toContain("exact server-prepared action");
      expect(dialog.message()).toContain("Consequences:");
      await dialog.accept();
    })(),
    locator.click()
  ]);
}

async function runCombatantControlUpdate(page: Page, control: Locator, action: () => Promise<unknown>) {
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === "PATCH" && /\/api\/v1\/combats\/[^/]+\/combatants\/[^/]+$/.test(new URL(response.url()).pathname)
  );
  await action();
  await expect(control).toBeDisabled();
  await expectJsonResponse(await responsePromise);
  await expect(control).toBeEnabled();
}

async function commitCombatantDraft(page: Page, input: Locator, value: string) {
  await runCombatantControlUpdate(page, input, async () => {
    await input.fill(value);
    await input.press("Enter");
  });
}

function statusMessage(page: Page, text: string | RegExp) {
  return page.getByRole("status").filter({ hasText: text }).first();
}

function sceneTab(page: Page, sceneName: string) {
  return page.locator(".scene-tabs button.scene-tab").filter({
    has: page.getByText(sceneName, { exact: true })
  });
}

async function startCombatFromPanel(panel: Locator, options: { currentTurnTokenName?: string } = {}) {
  const review = panel.getByRole("button", { name: "Review combatants" });
  if (!(await review.isVisible().catch(() => false))) {
    const end = panel.getByRole("button", { name: "End" });
    if (await end.isVisible().catch(() => false)) {
      await endCombatFromPanel(panel.page(), panel);
    }
  }
  await review.click();
  const dialog = panel.page().getByRole("dialog", { name: /^Review / });
  await expect(dialog).toBeVisible();
  const selectAll = dialog.getByRole("button", { name: "Select all" });
  if (await selectAll.isEnabled()) await selectAll.click();
  if (options.currentTurnTokenName) {
    const serverRoll = dialog.getByRole("checkbox", { name: /Server-roll initiative/ });
    if (await serverRoll.isChecked()) await serverRoll.uncheck();
  }
  const manualInitiatives = dialog.locator('input[type="number"]:enabled');
  for (let index = 0; index < await manualInitiatives.count(); index += 1) {
    await manualInitiatives.nth(index).fill(String(20 - index));
  }
  if (options.currentTurnTokenName) {
    await dialog.getByRole("spinbutton", { name: `${options.currentTurnTokenName} initiative` }).fill("99");
  }
  const start = dialog.getByRole("button", { name: /^Start combat \(\d+\)$/ });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(dialog).toBeHidden();
}

async function advanceCombatFromPanel(page: Page, panel: Locator, controlName: "Next turn" | "Prev") {
  const control = panel.getByRole("button", { name: controlName });
  // A concurrent server write can answer the first PATCH with a structured 409
  // stale_write; the client rebases on the returned state and retries once, so
  // wait for the successful PATCH. An unrecovered conflict times out here.
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === "PATCH" && /\/api\/v1\/combats\/[^/]+$/.test(new URL(response.url()).pathname) && response.ok()
  );
  await clickElement(control);
  await expectJsonResponse(await responsePromise);
  await expect(control).toBeEnabled();
}

async function endCombatFromPanel(page: Page, panel: Locator) {
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === "DELETE" && /\/api\/v1\/combats\/[^/]+$/.test(new URL(response.url()).pathname)
  );
  await clickElement(panel.getByRole("button", { name: "End" }));
  const confirm = panel.getByRole("button", { name: "Confirm end combat" });
  if (await confirm.isVisible().catch(() => false)) await clickElement(confirm);
  await expectJsonResponse(await responsePromise);
  await expect(panel.getByRole("button", { name: "Review combatants" })).toBeVisible();
}

async function setCheckbox(locator: Locator, checked: boolean) {
  await expect(locator).toBeVisible();
  await locator.evaluate((element, nextChecked) => {
    const input = element as HTMLInputElement;
    if (input.checked !== nextChecked) input.click();
  }, checked);
}

async function submitChatCommand(page: Page, command: string) {
  await openInspectorPanel(page, "Chat");
  const commandLine = page.getByRole("textbox", { name: "Chat message" });
  await expect(commandLine).toBeVisible();
  await commandLine.fill(command);
  await page.getByRole("button", { name: "Send chat command" }).click();
}

async function loginDemoSession(page: Page, userId: "usr_demo_gm" | "usr_demo_player") {
  await page.goto("/");
  await page.evaluate(
    async ({ apiBaseUrl, userId }) => {
      const email = userId === "usr_demo_gm" ? "gm@example.test" : "player@example.test";
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email })
      });
      if (!response.ok) throw new Error(await response.text());
      const login = (await response.json()) as { token: string; user: { id: string } };
      localStorage.setItem("otte:userId", login.user.id);
      localStorage.setItem("otte:sessionToken", login.token);
      localStorage.setItem("otte:sessionTokenUser", login.user.id);
    },
    { apiBaseUrl, userId }
  );
  await page.goto("/");
}

async function getCampaignDefaultSystemId(page: Page): Promise<string> {
  const campaign = await expectJsonResponse<{ defaultSystemId: string }>(
    await page.request.get(`${apiBaseUrl}/api/v1/campaigns/camp_demo`, { headers: gmApiHeaders })
  );
  return campaign.defaultSystemId;
}

async function activateCampaignSystem(page: Page, systemId: string): Promise<void> {
  const campaign = await expectJsonResponse<{ updatedAt: string }>(
    await page.request.get(`${apiBaseUrl}/api/v1/campaigns/camp_demo`, { headers: gmApiHeaders })
  );
  await expectJsonResponse(
    await page.request.post(`${apiBaseUrl}/api/v1/campaigns/camp_demo/systems/${encodeURIComponent(systemId)}/install`, {
      headers: gmMutationHeaders(`activate-system-${systemId}`),
      data: { expectedUpdatedAt: campaign.updatedAt }
    })
  );
}

async function selectTokenInspectorActor(page: Page, actorName: string) {
  const panel = selectedActorPanel(page);
  await openActorDisclosure(panel, "Token settings");
  await page.getByRole("combobox", { name: "Token inspector actor" }).selectOption({ label: actorName });
}

async function selectActionTargetActor(page: Page, actorName: string) {
  const panel = selectedActorPanel(page);
  await openActorDisclosure(panel, "Actor details");
  await page.getByRole("combobox", { name: "Action target actor" }).selectOption({ label: actorName });
}

async function createSystemCharacter(page: Page, input: { templateId: string; name: string; ownerUserId: string; advanceToLevel?: number }): Promise<E2EActor> {
  const advancementChoices = Array.from({ length: Math.max(0, (input.advanceToLevel ?? 1) - 1) }, (_value, index) => ({
    level: index + 2,
    choices: e2eAdvancementChoices(input.templateId, index + 2)
  }));
  return page.evaluate(
    async ({ apiBaseUrl, input, advancementChoices }) => {
      const bearer = localStorage.getItem("otte:sessionToken");
      if (!bearer) throw new Error("No browser session token available for actor setup");
      const created = await fetch(`${apiBaseUrl}/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${bearer}`,
          "content-type": "application/json",
          "idempotency-key": `e2e-character-create:${crypto.randomUUID()}`,
        },
        body: JSON.stringify({ templateId: input.templateId, name: input.name, ownerUserId: input.ownerUserId })
      });
      if (!created.ok) throw new Error(await created.text());
      let actor = (await created.json()).actor as E2EActor;
      for (let level = 2; level <= (input.advanceToLevel ?? 1); level += 1) {
        const choices = advancementChoices.find((entry) => entry.level === level)?.choices ?? {};
        const previewKey = `e2e-advancement-preview:${crypto.randomUUID()}`;
        const commitKey = `e2e-advancement-commit:${crypto.randomUUID()}`;
        const previewResponse = await fetch(`${apiBaseUrl}/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actor.id}/rules-preview`, {
          method: "POST",
          headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json", "idempotency-key": previewKey },
          body: JSON.stringify({
            operation: "advancement",
            optionId: "level-up",
            hitPointMode: "fixed",
            prepare: true,
            ...choices
          })
        });
        if (!previewResponse.ok) throw new Error(await previewResponse.text());
        const preview = await previewResponse.json() as {
          status?: string;
          blockers?: unknown[];
          preparation?: { preparedPreviewKey?: string; actorUpdatedAt?: string };
        };
        if (preview.status !== "ready" || !preview.preparation?.preparedPreviewKey || !preview.preparation.actorUpdatedAt) {
          throw new Error(`Advancement preview was not ready: ${JSON.stringify(preview)}`);
        }
        const advanced = await fetch(`${apiBaseUrl}/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actor.id}/advance`, {
          method: "POST",
          headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json", "idempotency-key": commitKey },
          body: JSON.stringify({
            preparedPreviewKey: preview.preparation.preparedPreviewKey,
            expectedUpdatedAt: preview.preparation.actorUpdatedAt
          })
        });
        if (!advanced.ok) throw new Error(await advanced.text());
        actor = (await advanced.json()).actor as E2EActor;
      }
      return actor;
    },
    { apiBaseUrl, input, advancementChoices }
  );
}

async function createSystemMonster(page: Page, input: { threatId: string; name: string; ownerUserId: string }): Promise<E2EActor> {
  return page.evaluate(
    async ({ apiBaseUrl, input }) => {
      const bearer = localStorage.getItem("otte:sessionToken");
      if (!bearer) throw new Error("No browser session token available for monster setup");
      const response = await fetch(`${apiBaseUrl}/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/monsters`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${bearer}`,
          "content-type": "application/json",
          "idempotency-key": `e2e-monster-create:${crypto.randomUUID()}`
        },
        body: JSON.stringify(input)
      });
      if (!response.ok) throw new Error(await response.text());
      return (await response.json()).actor as E2EActor;
    },
    { apiBaseUrl, input }
  );
}

async function createRulesTargetActor(page: Page, input: { name: string; hp: { current: number; max: number }; ownerUserId?: string }): Promise<E2EActor> {
  return page.evaluate(
    async ({ apiBaseUrl, input }) => {
      const bearer = localStorage.getItem("otte:sessionToken");
      if (!bearer) throw new Error("No browser session token available for actor setup");
      const campaignResponse = await fetch(`${apiBaseUrl}/api/v1/campaigns/camp_demo`, {
        headers: { authorization: `Bearer ${bearer}` }
      });
      if (!campaignResponse.ok) throw new Error(await campaignResponse.text());
      const campaign = await campaignResponse.json() as { updatedAt: string };
      const response = await fetch(`${apiBaseUrl}/api/v1/campaigns/camp_demo/actors`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${bearer}`,
          "content-type": "application/json",
          "idempotency-key": `e2e-rules-target-create:${crypto.randomUUID()}`
        },
        body: JSON.stringify({
          expectedUpdatedAt: campaign.updatedAt,
          systemId: "dnd-5e-srd",
          ownerUserId: input.ownerUserId ?? "usr_demo_player",
          type: "npc",
          name: input.name,
          data: {
            ruleset: "SRD 5.2.1",
            hp: input.hp,
            attributes: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
            conditions: []
          }
        })
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json() as Promise<E2EActor>;
    },
    { apiBaseUrl, input }
  );
}

async function getActorById(page: Page, actorId: string): Promise<E2EActor> {
  return page.evaluate(
    async ({ apiBaseUrl, actorId }) => {
      const bearer = localStorage.getItem("otte:sessionToken");
      if (!bearer) throw new Error("No browser session token available for actor lookup");
      const response = await fetch(`${apiBaseUrl}/api/v1/campaigns/camp_demo/actors`, {
        headers: { authorization: `Bearer ${bearer}` }
      });
      if (!response.ok) throw new Error(await response.text());
      const actors = (await response.json()) as E2EActor[];
      const actor = actors.find((item) => item.id === actorId);
      if (!actor) throw new Error(`Actor ${actorId} not found`);
      return actor;
    },
    { apiBaseUrl, actorId }
  );
}

async function createSceneToken(page: Page, input: { name: string; x: number; y: number; ownerUserIds: string[]; actorId?: string }): Promise<E2EToken> {
  return page.evaluate(
    async ({ apiBaseUrl, input }) => {
      const bearer = localStorage.getItem("otte:sessionToken");
      if (!bearer) throw new Error("No browser session token available for token setup");
      const sceneResponse = await fetch(`${apiBaseUrl}/api/v1/campaigns/camp_demo/scenes`, {
        headers: { authorization: `Bearer ${bearer}` }
      });
      if (!sceneResponse.ok) throw new Error(await sceneResponse.text());
      const scene = ((await sceneResponse.json()) as Array<{ id: string; updatedAt: string }>).find((item) => item.id === "scn_vault_entry");
      if (!scene) throw new Error("Vault Entry scene is unavailable for token setup");
      const response = await fetch(`${apiBaseUrl}/api/v1/scenes/scn_vault_entry/tokens`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${bearer}`,
          "content-type": "application/json",
          "idempotency-key": `e2e-token-create:${crypto.randomUUID()}`
        },
        body: JSON.stringify({ ...input, width: 50, height: 50, hidden: false, locked: false, disposition: "neutral", expectedUpdatedAt: scene.updatedAt })
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    { apiBaseUrl, input }
  );
}

async function deleteTokenById(page: Page, tokenId: string) {
  await page.evaluate(
    async ({ apiBaseUrl, tokenId }) => {
      const bearer = localStorage.getItem("otte:sessionToken");
      if (!bearer) throw new Error("No browser session token available for token cleanup");
      const tokenResponse = await fetch(`${apiBaseUrl}/api/v1/scenes/scn_vault_entry/tokens`, {
        headers: { authorization: `Bearer ${bearer}` }
      });
      if (!tokenResponse.ok) throw new Error(await tokenResponse.text());
      const token = ((await tokenResponse.json()) as Array<{ id: string; updatedAt: string }>).find((item) => item.id === tokenId);
      if (!token) return;
      const response = await fetch(`${apiBaseUrl}/api/v1/tokens/${tokenId}?expectedUpdatedAt=${encodeURIComponent(token.updatedAt)}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${bearer}`, "idempotency-key": `e2e-token-delete:${crypto.randomUUID()}` }
      });
      if (!response.ok && response.status !== 404) throw new Error(await response.text());
    },
    { apiBaseUrl, tokenId }
  );
}

async function deleteActorById(page: Page, actorId: string) {
  await page.evaluate(
    async ({ apiBaseUrl, actorId }) => {
      const bearer = localStorage.getItem("otte:sessionToken");
      if (!bearer) throw new Error("No browser session token available for actor cleanup");
      const headers = { authorization: `Bearer ${bearer}` };
      const actorResponse = await fetch(`${apiBaseUrl}/api/v1/actors/${actorId}`, { headers });
      if (actorResponse.status === 404) return;
      if (!actorResponse.ok) throw new Error(await actorResponse.text());
      const actor = await actorResponse.json() as { updatedAt: string };
      const response = await fetch(`${apiBaseUrl}/api/v1/actors/${actorId}?expectedUpdatedAt=${encodeURIComponent(actor.updatedAt)}`, {
        method: "DELETE",
        headers: { ...headers, "idempotency-key": `e2e-actor-delete:${crypto.randomUUID()}` }
      });
      if (!response.ok && response.status !== 404) throw new Error(await response.text());
    },
    { apiBaseUrl, actorId }
  );
}

async function patchTokenConditions(page: Page, tokenId: string, conditions: Array<{ id: string; name: string }>) {
  await page.evaluate(
    async ({ apiBaseUrl, tokenId, conditions }) => {
      const bearer = localStorage.getItem("otte:sessionToken");
      if (!bearer) throw new Error("No browser session token available for token patch");
      const tokenResponse = await fetch(`${apiBaseUrl}/api/v1/scenes/scn_vault_entry/tokens`, {
        headers: { authorization: `Bearer ${bearer}` }
      });
      if (!tokenResponse.ok) throw new Error(await tokenResponse.text());
      const token = ((await tokenResponse.json()) as Array<{ id: string; updatedAt: string }>).find((item) => item.id === tokenId);
      if (!token) throw new Error(`Token ${tokenId} not found for condition patch`);
      const response = await fetch(`${apiBaseUrl}/api/v1/tokens/${tokenId}`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${bearer}`,
          "content-type": "application/json",
          "idempotency-key": `e2e-token-condition:${crypto.randomUUID()}`
        },
        body: JSON.stringify({ conditions, expectedUpdatedAt: token.updatedAt })
      });
      if (!response.ok) throw new Error(await response.text());
    },
    { apiBaseUrl, tokenId, conditions }
  );
}

async function getSceneTokenById(page: Page, tokenId: string): Promise<E2EToken> {
  return page.evaluate(
    async ({ apiBaseUrl, tokenId }) => {
      const bearer = localStorage.getItem("otte:sessionToken");
      if (!bearer) throw new Error("No browser session token available for token lookup");
      const response = await fetch(`${apiBaseUrl}/api/v1/scenes/scn_vault_entry/tokens`, {
        headers: { authorization: `Bearer ${bearer}` }
      });
      if (!response.ok) throw new Error(await response.text());
      const tokens = await response.json();
      const token = tokens.find((item: { id: string }) => item.id === tokenId);
      if (!token) throw new Error(`Token ${tokenId} not found`);
      return token;
    },
    { apiBaseUrl, tokenId }
  );
}

async function getNewestSceneTokenByName(page: Page, name: string): Promise<E2EToken> {
  return page.evaluate(
    async ({ apiBaseUrl, name }) => {
      const bearer = localStorage.getItem("otte:sessionToken");
      if (!bearer) throw new Error("No browser session token available for token lookup");
      const response = await fetch(`${apiBaseUrl}/api/v1/scenes/scn_vault_entry/tokens`, {
        headers: { authorization: `Bearer ${bearer}` }
      });
      if (!response.ok) throw new Error(await response.text());
      const tokens = await response.json();
      const [token] = tokens
        .filter((item: { name?: string }) => item.name === name)
        .sort((left: { createdAt?: string }, right: { createdAt?: string }) => String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")));
      if (!token) throw new Error(`Token ${name} not found`);
      return token;
    },
    { apiBaseUrl, name }
  );
}

async function getSceneSortOrderByName(page: Page, name: string): Promise<number> {
  return page.evaluate(
    async ({ apiBaseUrl, name }) => {
      const bearer = localStorage.getItem("otte:sessionToken");
      if (!bearer) throw new Error("No browser session token available for scene lookup");
      const response = await fetch(`${apiBaseUrl}/api/v1/campaigns/camp_demo/scenes`, {
        headers: { authorization: `Bearer ${bearer}` }
      });
      if (!response.ok) throw new Error(await response.text());
      const scenes = (await response.json()) as Array<{ name: string; sortOrder: number }>;
      const scene = scenes.find((item) => item.name === name);
      if (!scene) throw new Error(`Scene ${name} not found`);
      return scene.sortOrder;
    },
    { apiBaseUrl, name }
  );
}

async function dragTokenByName(page: Page, tokenName: string, deltaX: number, deltaY: number) {
  const tokenButton = page.getByRole("button", { name: `Token ${tokenName}` });
  await expect(tokenButton).toBeVisible();
  const box = await tokenButton.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + deltaX, box!.y + box!.height / 2 + deltaY, { steps: 6 });
  await page.mouse.up();
}

async function scenePointToClient(page: Page, point: { x: number; y: number }, scene: { width: number; height: number } = { width: 1200, height: 800 }) {
  const boardBox = await page.locator(".scene-board").boundingBox();
  expect(boardBox).not.toBeNull();
  return {
    x: boardBox!.x + (point.x / scene.width) * boardBox!.width,
    y: boardBox!.y + (point.y / scene.height) * boardBox!.height
  };
}

async function deleteNewestTokenByName(page: Page, name: string) {
  await page.evaluate(
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
      const [token] = tokens
        .filter((item: { name?: string }) => item.name === name)
        .sort((left: { createdAt?: string }, right: { createdAt?: string }) => String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")));
      if (!token) throw new Error(`No token named ${name} found for cleanup`);
      const response = await fetch(`${apiBaseUrl}/api/v1/tokens/${token.id}?expectedUpdatedAt=${encodeURIComponent(token.updatedAt)}`, {
        method: "DELETE",
        headers: { ...headers, "idempotency-key": `e2e-token-delete:${crypto.randomUUID()}` }
      });
      if (!response.ok) throw new Error(await response.text());
    },
    { apiBaseUrl, name }
  );
}

test("GM can switch selected-token permission presets", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  await openInspectorPanel(page, "Actors");
  const actorPanel = selectedActorPanel(page);
  await openActorDisclosure(actorPanel, "Token settings");
  const tokenPermissionPresets = page.getByLabel("Token permission presets");
  await expect(tokenPermissionPresets).toBeVisible();
  await page.getByRole("tabpanel", { name: "Actors" }).getByRole("tab", { name: "Compendium", exact: true }).click();
  const compendiumBrowser = page.locator('[aria-label="Actor compendium browser"]');
  await compendiumBrowser.getByRole("textbox", { name: "Compendium search" }).fill("Healing Word");
  const healingWordEntry = compendiumBrowser.locator("article").filter({
    has: page.getByText("Healing Word", { exact: true })
  });
  await healingWordEntry.getByRole("button", { name: "Add" }).click();
  await expect(statusMessage(page, "Healing Word imported")).toBeVisible();
  await openActorDisclosure(actorPanel, "Actor details");
  const tokenActionTargets = page.getByLabel("Token action target shortcuts");
  await expect(tokenActionTargets).toContainText("Target Valen Ash");
  await setCheckbox(page.getByRole("checkbox", { name: "Targeted" }), true);
  await expect(statusMessage(page, "Token targeted")).toBeVisible();
  await expect(tokenActionTargets).toContainText("Target Valen Ash (marked)");
  const canvasTargetManager = page.getByLabel("Canvas target manager");
  await expect(canvasTargetManager).toContainText("My targets 1 / 1");
  const placedToken = await createSceneToken(page, { name: "Valen Ash", actorId: "act_valen", x: 520, y: 340, ownerUserIds: ["usr_demo_player"] });
  await page.reload();
  await openInspectorPanel(page, "Actors");
  await openActorDisclosure(actorPanel, "Token settings");
  await expect(page.getByRole("button", { name: "Token Valen Ash" }).first()).toBeVisible();
  await clickElement(canvasTargetManager.getByRole("button", { name: "Target visible" }));
  await expect(statusMessage(page, "Targeted 2 tokens")).toBeVisible();
  await expect(canvasTargetManager).toContainText("My targets 2 / 2");
  await clickElement(canvasTargetManager.getByRole("button", { name: "Clear my targets" }));
  await expect(statusMessage(page, "Cleared 2 targets")).toBeVisible();
  await expect(canvasTargetManager).toContainText("My targets 0 / 2");
  const targetArea = canvasTargetManager.getByLabel("Canvas target area");
  await targetArea.getByRole("spinbutton", { name: "Target area x" }).fill("0");
  await targetArea.getByRole("spinbutton", { name: "Target area y" }).fill("0");
  await targetArea.getByRole("spinbutton", { name: "Target area width" }).fill("1200");
  await targetArea.getByRole("spinbutton", { name: "Target area height" }).fill("800");
  await expect(targetArea.getByLabel("Target area preview")).toContainText("2 tokens in area");
  await expect(targetArea.getByLabel("Target area preview")).toContainText("Valen Ash");
  await clickElement(targetArea.getByRole("button", { name: "Target area" }));
  await expect(statusMessage(page, "Targeted 2 tokens")).toBeVisible();
  await expect(canvasTargetManager).toContainText("My targets 2 / 2");
  await clickElement(targetArea.getByRole("button", { name: "Clear area targets" }));
  await expect(statusMessage(page, "Cleared 2 targets")).toBeVisible();
  await expect(canvasTargetManager).toContainText("My targets 0 / 2");
  await page.evaluate(async ({ apiBaseUrl }) => {
    const bearer = localStorage.getItem("otte:sessionToken");
    if (!bearer) throw new Error("No browser session token available for lasso setup");
    const headers = { authorization: `Bearer ${bearer}` };
    const campaigns = await fetch(`${apiBaseUrl}/api/v1/campaigns`, { headers }).then((response) => response.json());
    const campaign = campaigns.find((item: { name?: string }) => item.name === "The Ember Vault") ?? campaigns[0];
    const scenes = await fetch(`${apiBaseUrl}/api/v1/campaigns/${campaign.id}/scenes`, { headers }).then((response) => response.json());
    const scene = scenes.find((item: { name?: string }) => item.name === "Vault Entry") ?? scenes[0];
    const response = await fetch(`${apiBaseUrl}/api/v1/scenes/${scene.id}/annotations`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json", "idempotency-key": `e2e-annotation-create:${crypto.randomUUID()}` },
      body: JSON.stringify({
        kind: "drawing",
        label: "Drawing",
        color: "#a78bfa",
        expectedUpdatedAt: scene.updatedAt,
        points: [
          { x: 0, y: 0 },
          { x: scene.width, y: 0 },
          { x: scene.width, y: scene.height },
          { x: 0, y: scene.height },
          { x: 0, y: 0 }
        ]
      })
    });
    if (!response.ok) throw new Error(await response.text());
  }, { apiBaseUrl });
  await expect(canvasTargetManager.getByLabel("Latest drawing lasso preview")).toContainText("2 tokens in lasso");
  await clickElement(canvasTargetManager.getByRole("button", { name: "Target lasso" }));
  await expect(statusMessage(page, "Targeted 2 tokens")).toBeVisible();
  await expect(canvasTargetManager).toContainText("My targets 2 / 2");
  await clickElement(canvasTargetManager.getByRole("button", { name: "Clear lasso targets" }));
  await expect(statusMessage(page, "Cleared 2 targets")).toBeVisible();
  await expect(canvasTargetManager).toContainText("My targets 0 / 2");
  await clickElement(page.getByRole("button", { name: "Delete latest annotation" }));
  await expect(statusMessage(page, "Drawing deleted")).toBeVisible();
  const targetedResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" && /\/api\/v1\/tokens\/[^/]+\/target$/.test(new URL(response.url()).pathname)
  );
  await setCheckbox(page.getByRole("checkbox", { name: "Targeted" }), true);
  await expect(statusMessage(page, "Token targeted")).toBeVisible();
  const targetedToken = await expectJsonResponse<{ updatedAt: string }>(await targetedResponsePromise);
  const presetResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "PATCH" && /\/api\/v1\/tokens\/[^/]+$/.test(new URL(response.url()).pathname)
  );
  await clickElement(tokenPermissionPresets.getByRole("button", { name: "GM locked" }));
  await expect(statusMessage(page, "Token updated")).toBeVisible();
  const presetResponse = await presetResponsePromise;
  const presetRequest = presetResponse.request().postDataJSON() as { expectedUpdatedAt?: string };
  expect(presetRequest.expectedUpdatedAt).toBe(targetedToken.updatedAt);
  await expectJsonResponse(presetResponse);
  await expect(tokenPermissionPresets).toContainText("GM locked");
  await expect(page.locator(".metric-row", { hasText: "Token State" })).toContainText("Targeted 1");
  await expect(page.locator(".metric-row", { hasText: "Token State" })).not.toContainText("Owners");

  await clickElement(tokenPermissionPresets.getByRole("button", { name: "Party controlled" }));
  await expect(statusMessage(page, "Token updated")).toBeVisible();
  await expect(tokenPermissionPresets).toContainText("Party controlled");
  await expect(page.locator(".metric-row", { hasText: "Token State" })).toContainText("Owners 1");
  const selectedTargeted = page.getByRole("checkbox", { name: "Targeted" });
  if (await selectedTargeted.isChecked()) {
    await setCheckbox(selectedTargeted, false);
    await expect(statusMessage(page, "Token untargeted")).toBeVisible();
  }
  await deleteTokenById(page, placedToken.id);
});

test("token inspector surfaces a rejected edit", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  await openInspectorPanel(page, "Actors");
  const actorPanel = selectedActorPanel(page);
  await openActorDisclosure(actorPanel, "Token settings");
  const presets = page.getByLabel("Token permission presets");
  await expect(presets).toBeVisible();

  let rejected = false;
  await page.route("**/api/v1/tokens/*", async (route) => {
    if (!rejected && route.request().method() === "PATCH") {
      rejected = true;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Token inspector edit rejected" })
      });
      return;
    }
    await route.continue();
  });

  await clickElement(presets.getByRole("button", { name: "GM locked" }));
  await expect(statusMessage(page, "Token update failed: Token inspector edit rejected")).toBeVisible();
  expect(rejected).toBe(true);
});

test("GM can box-select and drag multiple scene tokens", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  const suffix = Date.now().toString(36);
  let firstToken: E2EToken | undefined;
  let secondToken: E2EToken | undefined;
  try {
    firstToken = await createSceneToken(page, { name: `E2E Box Alpha ${suffix}`, x: 920, y: 620, ownerUserIds: [] });
    secondToken = await createSceneToken(page, { name: `E2E Box Beta ${suffix}`, x: 1000, y: 620, ownerUserIds: [] });
    await page.reload();
    await expect(page.getByRole("button", { name: `Token ${firstToken.name}` })).toBeVisible();
    await expect(page.getByRole("button", { name: `Token ${secondToken.name}` })).toBeVisible();
    const expandLayerPanel = page.getByRole("button", { name: "Expand layer panel" });
    if (await expandLayerPanel.isVisible().catch(() => false)) await expandLayerPanel.click();
    await expect(page.getByLabel("Map layer stack")).toContainText("Player");

    const start = await scenePointToClient(page, { x: 880, y: 580 });
    const end = await scenePointToClient(page, { x: 1080, y: 710 });
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByRole("status", { name: "Selected tokens" })).toContainText("2 selected");

    const beforeFirst = await getSceneTokenById(page, firstToken.id);
    const beforeSecond = await getSceneTokenById(page, secondToken.id);
    await dragTokenByName(page, firstToken.name, 120, 0);
    await expect.poll(async () => {
      const movedFirst = await getSceneTokenById(page, firstToken!.id);
      const movedSecond = await getSceneTokenById(page, secondToken!.id);
      return movedFirst.x > beforeFirst.x && movedSecond.x > beforeSecond.x;
    }).toBe(true);
  } finally {
    if (firstToken) await deleteTokenById(page, firstToken.id).catch(() => undefined);
    if (secondToken) await deleteTokenById(page, secondToken.id).catch(() => undefined);
  }
});

test("demo GM can reach campaign, scene, and tabletop controls", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
  await page.getByRole("button", { name: "Demo GM" }).click();

  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  await openManageCategory(page, "Campaign");
  await expect(page.getByText("Campaign Settings")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Edit campaign name" })).toHaveValue("The Ember Vault");
  await expect(page.getByText("Delete is audited and removes").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Campaign", exact: true })).toBeEnabled();
  await expect(page.getByText("Campaign status: Active")).toBeVisible();
  await page.getByRole("button", { name: "Archive Campaign" }).click();
  await expect(statusMessage(page, "The Ember Vault archived")).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore Campaign" })).toBeVisible();
  await page.getByRole("button", { name: "Restore Campaign" }).click();
  await expect(statusMessage(page, "The Ember Vault restored")).toBeVisible();
  await expect(page.getByText("Campaign status: Active")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete Campaign" })).toBeDisabled();

  await openManageCategory(page, "Scenes");
  await expect(page.getByText("Scene Manager")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Edit scene name" })).toHaveValue("Vault Entry");
  const sceneActivationHistory = page.getByRole("region", { name: "Scene activation history" });
  await expect(sceneActivationHistory).toContainText("Activation history");
  await expect(sceneActivationHistory).toContainText("1 activation");
  const sceneStateComparison = page.getByRole("region", { name: "Scene state comparison" });
  await expect(sceneStateComparison).toContainText("Selected scene");
  await expect(sceneStateComparison).toContainText("Selected scene is the active player scene.");
  await expect(page.getByText("Delete is audited and removes").first()).toBeVisible();
  await page.getByRole("textbox", { name: "Edit scene folder" }).fill("prep/vault");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(statusMessage(page, "Vault Entry updated")).toBeVisible();
  await page.getByRole("combobox", { name: "Scene folder filter" }).selectOption("prep/vault");
  await expect(sceneTab(page, "Vault Entry")).toBeVisible();
  await page.getByRole("combobox", { name: "Scene folder filter" }).selectOption("all");
  await expect(page.getByRole("status", { name: "Scene filter summary" })).toContainText("scenes");
  await page.getByRole("textbox", { name: "Scene search" }).fill("Vault Entry");
  await expect(sceneTab(page, "Vault Entry")).toBeVisible();
  await page.getByRole("textbox", { name: "Scene search" }).fill("Missing Scene");
  await expect(page.getByText("No scenes match filters.")).toBeVisible();
  await page.getByRole("textbox", { name: "Scene search" }).fill("");
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Duplicate Scene", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Delete Scene", exact: true })).toBeDisabled();
  await page.getByRole("textbox", { name: "Duplicate scene name" }).fill("Vault Entry Reorder");
  await page.getByRole("button", { name: "Duplicate Scene", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Edit scene name" })).toHaveValue("Vault Entry Reorder");
  await expect(sceneStateComparison).toContainText("Vault Entry Reorder");
  await expect(sceneStateComparison).toContainText("Active scene");
  await expect(sceneStateComparison).toContainText("Vault Entry");
  await expect(sceneStateComparison).toContainText("Dimensions");
  await expect(sceneStateComparison).toContainText("Tokens");
  await expect(sceneStateComparison).toContainText("Scene diff details");
  await expect(sceneStateComparison).toContainText("Prep drift review");
  await expect(sceneStateComparison).toContainText("Token roster");
  await expect(sceneStateComparison).toContainText("Selected-only none; active-only");
  await expect(sceneStateComparison).toContainText("Valen Ash");
  await expect(sceneStateComparison).toContainText("Background asset");
  await page.getByRole("textbox", { name: "Scene search" }).fill("");
  await page.getByRole("button", { name: "Select visible scenes" }).click();
  await expect(page.getByRole("status", { name: "Scene selection summary" })).toContainText("2 selected");
  await page.getByRole("textbox", { name: "Bulk scene folder" }).fill("prep/selected");
  await page.getByRole("button", { name: "Move selected scenes" }).click();
  await expect(statusMessage(page, "Moved 2 selected scenes to prep/selected")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Edit scene folder" })).toHaveValue("prep/selected");
  await page.getByRole("button", { name: "Clear selected scenes" }).click();
  await expect(page.getByRole("status", { name: "Scene selection summary" })).toContainText("0 selected");
  await page.getByRole("textbox", { name: "Scene search" }).fill("Vault Entry Reorder");
  await page.getByRole("textbox", { name: "Bulk scene folder" }).fill("prep/bulk");
  await page.getByRole("button", { name: "Move visible scenes" }).click();
  await expect(statusMessage(page, "Moved 1 visible scenes to prep/bulk")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Edit scene folder" })).toHaveValue("prep/bulk");
  const reorderSortOrderBeforeMove = await getSceneSortOrderByName(page, "Vault Entry Reorder");
  await expect(page.getByRole("button", { name: "Move Up" })).toBeEnabled();
  await page.getByRole("button", { name: "Move Up" }).click();
  await expect.poll(() => getSceneSortOrderByName(page, "Vault Entry Reorder")).toBeLessThan(reorderSortOrderBeforeMove);
  await expect(page.getByRole("button", { name: "Move Down" })).toBeEnabled();
  await page.getByRole("button", { name: "Move Down" }).click();
  await expect.poll(() => getSceneSortOrderByName(page, "Vault Entry Reorder")).toBe(reorderSortOrderBeforeMove);
  await page.getByRole("button", { name: "Activate", exact: true }).click();
  await expect(page.getByRole("button", { name: "Activate", exact: true })).toBeDisabled();
  await expect(sceneActivationHistory).toContainText("1 activation");
  await expect(sceneActivationHistory).toContainText("previous active scn_vault_entry");
  await page.getByRole("textbox", { name: "Confirm scene delete" }).fill("Vault Entry Reorder");
  await page.getByRole("button", { name: "Delete Scene", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Edit scene name" })).toHaveValue("Vault Entry");
  await expect(statusMessage(page, "Vault Entry Reorder deleted; Vault Entry is now live")).toBeVisible();
  await expect(page.getByRole("button", { name: "Activate", exact: true })).toBeDisabled();
  await expect(sceneActivationHistory).toContainText("2 activations");
  await closeManage(page);

  await expect(page.getByRole("button", { name: "Add token" })).toBeVisible();
  await submitChatCommand(page, "/roll 1d20+5");
  await expect(page.getByRole("status").filter({ hasText: /^Rolled \d+$/ })).toBeVisible();
  await openInspectorPanel(page, "Actors");
  await page.getByRole("tabpanel", { name: "Actors" }).getByRole("tab", { name: "Compendium", exact: true }).click();
  const compendiumBrowser = page.locator('[aria-label="Actor compendium browser"]');
  await expect(compendiumBrowser).toContainText("Compendium");
  await compendiumBrowser.getByRole("textbox", { name: "Compendium search" }).fill("Healing Word");
  await expect(compendiumBrowser).toContainText("Healing Word");
  const healingWordEntry = compendiumBrowser.locator("article").filter({
    has: page.getByText("Healing Word", { exact: true })
  });
  await healingWordEntry.getByRole("button", { name: "Add" }).click();
  await expect(statusMessage(page, /Healing Word (imported|at content version .* already present)/)).toBeVisible();
  await expect(page.locator(".metric-row", { hasText: "Spells" })).toContainText("Healing Word");
  await page.getByRole("tab", { name: "Loadout" }).click();
  const healingWordLoadout = page.getByRole("region", { name: "Actor loadout sheet" }).locator("article", { hasText: "Healing Word" }).first();
  await expect(healingWordLoadout).toContainText("prepared");
  const spellPreparation = page.getByRole("region", { name: "D&D spell preparation" });
  await spellPreparation.getByRole("checkbox", { name: "Healing Word", exact: true }).uncheck();
  await spellPreparation.getByRole("button", { name: "Preview preparation" }).click();
  const preparationReview = spellPreparation.getByLabel("Spell preparation review");
  await expect(preparationReview).toContainText("This character does not have a supported stored spellcasting class");
  await expect(preparationReview).toContainText("No item preparation flags will change");
  await expect(preparationReview.getByRole("button", { name: "Apply prepared spells" })).toBeDisabled();
  await expect(healingWordLoadout).toContainText("prepared");
  await page.getByRole("tab", { name: "Actions" }).click();
  await expect(page.getByRole("region", { name: "Actor action sheet" })).toContainText("Healing Word Healing");
  await openActorDisclosure(selectedActorPanel(page), "Actor details");
  await expect(page.getByRole("combobox", { name: "Action target actor" })).toBeVisible();
  await page.getByRole("combobox", { name: "Action target actor" }).selectOption({ label: "Valen Ash" });
  await setCheckbox(page.getByRole("checkbox", { name: "Apply action effect" }), true);
  await setCheckbox(page.getByRole("checkbox", { name: "Consume action resources" }), false);
  const healingWordAction = page.getByRole("region", { name: "Actor action sheet" }).locator("article").filter({
    has: page.getByText("Healing Word Healing", { exact: true })
  });
  await clickAndConfirmPreparedDndAction(healingWordAction.getByRole("button", { name: "Use action" }));
  await expect(statusMessage(page, /Valen Ash (used action|action posted).*applied/)).toBeVisible();
  await page.getByRole("button", { name: "Token Valen Ash" }).first().click();
  await openActorDisclosure(selectedActorPanel(page), "Token settings");
  await page.getByRole("textbox", { name: "Token conditions" }).fill("Marked, Blessed");
  await page.getByRole("textbox", { name: "Token conditions" }).blur();
  await expect(statusMessage(page, "Token updated")).toBeVisible();
  await page.getByRole("textbox", { name: "Token auras" }).fill("Guardian Aura:15:#38bdf8");
  await page.getByRole("textbox", { name: "Token auras" }).blur();
  await expect(page.getByText("Guardian Aura 15")).toBeVisible();
  await page.getByRole("textbox", { name: "Token notes" }).fill("Hold the vault doorway.");
  await page.getByRole("textbox", { name: "Token notes" }).blur();
  await expect(statusMessage(page, "Token updated")).toBeVisible();
  const tokenOwners = page.locator('[aria-label="Token owners"]');
  await setCheckbox(tokenOwners.getByRole("checkbox", { name: "Demo Player" }), true);
  await expect(statusMessage(page, "Token updated")).toBeVisible();
  await expect(page.locator(".metric-row", { hasText: "Token State" })).toContainText("Owners 1");
  const targetedCheckbox = page.getByRole("checkbox", { name: "Targeted" });
  if (!(await targetedCheckbox.isChecked())) {
    await setCheckbox(targetedCheckbox, true);
    await expect(statusMessage(page, "Token targeted")).toBeVisible();
  }
  await expect(targetedCheckbox).toBeChecked();
  const sceneBoard = page.locator(".scene-board").first();
  await openTokenQuickCreate(page);
  await page.getByRole("combobox", { name: "Token actor" }).selectOption("act_valen");
  await page.getByRole("button", { name: "Add token" }).click();
  await expect(statusMessage(page, "Valen Ash created")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Token inspector name" })).toHaveValue("Valen Ash");
  await deleteNewestTokenByName(page, "Valen Ash");
  const box = await sceneBoard.boundingBox();
  expect(box).not.toBeNull();
  await openTokenQuickCreate(page);
  await page.getByRole("textbox", { name: "Token name" }).fill("AOE Target");
  await page.getByRole("button", { name: "Token", exact: true }).click();
  await expect(statusMessage(page, "AOE Target created")).toBeVisible();
  const aoeTarget = await getNewestSceneTokenByName(page, "AOE Target");
  await patchTokenConditions(page, aoeTarget.id, [
    { id: "resistant-fire", name: "Resistant fire" },
    { id: "concentrating", name: "Concentrating" }
  ]);
  const annotationPanel = page.getByRole("region", { name: "Annotation layers and history" });
  await page.getByRole("button", { name: "Drawing", exact: true }).click();
  await expect(annotationPanel).toBeVisible();
  await annotationPanel.getByRole("textbox", { name: "Annotation group label" }).fill("E2E Markup");
  await annotationPanel.getByRole("combobox", { name: "Annotation layer" }).selectOption("measurement");
  await annotationPanel.getByRole("button", { name: "Close annotation settings" }).click();
  await page.getByRole("button", { name: "Ping" }).click();
  await sceneBoard.click({ position: { x: Math.round(box!.width * 0.2), y: Math.round(box!.height * 0.76) } });
  await expect(statusMessage(page, "Ping sent")).toBeVisible();
  await page.getByRole("button", { name: "Drawing", exact: true }).click();
  await expect(annotationPanel).toBeVisible();
  for (const section of ["Layer visibility", "Groups", "History"]) {
    await annotationPanel.locator("details.annotation-panel-section").filter({ hasText: section }).locator("summary").click();
  }
  await expect(annotationPanel.getByRole("region", { name: "Annotation group summary" })).toContainText("E2E Markup");
  await annotationPanel.getByRole("button", { name: "Close annotation settings" }).click();
  await page.getByRole("button", { name: "Ruler" }).click();
  await expect(statusMessage(page, "Ruler tool active")).toBeVisible();
  await page.getByRole("button", { name: "Area template" }).click();
  await expect(annotationPanel).toBeVisible();
  for (const section of ["Layer visibility", "History", "Area template"]) {
    const details = annotationPanel.locator("details.annotation-panel-section").filter({ hasText: section }).first();
    const isOpen = await details.evaluate((element) => (element as HTMLDetailsElement).open);
    if (!isOpen) await details.locator("summary").click();
  }
  await expect(annotationPanel.getByRole("checkbox", { name: "Snap templates to grid" })).toBeChecked();
  await annotationPanel.getByRole("combobox", { name: "Annotation layer" }).selectOption("effects");
  await annotationPanel.getByRole("combobox", { name: "Template shape" }).selectOption("line");
  await annotationPanel.getByRole("combobox", { name: "Template save ability" }).selectOption("dexterity");
  await annotationPanel.getByRole("spinbutton", { name: "Template save DC" }).fill("15");
  await annotationPanel.getByRole("textbox", { name: "Template damage formula" }).fill("6");
  await annotationPanel.getByRole("textbox", { name: "Template damage type" }).fill("fire");
  await annotationPanel.getByRole("button", { name: "Close annotation settings" }).click();
  const templateBox = await sceneBoard.boundingBox();
  expect(templateBox).not.toBeNull();
  await sceneBoard.hover({ position: { x: Math.round(templateBox!.width * 0.8), y: Math.round(templateBox!.height * 0.5) } });
  await page.mouse.down();
  await page.mouse.move(templateBox!.x + templateBox!.width * 0.5, templateBox!.y + templateBox!.height * 0.5);
  await page.mouse.up();
  await expect(statusMessage(page, "Template added")).toBeVisible();
  await page.getByRole("button", { name: "Drawing", exact: true }).click();
  await expect(annotationPanel).toBeVisible();
  for (const section of ["Layer visibility", "History", "Area template"]) {
    const details = annotationPanel.locator("details.annotation-panel-section").filter({ hasText: section }).first();
    const isOpen = await details.evaluate((element) => (element as HTMLDetailsElement).open);
    if (!isOpen) await details.locator("summary").click();
  }
  await expect(annotationPanel.getByRole("region", { name: "Annotation layer summary" })).toContainText("Effects");
  await expect(annotationPanel.getByRole("region", { name: "Annotation history" })).toContainText("Create Template");
  await expect(annotationPanel.getByRole("region", { name: "Area template automation" })).toContainText("Snapped Line template");
  await expect(annotationPanel.getByRole("region", { name: "Area template automation" })).toContainText("1 affected - dnd-5e-srd");
  await expect(annotationPanel.getByRole("region", { name: "Area template automation" })).toContainText("Line template: 1 affected token");
  await expect(annotationPanel.getByRole("region", { name: "Area template automation" })).toContainText("Dexterity save DC 15");
  await expect(annotationPanel.getByRole("region", { name: "Area template automation" })).toContainText("damage 6 fire");
  await annotationPanel.getByRole("checkbox", { name: "Show Effects annotations" }).uncheck();
  await expect(statusMessage(page, "Effects annotations hidden")).toBeVisible();
  await expect(page.locator(".scene-annotation.template")).toHaveCount(0);
  await annotationPanel.getByRole("checkbox", { name: "Show Effects annotations" }).check();
  await expect(statusMessage(page, "Effects annotations shown")).toBeVisible();
  await expect(page.locator(".scene-annotation.template")).toBeVisible();
  await annotationPanel.getByRole("button", { name: "Target affected" }).click();
  await expect(statusMessage(page, "Targeted 1 tokens")).toBeVisible();
  await annotationPanel.getByRole("button", { name: "Roll damage" }).click();
  await expect(statusMessage(page, "Template damage 6")).toBeVisible();
  await annotationPanel.getByRole("button", { name: "Apply damage" }).click();
  await expect(statusMessage(page, "Applied template damage to 1 tokens")).toBeVisible();
  const damagedTarget = await getSceneTokenById(page, aoeTarget.id);
  expect(damagedTarget.conditions?.map((condition) => condition.name)).toContain("Damaged 3 fire (resisted; concentration DC 10)");
  await annotationPanel.getByRole("button", { name: "Resolve saves" }).click();
  await expect(statusMessage(page, "Resolved saves for 1 tokens")).toBeVisible();
  const resolvedTarget = await getSceneTokenById(page, aoeTarget.id);
  expect(resolvedTarget.conditions?.some((condition) => /^(Saved|Failed) Dexterity \d+ vs DC 15 - Damaged (1|3) fire \(resisted; concentration DC 10\)$/.test(condition.name))).toBeTruthy();
  await page.evaluate(async ({ apiBaseUrl }) => {
    const bearer = localStorage.getItem("otte:sessionToken");
    if (!bearer) throw new Error("No browser session token available for drawing setup");
    const headers = { authorization: `Bearer ${bearer}` };
    const campaigns = await fetch(`${apiBaseUrl}/api/v1/campaigns`, { headers }).then((response) => response.json());
    const campaign = campaigns.find((item: { name?: string }) => item.name === "The Ember Vault") ?? campaigns[0];
    const scenes = await fetch(`${apiBaseUrl}/api/v1/campaigns/${campaign.id}/scenes`, { headers }).then((response) => response.json());
    const scene = scenes.find((item: { name?: string }) => item.name === "Vault Entry") ?? scenes[0];
    const response = await fetch(`${apiBaseUrl}/api/v1/scenes/${scene.id}/annotations`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "idempotency-key": `e2e-create-drawing:${crypto.randomUUID()}`,
      },
      body: JSON.stringify({
        expectedUpdatedAt: scene.updatedAt,
        kind: "drawing",
        label: "Drawing",
        color: "#a78bfa",
        layer: "drawings",
        groupLabel: "E2E Markup",
        points: [
          { x: Math.round(scene.width * 0.82), y: Math.round(scene.height * 0.22) },
          { x: Math.round(scene.width * 0.72), y: Math.round(scene.height * 0.32) },
          { x: Math.round(scene.width * 0.62), y: Math.round(scene.height * 0.24) }
        ]
      })
    });
    if (!response.ok) throw new Error(await response.text());
  }, { apiBaseUrl });
  await page.reload();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  await expect(page.locator(".scene-annotation.drawing").first()).toBeVisible();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await expect(statusMessage(page, "Select tool active")).toBeVisible();
  const templateMoveHandle = page.getByRole("button", { name: "Move Template annotation in E2E Markup" });
  await expect(templateMoveHandle).toBeVisible();
  const templateMoveHandleBox = await templateMoveHandle.boundingBox();
  expect(templateMoveHandleBox).not.toBeNull();
  await page.mouse.move(templateMoveHandleBox!.x + templateMoveHandleBox!.width / 2, templateMoveHandleBox!.y + templateMoveHandleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(templateMoveHandleBox!.x + templateMoveHandleBox!.width / 2 - 72, templateMoveHandleBox!.y + templateMoveHandleBox!.height / 2 - 48);
  await page.mouse.up();
  await expect(statusMessage(page, "Moved Template annotation")).toBeVisible();
  const drawingEndHandle = page.getByRole("button", { name: "Edit path end Drawing annotation in E2E Markup" });
  await expect(drawingEndHandle).toBeVisible();
  const drawingEndHandleBox = await drawingEndHandle.boundingBox();
  expect(drawingEndHandleBox).not.toBeNull();
  await page.mouse.move(drawingEndHandleBox!.x + drawingEndHandleBox!.width / 2, drawingEndHandleBox!.y + drawingEndHandleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(drawingEndHandleBox!.x + drawingEndHandleBox!.width / 2 + 28, drawingEndHandleBox!.y + drawingEndHandleBox!.height / 2 - 18);
  await page.mouse.up();
  await expect(statusMessage(page, "Moved Drawing annotation")).toBeVisible();
  await page.getByRole("button", { name: "Drawing", exact: true }).click();
  await expect(annotationPanel).toBeVisible();
  for (const section of ["Layer visibility", "Groups", "History", "Area template"]) {
    const details = annotationPanel.locator("details.annotation-panel-section").filter({ hasText: section }).first();
    const isOpen = await details.evaluate((element) => (element as HTMLDetailsElement).open);
    if (!isOpen) await details.locator("summary").click();
  }
  await expect(annotationPanel.getByRole("region", { name: "Annotation history" })).toContainText("Update");
  await expect(annotationPanel.getByRole("region", { name: "Area template automation" })).toContainText("Line template");
  await annotationPanel.getByRole("button", { name: "Nudge annotation group E2E Markup" }).click();
  await expect(statusMessage(page, /Moved [23] annotations in E2E Markup/)).toBeVisible();
  const recolorGroup = annotationPanel.getByRole("button", { name: "Recolor annotation group E2E Markup" });
  await recolorGroup.focus();
  await expect(recolorGroup).toBeFocused();
  await recolorGroup.press("Enter");
  await expect(statusMessage(page, /Recolored [23] annotations in E2E Markup/)).toBeVisible();
  await expect(annotationPanel.getByRole("region", { name: "Annotation history" })).toContainText("Update");
  const deleteGroup = annotationPanel.getByRole("button", { name: "Delete annotation group E2E Markup" });
  await deleteGroup.focus();
  await expect(deleteGroup).toBeFocused();
  await deleteGroup.press("Enter");
  await expect(statusMessage(page, /Deleted [23] annotations in E2E Markup/)).toBeVisible();
  await expect(annotationPanel).toBeVisible();
  await expect(annotationPanel.getByRole("region", { name: "Annotation layer summary" })).toContainText("No annotations yet");
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await expect(page.locator(".scene-annotation")).toHaveCount(0);
  await deleteNewestTokenByName(page, "AOE Target");
  await submitChatCommand(page, "/roll 1d20");
  await expect(page.getByRole("status").filter({ hasText: /^Rolled \d+$/ })).toBeVisible();
  await submitChatCommand(page, "E2E moderation checkpoint");
  await submitChatCommand(page, "/gm E2E GM moderation checkpoint");
  await submitChatCommand(page, "E2E threaded reply");
  const chatMessages = page.locator('[aria-label="Chat messages"]');
  await expect(chatMessages).toContainText("E2E moderation checkpoint");
  await expect(chatMessages).toContainText("E2E GM moderation checkpoint");
  await expect(chatMessages).toContainText("E2E threaded reply");
  await expect(chatMessages.locator("article", { hasText: "E2E moderation checkpoint" }).first()).toContainText("Public");
  await expect(chatMessages.locator("article", { hasText: "E2E GM moderation checkpoint" }).first()).toContainText("GM");

  await page.getByRole("button", { name: "Prep", exact: true }).click();
  await page.getByRole("tab", { name: "Assets" }).click();
  await expect(page.getByRole("region", { name: "Asset library" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Asset search" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Asset lifecycle filter" })).toBeVisible();
  const recoveryPanel = page.getByRole("region", { name: "Asset restore recovery" });
  await expect(page.locator('[aria-label="Asset quota usage"]')).toContainText("remaining");
  await expect(page.locator('[aria-label="Asset quota management"]')).toContainText("Quota policy");
  await expect(page.locator('[aria-label="Asset quota management"]')).toContainText("Recommended action");
  await expect(page.locator('[aria-label="Asset quota management"]')).toContainText("No quota cleanup needed");
  const storageDetails = page.locator("details.asset-maintenance-drawer").filter({ hasText: "Storage and delivery details" }).first();
  await openDetails(storageDetails);
  await expect(page.getByText("Delivery ready")).toBeVisible();
  await expect(page.getByText("signed_blob delivery")).toBeVisible();
  await expect(page.getByText("0 undeliverable - 0 CDN eligible")).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload Asset" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Upload Background" })).toBeEnabled();
  await openDetails(page.locator("details.asset-upload-defaults"));
  await page.getByRole("textbox", { name: "Asset upload folder" }).fill("maps/vault");
  await page.getByRole("textbox", { name: "Asset upload tags" }).fill("e2e, map");
  await page.locator("#asset-library-upload").setInputFiles({
    name: "blocked-map.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert("blocked")</script></svg>')
  });
  await expect(page.getByText(/Upload failed:/)).toBeVisible();
  await expect(page.getByLabel("Asset upload recovery")).toContainText("blocked-map.svg");
  await page.getByRole("button", { name: "Retry upload" }).click();
  await expect(page.getByText(/Upload failed:/)).toBeVisible();
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(page.getByLabel("Asset upload recovery")).toHaveCount(0);
  await page.locator("#asset-library-upload").setInputFiles({
    name: "e2e-map.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#345"/><circle cx="32" cy="32" r="18" fill="#d9b44a"/></svg>')
  });
  await expect(statusMessage(page, "e2e-map.svg uploaded")).toBeVisible();
  await page.getByRole("textbox", { name: "Asset search" }).fill("e2e-map");
  const assetLibrary = page.getByRole("region", { name: "Asset library" });
  const uploadedAsset = assetLibrary.locator("article", { hasText: "e2e-map.svg" });
  await expect(uploadedAsset).toBeVisible();
  await expect(uploadedAsset).toContainText("maps/vault");
  await expect(uploadedAsset).toContainText("e2e");
  await expect(uploadedAsset).toContainText("map");
  await openDetails(uploadedAsset.locator("details.asset-card-details"));
  await uploadedAsset.getByRole("textbox", { name: "e2e-map.svg asset folder" }).fill("maps/revised");
  await uploadedAsset.getByRole("textbox", { name: "e2e-map.svg asset tags" }).fill("vault, background");
  await uploadedAsset.getByRole("button", { name: "Save Metadata" }).click();
  await expect(statusMessage(page, "e2e-map.svg metadata updated")).toBeVisible();
  await expect(uploadedAsset).toContainText("maps/revised");
  await expect(uploadedAsset).toContainText("vault");
  await expect(uploadedAsset).toContainText("background");
  await uploadedAsset.getByRole("button", { name: "Signed URL" }).click();
  await expect(statusMessage(page, "Signed URL ready for e2e-map.svg")).toBeVisible();
  await expect(statusMessage(page, "Asset delivery URL created")).toBeVisible();
  const assetFolderNavigation = page.getByLabel("Asset folder navigation");
  await expect(assetFolderNavigation).toContainText("maps");
  await page.getByRole("button", { name: "Open asset folder maps" }).click();
  await expect(uploadedAsset).toBeVisible();
  await expect(assetFolderNavigation).toContainText("revised");
  await page.getByRole("button", { name: "Open asset folder maps/revised" }).click();
  await expect(page.getByRole("combobox", { name: "Asset folder filter" })).toHaveValue("maps/revised");
  await expect(uploadedAsset).toBeVisible();
  await uploadedAsset.getByRole("button", { name: "Place e2e-map.svg asset on scene" }).click();
  await expect(statusMessage(page, "e2e-map.svg placed on scene")).toBeVisible();
  await deleteNewestTokenByName(page, "e2e-map.svg");
  const canvasAssetPicker = page.getByRole("region", { name: "Canvas asset picker" });
  await canvasAssetPicker.locator("summary").click();
  await canvasAssetPicker.getByRole("combobox", { name: "Canvas asset folder" }).selectOption("maps/revised");
  await canvasAssetPicker.getByRole("textbox", { name: "Canvas image search" }).fill("e2e-map");
  await expect(canvasAssetPicker.getByRole("region", { name: "Canvas asset thumbnail grid" })).toContainText("e2e-map.svg");
  await canvasAssetPicker.getByRole("button", { name: "Select canvas asset e2e-map.svg" }).click();
  await expect(canvasAssetPicker.getByRole("combobox", { name: "Canvas asset picker" })).toHaveValue(/asset_/);
  await expect(canvasAssetPicker.getByLabel("Selected canvas asset preview")).toContainText("e2e-map.svg");
  await expect(canvasAssetPicker.getByLabel("Selected canvas asset preview")).toContainText("maps/revised");
  await expect(canvasAssetPicker.getByLabel("Selected canvas asset preview").locator("img")).toBeVisible();
  await expect(canvasAssetPicker.getByRole("button", { name: "Place selected canvas asset" })).toBeEnabled();
  await expect(canvasAssetPicker.getByRole("button", { name: "Set selected canvas background" })).toBeEnabled();
  await canvasAssetPicker.getByRole("spinbutton", { name: "Canvas asset placement count" }).fill("2");
  await canvasAssetPicker.getByRole("button", { name: "Place selected canvas asset" }).click();
  await expect(statusMessage(page, "Placed 2 e2e-map.svg tokens")).toBeVisible();
  await deleteNewestTokenByName(page, "e2e-map.svg");
  await deleteNewestTokenByName(page, "e2e-map.svg");
  const boardBox = await sceneBoard.boundingBox();
  expect(boardBox).not.toBeNull();
  const canvasAssetTile = canvasAssetPicker.getByRole("button", { name: "Select canvas asset e2e-map.svg" });
  const dropPoint = {
    clientX: Math.floor(boardBox!.x + boardBox!.width * 0.5),
    clientY: Math.floor(boardBox!.y + boardBox!.height * 0.82)
  };
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await canvasAssetTile.dispatchEvent("dragstart", { dataTransfer });
  await sceneBoard.dispatchEvent("dragenter", { dataTransfer, ...dropPoint });
  await sceneBoard.dispatchEvent("dragover", { dataTransfer, ...dropPoint });
  await sceneBoard.dispatchEvent("drop", { dataTransfer, ...dropPoint });
  await canvasAssetTile.dispatchEvent("dragend", { dataTransfer, ...dropPoint });
  await dataTransfer.dispose();
  await expect.poll(async () => {
    try {
      await getNewestSceneTokenByName(page, "e2e-map.svg");
      return true;
    } catch {
      return false;
    }
  }).toBe(true);
  await deleteNewestTokenByName(page, "e2e-map.svg");
  await uploadedAsset.getByRole("checkbox", { name: "Select e2e-map.svg asset" }).check();
  await page.getByRole("button", { name: "Batch archive assets" }).click();
  await expect(statusMessage(page, "e2e-map.svg marked archived")).toBeVisible();
  await expect(uploadedAsset.locator(".status-pill")).toContainText("Archived");
  await openDetails(recoveryPanel);
  await expect(recoveryPanel).toContainText("e2e-map.svg");
  await page.getByRole("combobox", { name: "Asset lifecycle filter" }).selectOption("archived");
  await expect(uploadedAsset).toBeVisible();
  await uploadedAsset.getByRole("checkbox", { name: "Select e2e-map.svg asset" }).check();
  await page.getByRole("button", { name: "Batch restore assets" }).click();
  await expect(statusMessage(page, "e2e-map.svg marked active")).toBeVisible();
  await page.getByRole("combobox", { name: "Asset lifecycle filter" }).selectOption("all");
  await expect(uploadedAsset.locator(".status-pill")).toContainText("Active");
  await uploadedAsset.getByRole("button", { name: "Delete" }).click();
  await expect(statusMessage(page, "e2e-map.svg marked deleted")).toBeVisible();
  await expect(uploadedAsset.locator(".status-pill")).toContainText("Deleted");
  await expect(uploadedAsset.getByRole("button", { name: "Place e2e-map.svg asset on scene" })).toBeDisabled();
  await expect(uploadedAsset.getByRole("button", { name: "Background", exact: true })).toBeDisabled();
  await expect(uploadedAsset.getByRole("button", { name: "Signed URL" })).toBeDisabled();
  await openDetails(recoveryPanel);
  await expect(recoveryPanel).toContainText("e2e-map.svg");
  await page.getByRole("combobox", { name: "Asset lifecycle filter" }).selectOption("deleted");
  await expect(uploadedAsset).toBeVisible();
  await uploadedAsset.getByRole("checkbox", { name: "Select e2e-map.svg asset" }).check();
  await page.getByRole("button", { name: "Batch restore assets" }).click();
  await expect(statusMessage(page, "e2e-map.svg marked active")).toBeVisible();
  await page.getByRole("combobox", { name: "Asset lifecycle filter" }).selectOption("all");
  await expect(uploadedAsset.locator(".status-pill")).toContainText("Active");
  await page.getByRole("combobox", { name: "Asset folder filter" }).selectOption("maps/revised");
  await expect(uploadedAsset).toBeVisible();
  await page.getByRole("combobox", { name: "Asset folder filter" }).selectOption("all");
  await uploadedAsset.getByRole("button", { name: "Background", exact: true }).click();
  await expect(statusMessage(page, "e2e-map.svg set as Vault Entry background")).toBeVisible();
  await expect(page.locator(".scene-tab-thumb img").first()).toBeVisible();
  await openManageCategory(page, "Scenes");
  await page.getByRole("combobox", { name: "Edit scene background asset" }).selectOption({ label: "No background" });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".scene-background-preview")).toContainText("No background");
  await page.getByRole("combobox", { name: "Edit scene background asset" }).selectOption({ label: "e2e-map.svg" });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".scene-background-preview")).toContainText("e2e-map.svg");
  await closeManage(page);
  await page.getByRole("button", { name: "Prep", exact: true }).click();
  await page.getByRole("tab", { name: "Assets" }).click();
  const contentImportDrawer = page.locator("details.content-import-drawer");
  await openDetails(contentImportDrawer);
  await expect(contentImportDrawer).toContainText("Content import");

  await page.getByRole("combobox", { name: "Content import adapter" }).selectOption("csv_items");
  await page.getByRole("textbox", { name: "Adapter source name" }).fill("E2E CSV Adapter Source");
  await page.getByRole("textbox", { name: "Adapter source URL" }).fill("https://example.test/e2e-csv-items.csv");
  await page.getByRole("textbox", { name: "Adapter configuration" }).fill("columns=name|body;delimiter=|;kind=journal");
  await page.getByRole("textbox", { name: "Content import body" }).fill("name|body\nE2E Adapter Torch|Imported from a configured CSV adapter preset.\nE2E Adapter Rope|Second generated adapter journal.");
  await expect(page.getByLabel("Adapter preview summary")).toContainText("Adapter: csv-item-list-v1");
  await expect(page.getByLabel("Adapter preview summary")).toContainText("2 generated entities");
  await page.getByRole("button", { name: "Preview Batch" }).click();
  await expect(statusMessage(page, "Content import previewed")).toBeVisible();
  const adapterImportReport = page.locator(".content-import-report", { hasText: "E2E Adapter Torch" });
  await expect(adapterImportReport.locator('[aria-label="Provenance and license"]')).toContainText("Source: Adapter");
  await expect(adapterImportReport.locator('[aria-label="Provenance and license"]')).toContainText("Adapter: csv-item-list-v1");
  await expect(adapterImportReport.locator('[aria-label="Import entity selection"]')).toContainText("Journal: E2E Adapter Rope");
  await adapterImportReport.getByRole("button", { name: "Delete" }).click();
  await expect(statusMessage(page, "Deleted E2E CSV Adapter Source")).toBeVisible();
  await expect(page.getByText("No content imports for this campaign.")).toBeVisible();

  await page.getByRole("combobox", { name: "Content import adapter" }).selectOption("manual");
  await page.getByRole("combobox", { name: "Content import kind" }).selectOption("item");
  await page.getByRole("textbox", { name: "Content import name" }).fill("E2E Import Ledger");
  await page.getByRole("textbox", { name: "Content import body" }).fill("Imported from the browser validation flow.");
  await page.getByRole("button", { name: "Add Entity" }).click();
  await expect(page.locator('[aria-label="Pending import entities"]')).toContainText("Item: E2E Import Ledger");
  await page.getByRole("combobox", { name: "Content import kind" }).selectOption("handout");
  await page.getByRole("textbox", { name: "Content import name" }).fill("E2E Import Handout");
  await page.getByRole("textbox", { name: "Content import body" }).fill("A handout that should stay excluded during selective apply.");
  await page.getByRole("button", { name: "Preview Batch" }).click();
  await expect(statusMessage(page, "Content import previewed")).toBeVisible();

  const importReport = page.locator(".content-import-report", { hasText: "E2E Import Ledger" });
  await expect(importReport.locator('[aria-label="Validation report"]')).toContainText("2 warnings");
  await expect(importReport.locator('[aria-label="Validation report"]')).toContainText("2 of 2");
  await expect(importReport.locator('[aria-label="Provenance and license"]')).toContainText("Source: Manual");
  await expect(importReport.locator('[aria-label="Provenance and license"]')).toContainText("License: User-provided private table content");
  await expect(importReport.locator('[aria-label="Provenance and license"]')).toContainText("Usage: Private Home Game");
  await expect(importReport.locator('[aria-label="Import entity selection"]')).toContainText("Item: E2E Import Ledger");
  await expect(importReport.locator('[aria-label="Import entity selection"]')).toContainText("Handout: E2E Import Handout");
  await expect(importReport.locator('[aria-label="Import entity selection"]')).toContainText("private_home_game_not_redistributable");

  await importReport.getByRole("checkbox", { name: "Select E2E Import Ledger" }).uncheck();
  await importReport.getByRole("checkbox", { name: "Select E2E Import Handout" }).uncheck();
  await expect(importReport.getByRole("button", { name: "Apply Selected" })).toBeDisabled();
  await importReport.getByRole("checkbox", { name: "Select E2E Import Ledger" }).check();
  await importReport.getByRole("button", { name: "Apply Selected" }).click();
  await expect(statusMessage(page, "Content import applied")).toBeVisible();
  await expect(importReport).toContainText("applied to items");
  await page.getByRole("tab", { name: "Actors" }).click();
  await page.getByRole("tab", { name: "Loadout" }).click();
  const assignment = page.getByLabel("Assign item to actor");
  await expect(assignment.getByRole("combobox", { name: "Unassigned item" })).toContainText("E2E Import Ledger");
  await page.getByRole("button", { name: "Drag E2E Import Ledger to actor loadout" }).dragTo(page.getByRole("region", { name: "Actor loadout sheet" }));
  const assignmentStatus = statusMessage(page, "Gave E2E Import Ledger to Valen Ash");
  let assignedByDrag = false;
  try {
    await expect(assignmentStatus).toBeVisible({ timeout: 2000 });
    assignedByDrag = true;
  } catch {
    assignedByDrag = false;
  }
  if (!assignedByDrag) {
    await assignment.getByRole("combobox", { name: "Unassigned item" }).selectOption({ label: "E2E Import Ledger" });
    await assignment.getByRole("button", { name: "Assign selected item" }).click();
  }
  await expect(assignmentStatus).toBeVisible();
  await expect(page.getByRole("region", { name: "Actor loadout sheet" })).toContainText("E2E Import Ledger");
  const importedLoadoutItem = page.getByRole("region", { name: "Actor loadout sheet" }).locator("article", { hasText: "E2E Import Ledger" });
  await importedLoadoutItem.getByRole("button", { name: "Add one" }).click();
  await expect(statusMessage(page, "E2E Import Ledger updated")).toBeVisible();
  await expect(importedLoadoutItem).toContainText("E2E Import Ledger x2");
  await importedLoadoutItem.getByRole("button", { name: "Spend one" }).click();
  await expect(statusMessage(page, "E2E Import Ledger updated")).toBeVisible();
  await expect(importedLoadoutItem).toContainText("E2E Import Ledger x1");
  await page.getByRole("button", { name: "Prep", exact: true }).click();
  await page.getByRole("tab", { name: "Assets" }).click();
  await openDetails(contentImportDrawer);
  await importReport.getByRole("button", { name: "Rollback" }).click();
  await expect(statusMessage(page, "Content import rolled back")).toBeVisible();
  await expect(importReport.locator('[aria-label="Import history"]')).toContainText("Rolled back:");
});

test("GM can organize prep across the World Atlas, Handout Library, and Session Desk", async ({ page }) => {
  test.setTimeout(60_000);
  const suffix = Date.now().toString(36);
  const worldName = `E2E Ashen Atlas ${suffix}`;
  const worldDescription = "A persistent E2E world for linked prep.";
  const handoutTitle = `E2E Atlas Brief ${suffix}`;
  const handoutBody = "The western vault opens only when the ember bell rings.";
  const sessionTitle = `E2E Atlas Session ${suffix}`;
  const sessionAgenda = "Review the atlas brief, enter Vault Entry, and follow the ember bell clue.";
  const sessionNotes = "Bring the linked handout into play.";
  let vaultSceneId = "";
  let originalWorldId: string | undefined;

  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  try {
    const scenes = await expectJsonResponse<Array<{ id: string; name: string; worldId?: string }>>(
      await page.request.get(`${apiBaseUrl}/api/v1/campaigns/camp_demo/scenes`, { headers: gmApiHeaders })
    );
    const vaultScene = scenes.find((scene) => scene.name === "Vault Entry");
    expect(vaultScene).toBeDefined();
    vaultSceneId = vaultScene!.id;
    originalWorldId = vaultScene!.worldId;

    await page.getByRole("button", { name: "Prep", exact: true }).click();
    await openInspectorPanel(page, "Worlds");
    const worldAtlas = page.getByRole("region", { name: "World Atlas" });
    await expect(worldAtlas.getByRole("heading", { name: "Places & prep scenes" })).toBeVisible();
    const addWorld = worldAtlas.locator("details.lore-create-drawer").filter({
      has: page.getByRole("textbox", { name: "New world name" })
    });
    await openDetails(addWorld);
    await addWorld.getByRole("textbox", { name: "New world name" }).fill(worldName);
    await addWorld.getByRole("textbox", { name: "New world description" }).fill(worldDescription);
    await addWorld.getByRole("button", { name: "Create world" }).click();
    await expect(statusMessage(page, `${worldName} added to the atlas`)).toBeVisible();
    const worldEditor = worldAtlas.getByRole("form", { name: `Edit world ${worldName}` });
    await expect(worldEditor.getByRole("textbox", { name: "World name" })).toHaveValue(worldName);
    await expect(worldEditor.getByRole("textbox", { name: "World description" })).toHaveValue(worldDescription);

    const worldFilters = worldAtlas.getByRole("group", { name: "Filter prep scenes by world" });
    await worldFilters.getByRole("button", { name: /^All / }).click();
    await worldAtlas.getByRole("combobox", { name: "World for Vault Entry" }).selectOption({ label: worldName });
    await expect(statusMessage(page, `Vault Entry moved to ${worldName}`)).toBeVisible();
    await worldFilters.getByRole("button", { name: new RegExp(`^${worldName} `) }).click();
    await expect(worldAtlas.getByRole("region", { name: "World scenes" })).toContainText("Vault Entry");

    await openInspectorPanel(page, "Handouts");
    const handoutLibrary = page.getByRole("region", { name: "Handout Library" });
    await expect(handoutLibrary.getByRole("heading", { name: "Shareable table documents" })).toBeVisible();
    await handoutLibrary.getByRole("button", { name: "Create handout" }).click();
    const handoutForm = handoutLibrary.getByRole("form", { name: "Create handout" });
    await handoutForm.getByRole("textbox", { name: "Handout title" }).fill(handoutTitle);
    await handoutForm.getByRole("textbox", { name: "Handout body" }).fill(handoutBody);
    await handoutForm.getByRole("combobox", { name: "Handout world" }).selectOption({ label: worldName });
    await handoutForm.getByRole("combobox", { name: "Handout visibility" }).selectOption("public");
    await handoutForm.getByRole("textbox", { name: "Handout tags" }).fill("atlas, ember-bell");
    await handoutForm.getByRole("button", { name: "Share handout" }).click();
    await expect(statusMessage(page, `${handoutTitle} shared`)).toBeVisible();
    const handoutRow = handoutLibrary.getByRole("listitem").filter({ hasText: handoutTitle });
    await expect(handoutRow).toContainText("Everyone");
    await expect(handoutRow).toContainText("atlas");
    const savedHandout = handoutLibrary.getByRole("form", { name: `Edit handout ${handoutTitle}` });
    await expect(savedHandout.getByRole("textbox", { name: "Handout body" })).toHaveValue(handoutBody);
    await expect(savedHandout.getByRole("combobox", { name: "Handout world" })).toHaveValue(
      (await expectJsonResponse<Array<{ id: string; name: string }>>(
        await page.request.get(`${apiBaseUrl}/api/v1/campaigns/camp_demo/worlds`, { headers: gmApiHeaders })
      )).find((world) => world.name === worldName)!.id
    );

    await openInspectorPanel(page, "Sessions");
    const sessionDesk = page.getByRole("region", { name: "Session Desk" });
    await expect(sessionDesk.getByRole("heading", { name: "Plan, run, remember" })).toBeVisible();
    await sessionDesk.getByRole("button", { name: "Plan session" }).click();
    const sessionForm = sessionDesk.getByRole("form", { name: "Plan campaign session" });
    await sessionForm.getByRole("textbox", { name: "Session title" }).fill(sessionTitle);
    await sessionForm.getByRole("textbox", { name: "Session agenda" }).fill(sessionAgenda);
    await sessionForm.getByRole("textbox", { name: "Session notes" }).fill(sessionNotes);
    await sessionForm.getByRole("checkbox", { name: "Vault Entry" }).check();
    await sessionForm.getByRole("button", { name: "Save", exact: true }).click();
    await expect(statusMessage(page, `${sessionTitle} planned`)).toBeVisible();
    const sessionRow = sessionDesk.getByRole("listitem").filter({ hasText: sessionTitle });
    await expect(sessionRow).toContainText("planned");
    await expect(sessionRow).toContainText("Unscheduled");
    const savedSession = sessionDesk.getByRole("form", { name: `Edit session ${sessionTitle}` });
    await expect(savedSession.getByRole("textbox", { name: "Session agenda" })).toHaveValue(sessionAgenda);
    await expect(savedSession.getByRole("textbox", { name: "Session notes" })).toHaveValue(sessionNotes);
    await expect(savedSession.getByRole("combobox", { name: "Scene to activate when session starts" })).toContainText("Vault Entry");

    await page.reload();
    await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
    await page.getByRole("button", { name: "Prep", exact: true }).click();

    await openInspectorPanel(page, "Worlds");
    const reloadedAtlas = page.getByRole("region", { name: "World Atlas" });
    await reloadedAtlas.getByRole("textbox", { name: "Search worlds" }).fill(worldName);
    const reloadedWorldFilters = reloadedAtlas.getByRole("group", { name: "Filter prep scenes by world" });
    await reloadedWorldFilters.getByRole("button", { name: new RegExp(`^${worldName} `) }).click();
    await expect(reloadedAtlas.getByRole("region", { name: "World scenes" })).toContainText("Vault Entry");

    await openInspectorPanel(page, "Handouts");
    const reloadedHandouts = page.getByRole("region", { name: "Handout Library" });
    await reloadedHandouts.getByRole("textbox", { name: "Search handouts" }).fill(handoutTitle);
    await reloadedHandouts.getByRole("combobox", { name: "Filter handouts by world" }).selectOption({ label: worldName });
    await expect(reloadedHandouts.getByRole("listitem").filter({ hasText: handoutTitle })).toContainText("ember-bell");

    await openInspectorPanel(page, "Sessions");
    const reloadedSessions = page.getByRole("region", { name: "Session Desk" });
    await expect(reloadedSessions.getByRole("listitem").filter({ hasText: sessionTitle })).toContainText("planned");
  } finally {
    try {
      const sessionsResponse = await page.request.get(`${apiBaseUrl}/api/v1/campaigns/camp_demo/sessions`, { headers: gmApiHeaders });
      if (sessionsResponse.ok()) {
        const sessions = (await sessionsResponse.json()) as Array<{ id: string; title: string; status: string; updatedAt: string }>;
        for (const session of sessions.filter((item) => item.title === sessionTitle && item.status === "planned")) {
          await page.request.delete(
            expectedUpdatedAtUrl(`${apiBaseUrl}/api/v1/campaign-sessions/${session.id}`, session.updatedAt),
            { headers: gmMutationHeaders("delete-session") },
          );
        }
      }
      const handoutsResponse = await page.request.get(`${apiBaseUrl}/api/v1/campaigns/camp_demo/handouts`, { headers: gmApiHeaders });
      if (handoutsResponse.ok()) {
        const handouts = (await handoutsResponse.json()) as Array<{ id: string; title: string; updatedAt: string }>;
        for (const handout of handouts.filter((item) => item.title === handoutTitle)) {
          await page.request.delete(
            expectedUpdatedAtUrl(`${apiBaseUrl}/api/v1/handouts/${handout.id}`, handout.updatedAt),
            { headers: gmMutationHeaders("delete-handout") },
          );
        }
      }
      if (vaultSceneId) {
        const currentScenes = await expectJsonResponse<Array<{ id: string; updatedAt: string }>>(
          await page.request.get(`${apiBaseUrl}/api/v1/campaigns/camp_demo/scenes`, { headers: gmApiHeaders }),
        );
        const currentVaultScene = currentScenes.find((scene) => scene.id === vaultSceneId);
        expect(currentVaultScene).toBeDefined();
        await page.request.patch(`${apiBaseUrl}/api/v1/scenes/${vaultSceneId}`, {
          headers: gmMutationHeaders("restore-scene-world"),
          data: { worldId: originalWorldId ?? null, expectedUpdatedAt: currentVaultScene!.updatedAt }
        });
      }
      const worldsResponse = await page.request.get(`${apiBaseUrl}/api/v1/campaigns/camp_demo/worlds`, { headers: gmApiHeaders });
      if (worldsResponse.ok()) {
        const worlds = (await worldsResponse.json()) as Array<{ id: string; name: string; updatedAt: string }>;
        for (const world of worlds.filter((item) => item.name === worldName)) {
          await page.request.delete(
            expectedUpdatedAtUrl(`${apiBaseUrl}/api/v1/worlds/${world.id}`, world.updatedAt),
            { headers: gmMutationHeaders("delete-world") },
          );
        }
      }
    } catch {
      // Preserve the primary browser assertion when the server is already unavailable.
    }
  }
});

test("World and handout panels reconcile realtime changes made by another client", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const worldName = `Realtime World ${suffix}`;
  const handoutTitle = `Realtime Handout ${suffix}`;
  let worldId = "";
  let handoutId = "";
  let worldUpdatedAt = "";
  let handoutUpdatedAt = "";

  await page.goto("/");
  const realtimeConnected = page.waitForEvent("websocket");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await realtimeConnected;
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  try {
    await page.getByRole("button", { name: "Prep", exact: true }).click();
    await openInspectorPanel(page, "Worlds");
    const worldAtlas = page.getByRole("region", { name: "World Atlas" });
    await expect(worldAtlas.getByRole("group", { name: "Filter prep scenes by world" })).toBeVisible();

    const campaignBeforeWorld = await expectJsonResponse<{ updatedAt: string }>(
      await page.request.get(`${apiBaseUrl}/api/v1/campaigns/camp_demo`, { headers: gmApiHeaders }),
    );
    const world = await expectJsonResponse<{ id: string; updatedAt: string }>(
      await page.request.post(`${apiBaseUrl}/api/v1/campaigns/camp_demo/worlds`, {
        headers: gmMutationHeaders("create-realtime-world"),
        data: {
          name: worldName,
          description: "Created outside the open browser client.",
          expectedUpdatedAt: campaignBeforeWorld.updatedAt,
        }
      })
    );
    worldId = world.id;
    worldUpdatedAt = world.updatedAt;
    await expect(worldAtlas.getByRole("button", { name: new RegExp(`^${worldName} `) })).toBeVisible();

    await openInspectorPanel(page, "Handouts");
    const handoutLibrary = page.getByRole("region", { name: "Handout Library" });
    const campaignBeforeHandout = await expectJsonResponse<{ updatedAt: string }>(
      await page.request.get(`${apiBaseUrl}/api/v1/campaigns/camp_demo`, { headers: gmApiHeaders }),
    );
    const handout = await expectJsonResponse<{ id: string; updatedAt: string }>(
      await page.request.post(`${apiBaseUrl}/api/v1/campaigns/camp_demo/handouts`, {
        headers: gmMutationHeaders("create-realtime-handout"),
        data: {
          expectedUpdatedAt: campaignBeforeHandout.updatedAt,
          worldId,
          title: handoutTitle,
          body: "Created outside the open browser client.",
          visibility: "public",
          visibleToUserIds: [],
          visibleToActorIds: [],
          assetIds: [],
          tags: ["realtime"]
        }
      })
    );
    handoutId = handout.id;
    handoutUpdatedAt = handout.updatedAt;
    const handoutRow = handoutLibrary.getByRole("listitem").filter({ hasText: handoutTitle });
    await expect(handoutRow.getByRole("button")).toBeVisible();
  } finally {
    if (handoutId && handoutUpdatedAt) {
      await page.request.delete(
        expectedUpdatedAtUrl(`${apiBaseUrl}/api/v1/handouts/${handoutId}`, handoutUpdatedAt),
        { headers: gmMutationHeaders("delete-realtime-handout") },
      ).catch(() => undefined);
    }
    if (worldId && worldUpdatedAt) {
      await page.request.delete(
        expectedUpdatedAtUrl(`${apiBaseUrl}/api/v1/worlds/${worldId}`, worldUpdatedAt),
        { headers: gmMutationHeaders("delete-realtime-world") },
      ).catch(() => undefined);
    }
  }
});

test("failed AI proposal actions remain available for retry", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const draftResponse = await expectJsonResponse<{ proposal: { id: string; title: string } }>(
    await page.request.post(`${apiBaseUrl}/api/v1/campaigns/camp_demo/ai/encounter-design`, {
      headers: gmMutationHeaders("failed-ai-proposal-draft"),
      data: {
        prompt: `A retry-only encounter proposal ${suffix}`,
        difficulty: "standard",
        sceneName: `Retry proposal scene ${suffix}`,
        sceneWidth: 900,
        sceneHeight: 700,
        gridSize: 50
      }
    })
  );
  const draft = draftResponse.proposal;

  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Demo GM" }).click();
    await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
    const aiAgent = await openAiAgent(page);
    const proposal = aiAgent.locator(".ai-agent-proposal-row", { hasText: draft.title });
    await expect(proposal).toHaveCount(1);
    await page.route(`**/api/v1/proposals/${draft.id}/approve`, (route) => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "temporary approval failure" })
    }));
    await proposal.getByRole("button", { name: "Approve and apply" }).click();
    await expect(aiAgent.getByText("Apply failed: temporary approval failure", { exact: true })).toBeVisible();
    await expect(proposal).toBeVisible();
    await page.unroute(`**/api/v1/proposals/${draft.id}/approve`);

    await page.route(`**/api/v1/proposals/${draft.id}/reject`, (route) => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "temporary rejection failure" })
    }));
    await proposal.getByRole("button", { name: "Reject" }).click();
    await expect(aiAgent.getByText("Reject failed: temporary rejection failure", { exact: true })).toBeVisible();
    await expect(proposal).toBeVisible();
    await page.unroute(`**/api/v1/proposals/${draft.id}/reject`);
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await expectJsonResponse(
      await page.request.post(`${apiBaseUrl}/api/v1/proposals/${draft.id}/reject`, { headers: gmMutationHeaders("failed-ai-proposal-reject") }),
    );
  }
});

test("AI auto-apply consent is scoped to the current user and campaign", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  const aiAgent = await openAiAgent(page);
  const approvalMode = aiAgent.getByRole("combobox", { name: "AI Agent approval mode" });
  await expect(approvalMode).toHaveValue("manual");
  await approvalMode.selectOption("auto");
  await expect(approvalMode).toHaveValue("auto");

  const campaignName = `Scoped AI ${Date.now().toString(36)}`;
  const campaign = await page.evaluate(async ({ apiBaseUrl, campaignName }) => {
    const bearer = localStorage.getItem("otte:sessionToken");
    if (!bearer) throw new Error("No browser session token available for campaign setup");
    const response = await fetch(`${apiBaseUrl}/api/v1/campaigns`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${bearer}`,
        "content-type": "application/json",
        "idempotency-key": `e2e-create-scoped-campaign:${crypto.randomUUID()}`,
      },
      body: JSON.stringify({ name: campaignName, description: "AI preference scope test" })
    });
    if (!response.ok) throw new Error(await response.text());
    return (await response.json()) as { id: string; updatedAt: string };
  }, { apiBaseUrl, campaignName });

  try {
    await page.reload();
    await page.getByRole("navigation", { name: "Campaigns" }).getByRole("button", { name: campaignName }).click();
    await expect(page.getByRole("heading", { name: campaignName })).toBeVisible();
    const scopedAgent = await openAiAgent(page);
    await expect(scopedAgent.getByRole("combobox", { name: "AI Agent approval mode" })).toHaveValue("manual");

    await page.getByRole("navigation", { name: "Campaigns" }).getByRole("button", { name: "The Ember Vault" }).click();
    await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
    await expect(scopedAgent.getByRole("combobox", { name: "AI Agent approval mode" })).toHaveValue("auto");
  } finally {
    const currentCampaign = await expectJsonResponse<{ updatedAt: string }>(
      await page.request.get(`${apiBaseUrl}/api/v1/campaigns/${campaign.id}`, { headers: gmApiHeaders }),
    );
    await expectJsonResponse(
      await page.request.delete(
        expectedUpdatedAtUrl(`${apiBaseUrl}/api/v1/campaigns/${campaign.id}`, currentCampaign.updatedAt),
        { headers: gmMutationHeaders("delete-scoped-campaign") },
      ),
    );
  }
});

test("blank canvas opens in actionable prep and accepts a local map", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Try Blank Canvas" }).click();
  await expect(page.getByRole("button", { name: "Prep", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("tab", { name: "Assets" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Asset manager" })).toBeVisible();

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload Background" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: "local-demo-map.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")
  });

  await expect(page.getByRole("status").filter({ hasText: "Demo map ready" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Asset library" })).toContainText("local-demo-map.png");
  await expect(page.locator(".scene-map")).toBeVisible();

  await page.getByRole("button", { name: "Manage", exact: true }).click();
  await page.getByRole("region", { name: "Demo mode" }).getByRole("button", { name: "Exit" }).click();
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("button", { name: "Live Table", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("GM can create a campaign through the setup wizard", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Demo GM" }).click();
  await openManageCategory(page, "Campaign");
  await openCreateDrawer(page, "New campaign");
  await expect(page.getByText("Campaign Setup", { exact: true })).toBeVisible();

  await page.getByRole("textbox", { name: "Campaign name", exact: true }).fill("E2E Setup Campaign");
  await page.getByRole("textbox", { name: "Campaign description", exact: true }).fill("Created through the campaign setup wizard");
  await page.getByRole("combobox", { name: "Campaign visibility", exact: true }).selectOption("invite_only");
  await page.getByRole("button", { name: "Next: Scene & map" }).click();
  await expect(page.getByRole("checkbox", { name: "Include starter content" })).toBeChecked();
  await page.getByRole("button", { name: "Next: Invitation" }).click();
  await page.getByRole("checkbox", { name: "Create starter invite" }).check();
  await page.getByRole("textbox", { name: "Setup invite email" }).fill("setup-player@example.com");
  await page.getByRole("combobox", { name: "Setup default player permission preset" }).selectOption("player");
  await openDetails(page.locator("details.campaign-setup-advanced").filter({ hasText: "Advanced permission settings" }));
  await page.getByRole("combobox", { name: "Setup campaign permission template" }).selectOption("player_authoring");
  await expect(page.getByText("Players can create actors, journal entries, and tokens for collaborative prep.")).toBeVisible();
  await page.getByRole("button", { name: "Next: Review" }).click();
  const setupImpact = page.locator('[aria-label="Campaign setup impact"]');
  await expect(setupImpact).toContainText("Invite only - Player invite for setup-player@example.com");
  await expect(setupImpact).toContainText("First Session - 1200x800 - grid 50 - starter content");
  await expect(setupImpact).toContainText("Player authoring");
  await expect(setupImpact).toContainText("Starter content: First Session and welcome notes");

  await page.getByRole("button", { name: "Create Campaign Setup" }).click();

  await expect(page.locator("h1").filter({ hasText: "E2E Setup Campaign" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "E2E Setup Campaign created with First Session; invite link ready to copy; Player authoring permissions applied" })).toBeVisible();
  await expect(page.locator('input[aria-label="Invite token"][readonly]')).toHaveValue(/^oti_/);
  await expect(page.getByRole("textbox", { name: "Invite link" })).toHaveValue(/\/join\?invite=oti_/);
  await expect(page.getByRole("textbox", { name: "Invite link" })).toBeFocused();
  await closeManage(page);

  await page.getByRole("button", { name: "Prep", exact: true }).click();
  await expect(sceneTab(page, "First Session")).toBeVisible();
  await page.getByRole("tab", { name: "Journal" }).click();
  await expect(page.getByRole("heading", { name: "Running your first session", exact: true })).toBeVisible();
  await expect(page.getByText("Create characters from the party rail character creator.")).toBeVisible();
  await expect(page.getByText("Generate a session recap from the Journal tab.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "GM notes", exact: true })).toBeVisible();

  await openManageCategory(page, "Campaign");
  await openCreateDrawer(page, "New campaign");
  await page.getByRole("textbox", { name: "Campaign name", exact: true }).fill("E2E Bare Campaign");
  await page.getByRole("button", { name: "Next: Scene & map" }).click();
  await page.getByRole("checkbox", { name: "Include starter content" }).uncheck();
  await page.getByRole("textbox", { name: "Setup initial scene name" }).fill("Bare Opening");
  await openDetails(page.locator("details.campaign-setup-advanced").filter({ hasText: "Advanced scene and onboarding settings" }));
  await page.getByRole("textbox", { name: "Setup onboarding title" }).fill("Bare Welcome");
  await page.getByRole("textbox", { name: "Setup onboarding copy" }).fill("A handout for the bare setup path.");
  await page.getByRole("button", { name: "Next: Invitation" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(setupImpact).toContainText("Bare Opening - 1200x800 - grid 50 - session-0");
  await expect(setupImpact).toContainText("Public handout: Bare Welcome");
  await page.getByRole("button", { name: "Create Campaign Setup" }).click();

  await expect(page.locator("h1").filter({ hasText: "E2E Bare Campaign" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "E2E Bare Campaign created with Bare Opening; opened session prep" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Prep", exact: true })).toBeFocused();
  await expect(sceneTab(page, "Bare Opening")).toBeVisible();
  await page.getByRole("tab", { name: "Journal" }).click();
  await expect(page.getByRole("heading", { name: "Bare Welcome", exact: true })).toBeVisible();
  await expect(page.getByText("A handout for the bare setup path.")).toBeVisible();
  await expect(page.getByText("Running your first session")).not.toBeVisible();
});

test("campaign setup locks duplicate submits and resumes after a failed follow-up", async ({ page }) => {
  let campaignPosts = 0;
  let inviteAttempts = 0;
  let releaseFirstCampaign!: () => void;
  const firstCampaignGate = new Promise<void>((resolve) => {
    releaseFirstCampaign = resolve;
  });
  let holdFirstCampaign = true;

  await page.route("**/api/v1/campaigns", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    campaignPosts += 1;
    if (holdFirstCampaign) {
      holdFirstCampaign = false;
      await firstCampaignGate;
    }
    await route.continue();
  });
  await page.route("**/api/v1/campaigns/*/invites", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    inviteAttempts += 1;
    if (inviteAttempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "simulated invite failure" })
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await openManageCategory(page, "Campaign");
  await openCreateDrawer(page, "New campaign");
  const campaignName = page.getByRole("textbox", { name: "Campaign name", exact: true });
  await campaignName.fill("E2E Retry Safe Campaign");
  const setupForm = page.locator("form.campaign-setup-steps");
  await page.getByRole("button", { name: "Next: Scene & map" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("checkbox", { name: "Create starter invite" }).check();
  await page.getByRole("textbox", { name: "Setup invite email" }).fill("retry-safe@example.com");
  await page.getByRole("button", { name: "Next: Review" }).click();
  const submitButton = setupForm.locator('button[type="submit"]');
  await submitButton.click();
  await expect.poll(() => campaignPosts).toBe(1);
  try {
    await expect(submitButton).toBeDisabled();
    await expect(setupForm.locator("fieldset")).toHaveAttribute("disabled", "");
    await submitButton.evaluate((button: HTMLButtonElement) => button.click());
    expect(campaignPosts).toBe(1);
  } finally {
    releaseFirstCampaign();
  }

  await expect(page.getByRole("status").filter({ hasText: "simulated invite failure" })).toBeVisible();
  await expect(submitButton).toHaveText(/Retry Campaign Setup/);
  await expect(setupForm.locator("fieldset")).toHaveAttribute("disabled", "");
  expect(campaignPosts).toBe(1);
  expect(inviteAttempts).toBe(1);

  await submitButton.click();
  const inviteLink = page.getByRole("textbox", { name: "Invite link" });
  await expect(page.getByRole("status").filter({ hasText: "E2E Retry Safe Campaign created with First Session; invite link ready to copy" })).toBeVisible();
  await expect(inviteLink).toHaveValue(/\/join\?invite=oti_/);
  await expect(inviteLink).toBeFocused();
  expect(campaignPosts).toBe(1);
  expect(inviteAttempts).toBe(2);
});

test("GM can export and safely re-import a campaign archive", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  await openManageCategory(page, "Archives");

  const exportWizard = page.getByRole("region", { name: "Archive export wizard" });
  await expect(exportWizard).toBeVisible();
  await expect(exportWizard.getByRole("combobox", { name: "Archive export scope" })).toHaveValue("campaign");
  await expect(exportWizard.getByRole("combobox", { name: "Archive export version" })).toHaveValue("0.2.0");
  await expect(exportWizard.getByRole("combobox", { name: "Archive redaction mode" })).toHaveValue("portable");
  await expect(exportWizard.getByLabel("Archive compatibility notes")).toContainText("v0.3/v1-compatible importer");

  const downloadPromise = page.waitForEvent("download");
  await exportWizard.getByRole("button", { name: "Export JSON (small archives)" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("The Ember Vault");

  const archiveDirectory = mkdtempSync(join(tmpdir(), "otte-e2e-archive-"));
  const archivePath = join(archiveDirectory, download.suggestedFilename());
  await download.saveAs(archivePath);
  const selectedJournalTitle = `Selected import journal ${Date.now().toString(36)}`;
  const selectedCollectionArchivePath = join(archiveDirectory, "selected-journal-import.ottx.json");
  const selectedCollectionArchive = JSON.parse(readFileSync(archivePath, "utf8")) as {
    data: {
      journals: Array<Record<string, unknown>>;
    };
  };
  selectedCollectionArchive.data.journals.push({
    id: `jrn_e2e_selected_${Date.now().toString(36)}`,
    campaignId: "camp_demo",
    title: selectedJournalTitle,
    body: "Imported through the selected-collection archive browser path.",
    visibility: "gm_only",
    visibleToUserIds: [],
    visibleToActorIds: [],
    tags: ["selected-import"],
    createdBy: "usr_demo_gm",
    updatedBy: "usr_demo_gm",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  writeFileSync(selectedCollectionArchivePath, JSON.stringify(selectedCollectionArchive));
  const reportBundleDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Report Bundle" }).click();
  const reportBundleDownload = await reportBundleDownloadPromise;
  expect(reportBundleDownload.suggestedFilename()).toContain("dogfood-report-bundle");
  const reportBundlePath = join(archiveDirectory, reportBundleDownload.suggestedFilename());
  await reportBundleDownload.saveAs(reportBundlePath);
  const reportBundle = JSON.parse(readFileSync(reportBundlePath, "utf8")) as {
    format?: string;
    privacy?: { mode?: string };
    campaign?: { name?: string };
  };
  expect(reportBundle).toEqual(
    expect.objectContaining({
      format: "otte-dogfood-report-bundle",
      privacy: expect.objectContaining({ mode: "redacted" }),
      campaign: expect.objectContaining({ name: "The Ember Vault" })
    })
  );
  const badArchivePath = join(archiveDirectory, "broken.ottx.json");
  writeFileSync(badArchivePath, "{ broken archive");

  await page.getByLabel("Import campaign archive").setInputFiles(badArchivePath);
  await expect(statusMessage(page, "Archive import failed")).toBeVisible();
  await expect(page.getByLabel("Archive import recovery")).toContainText("broken.ottx.json");
  await page.getByRole("button", { name: "Retry import" }).click();
  await expect(page.getByLabel("Archive import recovery")).toContainText("broken.ottx.json");

  const importWizard = page.getByRole("region", { name: "Archive import wizard" });
  await expect(importWizard.getByRole("combobox", { name: "Archive import mode" })).toHaveValue("upsert");
  await importWizard.getByRole("combobox", { name: "Archive import mode" }).selectOption("reject_conflicts");
  await page.getByLabel("Import campaign archive").setInputFiles(archivePath);
  await expect(statusMessage(page, "Archive import failed")).toBeVisible();
  await expect(page.locator("#import-status")).toContainText("import_conflict");
  await expect(page.getByLabel("Archive import recovery")).toContainText(download.suggestedFilename());
  await importWizard.getByRole("combobox", { name: "Archive import mode" }).selectOption("dry_run");
  await page.getByLabel("Import campaign archive").setInputFiles(archivePath);
  await expect(statusMessage(page, /Archive dry run found \d+ conflicts/)).toBeVisible();
  await expect(importWizard.getByLabel("Archive import validation")).toContainText("dry run");
  await expect(importWizard.getByLabel("Archive import validation")).toContainText("campaigns");
  await importWizard.getByRole("combobox", { name: "Archive import scope" }).selectOption("assets_only");
  await page.getByLabel("Import campaign archive").setInputFiles(archivePath);
  await expect(importWizard.getByLabel("Archive import validation")).toContainText("assets only");
  await importWizard.getByRole("combobox", { name: "Archive import scope" }).selectOption("selected_collections");
  await expect(importWizard.getByLabel("Archive import collection selection")).toContainText("Journals");
  await importWizard.getByLabel("Import Tokens").check();
  await importWizard.getByLabel("Import Assets").uncheck();
  await page.getByLabel("Import campaign archive").setInputFiles(archivePath);
  await expect(importWizard.getByLabel("Archive import validation")).toContainText("selected records");
  await expect(importWizard.getByLabel("Archive import validation")).toContainText("tokens");
  await expect(importWizard.getByLabel("Archive import validation")).toContainText("Dependency warnings");
  await importWizard.getByRole("combobox", { name: "Archive import mode" }).selectOption("upsert");
  await importWizard.getByLabel("Import Journals").check();
  await importWizard.getByLabel("Import Tokens").uncheck();
  await page.getByLabel("Import campaign archive").setInputFiles(selectedCollectionArchivePath);
  await expect(statusMessage(page, /Archive imported|Imported with \d+ conflicts/)).toBeVisible();
  await expect(importWizard.getByLabel("Archive import validation")).toContainText("selected records");
  await expect(importWizard.getByLabel("Archive import validation")).toContainText("journals");
  await closeManage(page);
  await page.getByRole("button", { name: "Prep", exact: true }).click();
  await page.getByRole("tab", { name: "Journal" }).click();
  await expect(page.getByRole("heading", { name: selectedJournalTitle, exact: true })).toBeVisible();
  await expect(page.getByText("Imported through the selected-collection archive browser path.")).toBeVisible();
  await openManageCategory(page, "Archives");
  const reopenedImportWizard = page.getByRole("region", { name: "Archive import wizard" });
  await expect(reopenedImportWizard).toBeVisible();
  const archiveRecovery = reopenedImportWizard.getByRole("region", { name: "Archive import rollback operations" });
  await expect(archiveRecovery).toBeVisible();
  const operationPicker = archiveRecovery.getByRole("combobox", { name: "Import operation" });
  const selectedImportOperationId = await operationPicker.inputValue();
  expect(selectedImportOperationId).toMatch(/^arcimp_/);
  await archiveRecovery.getByRole("button", { name: "Review rollback impact" }).click();
  await expect(archiveRecovery.getByLabel("Archive rollback impact confirmation")).toContainText("delete 1 records");
  await archiveRecovery.getByRole("textbox", { name: "Type operation id to confirm rollback" }).fill(selectedImportOperationId);
  await archiveRecovery.getByRole("button", { name: "Roll back this import" }).click();
  await expect(statusMessage(page, "Archive import rolled back")).toBeVisible();
  await expect(operationPicker.locator(`option[value="${selectedImportOperationId}"]`)).toContainText("rolled_back");
  await reopenedImportWizard.getByRole("combobox", { name: "Archive import scope" }).selectOption("all");

  await reopenedImportWizard.getByRole("combobox", { name: "Archive import mode" }).selectOption("skip_conflicts");
  await page.getByLabel("Import campaign archive").setInputFiles(archivePath);
  await expect(statusMessage(page, /Imported non-conflicting records; skipped \d+ conflicts/)).toBeVisible();
  await expect(reopenedImportWizard.getByLabel("Archive import validation")).toContainText("Skipped");

  await importWizard.getByRole("combobox", { name: "Archive import mode" }).selectOption("upsert");
  await page.getByLabel("Import campaign archive").setInputFiles(archivePath);
  await expect(statusMessage(page, /Imported with \d+ conflicts/)).toBeVisible();
  await expect(page.locator("#import-status")).toContainText(download.suggestedFilename());
  await expect(page.getByLabel("Archive import recovery")).toHaveCount(0);
});

test("GM can run the browser combat tracker lifecycle", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  await page.getByRole("button", { name: "Prep", exact: true }).click();
  await openInspectorPanel(page, "SDK");
  const sdkPanel = sdkRuntimePanel(page);
  await sdkPanel.getByRole("button", { name: "Create Monster" }).click();
  await expect(page.getByText("Goblin Minion monster created")).toBeVisible();
  await expect(sdkPanel.locator(".metric-row", { hasText: "Created Monster" })).toContainText("Goblin Minion");

  await openInspectorPanel(page, "Actors");
  await openTokenQuickCreate(page);
  await page.getByRole("textbox", { name: "Token name" }).fill("Goblin Minion");
  await page.getByRole("combobox", { name: "Token actor" }).selectOption({ label: "Goblin Minion" });
  await page.getByRole("combobox", { name: "Token disposition" }).selectOption("hostile");
  await page.getByRole("button", { name: "Token", exact: true }).click();
  await expect(statusMessage(page, "Goblin Minion created")).toBeVisible();
  await expect(page.getByRole("button", { name: "Token Goblin Minion" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Live Table", exact: true }).click();
  await openInspectorPanel(page, "Combat");
  const combatPanel = combatTrackerPanel(page);
  await startCombatFromPanel(combatPanel, { currentTurnTokenName: "Valen Ash" });

  await expect(combatPanel.getByRole("heading", { name: "Round 1" })).toBeVisible();
  await expect(combatPanel.getByLabel("Combat summary")).toContainText("combatants");
  await expect(combatPanel.getByText("Valen Ash").first()).toBeVisible();
  await expect(combatPanel.getByText("Goblin Minion").first()).toBeVisible();
  const combatAudit = combatPanel.locator('details[aria-label="Combat audit"]');
  await openDetails(combatAudit);
  await expect(combatAudit).toContainText("combat.started");

  const valenCombatant = combatPanel.locator(".combatant-row", { hasText: "Valen Ash" }).first();
  const valenDetails = valenCombatant.getByRole("button", { name: "Valen Ash details" });
  await valenDetails.click();
  async function reopenValenDetails() {
    await valenDetails.click();
    await expect(valenDetails).toHaveAttribute("aria-expanded", "false");
    await valenDetails.click();
    await expect(valenDetails).toHaveAttribute("aria-expanded", "true");
  }
  const initiative = valenCombatant.getByLabel("Valen Ash initiative");
  await expect(initiative).toHaveValue(/\d+/);
  await commitCombatantDraft(page, initiative, "21");
  await reopenValenDetails();
  await expect(initiative).toHaveValue("21");
  const readiness = valenCombatant.getByLabel("Valen Ash readiness");
  await runCombatantControlUpdate(page, readiness, () => readiness.selectOption("ready"));
  await reopenValenDetails();
  await expect(readiness).toHaveValue("ready");
  await commitCombatantDraft(page, valenCombatant.getByLabel("Valen Ash combat conditions"), "prone:2, concentrating, stunned");
  await reopenValenDetails();
  await commitCombatantDraft(page, valenCombatant.getByLabel("Valen Ash death save successes"), "3");
  await reopenValenDetails();
  await commitCombatantDraft(page, valenCombatant.getByLabel("Valen Ash death save failures"), "1");
  await reopenValenDetails();
  const resourceUsed = valenCombatant.getByRole("checkbox", { name: /used$/ });
  await runCombatantControlUpdate(page, resourceUsed, () => resourceUsed.click());
  await expect(resourceUsed).toBeChecked();
  await expect(valenCombatant.getByLabel("Valen Ash combat state")).toContainText("Death saves 3/3 - 1/3");
  await expect(valenCombatant.getByLabel("Valen Ash combat state")).toContainText("Stable");
  await expect(valenCombatant.getByLabel("Valen Ash combat state")).toContainText("Focus 3 depleted");
  await expect(valenCombatant).toContainText("prone:2, stunned, concentration lost, stable");
  await expect(valenCombatant.getByLabel("Valen Ash combat state")).toContainText("prone expires in 2 rounds");
  await openInspectorPanel(page, "Actors");
  const actorPanel = selectedActorPanel(page);
  await expect(actorPanel.locator(".metric-row", { hasText: "Conditions" })).toContainText(/Prone:2, Stunned, Concentration Lost, Stable/i);
  await expect(actorPanel.locator(".metric-row", { hasText: "Combat State" })).toContainText("Death saves 3/3 successes, 1/3 failures");
  await expect(actorPanel.locator(".metric-row", { hasText: "Combat State" })).toContainText("Stable");
  await expect(actorPanel.locator(".metric-row", { hasText: "Combat State" })).toContainText("Focus 3 used and depleted");
  await actorPanel.getByLabel("Actor sheet current HP").fill("11");
  await expect(actorPanel.getByLabel("Actor sheet current HP")).toHaveValue("11");
  await actorPanel.getByLabel("Actor sheet current HP").fill("17");
  await expect(actorPanel.getByLabel("Actor sheet current HP")).toHaveValue("17");
  const hpPatchResponse = page.waitForResponse((response) => {
    const request = response.request();
    if (request.method() !== "PATCH" || !/\/api\/v1\/actors\/[^/]+$/.test(new URL(request.url()).pathname)) return false;
    const body = request.postDataJSON() as { data?: { hp?: { current?: number } } };
    return body.data?.hp?.current === 17;
  });
  const conditionsPatchResponse = page.waitForResponse((response) => {
    const request = response.request();
    if (request.method() !== "PATCH" || !/\/api\/v1\/actors\/[^/]+$/.test(new URL(request.url()).pathname)) return false;
    const body = request.postDataJSON() as { data?: { conditions?: unknown[] } };
    return Array.isArray(body.data?.conditions) && JSON.stringify(body.data.conditions).toLowerCase().includes("blessed");
  });
  await actorPanel.getByLabel("Actor sheet conditions").fill("blessed, prone");
  await actorPanel.getByLabel("Actor sheet conditions").blur();
  const hpActor = await expectJsonResponse<{ updatedAt: string }>(await hpPatchResponse);
  const conditionsResponse = await conditionsPatchResponse;
  const conditionsRequest = conditionsResponse.request().postDataJSON() as { expectedUpdatedAt?: string };
  expect(conditionsRequest.expectedUpdatedAt).toBe(hpActor.updatedAt);
  await expectJsonResponse(conditionsResponse);
  await expect(actorPanel.locator(".metric-row", { hasText: "Conditions" })).toContainText(/Blessed, Prone/i);
  await openActorDisclosure(actorPanel, "Actor details");
  await actorPanel.getByLabel("Focus resource current").fill("2");
  await actorPanel.getByLabel("Focus resource current").blur();
  await expect(actorPanel.locator(".metric-row", { hasText: "Resources" })).toContainText("Focus 2");
  await openActorDisclosure(actorPanel, "Token settings");
  const targetManager = actorPanel.getByRole("region", { name: "Canvas target manager" });
  await expect(targetManager).toContainText("Initiative: Valen Ash");
  await expect(targetManager.getByRole("button", { name: "Target current turn" })).toBeEnabled();
  await clickElement(targetManager.getByRole("button", { name: "Target current turn" }));
  await expect(statusMessage(page, "Targeted 1 tokens")).toBeVisible();
  await expect(targetManager).toContainText(/My targets [12] \//);
  await openInspectorPanel(page, "Combat");
  const valenDetailsButton = valenCombatant.getByRole("button", { name: "Valen Ash details" });
  if ((await valenDetailsButton.getAttribute("aria-expanded")) !== "true") await valenDetailsButton.click();

  const roundHeading = combatPanel.getByRole("heading", { name: /Round \d+/ });
  async function advanceUntilRound(round: string) {
    for (let attempts = 0; attempts < 8; attempts += 1) {
      if ((await roundHeading.textContent())?.includes(`Round ${round}`)) return;
      await advanceCombatFromPanel(page, combatPanel, "Next turn");
    }
    await expect(roundHeading).toContainText(`Round ${round}`);
  }
  async function previousUntilRound(round: string) {
    for (let attempts = 0; attempts < 8; attempts += 1) {
      if ((await roundHeading.textContent())?.includes(`Round ${round}`)) return;
      await advanceCombatFromPanel(page, combatPanel, "Prev");
    }
    await expect(roundHeading).toContainText(`Round ${round}`);
  }

  await advanceCombatFromPanel(page, combatPanel, "Next turn");
  await expect(roundHeading).toContainText("Round 1");
  await advanceUntilRound("2");
  await expect(roundHeading).toContainText("Round 2");
  await openDetails(combatAudit);
  await expect(combatAudit).toContainText("combat.updated");
  await expect(valenCombatant.getByLabel("Valen Ash combat state")).toContainText("prone expires in 2 rounds");
  await valenCombatant.getByLabel("Defeated").click();
  await expect(valenCombatant).toContainText("Defeated");
  await advanceUntilRound("3");
  await expect(valenCombatant.getByLabel("Valen Ash combat state")).toContainText("prone expires in 2 rounds");
  await previousUntilRound("2");

  await endCombatFromPanel(page, combatPanel);
  await deleteNewestTokenByName(page, "Goblin Minion");
});

test("actor sheet surfaces a rejected edit", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  await openInspectorPanel(page, "Actors");
  const actorPanel = selectedActorPanel(page);
  await expect(actorPanel.getByLabel("Actor sheet conditions")).toBeVisible();

  let rejected = false;
  await page.route("**/api/v1/actors/*", async (route) => {
    if (!rejected && route.request().method() === "PATCH") {
      rejected = true;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Actor sheet edit rejected" })
      });
      return;
    }
    await route.continue();
  });

  await actorPanel.getByLabel("Actor sheet conditions").fill("rejected condition");
  await actorPanel.getByLabel("Actor sheet conditions").blur();
  await expect(statusMessage(page, "Actor sheet edit rejected")).toBeVisible();
  expect(rejected).toBe(true);
});

test("player combat action requires GM confirmation and completes the browser flow", async ({ browser }) => {
  test.setTimeout(60_000);
  const gmPage = await browser.newPage();
  const playerPage = await browser.newPage();
  const suffix = Date.now().toString(36);

  await gmPage.goto("/");
  await gmPage.getByRole("button", { name: "Demo GM" }).click();
  await expect(gmPage.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  const fighter = await createSystemCharacter(gmPage, { templateId: "fighter", name: `E2E Confirm Fighter ${suffix}`, ownerUserId: "usr_demo_player" });
  const target = await createRulesTargetActor(gmPage, { name: `E2E Confirm Target ${suffix}`, hp: { current: 2, max: 12 }, ownerUserId: "usr_demo_gm" });
  const fighterToken = await createSceneToken(gmPage, { name: `E2E Confirm Fighter Token ${suffix}`, actorId: fighter.id, x: 320, y: 330, ownerUserIds: ["usr_demo_player"] });
  const targetToken = await createSceneToken(gmPage, { name: `E2E Confirm Target Token ${suffix}`, actorId: target.id, x: 460, y: 330, ownerUserIds: [] });

  try {
  await gmPage.reload();
  await expect(gmPage.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  await gmPage.getByRole("button", { name: "Live Table", exact: true }).click();
  await openInspectorPanel(gmPage, "Combat");
  const combatPanel = combatTrackerPanel(gmPage);
  await startCombatFromPanel(combatPanel);
  await expect(combatPanel.getByText(fighterToken.name).first()).toBeVisible();
  await expect(combatPanel.getByText(targetToken.name).first()).toBeVisible();

  await loginDemoSession(playerPage, "usr_demo_player");
  await expect(playerPage.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  if ((await playerPage.locator("p", { hasText: "Demo Player" }).count()) === 0) {
    await playerPage.locator('select[aria-label="Session user"]').selectOption("usr_demo_player");
  }
  await expect(playerPage.locator("p", { hasText: "Demo Player" })).toBeVisible();
  const playerTokenButton = playerPage.getByRole("button", { name: `Token ${fighterToken.name}` });
  await expect(playerTokenButton).toBeVisible({ timeout: 10_000 });
  await playerTokenButton.click();
  await expect(playerTokenButton).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 });
  await openInspectorPanel(playerPage, "Actors");
  const playerActorPanel = selectedActorPanel(playerPage);
  await expect(playerActorPanel.getByRole("heading", { name: fighter.name })).toBeVisible({ timeout: 10_000 });
  await playerActorPanel.getByRole("tab", { name: "Actions" }).click();
  await openActorDisclosure(playerActorPanel, "Actor details");
  await playerActorPanel.getByRole("combobox", { name: "Action target actor" }).selectOption({ label: target.name });
  await setCheckbox(playerActorPanel.getByRole("checkbox", { name: "Apply action effect" }), true);
  const actionSheet = playerActorPanel.getByRole("region", { name: "Actor action sheet" });
  const damageCard = actionSheet.locator("article", { hasText: "Longsword Damage" }).first();
  await expect(damageCard).toContainText("effect supported");
  await clickAndConfirmPreparedDndAction(damageCard.getByRole("button", { name: "Use action" }));
  await expect(statusMessage(playerPage, `${fighter.name} action pending GM confirmation`)).toBeVisible();
  await expect.poll(async () => ((await getActorById(gmPage, target.id)).data.hp as { current: number }).current).toBe(2);

  await openInspectorPanel(gmPage, "Combat");
  await expect(combatPanel.getByText("Pending GM Confirmation")).toBeVisible();
  await expect(combatPanel.locator("article", { hasText: "Longsword Damage" })).toContainText(fighter.name);
  await combatPanel.locator("article", { hasText: "Longsword Damage" }).getByRole("button", { name: "Confirm" }).click();
  await expect(statusMessage(gmPage, "Longsword Damage confirmed")).toBeVisible();
  await expect.poll(async () => ((await getActorById(gmPage, target.id)).data.hp as { current: number }).current).toBe(0);
  const targetCombatant = combatPanel.locator(".combatant-row", { hasText: targetToken.name }).first();
  await expect(targetCombatant).toContainText("Defeated");

  await advanceCombatFromPanel(gmPage, combatPanel, "Next turn");
  await expect(statusMessage(gmPage, "Combat updated")).toBeVisible();
  await endCombatFromPanel(gmPage, combatPanel);
  const endedRecap = combatPanel.locator('details[aria-label="Ended combat recap"]');
  await expect(endedRecap).toBeVisible();
  await endedRecap.locator("summary").click();
  await expect(endedRecap).toContainText(/confirmed actions/);

  mkdirSync("output/playwright", { recursive: true });
  await gmPage.screenshot({ path: `output/playwright/combat-confirmation-${suffix}.png`, fullPage: true });
  } finally {
    await deleteTokenById(gmPage, fighterToken.id);
    await deleteTokenById(gmPage, targetToken.id);
    await deleteActorById(gmPage, fighter.id);
    await deleteActorById(gmPage, target.id);
    await gmPage.close();
    await playerPage.close();
  }
});

test("GM can draft and apply an AI proposal from the browser", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  const comparisonSeed = await expectJsonResponse<{ proposal: { id: string; title: string } }>(
    await page.request.post(`${apiBaseUrl}/api/v1/campaigns/camp_demo/ai/encounter-design`, {
      headers: gmMutationHeaders("ai-comparison-seed"),
      data: {
        prompt: "A comparison proposal for the current vault scene.",
        difficulty: "standard",
        sceneName: "Scene comparison check",
        sceneWidth: 900,
        sceneHeight: 700,
        gridSize: 50
      }
    })
  );

  const archiveResponse = await page.request.get(`${apiBaseUrl}/api/v1/campaigns/camp_demo/export`, {
    headers: { "x-user-id": "usr_demo_gm" }
  });
  expect(archiveResponse.ok()).toBeTruthy();
  const aiRecoveryArchive = (await archiveResponse.json()) as {
    data: {
      aiThreads: Array<Record<string, unknown>>;
      aiToolCalls: Array<Record<string, unknown>>;
    };
  };
  const aiRecoverySeededAt = new Date().toISOString();
  aiRecoveryArchive.data.aiThreads.push({
    id: "thr_e2e_failed_provider_recovery",
    campaignId: "camp_demo",
    userId: "usr_demo_gm",
    provider: "local-echo",
    title: "E2E failed provider thread",
    prompt: "Replay this failed provider prompt from the browser.",
    status: "failed",
    startedAt: aiRecoverySeededAt,
    failedAt: aiRecoverySeededAt,
    durationMs: 12,
    retryAttempts: 0,
    eventCount: 0,
    toolCallCount: 0,
    providerError: "E2E provider timeout",
    createdAt: aiRecoverySeededAt,
    updatedAt: aiRecoverySeededAt
  });
  aiRecoveryArchive.data.aiThreads.push({
    id: "thr_e2e_retryable_tool_recovery",
    campaignId: "camp_demo",
    userId: "usr_demo_gm",
    provider: "local-echo",
    title: "E2E retryable tool thread",
    prompt: "Retry a failed compendium read.",
    status: "completed",
    startedAt: aiRecoverySeededAt,
    completedAt: aiRecoverySeededAt,
    durationMs: 20,
    retryAttempts: 0,
    eventCount: 2,
    toolCallCount: 1,
    createdAt: aiRecoverySeededAt,
    updatedAt: aiRecoverySeededAt
  });
  aiRecoveryArchive.data.aiToolCalls.push({
    id: "tool_e2e_retryable_compendium_start",
    threadId: "thr_e2e_retryable_tool_recovery",
    toolName: "read_compendium",
    input: { systemId: "dnd-5e-srd" },
    status: "started",
    createdAt: aiRecoverySeededAt,
    updatedAt: aiRecoverySeededAt
  });
  aiRecoveryArchive.data.aiToolCalls.push({
    id: "tool_e2e_retryable_compendium_failure",
    threadId: "thr_e2e_retryable_tool_recovery",
    toolName: "read_compendium",
    input: undefined,
    output: { error: "tool_failed", message: "E2E compendium retry smoke" },
    status: "failed",
    durationMs: 5,
    createdAt: aiRecoverySeededAt,
    updatedAt: aiRecoverySeededAt
  });
  const aiRecoveryCampaign = await expectJsonResponse<{ updatedAt: string }>(
    await page.request.get(`${apiBaseUrl}/api/v1/campaigns/camp_demo`, { headers: gmApiHeaders })
  );
  const aiRecoveryImport = await page.request.post(`${apiBaseUrl}/api/v1/import/campaign`, {
    headers: gmMutationHeaders("ai-recovery-import"),
    data: {
      archive: aiRecoveryArchive,
      mode: "upsert",
      scope: "all",
      expectedUpdatedAt: aiRecoveryCampaign.updatedAt
    }
  });
  expect(aiRecoveryImport.ok(), await aiRecoveryImport.text()).toBeTruthy();
  await page.reload();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  let aiAgent = await openAiAgent(page);
  await expect(aiAgent.getByLabel("AI Agent prompt")).toBeVisible();
  await expect(aiAgent.locator(".ai-agent-proposal-row", { hasText: comparisonSeed.proposal.title })).toContainText("pending");

  const replayThread = await expectJsonResponse<{ thread: { status: string }; assistantMessage: string }>(
    await page.request.post(`${apiBaseUrl}/api/v1/campaigns/camp_demo/ai/threads`, {
      headers: gmMutationHeaders("ai-replay-thread"),
      data: { prompt: "Replay this failed provider prompt from the browser.", surface: "ai_studio" }
    })
  );
  expect(replayThread.thread.status).toBe("completed");
  expect(replayThread.assistantMessage).toContain("Codex loopback handled");
  const retryToolBody = await expectJsonResponse<{ retried: number; completed: number; failed: number; skipped: number }>(
    await page.request.post(`${apiBaseUrl}/api/v1/campaigns/camp_demo/ai/tool-calls/tool_e2e_retryable_compendium_failure/retry`, {
      headers: gmMutationHeaders("ai-tool-call-retry"),
      data: {}
    })
  );
  expect(retryToolBody).toMatchObject({ retried: 1, completed: 1, failed: 0, skipped: 0 });

  await expectAiAssetGenerationResult(await page.request.post(`${apiBaseUrl}/api/v1/campaigns/camp_demo/ai/generate-map-asset`, {
    headers: gmMutationHeaders("ai-generate-map-asset"),
    data: {
      prompt: "E2E generated vault map with moonlit bridges and tactical cover.",
      name: "E2E Generated Vault Map",
      sceneId: "scn_vault_entry",
      size: "1536x1024",
      quality: "low",
      outputFormat: "png"
    }
  }));
  await expectAiAssetGenerationResult(await page.request.post(`${apiBaseUrl}/api/v1/campaigns/camp_demo/ai/generate-token-asset`, {
    headers: gmMutationHeaders("ai-generate-token-asset"),
    data: {
      prompt: "E2E generated Valen Ash token portrait with ember armor and shield.",
      name: "E2E Generated Valen Token",
      tokenId: "tok_valen",
      size: "1024x1024",
      quality: "low",
      outputFormat: "png"
    }
  }));

  const encounterDraft = await expectJsonResponse<{ proposal: { id: string; title: string; status: string; changesJson: Array<{ entity: string; action: string }> } }>(
    await page.request.post(`${apiBaseUrl}/api/v1/campaigns/camp_demo/ai/encounter-design`, {
      headers: gmMutationHeaders("ai-encounter-draft"),
      data: {
        prompt: "Mirror sentries defend the sealed vault",
        difficulty: "standard",
        sceneName: "AI Draft Encounter Scene",
        sceneWidth: 1200,
        sceneHeight: 800,
        gridSize: 50
      }
    })
  );
  expect(encounterDraft.proposal.status).toBe("pending");
  expect(encounterDraft.proposal.changesJson).toEqual(expect.arrayContaining([
    expect.objectContaining({ entity: "encounter", action: "create" }),
    expect.objectContaining({ entity: "scene", action: "create" })
  ]));
  await page.reload();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  aiAgent = await openAiAgent(page);
  const encounterProposal = aiAgent.locator(".ai-agent-proposal-row", { hasText: encounterDraft.proposal.title }).first();
  await expect(encounterProposal).toContainText("pending");
  await encounterProposal.getByRole("button", { name: "Approve and apply" }).click();
  await expect(aiAgent.getByText("Proposal applied").first()).toBeVisible();
  await expect(sceneTab(page, "AI Draft Encounter Scene")).toHaveAttribute("aria-pressed", "true");

  const extractedMemory = await expectJsonResponse<{ memory: { id: string; text: string; visibility: string; sourceIds: string[] } }>(
    await page.request.post(`${apiBaseUrl}/api/v1/campaigns/camp_demo/ai/memory/extract`, {
      headers: gmMutationHeaders("ai-memory-extract"),
      data: { sourceText: "The moonlit vault door only opens for the amber sigil.", visibility: "gm_only" }
    })
  );
  expect(extractedMemory.memory.text).toContain("amber sigil");
  expect(extractedMemory.memory.visibility).toBe("gm_only");
  expect(extractedMemory.memory.sourceIds[0]).toMatch(/^thr_/);
  const approvedMemory = await expectJsonResponse<{ approvedByUserId: string }>(
    await page.request.post(`${apiBaseUrl}/api/v1/ai/memory/${extractedMemory.memory.id}/approve`, {
      headers: gmMutationHeaders("ai-memory-approve"),
      data: {}
    })
  );
  expect(approvedMemory.approvedByUserId).toBe("usr_demo_gm");
  await expectJsonResponse<{ id: string }>(
    await page.request.delete(`${apiBaseUrl}/api/v1/ai/memory/${extractedMemory.memory.id}`, { headers: gmMutationHeaders("ai-memory-delete") })
  );

  const recapDraft = await expectJsonResponse<{
    proposal: {
      id: string;
      title: string;
      status: string;
      changesJson: Array<{ entity: string; data: { title?: string; body?: string; visibility?: string; tags?: string[] } }>;
    };
    memory: { text: string };
  }>(
    await page.request.post(`${apiBaseUrl}/api/v1/campaigns/camp_demo/ai/session-recap`, {
      headers: gmMutationHeaders("ai-session-recap"),
      data: { transcript: "The party secured the ember vault clue." }
    })
  );
  expect(recapDraft.proposal.status).toBe("pending");
  expect(recapDraft.memory.text).toContain("ember vault clue");
  const gmRecapChange = recapDraft.proposal.changesJson.find((change) => change.entity === "journal" && change.data.tags?.includes("gm-recap"));
  expect(gmRecapChange?.data).toEqual(
    expect.objectContaining({ title: expect.any(String), visibility: "gm_only", body: expect.stringContaining("ember vault clue") })
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  aiAgent = await openAiAgent(page);
  const recapProposal = aiAgent.locator(".ai-agent-proposal-row", { hasText: recapDraft.proposal.title }).first();
  await expect(recapProposal).toContainText("pending");
  await recapProposal.getByRole("button", { name: "Approve and apply" }).click();
  await expect(aiAgent.getByText("Proposal applied").first()).toBeVisible();

  const rejectedDraft = await expectJsonResponse<{ proposal: { id: string; title: string; status: string } }>(
    await page.request.post(`${apiBaseUrl}/api/v1/campaigns/camp_demo/ai/encounter-design`, {
      headers: gmMutationHeaders("ai-rejected-draft"),
      data: {
        prompt: "A brittle bridge hazard should be rejected from prep.",
        difficulty: "standard",
        sceneName: "Rejected AI Draft Encounter Scene",
        sceneWidth: 1200,
        sceneHeight: 800,
        gridSize: 50
      }
    })
  );
  expect(rejectedDraft.proposal.status).toBe("pending");
  await page.reload();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  aiAgent = await openAiAgent(page);
  const rejectedProposal = aiAgent.locator(".ai-agent-proposal-row", { hasText: rejectedDraft.proposal.title }).first();
  await expect(rejectedProposal).toContainText("pending");
  await rejectedProposal.getByRole("button", { name: "Reject" }).click();
  await expect(aiAgent.getByText("Proposal rejected").first()).toBeVisible();
  const proposals = await expectJsonResponse<Array<{ id: string; status: string }>>(
    await page.request.get(`${apiBaseUrl}/api/v1/campaigns/camp_demo/proposals`, { headers: gmApiHeaders })
  );
  expect(proposals.find((proposal) => proposal.id === rejectedDraft.proposal.id)?.status).toBe("rejected");

  await aiAgent.getByRole("button", { name: "Close AI Agent" }).click();
  await expect(aiAgent).toBeHidden();
  await page.getByRole("button", { name: "Prep", exact: true }).click();
  await page.getByRole("tab", { name: "Journal" }).click();
  const recapJournal = page.locator("article.journal-entry", { hasText: gmRecapChange!.data.title! });
  await expect(recapJournal).toContainText("gm_only");
  await expect(recapJournal).toContainText("ember vault clue");
});

test("GM can run SDK plugin and system workflows from the browser", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  await page.getByRole("button", { name: "Prep", exact: true }).click();
  await openInspectorPanel(page, "SDK");
  const sdkPanel = sdkRuntimePanel(page);
  await expect(sdkPanel.locator(".metric-row", { hasText: "Active System" })).toContainText("D&D 5.5e SRD");
  await expect(sdkPanel.locator(".metric-row", { hasText: "Registry Browser" })).toContainText("registry packages");
  await expect(sdkPanel.getByRole("button", { name: "Sync marketplace registries" })).toBeVisible();
  await expect(sdkPanel.getByRole("textbox", { name: "Plugin marketplace search" })).toBeVisible();
  await expect(sdkPanel.getByRole("combobox", { name: "Plugin marketplace source filter" })).toBeVisible();
  await expect(sdkPanel.getByRole("combobox", { name: "Plugin marketplace status filter" })).toBeVisible();
  await expect(sdkPanel.getByRole("combobox", { name: "Plugin marketplace core filter" })).toBeVisible();
  const marketplaceRiskReview = sdkPanel.locator('details[aria-label="Plugin marketplace risk review"]');
  await openDetails(marketplaceRiskReview);
  await expect(marketplaceRiskReview).toContainText("signature warnings");
  await expect(marketplaceRiskReview).toContainText("signature warning");
  const registryHistory = sdkPanel.locator('details[aria-label="Plugin registry history"]');
  await openDetails(registryHistory);
  await expect(registryHistory).toContainText("sources");
  await expect(registryHistory).toContainText("registry packages");
  await expect(registryHistory).toContainText("last sync");
  await expect(sdkPanel).toContainText("0 incompatible");
  await sdkPanel.getByRole("textbox", { name: "Plugin marketplace search" }).fill("versioned");
  await expect(sdkPanel.locator("article", { hasText: "Versioned Browser Plugin" })).toBeVisible();
  await expect(sdkPanel.locator("article", { hasText: "Example Macro Plugin" })).toHaveCount(0);
  await sdkPanel.getByRole("textbox", { name: "Plugin marketplace search" }).fill("");
  await sdkPanel.getByRole("combobox", { name: "Plugin marketplace core filter" }).selectOption("incompatible");
  await expect(sdkPanel.locator("article", { hasText: "Example Macro Plugin" })).toHaveCount(0);
  await expect(sdkPanel.locator(".panel-subtitle", { hasText: "0 of" })).toBeVisible();
  await sdkPanel.getByRole("combobox", { name: "Plugin marketplace core filter" }).selectOption("compatible");
  await sdkPanel.getByRole("combobox", { name: "Plugin marketplace source filter" }).selectOption("registry");
  await expect(sdkPanel.locator("article", { hasText: "Versioned Browser Plugin" })).toHaveCount(0);
  await expect(sdkPanel.locator("article", { hasText: "Example Macro Plugin" })).toHaveCount(0);
  await expect(sdkPanel.locator(".panel-subtitle", { hasText: "0 of" })).toBeVisible();
  await sdkPanel.getByRole("combobox", { name: "Plugin marketplace source filter" }).selectOption("local");
  await expect(sdkPanel.locator("article", { hasText: "Example Macro Plugin" })).toBeVisible();
  await expect(sdkPanel.locator("article", { hasText: "Versioned Browser Plugin" })).toBeVisible();
  await sdkPanel.getByRole("combobox", { name: "Plugin marketplace source filter" }).selectOption("all");

  const pluginCard = sdkPanel.locator("article", { hasText: "Example Macro Plugin" });
  await expect(pluginCard).toContainText("available plugin");
  await expect(pluginCard).toContainText("Permission review");
  await expect(pluginCard).toContainText("Source:");
  await expect(pluginCard).toContainText("Package:");
  await expect(pluginCard).toContainText("Trust:");
  await expect(pluginCard).toContainText("Signature:");
  await expect(pluginCard).toContainText("Compatibility:");
  await expect(pluginCard).toContainText("Core: >=0.1.0 on 0.3.0");
  await expect(pluginCard).toContainText("core compatible");
  await pluginCard.getByRole("button", { name: "Review and install" }).click();
  const permissionReview = page.getByRole("dialog", { name: "Install 0.1.0" });
  await expect(permissionReview.getByRole("group", { name: "Permissions to grant" })).toContainText("chat.write");
  await expect(permissionReview.getByRole("group", { name: "Permissions to grant" })).toContainText("token.read");
  await permissionReview.getByRole("button", { name: "Install 0.1.0 with 2 permissions" }).click();
  await expect(pluginCard).toContainText("installed plugin");
  await expect(pluginCard).toContainText("Installed v");
  await pluginCard.getByRole("button", { name: "/spark" }).click();
  await expect(statusMessage(page, "Example Macro Plugin command awaiting approval")).toBeVisible();
  await approveAgentProposal(page, "Example Macro Plugin: /spark");
  await page.getByRole("button", { name: "Live Table", exact: true }).click();
  await openInspectorPanel(page, "Chat");
  await expect(page.locator('[aria-label="Chat messages"]')).toContainText(/Spark macro: from the browser tabletop near .*Valen Ash/);
  await page.getByRole("button", { name: "Prep", exact: true }).click();
  await openInspectorPanel(page, "SDK");

  const versionedPluginCard = sdkPanel.locator("article", { hasText: "Versioned Browser Plugin" });
  await expect(versionedPluginCard).toContainText("Compatibility: latest 2.0.0");
  await expect(versionedPluginCard).toContainText("Versions: 2 compatible, 0 blocked");
  await versionedPluginCard.getByRole("button", { name: "Install 1.0.0" }).click();
  await page.getByRole("dialog", { name: "Install 1.0.0" }).getByRole("button", { name: "Install 1.0.0 with 1 permission" }).click();
  await expect(statusMessage(page, "Versioned Browser Plugin installed")).toBeVisible();
  await expect(versionedPluginCard).toContainText("Installed v1.0.0");
  await expect(versionedPluginCard.getByRole("button", { name: "Upgrade to 2.0.0" })).toBeEnabled();
  await sdkPanel.getByRole("combobox", { name: "Plugin marketplace status filter" }).selectOption("upgrade");
  await expect(versionedPluginCard).toBeVisible();
  await expect(pluginCard).toHaveCount(0);
  await sdkPanel.getByRole("combobox", { name: "Plugin marketplace status filter" }).selectOption("installed");
  await expect(versionedPluginCard).toBeVisible();
  await expect(pluginCard).toBeVisible();
  await sdkPanel.getByRole("combobox", { name: "Plugin marketplace status filter" }).selectOption("all");
  await versionedPluginCard.getByRole("button", { name: "/versioned" }).click();
  await expect(statusMessage(page, "Versioned Browser Plugin command awaiting approval")).toBeVisible();
  await approveAgentProposal(page, "Versioned Browser Plugin: /versioned");
  await page.getByRole("button", { name: "Live Table", exact: true }).click();
  await openInspectorPanel(page, "Chat");
  await expect(page.locator('[aria-label="Chat messages"]')).toContainText("Versioned browser plugin v1");
  await page.getByRole("button", { name: "Prep", exact: true }).click();
  await openInspectorPanel(page, "SDK");
  await versionedPluginCard.getByRole("button", { name: "Upgrade to 2.0.0" }).click();
  const upgradeDialog = page.getByRole("dialog", { name: "Upgrade to 2.0.0" });
  await upgradeDialog.getByRole("button", { name: "Upgrade to 2.0.0 with 1 permission" }).click();
  await expect(upgradeDialog).toBeHidden();
  await expect(versionedPluginCard).toContainText("Installed v2.0.0");
  await versionedPluginCard.getByRole("button", { name: "/versioned" }).click();
  await expect(statusMessage(page, "Versioned Browser Plugin command awaiting approval")).toBeVisible();
  await approveAgentProposal(page, "Versioned Browser Plugin: /versioned");
  await page.getByRole("button", { name: "Live Table", exact: true }).click();
  await openInspectorPanel(page, "Chat");
  await expect(page.locator('[aria-label="Chat messages"]')).toContainText("Versioned browser plugin v2");
  await page.getByRole("button", { name: "Prep", exact: true }).click();
  await openInspectorPanel(page, "SDK");
  await versionedPluginCard.getByRole("button", { name: "Roll back to 1.0.0" }).click();
  const rollbackDialog = page.getByRole("dialog", { name: "Roll back to 1.0.0" });
  await rollbackDialog.getByRole("button", { name: "Roll back to 1.0.0 with 1 permission" }).click();
  await expect(rollbackDialog).toBeHidden();
  await expect(versionedPluginCard).toContainText("Installed v1.0.0");
  await expect(versionedPluginCard).toContainText("Audit history: 3 plugin.install rows");

  await expect(sdkPanel.getByText("System Registry")).toBeVisible();
  const dndSystemCard = sdkPanel.locator("article", { hasText: "D&D 5.5e SRD" });
  await expect(dndSystemCard).toContainText("Manifest validation");
  await expect(dndSystemCard).toContainText("Core: >=0.1.0");
  await expect(dndSystemCard).toContainText("Entrypoints: client/server");
  await expect(dndSystemCard).toContainText("Schemas: actor/item");
  await expect(dndSystemCard).toContainText("Permissions: 4");
  await expect(dndSystemCard).toContainText("Activation impact");

  const fighterTemplate = sdkPanel.locator("article", { hasText: "SRD 5.2.1 martial character" });
  await fighterTemplate.getByRole("button", { name: "Create" }).click();
  await expect(statusMessage(page, "Fighter created")).toBeVisible();
  await openInspectorPanel(page, "Actors");
  await openActorDisclosure(selectedActorPanel(page), "Token settings");
  await page.getByRole("combobox", { name: "Token inspector actor" }).selectOption({ label: "Fighter" });
  await expect(statusMessage(page, "Token updated")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fighter" })).toBeVisible();
  await page.getByRole("button", { name: "Sheet" }).click();
  const fullSheet = page.getByRole("dialog", { name: "Fighter" });
  await expect(fullSheet.getByRole("region", { name: "Full sheet stats" }).getByLabel(/^Hit points/i)).toBeVisible();
  await expect(fullSheet.getByRole("region", { name: "Full sheet loadout" })).toBeVisible();
  await expect(fullSheet.getByRole("region", { name: "Full sheet actions" })).toContainText("Longsword Damage");
  await expect(fullSheet.getByRole("region", { name: "Full sheet targeting" })).toContainText("Action target");
  await fullSheet.getByRole("button", { name: "Close full character sheet" }).click();
  await page.getByRole("tabpanel", { name: "Actors" }).getByRole("tab", { name: "Compendium", exact: true }).click();
  const fighterCompendium = page.locator('[aria-label="Actor compendium browser"]');
  await fighterCompendium.getByRole("textbox", { name: "Compendium search" }).fill("Arrows");
  const arrowsEntry = fighterCompendium.locator("article", { hasText: "Arrows" }).first();
  await expect(arrowsEntry).toContainText("1 gp");
  await arrowsEntry.getByRole("spinbutton", { name: "Arrows purchase quantity" }).fill("2");
  await arrowsEntry.getByRole("button", { name: "Purchase" }).click();
  await expect(statusMessage(page, "Arrows purchased")).toBeVisible();
  await expect(fighterCompendium.getByRole("status")).toContainText("Arrows purchased for 2 gp; 48 gp remaining");
  await page.getByRole("tab", { name: "Loadout" }).click();
  await expect(page.getByRole("region", { name: "Actor loadout sheet" })).toContainText("Arrows x2");
  const inventoryManager = page.getByRole("region", { name: "Inventory management" });
  await expect(inventoryManager).toContainText("consumables");
  await inventoryManager.getByRole("combobox", { name: "Inventory filter" }).selectOption("consumable");
  await inventoryManager.getByRole("textbox", { name: "Inventory search" }).fill("Arrows");
  await expect(page.getByRole("region", { name: "Actor loadout sheet" })).toContainText("Arrows x2");
  await page.getByRole("tab", { name: "Actions" }).click();
  const actionPreview = page.getByRole("region", { name: "Action resolution preview" });
  await expect(actionPreview).toContainText("Target actor");
  await expect(actionPreview).toContainText("Effect mode");
  await expect(actionPreview).toContainText("Effect support");
  await expect(actionPreview).toContainText("Resources");
  await page.getByRole("button", { name: "Prep", exact: true }).click();
  await openInspectorPanel(page, "SDK");
  await expect(sdkPanel.getByRole("region", { name: "Actor advancement choices" })).toContainText("1 choices");
  await expect(sdkPanel.getByRole("combobox", { name: "Advancement option" })).toContainText("Level 2");
  await expect(sdkPanel.getByRole("button", { name: "Level Up", exact: true })).toBeDisabled();
  await sdkPanel.getByRole("radio", { name: /Fixed average/ }).check();
  const weaponMasteryChoices = sdkPanel.getByRole("group", { name: "Weapon Mastery choices" });
  await expect(weaponMasteryChoices).toContainText("Choose exactly 3 Weapon Mastery weapons");
  await weaponMasteryChoices.getByRole("checkbox").nth(0).check();
  await weaponMasteryChoices.getByRole("checkbox").nth(1).check();
  await weaponMasteryChoices.getByRole("checkbox").nth(2).check();
  await expect(weaponMasteryChoices.getByRole("status")).toContainText("3 of 3 Weapon Mastery weapons selected");
  await sdkPanel.getByRole("button", { name: "Review advancement" }).click();
  await expect(sdkPanel.getByRole("region", { name: "Advancement review step" })).toContainText("Level 2");
  await sdkPanel.getByLabel("Confirm advancement review").check();
  await sdkPanel.getByRole("button", { name: "Level Up", exact: true }).click();
  await expect(statusMessage(page, "Fighter advanced to Level 2")).toBeVisible();
  await openInspectorPanel(page, "Actors");
  await page.getByRole("tab", { name: "Actions" }).click();
  const actorPanel = selectedActorPanel(page);
  const actorResources = actorPanel.locator(".metric-row", { hasText: "Resources" });
  await expect(actorResources).toContainText("Second Wind 2/2");
  await openActorDisclosure(actorPanel, "Actor details");
  const hpUpdate = page.waitForResponse((response) => response.request().method() === "PATCH" && /\/api\/v1\/actors\/[^/]+$/.test(new URL(response.url()).pathname));
  await page.locator("#actor-hp").fill("1");
  await page.locator("#actor-hp").blur();
  await expectJsonResponse(await hpUpdate);
  await expect(page.locator("#actor-hp")).toHaveValue("1");
  await page.getByRole("combobox", { name: "Action target actor" }).selectOption({ label: "Fighter" });
  await setCheckbox(page.getByRole("checkbox", { name: "Apply action effect" }), true);
  await setCheckbox(page.getByRole("checkbox", { name: "Consume action resources" }), true);
  const secondWindCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Second Wind" }).first();
  await expect(secondWindCard).toContainText("effect supported");
  await secondWindCard.getByRole("button", { name: "Preview" }).click();
  await expect(actionPreview).toContainText("Preview ready");
  await clickAndConfirmPreparedDndAction(actionPreview.getByRole("button", { name: "Use previewed action" }));
  await expect(statusMessage(page, "Fighter used action: Second Wind 1; healing applied")).toBeVisible();
  await expect(actorResources).toContainText("Second Wind 1/2");
  await expect.poll(async () => Number(await page.locator("#actor-hp").inputValue())).toBeGreaterThan(1);
  await setCheckbox(page.getByRole("checkbox", { name: "Apply action effect" }), true);
  const actionSurgeCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Action Surge" }).first();
  await expect(actionSurgeCard).toContainText("Effect unsupported: clear Apply action effect to roll this action.");
  await expect(actionSurgeCard.getByRole("button", { name: "Use action" })).toBeDisabled();
  await setCheckbox(page.getByRole("checkbox", { name: "Apply action effect" }), false);
  await expect(actionSurgeCard.getByRole("button", { name: "Use action" })).toBeEnabled();

  const encounterPlan = await expectJsonResponse<{ plan: { summary: string; difficulty: string } }>(
    await page.request.post(`${apiBaseUrl}/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/encounter-plan`, {
      headers: gmMutationHeaders("dnd-encounter-plan"),
      data: { threats: [] }
    })
  );
  expect(encounterPlan.plan.summary.toLowerCase()).toContain("encounter");
  expect(encounterPlan.plan.difficulty).toBeTruthy();
  await page.getByRole("button", { name: "Prep", exact: true }).click();
  await openInspectorPanel(page, "SDK");
  const rollCountBeforeSystemCheck = await page.evaluate(async (apiBaseUrl) => {
    const bearer = localStorage.getItem("otte:sessionToken");
    if (!bearer) throw new Error("No browser session token available for roll lookup");
    const response = await fetch(`${apiBaseUrl}/api/v1/campaigns/camp_demo/rolls`, {
      headers: { authorization: `Bearer ${bearer}` }
    });
    if (!response.ok) throw new Error(await response.text());
    return (await response.json()).length;
  }, apiBaseUrl);
  await sdkPanel.getByRole("button", { name: /Check$/ }).click();
  await expect
    .poll(async () =>
      page.evaluate(async (apiBaseUrl) => {
        const bearer = localStorage.getItem("otte:sessionToken");
        if (!bearer) throw new Error("No browser session token available for roll lookup");
        const response = await fetch(`${apiBaseUrl}/api/v1/campaigns/camp_demo/rolls`, {
          headers: { authorization: `Bearer ${bearer}` }
        });
        if (!response.ok) throw new Error(await response.text());
        return (await response.json()).length;
      }, apiBaseUrl)
    )
    .toBeGreaterThan(rollCountBeforeSystemCheck);

  await page.getByRole("button", { name: "Prep", exact: true }).click();
  await openInspectorPanel(page, "SDK");
  const genericSystemCard = sdkPanel.locator("article", { hasText: "Generic Fantasy" });
  const originalSystemId = await getCampaignDefaultSystemId(page);
  try {
    await expect(genericSystemCard).toContainText("available system");
    await expect(genericSystemCard).toContainText("Core: >=0.1.0");
    await expect(genericSystemCard).toContainText("Entrypoints: client/server");
    await expect(genericSystemCard).toContainText("Schemas: actor/item");
    await expect(genericSystemCard).toContainText("Permissions: 4");
    await genericSystemCard.getByRole("button", { name: "Activate" }).click();
    await expect(statusMessage(page, "Generic Fantasy activated")).toBeVisible();
    await expect(sdkPanel.locator(".metric-row", { hasText: "Active System" })).toContainText("Generic Fantasy");
    await expect(genericSystemCard).toContainText("active system");
  } finally {
    if ((await getCampaignDefaultSystemId(page)) !== originalSystemId) {
      await activateCampaignSystem(page, originalSystemId);
    }
  }
  expect(await getCampaignDefaultSystemId(page)).toBe(originalSystemId);
});

test("GM can apply broader D&D SRD action effects from the browser", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  const suffix = Date.now().toString(36);
  const target = await createRulesTargetActor(page, { name: `E2E Rules Target ${suffix}`, hp: { current: 500, max: 500 } });
  const cleric = await createSystemCharacter(page, { templateId: "cleric", name: `E2E Cleric ${suffix}`, ownerUserId: "usr_demo_player", advanceToLevel: 5 });
  const bard = await createSystemCharacter(page, { templateId: "bard", name: `E2E Bard ${suffix}`, ownerUserId: "usr_demo_player", advanceToLevel: 5 });
  const druid = await createSystemCharacter(page, { templateId: "druid", name: `E2E Druid ${suffix}`, ownerUserId: "usr_demo_player", advanceToLevel: 5 });
  const wizard = await createSystemCharacter(page, { templateId: "wizard", name: `E2E Wizard ${suffix}`, ownerUserId: "usr_demo_player", advanceToLevel: 5 });
  const monster = await createSystemMonster(page, { threatId: "giant-spider", name: `E2E Giant Spider ${suffix}`, ownerUserId: "usr_demo_player" });
  const sorcerer = await createSystemCharacter(page, { templateId: "sorcerer", name: `E2E Sorcerer ${suffix}`, ownerUserId: "usr_demo_player", advanceToLevel: 5 });
  const warlock = await createSystemCharacter(page, { templateId: "warlock", name: `E2E Warlock ${suffix}`, ownerUserId: "usr_demo_player", advanceToLevel: 5 });
  const barbarian = await createSystemCharacter(page, { templateId: "barbarian", name: `E2E Barbarian ${suffix}`, ownerUserId: "usr_demo_player", advanceToLevel: 5 });
  const paladin = await createSystemCharacter(page, { templateId: "paladin", name: `E2E Paladin ${suffix}`, ownerUserId: "usr_demo_player", advanceToLevel: 5 });
  const monk = await createSystemCharacter(page, { templateId: "monk", name: `E2E Monk ${suffix}`, ownerUserId: "usr_demo_player", advanceToLevel: 5 });
  const ranger = await createSystemCharacter(page, { templateId: "ranger", name: `E2E Ranger ${suffix}`, ownerUserId: "usr_demo_player", advanceToLevel: 5 });
  const rogue = await createSystemCharacter(page, { templateId: "rogue", name: `E2E Rogue ${suffix}`, ownerUserId: "usr_demo_player", advanceToLevel: 5 });
  await createSceneToken(page, { name: `E2E Cleric Token ${suffix}`, actorId: cleric.id, x: 290, y: 330, ownerUserIds: ["usr_demo_player"] });
  await createSceneToken(page, { name: `E2E Bard Token ${suffix}`, actorId: bard.id, x: 260, y: 390, ownerUserIds: ["usr_demo_player"] });
  await createSceneToken(page, { name: `E2E Druid Token ${suffix}`, actorId: druid.id, x: 440, y: 390, ownerUserIds: ["usr_demo_player"] });
  await createSceneToken(page, { name: `E2E Wizard Token ${suffix}`, actorId: wizard.id, x: 500, y: 390, ownerUserIds: ["usr_demo_player"] });
  await createSceneToken(page, { name: `E2E Giant Spider Token ${suffix}`, actorId: monster.id, x: 560, y: 390, ownerUserIds: ["usr_demo_player"] });
  await createSceneToken(page, { name: `E2E Sorcerer Token ${suffix}`, actorId: sorcerer.id, x: 320, y: 390, ownerUserIds: ["usr_demo_player"] });
  await createSceneToken(page, { name: `E2E Warlock Token ${suffix}`, actorId: warlock.id, x: 380, y: 390, ownerUserIds: ["usr_demo_player"] });
  await createSceneToken(page, { name: `E2E Barbarian Token ${suffix}`, actorId: barbarian.id, x: 350, y: 330, ownerUserIds: ["usr_demo_player"] });
  await createSceneToken(page, { name: `E2E Paladin Token ${suffix}`, actorId: paladin.id, x: 410, y: 330, ownerUserIds: ["usr_demo_player"] });
  await createSceneToken(page, { name: `E2E Monk Token ${suffix}`, actorId: monk.id, x: 470, y: 330, ownerUserIds: ["usr_demo_player"] });
  await createSceneToken(page, { name: `E2E Ranger Token ${suffix}`, actorId: ranger.id, x: 530, y: 330, ownerUserIds: ["usr_demo_player"] });
  await createSceneToken(page, { name: `E2E Rogue Token ${suffix}`, actorId: rogue.id, x: 590, y: 330, ownerUserIds: ["usr_demo_player"] });

  await page.reload();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  await page.getByRole("button", { name: `Token E2E Paladin Token ${suffix}` }).click();
  await openInspectorPanel(page, "Actors");
  await expect(selectedActorPanel(page)).toContainText(`E2E Paladin ${suffix}`);
  await page.getByRole("tab", { name: "Actions" }).click();
  await expect(page.getByRole("heading", { name: `E2E Paladin ${suffix}` })).toBeVisible();
  await selectActionTargetActor(page, target.name);
  await setCheckbox(page.getByRole("checkbox", { name: "Apply action effect" }), true);
  await setCheckbox(page.getByRole("checkbox", { name: "Consume action resources" }), true);
  const divineSmiteCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Divine Smite" }).first();
  await expect(divineSmiteCard).toContainText("effect supported");
  const targetHpBeforeSmite = (target.data.hp as { current: number }).current;
  await clickAndConfirmPreparedDndAction(divineSmiteCard.getByRole("button", { name: "Use action" }));
  await expect(statusMessage(page, new RegExp(`E2E Paladin ${suffix} used action: Level 1 Spell Slot \\d+; damage applied`))).toBeVisible();
  await expect
    .poll(async () => ((await getActorById(page, target.id)).data.hp as { current: number }).current)
    .toBeLessThan(targetHpBeforeSmite);
  await selectTokenInspectorActor(page, paladin.name);
  await expect(statusMessage(page, "Token updated")).toBeVisible();
  await expect(page.getByRole("heading", { name: `E2E Paladin ${suffix}` })).toBeVisible();
  await selectActionTargetActor(page, target.name);
  const targetHpBeforeLayOnHands = ((await getActorById(page, target.id)).data.hp as { current: number }).current;
  const layOnHandsCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Lay On Hands" }).first();
  await expect(layOnHandsCard).toContainText("effect supported");
  await clickAndConfirmPreparedDndAction(layOnHandsCard.getByRole("button", { name: "Use action" }));
  await expect(statusMessage(page, new RegExp(`E2E Paladin ${suffix} used action: Lay On Hands \\d+; healing applied`))).toBeVisible();
  await expect
    .poll(async () => ((await getActorById(page, target.id)).data.hp as { current: number }).current)
    .toBeGreaterThan(targetHpBeforeLayOnHands);

  await selectTokenInspectorActor(page, cleric.name);
  await expect(statusMessage(page, "Token updated")).toBeVisible();
  await expect(page.getByRole("heading", { name: `E2E Cleric ${suffix}` })).toBeVisible();
  await selectActionTargetActor(page, target.name);
  await setCheckbox(page.getByRole("checkbox", { name: "Apply action effect" }), true);
  await setCheckbox(page.getByRole("checkbox", { name: "Consume action resources" }), true);
  const divineSparkCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Divine Spark Damage" }).first();
  await expect(divineSparkCard).toContainText("effect supported");
  const targetHpBeforeDivineSpark = ((await getActorById(page, target.id)).data.hp as { current: number }).current;
  await divineSparkCard.getByRole("button", { name: "Preview" }).click();
  const divineSparkPreview = page.getByRole("region", { name: "Action resolution preview" });
  await expect(divineSparkPreview).toContainText("Divine Spark Damage");
  await divineSparkPreview.getByRole("group", { name: `${target.name} constitution save outcome` }).getByRole("button", { name: "Failure" }).click();
  await clickAndConfirmPreparedDndAction(divineSparkPreview.getByRole("button", { name: "Use previewed action" }));
  await expect(statusMessage(page, new RegExp(`E2E Cleric ${suffix} used action: Channel Divinity \\d+; damage applied`))).toBeVisible();
  await expect
    .poll(async () => ((await getActorById(page, target.id)).data.hp as { current: number }).current)
    .toBeLessThan(targetHpBeforeDivineSpark);

  await selectTokenInspectorActor(page, sorcerer.name);
  await expect(statusMessage(page, "Token updated")).toBeVisible();
  await expect(page.getByRole("heading", { name: `E2E Sorcerer ${suffix}` })).toBeVisible();
  await selectActionTargetActor(page, target.name);
  await setCheckbox(page.getByRole("checkbox", { name: "Apply action effect" }), true);
  await setCheckbox(page.getByRole("checkbox", { name: "Consume action resources" }), true);
  const chromaticOrbCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Chromatic Orb Damage" }).first();
  await expect(chromaticOrbCard).toContainText("effect supported");
  const targetHpBeforeChromaticOrb = ((await getActorById(page, target.id)).data.hp as { current: number }).current;
  await clickAndConfirmPreparedDndAction(chromaticOrbCard.getByRole("button", { name: "Use action" }));
  await expect(statusMessage(page, new RegExp(`E2E Sorcerer ${suffix} used action: Level 1 Spell Slot \\d+; damage applied`))).toBeVisible();
  await expect
    .poll(async () => ((await getActorById(page, target.id)).data.hp as { current: number }).current)
    .toBeLessThan(targetHpBeforeChromaticOrb);

  await selectTokenInspectorActor(page, warlock.name);
  await expect(statusMessage(page, "Token updated")).toBeVisible();
  await expect(page.getByRole("heading", { name: `E2E Warlock ${suffix}` })).toBeVisible();
  await selectActionTargetActor(page, target.name);
  await setCheckbox(page.getByRole("checkbox", { name: "Apply action effect" }), true);
  await setCheckbox(page.getByRole("checkbox", { name: "Consume action resources" }), true);
  const hexCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Hex Damage" }).first();
  await expect(hexCard).toContainText("effect supported");
  const targetHpBeforeHex = ((await getActorById(page, target.id)).data.hp as { current: number }).current;
  await clickAndConfirmPreparedDndAction(hexCard.getByRole("button", { name: "Use action" }));
  await expect(statusMessage(page, new RegExp(`E2E Warlock ${suffix} used action: Level \\d+ Pact Magic Slot \\d+; damage applied`))).toBeVisible();
  await expect
    .poll(async () => ((await getActorById(page, target.id)).data.hp as { current: number }).current)
    .toBeLessThan(targetHpBeforeHex);
  const warlockAfterHex = await getActorById(page, warlock.id);
  const pactSlotLevel = Object.keys((warlockAfterHex.data.spellSlots as Record<string, { current: number }>) ?? {}).find((key) => key.startsWith("level")) ?? "level3";
  const pactSlotsAfterHex = ((warlockAfterHex.data.spellSlots as Record<string, { current: number }>)[pactSlotLevel]?.current) ?? 0;
  await selectTokenInspectorActor(page, warlock.name);
  await expect(statusMessage(page, "Token updated")).toBeVisible();
  await expect(page.getByRole("heading", { name: `E2E Warlock ${suffix}` })).toBeVisible();
  await setCheckbox(page.getByRole("checkbox", { name: "Apply action effect" }), false);
  const magicalCunningCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Magical Cunning" }).first();
  await expect(magicalCunningCard).toContainText("roll only action");
  await clickAndConfirmPreparedDndAction(magicalCunningCard.getByRole("button", { name: "Use action" }));
  await expect(statusMessage(page, new RegExp(`E2E Warlock ${suffix} used action: Magical Cunning \\d+`))).toBeVisible();
  await expect
    .poll(async () => (((await getActorById(page, warlock.id)).data.spellSlots as Record<string, { current: number }>)[pactSlotLevel]?.current) ?? 0)
    .toBeGreaterThan(pactSlotsAfterHex);

  await selectTokenInspectorActor(page, druid.name);
  await expect(statusMessage(page, "Token updated")).toBeVisible();
  await expect(page.getByRole("heading", { name: `E2E Druid ${suffix}` })).toBeVisible();
  await selectActionTargetActor(page, target.name);
  await setCheckbox(page.getByRole("checkbox", { name: "Apply action effect" }), true);
  await setCheckbox(page.getByRole("checkbox", { name: "Consume action resources" }), true);
  const cureWoundsCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Cure Wounds Healing" }).first();
  await expect(cureWoundsCard).toContainText("effect supported");
  const targetHpBeforeCureWounds = ((await getActorById(page, target.id)).data.hp as { current: number }).current;
  await clickAndConfirmPreparedDndAction(cureWoundsCard.getByRole("button", { name: "Use action" }));
  await expect(statusMessage(page, new RegExp(`E2E Druid ${suffix} used action: Level 1 Spell Slot \\d+; healing applied`))).toBeVisible();
  await expect
    .poll(async () => ((await getActorById(page, target.id)).data.hp as { current: number }).current)
    .toBeGreaterThan(targetHpBeforeCureWounds);

  await selectTokenInspectorActor(page, wizard.name);
  await expect(statusMessage(page, "Token updated")).toBeVisible();
  await expect(page.getByRole("heading", { name: `E2E Wizard ${suffix}` })).toBeVisible();
  await selectActionTargetActor(page, target.name);
  await setCheckbox(page.getByRole("checkbox", { name: "Apply action effect" }), true);
  await setCheckbox(page.getByRole("checkbox", { name: "Consume action resources" }), true);
  const fireBoltCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Fire Bolt Damage" }).first();
  await expect(fireBoltCard).toContainText("effect supported");
  const targetHpBeforeFireBolt = ((await getActorById(page, target.id)).data.hp as { current: number }).current;
  await clickAndConfirmPreparedDndAction(fireBoltCard.getByRole("button", { name: "Use action" }));
  await expect(statusMessage(page, new RegExp(`E2E Wizard ${suffix} action posted; damage applied`))).toBeVisible();
  await expect
    .poll(async () => ((await getActorById(page, target.id)).data.hp as { current: number }).current)
    .toBeLessThan(targetHpBeforeFireBolt);

  await selectTokenInspectorActor(page, monster.name);
  await expect(statusMessage(page, "Token updated")).toBeVisible();
  await expect(page.getByRole("heading", { name: `E2E Giant Spider ${suffix}` })).toBeVisible();
  await selectActionTargetActor(page, target.name);
  await setCheckbox(page.getByRole("checkbox", { name: "Apply action effect" }), true);
  await setCheckbox(page.getByRole("checkbox", { name: "Consume action resources" }), true);
  const biteDamageCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Bite Damage" }).first();
  await expect(biteDamageCard).toContainText("effect supported");
  const targetHpBeforeBite = ((await getActorById(page, target.id)).data.hp as { current: number }).current;
  await clickAndConfirmPreparedDndAction(biteDamageCard.getByRole("button", { name: "Use action" }));
  await expect(statusMessage(page, new RegExp(`E2E Giant Spider ${suffix} action posted; damage applied`))).toBeVisible();
  await expect
    .poll(async () => ((await getActorById(page, target.id)).data.hp as { current: number }).current)
    .toBeLessThan(targetHpBeforeBite);
  await selectTokenInspectorActor(page, monster.name);
  await expect(statusMessage(page, "Token updated")).toBeVisible();
  await expect(page.getByRole("heading", { name: `E2E Giant Spider ${suffix}` })).toBeVisible();
  await selectActionTargetActor(page, target.name);
  const webEffectCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Web Effect" }).first();
  await expect(webEffectCard).toContainText("effect supported");
  await webEffectCard.getByRole("button", { name: "Use action" }).click();
  await expect(statusMessage(page, "Save outcomes are required before this D&D action can be committed.")).toBeVisible();

  await selectTokenInspectorActor(page, bard.name);
  await expect(statusMessage(page, "Token updated")).toBeVisible();
  await expect(page.getByRole("heading", { name: `E2E Bard ${suffix}` })).toBeVisible();
  await selectActionTargetActor(page, target.name);
  await setCheckbox(page.getByRole("checkbox", { name: "Apply action effect" }), true);
  await setCheckbox(page.getByRole("checkbox", { name: "Consume action resources" }), true);
  const healingWordCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Healing Word Healing" }).first();
  await expect(healingWordCard).toContainText("effect supported");
  const targetHpBeforeHealingWord = ((await getActorById(page, target.id)).data.hp as { current: number }).current;
  await clickAndConfirmPreparedDndAction(healingWordCard.getByRole("button", { name: "Use action" }));
  await expect(statusMessage(page, new RegExp(`E2E Bard ${suffix} used action: Level 1 Spell Slot \\d+; healing applied`))).toBeVisible();
  await expect
    .poll(async () => ((await getActorById(page, target.id)).data.hp as { current: number }).current)
    .toBeGreaterThan(targetHpBeforeHealingWord);
  await selectTokenInspectorActor(page, bard.name);
  await expect(statusMessage(page, "Token updated")).toBeVisible();
  await expect(page.getByRole("heading", { name: `E2E Bard ${suffix}` })).toBeVisible();
  const bardicInspirationBefore = (((await getActorById(page, bard.id)).data.resources as Record<string, { current: number }>).bardicInspiration?.current) ?? 0;
  await setCheckbox(page.getByRole("checkbox", { name: "Apply action effect" }), false);
  const bardicInspirationCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Bardic Inspiration" }).first();
  await expect(bardicInspirationCard).toContainText("roll only action");
  await clickAndConfirmPreparedDndAction(bardicInspirationCard.getByRole("button", { name: "Use action" }));
  await expect(statusMessage(page, new RegExp(`E2E Bard ${suffix} used action: Bardic Inspiration \\d+`))).toBeVisible();
  await expect
    .poll(async () => (((await getActorById(page, bard.id)).data.resources as Record<string, { current: number }>).bardicInspiration?.current) ?? 0)
    .toBeLessThan(bardicInspirationBefore);
  const bardicInspirationSpent = (((await getActorById(page, bard.id)).data.resources as Record<string, { current: number }>).bardicInspiration?.current) ?? 0;
  await selectTokenInspectorActor(page, bard.name);
  await expect(statusMessage(page, "Token updated")).toBeVisible();
  await expect(page.getByRole("heading", { name: `E2E Bard ${suffix}` })).toBeVisible();
  const fontOfInspirationCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Font of Inspiration" }).first();
  await expect(fontOfInspirationCard).toContainText("roll only action");
  await clickAndConfirmPreparedDndAction(fontOfInspirationCard.getByRole("button", { name: "Use action" }));
  await expect(statusMessage(page, new RegExp(`E2E Bard ${suffix} used action: Level 1 Spell Slot \\d+`))).toBeVisible();
  await expect
    .poll(async () => (((await getActorById(page, bard.id)).data.resources as Record<string, { current: number }>).bardicInspiration?.current) ?? 0)
    .toBeGreaterThan(bardicInspirationSpent);

  await selectTokenInspectorActor(page, monk.name);
  await expect(statusMessage(page, "Token updated")).toBeVisible();
  await expect(page.getByRole("heading", { name: `E2E Monk ${suffix}` })).toBeVisible();
  await selectActionTargetActor(page, target.name);
  await setCheckbox(page.getByRole("checkbox", { name: "Apply action effect" }), true);
  await setCheckbox(page.getByRole("checkbox", { name: "Consume action resources" }), true);
  const stunningStrikeCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Stunning Strike" }).first();
  await expect(stunningStrikeCard).toContainText("effect supported");
  await stunningStrikeCard.getByRole("button", { name: "Use action" }).click();
  await expect(statusMessage(page, "Save outcomes are required before this D&D action can be committed.")).toBeVisible();
  const deflectCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Deflect" }).first();
  await expect(deflectCard).toContainText("Deflect Attacks Reaction Damage");
  await expect(deflectCard).toContainText("effect supported");

  await selectTokenInspectorActor(page, ranger.name);
  await expect(statusMessage(page, "Token updated")).toBeVisible();
  await expect(page.getByRole("heading", { name: `E2E Ranger ${suffix}` })).toBeVisible();
  await selectActionTargetActor(page, target.name);
  await setCheckbox(page.getByRole("checkbox", { name: "Apply action effect" }), true);
  await setCheckbox(page.getByRole("checkbox", { name: "Consume action resources" }), true);
  const huntersMarkCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Hunter's Mark" }).first();
  await expect(huntersMarkCard).toContainText("effect supported");
  const targetHpBeforeHuntersMark = ((await getActorById(page, target.id)).data.hp as { current: number }).current;
  await clickAndConfirmPreparedDndAction(huntersMarkCard.getByRole("button", { name: "Use action" }));
  await expect(statusMessage(page, new RegExp(`E2E Ranger ${suffix} used action: Level 1 Spell Slot \\d+; damage applied`))).toBeVisible();
  await expect
    .poll(async () => ((await getActorById(page, target.id)).data.hp as { current: number }).current)
    .toBeLessThan(targetHpBeforeHuntersMark);

  await selectTokenInspectorActor(page, rogue.name);
  await expect(statusMessage(page, "Token updated")).toBeVisible();
  await expect(page.getByRole("heading", { name: `E2E Rogue ${suffix}` })).toBeVisible();
  await selectActionTargetActor(page, target.name);
  await setCheckbox(page.getByRole("checkbox", { name: "Apply action effect" }), true);
  const sneakAttackCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Sneak Attack" }).first();
  await expect(sneakAttackCard).toContainText("effect supported");
  const targetHpBeforeSneakAttack = ((await getActorById(page, target.id)).data.hp as { current: number }).current;
  await sneakAttackCard.getByRole("button", { name: "Preview" }).click();
  const sneakAttackPreview = page.getByRole("region", { name: "Action resolution preview" });
  await expect(sneakAttackPreview).toContainText("Manual resolution required: Sneak Attack Damage uses unsupported damage type weapon; resolve it manually.");
  await expect(sneakAttackPreview.getByRole("button", { name: "Use previewed action" })).toBeDisabled();
  await expect.poll(async () => ((await getActorById(page, target.id)).data.hp as { current: number }).current).toBe(targetHpBeforeSneakAttack);

  await selectTokenInspectorActor(page, barbarian.name);
  await expect(statusMessage(page, "Token updated")).toBeVisible();
  await expect(page.getByRole("heading", { name: `E2E Barbarian ${suffix}` })).toBeVisible();
  await selectActionTargetActor(page, target.name);
  await setCheckbox(page.getByRole("checkbox", { name: "Apply action effect" }), true);
  const rageDamageCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Rage Damage" }).first();
  await expect(rageDamageCard).toContainText("effect supported");
  const targetHpBeforeRageDamage = ((await getActorById(page, target.id)).data.hp as { current: number }).current;
  await rageDamageCard.getByRole("button", { name: "Preview" }).click();
  const rageDamagePreview = page.getByRole("region", { name: "Action resolution preview" });
  await expect(rageDamagePreview).toContainText("Manual resolution required: Rage Damage Bonus uses unsupported damage type weapon; resolve it manually.");
  await expect(rageDamagePreview.getByRole("button", { name: "Use previewed action" })).toBeDisabled();
  await expect.poll(async () => ((await getActorById(page, target.id)).data.hp as { current: number }).current).toBe(targetHpBeforeRageDamage);
});

test("SDK marketplace blocks trust-policy failures in the browser", async ({ page }) => {
  const marketplaceFixturePlugins = [
        {
          id: "unsigned-fixture-plugin",
          name: "Unsigned Fixture Plugin",
          version: "1.0.0",
          permissions: ["chat.send"],
          installed: false,
          grantedPermissions: [],
          missingPermissions: ["chat.send"],
          updateAvailable: false,
          rollbackVersions: [],
          compatibleCore: { range: ">=0.1.0", coreVersion: "0.3.0", satisfied: true },
          trust: {
            status: "unsigned",
            policy: "require_trusted",
            required: true,
            installable: false,
            errors: ["Plugin package is unsigned under require_trusted policy"]
          },
          distribution: { availableVersions: ["1.0.0"], latestVersion: "1.0.0" },
          permissionReview: { requestedPermissions: ["chat.send"], grantRequired: true },
          chatCommands: [{ command: "/unsigned", description: "Should not install" }]
        },
        {
          id: "tampered-fixture-plugin",
          name: "Tampered Fixture Plugin",
          version: "1.0.0",
          permissions: ["chat.send"],
          installed: true,
          grantedPermissions: ["chat.send"],
          missingPermissions: [],
          installedVersion: "1.0.0",
          updateAvailable: false,
          rollbackVersions: [],
          compatibleCore: { range: ">=0.1.0", coreVersion: "0.3.0", satisfied: true },
          trust: {
            status: "untrusted",
            policy: "require_trusted",
            required: true,
            installable: false,
            errors: ["Plugin signature does not match package contents"],
            signature: { keyId: "trusted-local", algorithm: "hmac-sha256", verified: false, signaturePath: "plugin.signature.json" }
          },
          distribution: { availableVersions: ["1.0.0"], latestVersion: "1.0.0" },
          permissionReview: { requestedPermissions: ["chat.send"], grantRequired: false },
          chatCommands: [{ command: "/tampered", description: "Should fail closed" }]
        }
      ];
  await page.route("**/api/v1/campaigns/*/plugins", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(marketplaceFixturePlugins)
    });
  });
  await page.route("**/api/v1/campaigns/*/snapshot*", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { bundled?: Record<string, unknown> };
    body.bundled = { ...(body.bundled ?? {}), plugins: marketplaceFixturePlugins };
    await route.fulfill({ response, json: body });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  await page.getByRole("button", { name: "Prep", exact: true }).click();
  await openInspectorPanel(page, "SDK");
  const sdkPanel = sdkRuntimePanel(page);
  const marketplaceRiskReview = sdkPanel.locator('details[aria-label="Plugin marketplace risk review"]');
  await openDetails(marketplaceRiskReview);
  await expect(marketplaceRiskReview).toContainText("2 flagged");
  await expect(marketplaceRiskReview).toContainText("Unsigned Fixture Plugin");
  await expect(marketplaceRiskReview).toContainText("trust blocked");
  await expect(marketplaceRiskReview).toContainText("Tampered Fixture Plugin");
  await expect(marketplaceRiskReview).toContainText("Plugin signature does not match package contents");

  const unsignedPluginCard = sdkPanel.locator("article", { hasText: "Unsigned Fixture Plugin" });
  await expect(unsignedPluginCard).toContainText("Trust: unsigned");
  await expect(unsignedPluginCard).toContainText("Policy: require_trusted");
  await expect(unsignedPluginCard).toContainText("Plugin package is unsigned under require_trusted policy");
  await expect(unsignedPluginCard.getByRole("button", { name: "Review and install" })).toBeDisabled();

  const tamperedPluginCard = sdkPanel.locator("article", { hasText: "Tampered Fixture Plugin" });
  await expect(tamperedPluginCard).toContainText("installed plugin");
  await expect(tamperedPluginCard).toContainText("Trust: untrusted");
  await expect(tamperedPluginCard).toContainText("Signature: unverified trusted-local");
  await expect(tamperedPluginCard.getByRole("button", { name: "/tampered" })).toBeDisabled();
});

test("SDK marketplace is hidden from players in the browser", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  await page.getByLabel("Session user").selectOption("usr_demo_player");
  await expect(page.getByLabel("Session user")).toHaveValue("usr_demo_player");

  await expect(page.getByRole("button", { name: "Prep", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Plugins", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "AI Studio", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Account", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add token" })).toHaveCount(0);

  const journalTab = page.getByRole("tab", { name: "Journal", exact: true });
  await expect(journalTab).toHaveAttribute("aria-controls", "inspector-panel-journal");
  await journalTab.click();
  const journalPanel = page.getByRole("tabpanel");
  await expect(journalPanel).toHaveAttribute("id", "inspector-panel-journal");
  await expect(journalPanel.getByRole("region", { name: "Journal hierarchy" })).toBeVisible();
  await expect(journalPanel.getByText("New entry", { exact: true })).toHaveCount(0);
  await expect(journalPanel.getByRole("button", { name: "Generate session recap" })).toHaveCount(0);
});

test("closing a delayed invite cannot replace a newer login", async ({ page }) => {
  let releaseInvite!: () => void;
  let markInviteStarted!: () => void;
  const inviteStarted = new Promise<void>((resolve) => { markInviteStarted = resolve; });
  const inviteReleased = new Promise<void>((resolve) => { releaseInvite = resolve; });
  await mockInvitePreview(page);
  await page.route("**/api/v1/invites/accept", async (route) => {
    markInviteStarted();
    await inviteReleased;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        token: "stale-invite-token",
        user: { id: "usr_stale_invite", displayName: "Stale Invite" },
        session: { id: "ses_stale_invite", userId: "usr_stale_invite" },
        memberships: [],
        campaign: { id: "camp_stale_invite", name: "Stale Invite Campaign" }
      })
    }).catch(() => undefined);
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Have an invite token?" }).click();
  await page.getByRole("textbox", { name: "Public invite token" }).fill("oti_delayed");
  await page.getByRole("textbox", { name: "Join email" }).fill("delayed@example.test");
  await page.getByLabel("Join password").fill("correct horse");
  await page.getByRole("button", { name: "Accept Invite" }).click();
  await inviteStarted;

  await page.getByRole("button", { name: "Use sign in instead" }).click();
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  releaseInvite();
  await page.waitForTimeout(200);

  expect(await page.evaluate(() => ({ userId: localStorage.getItem("otte:userId"), token: localStorage.getItem("otte:sessionToken") }))).toMatchObject({
    userId: "usr_demo_gm"
  });
  expect(await page.evaluate(() => localStorage.getItem("otte:sessionToken"))).not.toBe("stale-invite-token");
});

test("invite acceptance sends only one in-flight one-time-token request", async ({ page }) => {
  let requestCount = 0;
  let releaseInvite!: () => void;
  let markInviteStarted!: () => void;
  const inviteStarted = new Promise<void>((resolve) => { markInviteStarted = resolve; });
  const inviteReleased = new Promise<void>((resolve) => { releaseInvite = resolve; });
  await mockInvitePreview(page);
  await page.route("**/api/v1/invites/accept", async (route) => {
    requestCount += 1;
    markInviteStarted();
    await inviteReleased;
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "unauthorized", message: "Invite request rejected for test" })
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Have an invite token?" }).click();
  const inviteForm = page.locator("form.invite-accept-form");
  await inviteForm.getByRole("textbox", { name: "Public invite token" }).fill("oti_single_flight");
  await inviteForm.getByRole("textbox", { name: "Join email" }).fill("single-flight@example.test");
  await inviteForm.getByLabel("Join password").fill("correct horse");
  const submit = inviteForm.locator('button[type="submit"]');

  await submit.evaluate((button) => {
    if (!(button instanceof HTMLButtonElement)) throw new Error("Invite submit control is not a button");
    button.click();
    button.click();
  });
  await inviteStarted;

  expect(requestCount).toBe(1);
  await expect(inviteForm).toHaveAttribute("aria-busy", "true");
  await expect(submit).toBeDisabled();
  await expect(submit).toContainText("Accepting Invite");

  releaseInvite();
  await expect(inviteForm).toHaveAttribute("aria-busy", "false");
  await expect(submit).toBeEnabled();
  await expect(page.getByText("Invite request rejected for test")).toBeVisible();
  expect(requestCount).toBe(1);
});

test("a delayed invite cannot replace a newer session switch", async ({ page }) => {
  let releaseInvite!: () => void;
  let markInviteStarted!: () => void;
  const inviteStarted = new Promise<void>((resolve) => { markInviteStarted = resolve; });
  const inviteReleased = new Promise<void>((resolve) => { releaseInvite = resolve; });
  await mockInvitePreview(page);
  await page.route("**/api/v1/invites/accept", async (route) => {
    markInviteStarted();
    await inviteReleased;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        token: "stale-authenticated-invite-token",
        user: { id: "usr_stale_authenticated_invite", displayName: "Stale Authenticated Invite" },
        session: { id: "ses_stale_authenticated_invite", userId: "usr_stale_authenticated_invite" },
        memberships: [],
        campaign: { id: "camp_stale_authenticated_invite", name: "Stale Authenticated Invite Campaign" }
      })
    }).catch(() => undefined);
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await openManageCategory(page, "People");
  await openDetails(page.locator("details", { hasText: "Join with an invite token" }));
  const joinButton = page.getByRole("button", { name: "Join", exact: true });
  const joinForm = page.locator("form", { has: joinButton });
  await joinForm.getByRole("textbox", { name: "Invite token" }).fill("oti_delayed_authenticated");
  await joinForm.getByRole("textbox", { name: "Join email" }).fill("delayed-authenticated@example.test");
  await joinForm.getByLabel("Password").fill("correct horse");
  await joinButton.click();
  await inviteStarted;

  await page.getByLabel("Session user").selectOption("usr_demo_player");
  await expect(page.getByLabel("Session user")).toHaveValue("usr_demo_player");
  releaseInvite();
  await page.waitForTimeout(200);

  expect(await page.evaluate(() => ({ userId: localStorage.getItem("otte:userId"), token: localStorage.getItem("otte:sessionToken") }))).toMatchObject({
    userId: "usr_demo_player"
  });
  expect(await page.evaluate(() => localStorage.getItem("otte:sessionToken"))).not.toBe("stale-authenticated-invite-token");
});

test("delayed GM actor and token mutations cannot apply after switching to a player", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  const baseline = await page.evaluate(async ({ apiBaseUrl }) => {
    const bearer = localStorage.getItem("otte:sessionToken");
    if (!bearer) throw new Error("No browser session token available for stale mutation setup");
    const headers = { authorization: `Bearer ${bearer}` };
    const tokenResponse = await fetch(`${apiBaseUrl}/api/v1/scenes/scn_vault_entry/tokens`, { headers });
    if (!tokenResponse.ok) throw new Error(await tokenResponse.text());
    const tokens = await tokenResponse.json() as Array<{ id: string; actorId?: string; name: string }>;
    const token = tokens.find((item) => item.id === "tok_valen");
    if (!token) throw new Error("Valen token is unavailable for stale mutation setup");
    if (!token.actorId) throw new Error("Valen token has no actor for stale mutation setup");
    const actorResponse = await fetch(`${apiBaseUrl}/api/v1/actors/${token.actorId}`, { headers });
    if (!actorResponse.ok) throw new Error(await actorResponse.text());
    return { actor: await actorResponse.json() as { id: string; name: string; campaignId: string; systemId: string }, token };
  }, { apiBaseUrl });

  const selectBaselineActor = async () => {
    const token = page.locator(".token").filter({ hasText: baseline.token.name }).first();
    if ((await token.getAttribute("aria-pressed")) !== "true") {
      await token.focus();
      await token.press("Enter");
    }
    await expect(selectedActorPanel(page)).toContainText(baseline.actor.name);
  };
  await selectBaselineActor();

  let actorRelease!: () => void;
  let actorStartedResolve!: () => void;
  const actorStarted = new Promise<void>((resolve) => { actorStartedResolve = resolve; });
  const actorReleased = new Promise<void>((resolve) => { actorRelease = resolve; });
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const genericActorUpdate = request.method() === "PATCH" && pathname === `/api/v1/actors/${baseline.actor.id}`;
    const conditionPath = `/api/v1/campaigns/${baseline.actor.campaignId}/systems/${baseline.actor.systemId}/actors/${baseline.actor.id}/conditions`;
    const conditionUpdate = (request.method() === "POST" && pathname === conditionPath)
      || (request.method() === "DELETE" && pathname.startsWith(`${conditionPath}/`));
    if (!genericActorUpdate && !conditionUpdate) return route.continue();
    actorStartedResolve();
    await actorReleased;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(conditionUpdate
        ? { actor: { ...baseline.actor, name: "GM stale actor response" } }
        : { ...baseline.actor, name: "GM stale actor response" })
    }).catch(() => undefined);
  });

  await page.getByRole("button", { name: "Poisoned", exact: true }).click();
  await actorStarted;
  await page.getByLabel("Session user").selectOption("usr_demo_player");
  await expect(page.getByLabel("Session user")).toHaveValue("usr_demo_player");
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  actorRelease();
  await page.waitForTimeout(200);
  await expect(page.getByText("GM stale actor response")).toHaveCount(0);

  await page.getByLabel("Session user").selectOption("usr_demo_gm");
  await expect(page.getByLabel("Session user")).toHaveValue("usr_demo_gm");
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  await selectBaselineActor();

  let tokenRelease!: () => void;
  let tokenStartedResolve!: () => void;
  const tokenStarted = new Promise<void>((resolve) => { tokenStartedResolve = resolve; });
  const tokenReleased = new Promise<void>((resolve) => { tokenRelease = resolve; });
  await page.route("**/api/v1/tokens/tok_valen", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    tokenStartedResolve();
    await tokenReleased;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...baseline.token, name: "GM stale token response", notes: "GM-only stale notes" })
    }).catch(() => undefined);
  });

  const actorPanel = selectedActorPanel(page);
  await openActorDisclosure(actorPanel, "Token settings");
  const tokenName = page.getByRole("textbox", { name: "Token inspector name" });
  await tokenName.fill("Attempted token update");
  await tokenName.press("Tab");
  await tokenStarted;
  await page.getByLabel("Session user").selectOption("usr_demo_player");
  await expect(page.getByLabel("Session user")).toHaveValue("usr_demo_player");
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  tokenRelease();
  await page.waitForTimeout(200);

  await expect(page.getByText("GM stale token response")).toHaveCount(0);
  expect(await page.locator("textarea").evaluateAll((elements) => elements.map((element) => (element as HTMLTextAreaElement).value))).not.toContain("GM-only stale notes");
  expect(await page.evaluate(() => localStorage.getItem("otte:userId"))).toBe("usr_demo_player");
});

test("closing Encounter Builder retries the same atomic monster placement", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  const encounter = await page.evaluate(async ({ apiBaseUrl }) => {
    const bearer = localStorage.getItem("otte:sessionToken");
    if (!bearer) throw new Error("No browser session token available for encounter cancellation setup");
    const headers = { authorization: `Bearer ${bearer}`, "content-type": "application/json" };
    const campaignResponse = await fetch(`${apiBaseUrl}/api/v1/campaigns/camp_demo`, { headers });
    if (!campaignResponse.ok) throw new Error(await campaignResponse.text());
    const campaign = await campaignResponse.json() as { defaultSystemId?: string; updatedAt: string };
    const systemId = campaign.defaultSystemId ?? "generic-fantasy";
    const threatsResponse = await fetch(`${apiBaseUrl}/api/v1/campaigns/camp_demo/systems/${encodeURIComponent(systemId)}/encounter-threats`, { headers });
    if (!threatsResponse.ok) throw new Error(await threatsResponse.text());
    const threats = await threatsResponse.json() as Array<{ id: string; name: string }>;
    const threat = threats[0];
    if (!threat) throw new Error("No encounter threat available");
    const name = `Cancelable Placement ${Date.now().toString(36)}`;
    const response = await fetch(`${apiBaseUrl}/api/v1/campaigns/camp_demo/systems/${encodeURIComponent(systemId)}/encounter-plan`, {
      method: "POST",
      headers: { ...headers, "idempotency-key": `encounter-cancellation-${Date.now().toString(36)}` },
      body: JSON.stringify({
        partyActorIds: [],
        threats: [{ id: threat.id, count: 3 }],
        createEncounter: true,
        name,
        expectedUpdatedAt: campaign.updatedAt,
      })
    });
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json() as { encounter?: { id: string; name: string } };
    if (!result.encounter) throw new Error("Encounter setup did not return a saved encounter");
    return result.encounter;
  }, { apiBaseUrl });

  const baselineActors = await expectJsonResponse<E2EActor[]>(await page.request.get(apiBaseUrl + "/api/v1/campaigns/camp_demo/actors", { headers: gmApiHeaders }));
  const baselineTokens = await expectJsonResponse<E2EToken[]>(await page.request.get(apiBaseUrl + "/api/v1/scenes/scn_vault_entry/tokens", { headers: gmApiHeaders }));
  let placementRelease!: () => void;
  let placementCommittedResolve!: () => void;
  let placementRequestCount = 0;
  const placementKeys: string[] = [];
  const placementBodies: string[] = [];
  type PlacementResult = {
    placements: Array<{ actor: E2EActor & { updatedAt: string }; sceneToken: E2EToken }>;
    scene: { id: string; updatedAt: string };
  };
  let committedResult: PlacementResult | undefined;
  const placementCommitted = new Promise<void>((resolve) => { placementCommittedResolve = resolve; });
  const placementReleased = new Promise<void>((resolve) => { placementRelease = resolve; });
  await page.route("**/api/v1/scenes/scn_vault_entry/encounter-monster-placements", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    placementRequestCount += 1;
    placementKeys.push(route.request().headers()["idempotency-key"] ?? "");
    placementBodies.push(route.request().postData() ?? "");
    if (placementRequestCount !== 1) return route.continue();
    const upstream = await route.fetch();
    const body = await upstream.text();
    committedResult = JSON.parse(body) as PlacementResult;
    placementCommittedResolve();
    await placementReleased;
    await route.fulfill({ status: upstream.status(), headers: upstream.headers(), body }).catch(() => undefined);
  });

  try {
    await page.reload();
    await openInspectorPanel(page, "Combat");
    await page.getByRole("button", { name: "Plan Encounter" }).click();
    const dialog = page.getByRole("dialog", { name: "Encounter builder" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: new RegExp(encounter.name) }).click();
    const place = dialog.getByRole("button", { name: "Place monsters on scene" });
    await expect(place).toBeEnabled();
    await place.click();
    await placementCommitted;
    await dialog.getByRole("button", { name: "Cancel monster placement and close encounter builder" }).click();
    await expect(dialog).toBeHidden();
    placementRelease();
    await page.waitForTimeout(200);

    await page.getByRole("button", { name: "Plan Encounter" }).click();
    const reopenedDialog = page.getByRole("dialog", { name: "Encounter builder" });
    await expect(reopenedDialog).toBeVisible();
    await reopenedDialog.getByRole("button", { name: new RegExp(encounter.name) }).click();
    const replayResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith("/api/v1/scenes/scn_vault_entry/encounter-monster-placements")
      && response.request().method() === "POST"
      && response.headers()["idempotency-replayed"] === "true"
    );
    await reopenedDialog.getByRole("button", { name: "Place monsters on scene" }).click();
    const replayResponse = await replayResponsePromise;
    expect(replayResponse.status()).toBe(200);
    const replayedResult = await replayResponse.json() as PlacementResult;
    expect(placementRequestCount).toBe(2);
    expect(placementKeys[1]).toBe(placementKeys[0]);
    expect(placementBodies[1]).toBe(placementBodies[0]);
    expect(replayedResult).toEqual(committedResult);
    expect(replayedResult.placements).toHaveLength(3);

    const actors = await expectJsonResponse<E2EActor[]>(await page.request.get(apiBaseUrl + "/api/v1/campaigns/camp_demo/actors", { headers: gmApiHeaders }));
    const tokens = await expectJsonResponse<E2EToken[]>(await page.request.get(apiBaseUrl + "/api/v1/scenes/scn_vault_entry/tokens", { headers: gmApiHeaders }));
    const placedActorIds = new Set(replayedResult.placements.map((placement) => placement.actor.id));
    const placedTokenIds = new Set(replayedResult.placements.map((placement) => placement.sceneToken.id));
    expect(actors).toHaveLength(baselineActors.length + 3);
    expect(tokens).toHaveLength(baselineTokens.length + 3);
    expect(actors.filter((actor) => placedActorIds.has(actor.id))).toHaveLength(3);
    expect(tokens.filter((token) => placedActorIds.has(token.actorId ?? "") && placedTokenIds.has(token.id))).toHaveLength(3);
  } finally {
    placementRelease();
    await page.unrouteAll({ behavior: "ignoreErrors" });
    for (const [index, placement] of (committedResult?.placements ?? []).entries()) {
      const deleteTokenResponse = await page.request.delete(
        expectedUpdatedAtUrl(apiBaseUrl + "/api/v1/tokens/" + placement.sceneToken.id, placement.sceneToken.updatedAt),
        { headers: gmMutationHeaders("delete-atomic-placement-token-" + index) },
      );
      if (deleteTokenResponse.status() !== 404) await expectJsonResponse(deleteTokenResponse);
      const deleteActorResponse = await page.request.delete(
        expectedUpdatedAtUrl(apiBaseUrl + "/api/v1/actors/" + placement.actor.id, placement.actor.updatedAt),
        { headers: gmMutationHeaders("delete-atomic-placement-actor-" + index) },
      );
      if (deleteActorResponse.status() !== 404) await expectJsonResponse(deleteActorResponse);
    }
    const currentEncounterResponse = await page.request.get(`${apiBaseUrl}/api/v1/encounters/${encounter.id}`, {
      headers: gmApiHeaders,
    });
    if (currentEncounterResponse.status() !== 404) {
      const currentEncounter = await expectJsonResponse<{ updatedAt: string }>(currentEncounterResponse);
      const deleteEncounterResponse = await page.request.delete(
        expectedUpdatedAtUrl(`${apiBaseUrl}/api/v1/encounters/${encounter.id}`, currentEncounter.updatedAt),
        { headers: gmMutationHeaders("delete-cancelled-encounter") },
      );
      if (deleteEncounterResponse.status() !== 404) await expectJsonResponse(deleteEncounterResponse);
    }
  }
});

test("player can accept an invite from a private browser session", async ({ browser, page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  await openManageCategory(page, "People");

  await page.getByRole("textbox", { name: "Invite email", exact: true }).fill("e2e.invited@example.test");
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  const createdInviteToken = page.locator('input[aria-label="Invite token"][readonly]');
  await expect(createdInviteToken).toHaveValue(/^oti_/);
  const inviteToken = await createdInviteToken.inputValue();
  expect(inviteToken).toMatch(/^oti_/);
  const createdInviteLink = page.getByRole("textbox", { name: "Invite link" });
  await expect(createdInviteLink).toHaveValue(new RegExp(`/join\\?invite=${inviteToken}$`));
  await page.evaluate(async ({ apiBaseUrl }) => {
    const bearer = localStorage.getItem("otte:sessionToken");
    if (!bearer) throw new Error("No browser session token available for hidden-scene setup");
    const headers = { authorization: `Bearer ${bearer}` };
    const campaigns = await fetch(`${apiBaseUrl}/api/v1/campaigns`, { headers }).then((response) => response.json());
    const campaign = campaigns.find((item: { name?: string }) => item.name === "The Ember Vault") ?? campaigns[0];
    if (!campaign) throw new Error("No campaign available for hidden-scene setup");
    const response = await fetch(`${apiBaseUrl}/api/v1/campaigns/${campaign.id}/scenes`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "idempotency-key": `e2e-hidden-scene-create:${crypto.randomUUID()}`,
      },
      body: JSON.stringify({
        name: "GM Prep Hidden Scene",
        active: false,
        folder: "gm-prep",
        width: 900,
        height: 700,
        gridSize: 50,
        expectedUpdatedAt: campaign.updatedAt,
      })
    });
    if (!response.ok) throw new Error(await response.text());
  }, { apiBaseUrl });
  await page.reload();
  await expect(sceneTab(page, "GM Prep Hidden Scene")).toBeVisible();

  const origin = new URL(page.url()).origin;
  const privateContext = await browser.newContext();
  const privatePage = await privateContext.newPage();
  const createdTokenIds: string[] = [];
  try {
    await privatePage.goto(`${origin}/join?invite=${encodeURIComponent(inviteToken)}`);
    await expect(privatePage.locator(".section-title", { hasText: "Accept Invite" })).toBeVisible();
    await expect(privatePage.getByRole("textbox", { name: "Public invite token" })).toHaveValue(inviteToken);
    await privatePage.getByRole("textbox", { name: "Join email" }).fill("e2e.invited@example.test");
    await privatePage.getByRole("textbox", { name: "Display name" }).fill("E2E Invited Player");
    await privatePage.getByLabel("Join password").fill("correct horse");
    await privatePage.getByRole("button", { name: "Accept Invite" }).click();

    await expect(privatePage.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
    await expect(privatePage.getByText("Campaign Settings")).not.toBeVisible();
    await expect(sceneTab(privatePage, "Vault Entry")).toBeVisible();
    await expect(sceneTab(privatePage, "GM Prep Hidden Scene")).toHaveCount(0);
    await expect(privatePage.getByRole("tab", { name: "Chat", exact: true })).toBeVisible();

    await submitChatCommand(page, "Realtime GM broadcast");
    await openInspectorPanel(privatePage, "Chat");
    await expect(privatePage.locator('[aria-label="Chat messages"]')).toContainText("Realtime GM broadcast");

    await submitChatCommand(privatePage, '/w "Demo GM" Realtime player whisper');
    await openInspectorPanel(page, "Chat");
    await expect(page.locator('[aria-label="Chat messages"]')).toContainText("Realtime player whisper");

    await submitChatCommand(privatePage, "/roll 1d20+1");
    await expect(privatePage.getByRole("status").filter({ hasText: /^Rolled \d+$/ })).toBeVisible();
    await submitChatCommand(privatePage, "/gmroll 1d20+2");
    await expect(privatePage.getByRole("status").filter({ hasText: /^Rolled \d+$/ })).toBeVisible();
    const playerRolls = await privatePage.evaluate(async ({ apiBaseUrl }) => {
      const bearer = localStorage.getItem("otte:sessionToken");
      if (!bearer) throw new Error("No browser session token available for roll lookup");
      const response = await fetch(`${apiBaseUrl}/api/v1/campaigns/camp_demo/rolls`, {
        headers: { authorization: `Bearer ${bearer}` }
      });
      if (!response.ok) throw new Error(await response.text());
      return (await response.json()) as Array<{ formula?: string; visibility?: string }>;
    }, { apiBaseUrl });
    expect(playerRolls.some((roll) => roll.formula === "1d20+1" && roll.visibility === "public")).toBe(true);
    expect(playerRolls.some((roll) => roll.formula === "1d20+2" && roll.visibility === "gm_only")).toBe(false);

    const playerUserId = await privatePage.evaluate(() => localStorage.getItem("otte:userId"));
    expect(playerUserId).toBeTruthy();
    const tokenSuffix = Date.now().toString(36);
    const playerActor = await createSystemCharacter(page, {
      templateId: "fighter",
      name: `E2E Player Fighter ${tokenSuffix}`,
      ownerUserId: playerUserId!,
      advanceToLevel: 2
    });
    const ownedToken = await createSceneToken(page, { name: `E2E Owned ${tokenSuffix}`, x: 430, y: 350, ownerUserIds: [playerUserId!], actorId: playerActor.id });
    const unownedToken = await createSceneToken(page, { name: `E2E Unowned ${tokenSuffix}`, x: 560, y: 360, ownerUserIds: [] });
    createdTokenIds.push(ownedToken.id, unownedToken.id);

    await privatePage.reload();
    await expect(privatePage.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
    await expect(sceneTab(privatePage, "Vault Entry")).toBeVisible();
    await expect(privatePage.getByRole("button", { name: `Token ${ownedToken.name}` })).toBeVisible();
    await expect(privatePage.getByRole("button", { name: `Token ${unownedToken.name}` })).toBeVisible();
    await privatePage.getByRole("button", { name: `Token ${ownedToken.name}` }).click();
    await privatePage.getByRole("tab", { name: "Actors", exact: true }).click();
    const actorPanel = selectedActorPanel(privatePage);
    await expect(actorPanel.getByRole("heading", { name: playerActor.name })).toBeVisible();
    await expect(actorPanel.locator(".metric-row", { hasText: "Resources" })).toContainText("Action Surge 1/1");
    await privatePage.getByRole("tab", { name: "Actions" }).click();
    const playerActionSheet = privatePage.getByRole("region", { name: "Actor action sheet" });
    const actionSurgeCard = playerActionSheet.locator("article", { hasText: "Action Surge" }).first();
    await expect(actionSurgeCard).toContainText("roll only action");
    await clickAndConfirmPreparedDndAction(actionSurgeCard.getByRole("button", { name: "Use action" }));
    await expect(privatePage.getByText(new RegExp(`${playerActor.name} used action: Action Surge 0`))).toBeVisible();
    await expect(actorPanel.locator(".metric-row", { hasText: "Resources" })).toContainText("Action Surge 0/1");

    const ownedBefore = await getSceneTokenById(page, ownedToken.id);
    await dragTokenByName(privatePage, ownedToken.name, 120, 70);
    await expect
      .poll(async () => {
        const token = await getSceneTokenById(page, ownedToken.id);
        return token.x !== ownedBefore.x || token.y !== ownedBefore.y;
      })
      .toBe(true);

    const unownedBefore = await getSceneTokenById(page, unownedToken.id);
    await dragTokenByName(privatePage, unownedToken.name, -90, 50);
    await page.waitForTimeout(300);
    const unownedAfter = await getSceneTokenById(page, unownedToken.id);
    expect(unownedAfter).toEqual(expect.objectContaining({ x: unownedBefore.x, y: unownedBefore.y }));
  } finally {
    for (const tokenId of createdTokenIds) {
      await deleteTokenById(page, tokenId).catch(() => undefined);
    }
    await privateContext.close();
  }
});

test("quick scene creation stays draft and dirty scene edits block navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await openManageCategory(page, "Scenes");
  await openCreateDrawer(page, "New scene");

  const sceneName = `Quick Draft ${Date.now().toString(36)}`;
  const sceneFolder = `dirty-guard-${Date.now().toString(36)}`;
  await page.getByRole("textbox", { name: "Scene name", exact: true }).fill(sceneName);
  await page.getByRole("textbox", { name: "Scene folder", exact: true }).fill(sceneFolder);
  await page.getByRole("checkbox", { name: "Activate for players", exact: true }).check();
  await closeManage(page);
  await page.getByRole("button", { name: "Prep", exact: true }).click();
  await page.getByRole("button", { name: "Add draft scene after newest scene" }).click();
  await expect(sceneTab(page, sceneName)).toBeVisible();

  const createdScene = await page.evaluate(async ({ apiBaseUrl, sceneName }) => {
    const bearer = localStorage.getItem("otte:sessionToken");
    if (!bearer) throw new Error("No browser session token available for scene verification");
    const headers = { authorization: `Bearer ${bearer}` };
    const campaigns = await fetch(`${apiBaseUrl}/api/v1/campaigns`, { headers }).then((response) => response.json());
    const campaign = campaigns.find((item: { name?: string }) => item.name === "The Ember Vault") ?? campaigns[0];
    const scenes = await fetch(`${apiBaseUrl}/api/v1/campaigns/${campaign.id}/scenes`, { headers }).then((response) => response.json());
    return scenes.find((scene: { name?: string }) => scene.name === sceneName) as { id: string; active: boolean; updatedAt: string } | undefined;
  }, { apiBaseUrl, sceneName });
  expect(createdScene).toMatchObject({ active: false });

  await sceneTab(page, "Vault Entry").click();
  await openManageCategory(page, "Scenes");
  const editName = page.getByRole("textbox", { name: "Edit scene name" });
  await expect(page.getByRole("checkbox", { name: /Active player scene/ })).toBeDisabled();
  await editName.fill("Vault Entry unsaved");
  const managePanel = page.getByRole("region", { name: "Manage workspace panel" });
  const folderFilter = page.getByRole("combobox", { name: "Scene folder filter" });
  await folderFilter.selectOption(sceneFolder);
  await expect(folderFilter).toHaveValue("all");
  await expect(editName).toHaveValue("Vault Entry unsaved");
  await page.getByRole("button", { name: "Select visible scenes" }).click();
  const duplicateSelectedButtons = page.locator("button", { hasText: "Duplicate selected scenes" });
  await expect(duplicateSelectedButtons).toHaveCount(2);
  await expect(duplicateSelectedButtons.nth(0)).toBeDisabled();
  await expect(duplicateSelectedButtons.nth(1)).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(managePanel).toBeVisible();
  await expect(editName).toHaveValue("Vault Entry unsaved");
  await page.keyboard.press("Control+K");
  await page.getByRole("textbox", { name: "Command palette search" }).fill("Go to Prep");
  await page.keyboard.press("Enter");
  await expect(managePanel).toBeVisible();
  await expect(editName).toHaveValue("Vault Entry unsaved");
  await managePanel.getByRole("button", { name: "Close", exact: true }).click();
  await expect(managePanel).toBeVisible();
  await expect(editName).toHaveValue("Vault Entry unsaved");
  await expect(statusMessage(page, "Save or discard scene changes before leaving Scene Manager")).toBeVisible();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await closeManage(page);
  await page.getByRole("button", { name: "Prep", exact: true }).click();
  await sceneTab(page, "Vault Entry").click();
  await openManageCategory(page, "Scenes");
  await expect(editName).toHaveValue("Vault Entry");

  await page.evaluate(async ({ apiBaseUrl, sceneId }) => {
    const bearer = localStorage.getItem("otte:sessionToken");
    if (!bearer || !sceneId) return;
    const current = await fetch(`${apiBaseUrl}/api/v1/scenes/${sceneId}`, {
      headers: { authorization: `Bearer ${bearer}` },
    });
    if (current.status === 404) return;
    if (!current.ok) throw new Error(await current.text());
    const scene = await current.json() as { updatedAt: string };
    const deleted = await fetch(
      `${apiBaseUrl}/api/v1/scenes/${sceneId}?expectedUpdatedAt=${encodeURIComponent(scene.updatedAt)}`,
      {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${bearer}`,
          "idempotency-key": `e2e-quick-scene-delete:${crypto.randomUUID()}`,
        },
      },
    );
    if (!deleted.ok && deleted.status !== 404) throw new Error(await deleted.text());
  }, { apiBaseUrl, sceneId: createdScene?.id });
});

test("GM can bulk duplicate selected prep scenes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await openManageCategory(page, "Scenes");
  await expect(page.getByText("Scene Manager")).toBeVisible();

  const prefix = `Bulk Prep ${Date.now()}`;
  await openCreateDrawer(page, "New scene");
  const activeForPlayers = page.getByRole("checkbox", { name: "Activate for players", exact: true });
  if (await activeForPlayers.isChecked()) await activeForPlayers.uncheck();

  await page.getByRole("textbox", { name: "Scene name", exact: true }).fill(`${prefix} A`);
  await page.getByRole("button", { name: "Add Scene", exact: true }).click();
  await expect(sceneTab(page, `${prefix} A`)).toBeVisible();
  await page.getByRole("textbox", { name: "Scene name", exact: true }).fill(`${prefix} B`);
  await page.getByRole("button", { name: "Add Scene", exact: true }).click();
  await expect(sceneTab(page, `${prefix} B`)).toBeVisible();

  await page.getByRole("textbox", { name: "Scene search" }).fill(prefix);
  await expect(page.getByRole("status", { name: "Scene filter summary" })).toContainText("2 of");
  await page.getByRole("button", { name: "Select visible scenes" }).click();
  await expect(page.getByRole("status", { name: "Scene selection summary" })).toContainText("2 selected");
  const previewRequestPromise = page.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname.endsWith("/scene-duplications"));
  await page.getByRole("button", { name: "Duplicate selected scenes" }).click();
  const previewRequest = await previewRequestPromise;
  expect(previewRequest.postDataJSON()).toMatchObject({ dryRun: true, sources: [{}, {}] });
  const review = page.getByRole("region", { name: "Scene duplication review" });
  await expect(review).toBeVisible();
  await expect(review.getByRole("list", { name: "Planned scene copies" })).toContainText(`${prefix} A Copy`);
  await expect(review.getByRole("list", { name: "Planned scene copies" })).toContainText(`${prefix} B Copy`);
  const commitResponsePromise = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/scene-duplications") && response.status() === 201);
  await review.getByRole("button", { name: "Confirm duplicate selected scenes" }).click();
  const commitResponse = await commitResponsePromise;
  expect(commitResponse.request().postDataJSON()).toMatchObject({ dryRun: false, sources: [{}, {}] });
  await expect(page.getByText(/Duplicated 2 scenes, \d+ tokens, and \d+ actors atomically/)).toBeVisible();
  await expect(page.getByRole("status", { name: "Scene selection summary" })).toContainText("2 selected");

  await page.reload();
  await openManageCategory(page, "Scenes");
  await page.getByRole("textbox", { name: "Scene search" }).fill(`${prefix} A Copy`);
  await expect(sceneTab(page, `${prefix} A Copy`)).toBeVisible();
  await page.getByRole("textbox", { name: "Scene search" }).fill(`${prefix} B Copy`);
  await expect(sceneTab(page, `${prefix} B Copy`)).toBeVisible();
});

test("failed prep scene duplication leaves no partial copies", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await openManageCategory(page, "Scenes");

  const prefix = `Failed Bulk Prep ${Date.now()}`;
  await openCreateDrawer(page, "New scene");
  const activeForPlayers = page.getByRole("checkbox", { name: "Activate for players", exact: true });
  if (await activeForPlayers.isChecked()) await activeForPlayers.uncheck();
  for (const suffix of ["A", "B"]) {
    await page.getByRole("textbox", { name: "Scene name", exact: true }).fill(`${prefix} ${suffix}`);
    await page.getByRole("button", { name: "Add Scene", exact: true }).click();
    await expect(sceneTab(page, `${prefix} ${suffix}`)).toBeVisible();
  }

  await page.getByRole("textbox", { name: "Scene search" }).fill(prefix);
  await page.getByRole("button", { name: "Select visible scenes" }).click();
  await page.getByRole("button", { name: "Duplicate selected scenes" }).click();
  const review = page.getByRole("region", { name: "Scene duplication review" });
  await expect(review).toBeVisible();
  await page.route("**/scene-duplications", async (route) => {
    const body = route.request().postDataJSON() as { dryRun?: boolean };
    if (body.dryRun === false) {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "forced_failure", message: "Forced atomic duplication failure" }) });
      return;
    }
    await route.continue();
  });
  await review.getByRole("button", { name: "Confirm duplicate selected scenes" }).click();
  await expect(page.getByText("Forced atomic duplication failure")).toBeVisible();

  await page.reload();
  await openManageCategory(page, "Scenes");
  await page.getByRole("textbox", { name: "Scene search" }).fill(`${prefix} Copy`);
  await expect(page.getByRole("status", { name: "Scene filter summary" })).toContainText("0 of");
  await expect(sceneTab(page, `${prefix} A Copy`)).toHaveCount(0);
  await expect(sceneTab(page, `${prefix} B Copy`)).toHaveCount(0);
});

test("character at 0 HP resolves Death Saving Throws from the sheet to a terminal state", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  const suffix = Date.now().toString(36);
  const hero = await createSystemCharacter(page, { templateId: "cleric", name: `E2E Dying Hero ${suffix}`, ownerUserId: "usr_demo_gm" });
  await createSceneToken(page, { name: `E2E Dying Token ${suffix}`, actorId: hero.id, x: 640, y: 320, ownerUserIds: [] });

  await page.reload();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  await page.getByRole("button", { name: `Token E2E Dying Token ${suffix}` }).click();
  await openInspectorPanel(page, "Actors");
  const actorPanel = selectedActorPanel(page);
  await expect(actorPanel).toContainText(`E2E Dying Hero ${suffix}`);

  // A healthy character has core rolls but no Death Saving Throw affordance.
  const statsSheet = actorPanel.getByRole("region", { name: "Actor stats sheet" });
  await expect(statsSheet.getByRole("button", { name: /Roll Strength check/ })).toBeVisible();
  await expect(statsSheet.locator(".actor-death-save-row")).toHaveCount(0);

  await openActorDisclosure(actorPanel, "Actor details");
  const hpUpdate = page.waitForResponse((response) => response.request().method() === "PATCH" && /\/api\/v1\/actors\/[^/]+$/.test(new URL(response.url()).pathname));
  await page.locator("#actor-hp").fill("0");
  await page.locator("#actor-hp").blur();
  await expectJsonResponse(await hpUpdate);

  const deathSaveRow = statsSheet.locator(".actor-death-save-row");
  await expect(deathSaveRow).toContainText("Death saves 0/3 - 0/3");
  const rollButton = deathSaveRow.getByRole("button", { name: /Roll Death Saving Throw/ });
  await expect(rollButton).toBeVisible();

  // Each roll adds at least one counter or revives, so a terminal outcome
  // (Stable, Dead, or natural-20 revival) always arrives within five rolls.
  let terminal: "stable" | "dead" | "revived" | undefined;
  for (let attempt = 0; attempt < 5 && !terminal; attempt += 1) {
    const commit = page.waitForResponse((response) =>
      response.request().method() === "POST" &&
      /\/actors\/[^/]+\/roll$/.test(new URL(response.url()).pathname) &&
      (response.request().postData() ?? "").includes("death-save") &&
      response.ok()
    );
    await rollButton.click();
    const committed = await expectJsonResponse<{ resolution?: { deathSave?: { result?: "revived" | "stable" | "dead"; successes: number; failures: number } } }>(await commit);
    const outcome = committed.resolution?.deathSave;
    expect(outcome).toBeTruthy();
    await expect(statusMessage(page, /Death Saving Throw/)).toBeVisible();
    terminal = outcome?.result;
    if (!terminal) {
      await expect(deathSaveRow).toContainText(`Death saves ${outcome!.successes}/3 - ${outcome!.failures}/3`);
    }
  }
  expect(terminal).toBeTruthy();

  const persistedActor = await getActorById(page, hero.id);
  if (terminal === "revived") {
    expect(persistedActor.data).toMatchObject({ hp: { current: 1 }, deathSaves: { successes: 0, failures: 0 }, lifeState: "conscious" });
    await expect.poll(async () => await page.locator("#actor-hp").inputValue()).toBe("1");
    await expect(statsSheet.locator(".actor-death-save-row")).toHaveCount(0);
  } else {
    expect(persistedActor.data).toMatchObject(
      terminal === "stable"
        ? { hp: { current: 0 }, deathSaves: { successes: 0, failures: 0 }, lifeState: "stable" }
        : { hp: { current: 0 }, deathSaves: { failures: 3 }, lifeState: "dead" }
    );
    await expect(deathSaveRow).toContainText(terminal === "stable" ? "Stable" : "Dead");
    await expect(deathSaveRow.getByRole("button", { name: /Roll Death Saving Throw/ })).toHaveCount(0);
  }

  // The roll and its outcome reach the shared chat history.
  await openInspectorPanel(page, "Chat");
  await expect(page.locator(".chat-message", { hasText: "Death Saving Throw" }).last()).toContainText(/success|failure|natural/);

  // Terminal lifecycle and the Stable 0/0 reset survive a fresh browser load.
  await page.reload();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  await page.getByRole("button", { name: `Token E2E Dying Token ${suffix}` }).click();
  await openInspectorPanel(page, "Actors");
  const reloadedStats = selectedActorPanel(page).getByRole("region", { name: "Actor stats sheet" });
  if (terminal === "revived") {
    await expect(reloadedStats.locator(".actor-death-save-row")).toHaveCount(0);
  } else {
    await expect(reloadedStats.locator(".actor-death-save-row")).toContainText(terminal === "stable" ? "Stable" : "Dead");
    if (terminal === "stable") await expect(reloadedStats.locator(".actor-death-save-row")).toContainText("Death saves 0/3 - 0/3");
  }
});
