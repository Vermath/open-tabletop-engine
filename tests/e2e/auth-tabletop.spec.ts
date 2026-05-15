import { Buffer } from "node:buffer";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const apiBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}`;

interface E2EToken {
  id: string;
  name: string;
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

async function createSystemCharacter(page: Page, input: { templateId: string; name: string; ownerUserId: string; advanceToLevel?: number }): Promise<E2EActor> {
  return page.evaluate(
    async ({ apiBaseUrl, input }) => {
      const bearer = localStorage.getItem("otte:sessionToken");
      if (!bearer) throw new Error("No browser session token available for actor setup");
      const created = await fetch(`${apiBaseUrl}/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters`, {
        method: "POST",
        headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
        body: JSON.stringify({ templateId: input.templateId, name: input.name, ownerUserId: input.ownerUserId })
      });
      if (!created.ok) throw new Error(await created.text());
      let actor = (await created.json()).actor as E2EActor;
      for (let level = 2; level <= (input.advanceToLevel ?? 1); level += 1) {
        const advanced = await fetch(`${apiBaseUrl}/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actor.id}/advance`, {
          method: "POST",
          headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
          body: JSON.stringify({ optionId: "level-up" })
        });
        if (!advanced.ok) throw new Error(await advanced.text());
        actor = (await advanced.json()).actor as E2EActor;
      }
      return actor;
    },
    { apiBaseUrl, input }
  );
}

async function createRulesTargetActor(page: Page, input: { name: string; hp: { current: number; max: number } }): Promise<E2EActor> {
  return page.evaluate(
    async ({ apiBaseUrl, input }) => {
      const bearer = localStorage.getItem("otte:sessionToken");
      if (!bearer) throw new Error("No browser session token available for actor setup");
      const response = await fetch(`${apiBaseUrl}/api/v1/campaigns/camp_demo/actors`, {
        method: "POST",
        headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
        body: JSON.stringify({
          systemId: "dnd-5e-srd",
          ownerUserId: "usr_demo_player",
          type: "character",
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
      const response = await fetch(`${apiBaseUrl}/api/v1/scenes/scn_vault_entry/tokens`, {
        method: "POST",
        headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
        body: JSON.stringify({ ...input, width: 50, height: 50, hidden: false, locked: false, disposition: "neutral" })
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
      const response = await fetch(`${apiBaseUrl}/api/v1/tokens/${tokenId}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${bearer}` }
      });
      if (!response.ok && response.status !== 404) throw new Error(await response.text());
    },
    { apiBaseUrl, tokenId }
  );
}

async function patchTokenConditions(page: Page, tokenId: string, conditions: Array<{ id: string; name: string }>) {
  await page.evaluate(
    async ({ apiBaseUrl, tokenId, conditions }) => {
      const bearer = localStorage.getItem("otte:sessionToken");
      if (!bearer) throw new Error("No browser session token available for token patch");
      const response = await fetch(`${apiBaseUrl}/api/v1/tokens/${tokenId}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
        body: JSON.stringify({ conditions })
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
      const response = await fetch(`${apiBaseUrl}/api/v1/tokens/${token.id}`, { method: "DELETE", headers });
      if (!response.ok) throw new Error(await response.text());
    },
    { apiBaseUrl, name }
  );
}

test("GM can switch selected-token permission presets", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  const tokenPermissionPresets = page.getByLabel("Token permission presets");
  await expect(tokenPermissionPresets).toBeVisible();
  const compendiumBrowser = page.locator('[aria-label="Actor compendium browser"]');
  await compendiumBrowser.getByRole("textbox", { name: "Compendium search" }).fill("Healing Word");
  await compendiumBrowser.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Healing Word imported")).toBeVisible();
  const tokenActionTargets = page.getByLabel("Token action target shortcuts");
  await expect(tokenActionTargets).toContainText("Target Valen Ash");
  await page.getByRole("checkbox", { name: "Targeted" }).click();
  await expect(page.getByText("Token targeted")).toBeVisible();
  await expect(tokenActionTargets).toContainText("Target Valen Ash (marked)");
  const canvasTargetManager = page.getByLabel("Canvas target manager");
  await expect(canvasTargetManager).toContainText("My targets 1 / 1");
  const placedToken = await createSceneToken(page, { name: "Valen Ash", actorId: "act_valen", x: 520, y: 340, ownerUserIds: ["usr_demo_player"] });
  await page.reload();
  await expect(page.getByRole("button", { name: "Token Valen Ash" }).first()).toBeVisible();
  await canvasTargetManager.getByRole("button", { name: "Target visible" }).click();
  await expect(page.getByText("Targeted 2 tokens")).toBeVisible();
  await expect(canvasTargetManager).toContainText("My targets 2 / 2");
  await canvasTargetManager.getByRole("button", { name: "Clear my targets" }).click();
  await expect(page.getByText("Cleared 2 targets")).toBeVisible();
  await expect(canvasTargetManager).toContainText("My targets 0 / 2");
  const targetArea = canvasTargetManager.getByLabel("Canvas target area");
  await targetArea.getByRole("spinbutton", { name: "Target area x" }).fill("0");
  await targetArea.getByRole("spinbutton", { name: "Target area y" }).fill("0");
  await targetArea.getByRole("spinbutton", { name: "Target area width" }).fill("1200");
  await targetArea.getByRole("spinbutton", { name: "Target area height" }).fill("800");
  await expect(targetArea.getByLabel("Target area preview")).toContainText("2 tokens in area");
  await expect(targetArea.getByLabel("Target area preview")).toContainText("Valen Ash");
  await targetArea.getByRole("button", { name: "Target area" }).click();
  await expect(page.getByText("Targeted 2 tokens")).toBeVisible();
  await expect(canvasTargetManager).toContainText("My targets 2 / 2");
  await targetArea.getByRole("button", { name: "Clear area targets" }).click();
  await expect(page.getByText("Cleared 2 targets")).toBeVisible();
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
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        kind: "drawing",
        label: "Drawing",
        color: "#a78bfa",
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
  await canvasTargetManager.getByRole("button", { name: "Target lasso" }).click();
  await expect(page.getByText("Targeted 2 tokens")).toBeVisible();
  await expect(canvasTargetManager).toContainText("My targets 2 / 2");
  await canvasTargetManager.getByRole("button", { name: "Clear lasso targets" }).click();
  await expect(page.getByText("Cleared 2 targets")).toBeVisible();
  await expect(canvasTargetManager).toContainText("My targets 0 / 2");
  await page.getByRole("button", { name: "Delete latest annotation" }).click();
  await expect(page.getByText("Drawing deleted")).toBeVisible();
  await page.getByRole("checkbox", { name: "Targeted" }).click();
  await expect(page.getByText("Token targeted")).toBeVisible();
  await tokenPermissionPresets.getByRole("button", { name: "Party controlled" }).click();
  await expect(page.getByText("Token updated")).toBeVisible();
  await expect(tokenPermissionPresets).toContainText("Party controlled");
  await expect(page.locator(".metric-row", { hasText: "Token State" })).toContainText("Owners 1");

  await tokenPermissionPresets.getByRole("button", { name: "GM locked" }).click();
  await expect(page.getByText("Token updated")).toBeVisible();
  await expect(tokenPermissionPresets).toContainText("GM locked");
  await expect(page.locator(".metric-row", { hasText: "Token State" })).toContainText("Targeted 1");
  await expect(page.locator(".metric-row", { hasText: "Token State" })).not.toContainText("Owners");
  const selectedTargeted = page.getByRole("checkbox", { name: "Targeted" });
  if (await selectedTargeted.isChecked()) {
    await selectedTargeted.click();
    await expect(page.getByText("Token untargeted")).toBeVisible();
  }
  await deleteTokenById(page, placedToken.id);
});

test("demo GM can reach campaign, scene, and tabletop controls", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
  await page.getByRole("button", { name: "Demo GM" }).click();

  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  await expect(page.getByText("Campaign Settings")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Edit campaign name" })).toHaveValue("The Ember Vault");
  await expect(page.getByText("Delete is audited and removes").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Campaign" })).toBeEnabled();
  await expect(page.getByText("Campaign status: Active")).toBeVisible();
  await page.getByRole("button", { name: "Archive Campaign" }).click();
  await expect(page.getByText("The Ember Vault archived")).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore Campaign" })).toBeVisible();
  await page.getByRole("button", { name: "Restore Campaign" }).click();
  await expect(page.getByText("The Ember Vault restored")).toBeVisible();
  await expect(page.getByText("Campaign status: Active")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete Campaign" })).toBeDisabled();

  await expect(page.getByText("Scene Manager")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Edit scene name" })).toHaveValue("Vault Entry");
  const sceneActivationHistory = page.getByRole("region", { name: "Scene activation history" });
  await expect(sceneActivationHistory).toContainText("Activation history");
  await expect(sceneActivationHistory).toContainText("1 activation");
  const sceneStateComparison = page.getByRole("region", { name: "Scene state comparison" });
  await expect(sceneStateComparison).toContainText("Selected scene");
  await expect(sceneStateComparison).toContainText("Selected scene is the active player scene.");
  await expect(page.getByText("Delete is audited and removes").nth(1)).toBeVisible();
  await page.getByRole("textbox", { name: "Edit scene folder" }).fill("prep/vault");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Vault Entry updated")).toBeVisible();
  await page.getByRole("combobox", { name: "Scene folder filter" }).selectOption("prep/vault");
  await expect(page.getByRole("button", { name: /Vault Entry/ })).toBeVisible();
  await page.getByRole("combobox", { name: "Scene folder filter" }).selectOption("all");
  await expect(page.getByRole("status", { name: "Scene filter summary" })).toContainText("scenes");
  await page.getByRole("textbox", { name: "Scene search" }).fill("Vault Entry");
  await expect(page.getByRole("button", { name: /Vault Entry/ })).toBeVisible();
  await page.getByRole("textbox", { name: "Scene search" }).fill("Missing Scene");
  await expect(page.getByText("No scenes match filters.")).toBeVisible();
  await page.getByRole("textbox", { name: "Scene search" }).fill("");
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Duplicate Scene" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Delete Scene" })).toBeDisabled();
  await page.getByRole("textbox", { name: "Duplicate scene name" }).fill("Vault Entry Reorder");
  await page.getByRole("button", { name: "Duplicate Scene" }).click();
  await expect(page.getByRole("textbox", { name: "Edit scene name" })).toHaveValue("Vault Entry Reorder");
  await expect(sceneStateComparison).toContainText("Vault Entry Reorder");
  await expect(sceneStateComparison).toContainText("Active scene");
  await expect(sceneStateComparison).toContainText("Vault Entry");
  await expect(sceneStateComparison).toContainText("Dimensions");
  await expect(sceneStateComparison).toContainText("Tokens");
  await expect(sceneStateComparison).toContainText("Scene diff details");
  await expect(sceneStateComparison).toContainText("Prep drift review");
  await expect(sceneStateComparison).toContainText("Token roster");
  await expect(sceneStateComparison).toContainText("No token roster drift");
  await expect(sceneStateComparison).toContainText("Background asset");
  await page.getByRole("textbox", { name: "Scene search" }).fill("");
  await page.getByRole("button", { name: "Select visible scenes" }).click();
  await expect(page.getByRole("status", { name: "Scene selection summary" })).toContainText("2 selected");
  await page.getByRole("textbox", { name: "Bulk scene folder" }).fill("prep/selected");
  await page.getByRole("button", { name: "Move selected scenes" }).click();
  await expect(page.getByText("Moved 2 selected scenes to prep/selected")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Edit scene folder" })).toHaveValue("prep/selected");
  await page.getByRole("button", { name: "Clear selected scenes" }).click();
  await expect(page.getByRole("status", { name: "Scene selection summary" })).toContainText("0 selected");
  await page.getByRole("textbox", { name: "Scene search" }).fill("Vault Entry Reorder");
  await page.getByRole("textbox", { name: "Bulk scene folder" }).fill("prep/bulk");
  await page.getByRole("button", { name: "Move visible scenes" }).click();
  await expect(page.getByText("Moved 1 visible scenes to prep/bulk")).toBeVisible();
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
  await page.getByRole("button", { name: "Delete Scene" }).click();
  await expect(page.getByRole("textbox", { name: "Edit scene name" })).toHaveValue("Vault Entry");
  await page.getByRole("button", { name: "Activate", exact: true }).click();
  await expect(page.getByRole("button", { name: "Activate", exact: true })).toBeDisabled();
  await expect(sceneActivationHistory).toContainText("2 activations");

  await expect(page.getByRole("button", { name: "Add token" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Roll dice" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Saved dice formula" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Attack Check - 1d20+5" })).toBeAttached();
  await expect(page.getByRole("button", { name: "Save dice formula" })).toBeVisible();
  const compendiumBrowser = page.locator('[aria-label="Actor compendium browser"]');
  await expect(compendiumBrowser).toContainText("Compendium");
  await compendiumBrowser.getByRole("textbox", { name: "Compendium search" }).fill("Healing Word");
  await expect(compendiumBrowser).toContainText("Healing Word");
  await compendiumBrowser.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Healing Word imported")).toBeVisible();
  await expect(page.locator(".metric-row", { hasText: "Spells" })).toContainText("Healing Word");
  await page.getByRole("tab", { name: "Loadout" }).click();
  const healingWordLoadout = page.getByRole("region", { name: "Actor loadout sheet" }).locator("article", { hasText: "Healing Word" }).first();
  await expect(healingWordLoadout).toContainText("prepared");
  await healingWordLoadout.getByRole("checkbox", { name: "Healing Word prepared" }).click();
  await expect(page.getByText("Healing Word updated")).toBeVisible();
  await expect(healingWordLoadout).toContainText("unprepared");
  await page.getByRole("tab", { name: "Actions" }).click();
  await expect(page.getByRole("region", { name: "Actor action sheet" })).toContainText("Healing Word Healing");
  await expect(page.getByRole("combobox", { name: "Action target actor" })).toBeVisible();
  await page.getByRole("combobox", { name: "Action target actor" }).selectOption({ label: "Valen Ash" });
  await page.getByRole("checkbox", { name: "Apply action effect" }).check();
  await page.getByRole("checkbox", { name: "Consume action resources" }).uncheck();
  await page.getByRole("button", { name: "Use Healing Word Healing" }).click();
  await expect(page.getByText(/Valen Ash (used action|action posted).*applied/)).toBeVisible();
  await page.getByRole("button", { name: "Token Valen Ash" }).first().click();
  await page.getByRole("textbox", { name: "Token conditions" }).fill("Marked, Blessed");
  await page.getByRole("textbox", { name: "Token conditions" }).blur();
  await expect(page.getByText("Token updated")).toBeVisible();
  await page.getByRole("textbox", { name: "Token auras" }).fill("Guardian Aura:15:#38bdf8");
  await page.getByRole("textbox", { name: "Token auras" }).blur();
  await expect(page.getByText("Guardian Aura 15")).toBeVisible();
  await page.getByRole("textbox", { name: "Token notes" }).fill("Hold the vault doorway.");
  await page.getByRole("textbox", { name: "Token notes" }).blur();
  await expect(page.getByText("Token updated")).toBeVisible();
  const tokenOwners = page.locator('[aria-label="Token owners"]');
  await tokenOwners.getByRole("checkbox", { name: "Demo Player" }).click();
  await expect(page.getByText("Token updated")).toBeVisible();
  await expect(page.locator(".metric-row", { hasText: "Token State" })).toContainText("Owners 1");
  await page.getByRole("checkbox", { name: "Targeted" }).click();
  await expect(page.getByText("Token targeted")).toBeVisible();
  const sceneBoard = page.locator(".scene-board").first();
  await page.getByRole("combobox", { name: "Token actor" }).selectOption("act_valen");
  await page.getByRole("button", { name: "Add token" }).click();
  await expect(page.getByText("Valen Ash created")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Token inspector name" })).toHaveValue("Valen Ash");
  await deleteNewestTokenByName(page, "Valen Ash");
  const box = await sceneBoard.boundingBox();
  expect(box).not.toBeNull();
  await page.getByRole("textbox", { name: "Token name" }).fill("AOE Target");
  await page.getByRole("button", { name: "Token", exact: true }).click();
  await expect(page.getByText("AOE Target created")).toBeVisible();
  const aoeTarget = await getNewestSceneTokenByName(page, "AOE Target");
  await patchTokenConditions(page, aoeTarget.id, [
    { id: "resistant-fire", name: "Resistant fire" },
    { id: "concentrating", name: "Concentrating" }
  ]);
  const annotationPanel = page.getByRole("region", { name: "Annotation layers and history" });
  await annotationPanel.getByRole("textbox", { name: "Annotation group label" }).fill("E2E Markup");
  await annotationPanel.getByRole("combobox", { name: "Annotation layer" }).selectOption("measurement");
  await expect(annotationPanel.getByRole("region", { name: "Annotation history" })).toBeVisible();
  await page.getByRole("button", { name: "Ping" }).click();
  await sceneBoard.click({ position: { x: Math.round(box!.width * 0.62), y: Math.round(box!.height * 0.38) } });
  await expect(page.getByText("Ping added")).toBeVisible();
  await expect(annotationPanel.getByRole("region", { name: "Annotation group summary" })).toContainText("E2E Markup");
  await page.getByRole("button", { name: "Ruler" }).click();
  const rulerBox = await sceneBoard.boundingBox();
  expect(rulerBox).not.toBeNull();
  await sceneBoard.hover({ position: { x: Math.round(rulerBox!.width * 0.8), y: Math.round(rulerBox!.height * 0.66) } });
  await page.mouse.down();
  await page.mouse.move(rulerBox!.x + rulerBox!.width * 0.95, rulerBox!.y + rulerBox!.height * 0.66);
  await page.mouse.up();
  await expect(page.getByText("Ruler added")).toBeVisible();
  await expect(page.locator(".scene-annotation.ruler")).toBeVisible();
  await expect(annotationPanel.getByRole("region", { name: "Annotation layer summary" })).toContainText("Measurement");
  await expect(annotationPanel.getByRole("region", { name: "Annotation layer summary" })).toContainText("2");
  await expect(annotationPanel.getByRole("region", { name: "Annotation history" })).toContainText("Create Ruler");
  await expect(annotationPanel.getByRole("checkbox", { name: "Snap templates to grid" })).toBeChecked();
  await annotationPanel.getByRole("combobox", { name: "Annotation layer" }).selectOption("effects");
  await annotationPanel.getByRole("combobox", { name: "Template shape" }).selectOption("line");
  await annotationPanel.getByRole("combobox", { name: "Template save ability" }).selectOption("dexterity");
  await annotationPanel.getByRole("spinbutton", { name: "Template save DC" }).fill("15");
  await annotationPanel.getByRole("textbox", { name: "Template damage formula" }).fill("6");
  await annotationPanel.getByRole("textbox", { name: "Template damage type" }).fill("fire");
  await page.getByRole("button", { name: "Area template" }).click();
  const templateBox = await sceneBoard.boundingBox();
  expect(templateBox).not.toBeNull();
  await sceneBoard.hover({ position: { x: Math.round(templateBox!.width * 0.8), y: Math.round(templateBox!.height * 0.5) } });
  await page.mouse.down();
  await page.mouse.move(templateBox!.x + templateBox!.width * 0.5, templateBox!.y + templateBox!.height * 0.5);
  await page.mouse.up();
  await expect(page.getByText("Template added")).toBeVisible();
  await expect(annotationPanel.getByRole("region", { name: "Annotation layer summary" })).toContainText("Effects");
  await expect(annotationPanel.getByRole("region", { name: "Annotation history" })).toContainText("Create Template");
  await expect(annotationPanel.getByRole("region", { name: "Area template automation" })).toContainText("Snapped Line template");
  await expect(annotationPanel.getByRole("region", { name: "Area template automation" })).toContainText("1 affected - dnd-5e-srd");
  await expect(annotationPanel.getByRole("region", { name: "Area template automation" })).toContainText("Line template: 1 affected token");
  await expect(annotationPanel.getByRole("region", { name: "Area template automation" })).toContainText("Dexterity save DC 15");
  await expect(annotationPanel.getByRole("region", { name: "Area template automation" })).toContainText("damage 6 fire");
  await annotationPanel.getByRole("checkbox", { name: "Show Effects annotations" }).uncheck();
  await expect(page.getByText("Effects annotations hidden")).toBeVisible();
  await expect(page.locator(".scene-annotation.template")).toHaveCount(0);
  await annotationPanel.getByRole("checkbox", { name: "Show Effects annotations" }).check();
  await expect(page.getByText("Effects annotations shown")).toBeVisible();
  await expect(page.locator(".scene-annotation.template")).toBeVisible();
  await annotationPanel.getByRole("button", { name: "Target affected" }).click();
  await expect(page.getByText("Targeted 1 tokens")).toBeVisible();
  await annotationPanel.getByRole("button", { name: "Roll damage" }).click();
  await expect(page.getByText("Template damage 6")).toBeVisible();
  await annotationPanel.getByRole("button", { name: "Apply damage" }).click();
  await expect(page.getByText("Applied template damage to 1 tokens")).toBeVisible();
  const damagedTarget = await getSceneTokenById(page, aoeTarget.id);
  expect(damagedTarget.conditions?.map((condition) => condition.name)).toContain("Damaged 3 fire (resisted; concentration DC 10)");
  await annotationPanel.getByRole("button", { name: "Resolve saves" }).click();
  await expect(page.getByText("Resolved saves for 1 tokens")).toBeVisible();
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
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
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
  await expect(page.getByText("Select tool active")).toBeVisible();
  const rulerHandle = page.getByRole("button", { name: "Move Ruler annotation in E2E Markup" });
  await expect(rulerHandle).toBeVisible();
  const rulerHandleBox = await rulerHandle.boundingBox();
  expect(rulerHandleBox).not.toBeNull();
  await page.mouse.move(rulerHandleBox!.x + rulerHandleBox!.width / 2, rulerHandleBox!.y + rulerHandleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(rulerHandleBox!.x + rulerHandleBox!.width / 2 + 26, rulerHandleBox!.y + rulerHandleBox!.height / 2 + 18);
  await page.mouse.up();
  await expect(page.getByText("Moved Ruler annotation")).toBeVisible();
  await expect(annotationPanel.getByRole("region", { name: "Annotation history" })).toContainText("Update");
  const templateEndHandle = page.getByRole("button", { name: "Edit end Template annotation in E2E Markup" });
  await expect(templateEndHandle).toBeVisible();
  const templateEndHandleBox = await templateEndHandle.boundingBox();
  expect(templateEndHandleBox).not.toBeNull();
  await page.mouse.move(templateEndHandleBox!.x + templateEndHandleBox!.width / 2, templateEndHandleBox!.y + templateEndHandleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(templateEndHandleBox!.x + templateEndHandleBox!.width / 2 - 34, templateEndHandleBox!.y + templateEndHandleBox!.height / 2 - 22);
  await page.mouse.up();
  await expect(page.getByText("Moved Template annotation")).toBeVisible();
  await expect(annotationPanel.getByRole("region", { name: "Area template automation" })).toContainText("Line template");
  const drawingEndHandle = page.getByRole("button", { name: "Edit path end Drawing annotation in E2E Markup" });
  await expect(drawingEndHandle).toBeVisible();
  const drawingEndHandleBox = await drawingEndHandle.boundingBox();
  expect(drawingEndHandleBox).not.toBeNull();
  await page.mouse.move(drawingEndHandleBox!.x + drawingEndHandleBox!.width / 2, drawingEndHandleBox!.y + drawingEndHandleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(drawingEndHandleBox!.x + drawingEndHandleBox!.width / 2 + 28, drawingEndHandleBox!.y + drawingEndHandleBox!.height / 2 - 18);
  await page.mouse.up();
  await expect(page.getByText("Moved Drawing annotation")).toBeVisible();
  await annotationPanel.getByRole("button", { name: "Nudge annotation group E2E Markup" }).click();
  await expect(page.getByText("Moved 4 annotations in E2E Markup")).toBeVisible();
  const recolorGroup = annotationPanel.getByRole("button", { name: "Recolor annotation group E2E Markup" });
  await recolorGroup.focus();
  await expect(recolorGroup).toBeFocused();
  await recolorGroup.press("Enter");
  await expect(page.getByText("Recolored 4 annotations in E2E Markup")).toBeVisible();
  await expect(annotationPanel.getByRole("region", { name: "Annotation history" })).toContainText("Update");
  const deleteGroup = annotationPanel.getByRole("button", { name: "Delete annotation group E2E Markup" });
  await deleteGroup.focus();
  await expect(deleteGroup).toBeFocused();
  await deleteGroup.press("Enter");
  await expect(page.getByText("Deleted 4 annotations in E2E Markup")).toBeVisible();
  await expect(annotationPanel.getByRole("region", { name: "Annotation layer summary" })).toContainText("No annotations yet");
  await expect(page.locator(".scene-annotation")).toHaveCount(0);
  await deleteNewestTokenByName(page, "AOE Target");
  await page.getByRole("button", { name: "Roll dice" }).click();
  await expect(page.getByRole("combobox", { name: "Whisper recipient" })).toBeDisabled();
  await page.getByRole("combobox", { name: "Chat visibility" }).selectOption("whisper");
  await expect(page.getByRole("combobox", { name: "Whisper recipient" })).toBeEnabled();
  await page.getByRole("combobox", { name: "Chat visibility" }).selectOption("public");
  await expect(page.getByRole("textbox", { name: "Chat message" })).toBeVisible();
  await page.getByRole("textbox", { name: "Chat message" }).fill("E2E moderation checkpoint");
  await page.getByRole("button", { name: "Send chat message" }).click();
  await page.getByRole("combobox", { name: "Chat visibility" }).selectOption("gm_only");
  await page.getByRole("textbox", { name: "Chat message" }).fill("E2E GM moderation checkpoint");
  await page.getByRole("button", { name: "Send chat message" }).click();
  await page.getByRole("combobox", { name: "Chat visibility" }).selectOption("public");

  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(page.getByText("Chat History")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Chat history search" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Chat history type" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Chat history visibility" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Chat export format" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export chat history" })).toBeVisible();
  const publicChatRoot = page.locator("article", { hasText: "E2E moderation checkpoint" }).first();
  await publicChatRoot.getByRole("button", { name: "Reply" }).click();
  await expect(page.getByRole("status", { name: "Chat reply target" })).toContainText("E2E moderation checkpoint");
  await page.getByRole("textbox", { name: "Chat message" }).fill("E2E threaded reply");
  await page.getByRole("button", { name: "Send chat message" }).click();
  await expect(page.getByRole("region", { name: "Chat reply threads" })).toContainText("1 replies");
  await expect(page.getByRole("region", { name: "Chat reply threads" })).toContainText("E2E moderation checkpoint");
  await expect(page.locator('[aria-label="Chat reply context"]').first()).toContainText("E2E moderation checkpoint");
  const chatExportDirectory = mkdtempSync(join(tmpdir(), "otte-e2e-chat-export-"));
  await page.getByRole("combobox", { name: "Chat export format" }).selectOption("json");
  const chatJsonExportDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export chat history" }).click();
  const chatJsonExportDownload = await chatJsonExportDownloadPromise;
  expect(chatJsonExportDownload.suggestedFilename()).toMatch(/^chat-camp_demo-\d{4}-\d{2}-\d{2}\.json$/);
  const chatJsonExportPath = join(chatExportDirectory, chatJsonExportDownload.suggestedFilename());
  await chatJsonExportDownload.saveAs(chatJsonExportPath);
  const chatJsonExport = JSON.parse(readFileSync(chatJsonExportPath, "utf8")) as { messages: Array<{ body?: string; visibility?: string; replyToMessageId?: string }> };
  expect(chatJsonExport.messages.some((message) => message.body === "E2E moderation checkpoint" && message.visibility === "public")).toBe(true);
  expect(chatJsonExport.messages.some((message) => message.body === "E2E GM moderation checkpoint" && message.visibility === "gm_only")).toBe(true);
  expect(chatJsonExport.messages.some((message) => message.body === "E2E threaded reply" && message.replyToMessageId)).toBe(true);
  await expect(page.getByText("Exported chat history as json")).toBeVisible();
  await page.getByRole("combobox", { name: "Chat export format" }).selectOption("ndjson");
  const chatExportDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export chat history" }).click();
  const chatExportDownload = await chatExportDownloadPromise;
  expect(chatExportDownload.suggestedFilename()).toMatch(/^chat-camp_demo-\d{4}-\d{2}-\d{2}\.ndjson$/);
  const chatExportPath = join(chatExportDirectory, chatExportDownload.suggestedFilename());
  await chatExportDownload.saveAs(chatExportPath);
  const chatExportLines = readFileSync(chatExportPath, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as { body?: string; visibility?: string; replyToMessageId?: string });
  expect(chatExportLines.some((message) => message.body === "E2E moderation checkpoint" && message.visibility === "public")).toBe(true);
  expect(chatExportLines.some((message) => message.body === "E2E GM moderation checkpoint" && message.visibility === "gm_only")).toBe(true);
  expect(chatExportLines.some((message) => message.body === "E2E threaded reply" && message.replyToMessageId)).toBe(true);
  await expect(page.getByText("Exported chat history as ndjson")).toBeVisible();
  await expect(page.getByRole("region", { name: "Chat moderation review" })).toContainText("Reviewable");
  await expect(page.getByRole("region", { name: "Chat moderation threads" })).toContainText("groups");
  await expect(page.getByRole("button", { name: "Review thread" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Mark follow up" }).first().click();
  await expect(page.getByText("Chat message marked Follow Up")).toBeVisible();
  await expect(page.getByRole("region", { name: "Chat moderation review" })).toContainText("Follow Up");
  await page.getByRole("button", { name: "Mark reviewed" }).first().click();
  await expect(page.getByText("Chat message marked Reviewed")).toBeVisible();
  await expect(page.getByRole("region", { name: "Chat moderation review" })).toContainText("Reviewed");
  await expect(page.getByRole("button", { name: "Whispers" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete chat message" }).first()).toBeVisible();
  await expect(page.getByText("Roll History")).toBeVisible();
  await expect(page.getByText("Term breakdown").first()).toBeVisible();

  await page.getByRole("button", { name: "Content" }).click();
  await expect(page.getByText("Asset Library")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Asset search" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Asset lifecycle filter" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Asset restore recovery" })).toContainText("Recoverable");
  await expect(page.locator('[aria-label="Asset quota usage"]').getByText("No campaign quota configured")).toBeVisible();
  await expect(page.locator('[aria-label="Asset quota management"]')).toContainText("Quota health");
  await expect(page.locator('[aria-label="Asset quota management"]')).toContainText("Recommended action");
  await expect(page.getByText("Delivery ready")).toBeVisible();
  await expect(page.getByText("signed_blob delivery")).toBeVisible();
  await expect(page.getByText("0 undeliverable - 0 CDN eligible")).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload Asset" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Upload Background" })).toBeEnabled();
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
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByLabel("Asset upload recovery")).toHaveCount(0);
  await page.locator("#asset-library-upload").setInputFiles({
    name: "e2e-map.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#345"/><circle cx="32" cy="32" r="18" fill="#d9b44a"/></svg>')
  });
  await expect(page.getByText("e2e-map.svg uploaded")).toBeVisible();
  await page.getByRole("textbox", { name: "Asset search" }).fill("e2e-map");
  const assetLibrary = page.getByRole("region", { name: "Asset library" });
  const uploadedAsset = assetLibrary.locator("article", { hasText: "e2e-map.svg" });
  await expect(uploadedAsset).toBeVisible();
  await expect(uploadedAsset).toContainText("maps/vault");
  await expect(uploadedAsset).toContainText("e2e, map");
  await uploadedAsset.getByRole("textbox", { name: "e2e-map.svg asset folder" }).fill("maps/revised");
  await uploadedAsset.getByRole("textbox", { name: "e2e-map.svg asset tags" }).fill("vault, background");
  await uploadedAsset.getByRole("button", { name: "Save Metadata" }).click();
  await expect(page.getByText("e2e-map.svg metadata updated")).toBeVisible();
  await expect(uploadedAsset).toContainText("maps/revised");
  await expect(uploadedAsset).toContainText("vault, background");
  const assetFolderNavigation = page.getByLabel("Asset folder navigation");
  await expect(assetFolderNavigation).toContainText("maps");
  await page.getByRole("button", { name: "Open asset folder maps" }).click();
  await expect(uploadedAsset).toBeVisible();
  await expect(assetFolderNavigation).toContainText("revised");
  await page.getByRole("button", { name: "Open asset folder maps/revised" }).click();
  await expect(page.getByRole("combobox", { name: "Asset folder filter" })).toHaveValue("maps/revised");
  await expect(uploadedAsset).toBeVisible();
  await uploadedAsset.getByRole("button", { name: "Place e2e-map.svg asset on scene" }).click();
  await expect(page.getByText("e2e-map.svg placed on scene")).toBeVisible();
  await deleteNewestTokenByName(page, "e2e-map.svg");
  await page.getByRole("combobox", { name: "Canvas asset folder" }).selectOption("maps/revised");
  await page.getByRole("textbox", { name: "Canvas image search" }).fill("e2e-map");
  await expect(page.getByRole("region", { name: "Canvas asset thumbnail grid" })).toContainText("e2e-map.svg");
  await page.getByRole("button", { name: "Select canvas asset e2e-map.svg" }).click();
  await expect(page.getByRole("combobox", { name: "Canvas asset picker" })).toHaveValue(/asset_/);
  await expect(page.getByLabel("Selected canvas asset preview")).toContainText("e2e-map.svg");
  await expect(page.getByLabel("Selected canvas asset preview")).toContainText("maps/revised");
  await expect(page.getByLabel("Selected canvas asset preview").locator("img")).toBeVisible();
  await expect(page.getByRole("button", { name: "Place selected canvas asset" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Set selected canvas background" })).toBeEnabled();
  await page.getByRole("spinbutton", { name: "Canvas asset placement count" }).fill("2");
  await page.getByRole("button", { name: "Place selected canvas asset" }).click();
  await expect(page.getByText("Placed 2 e2e-map.svg tokens")).toBeVisible();
  await deleteNewestTokenByName(page, "e2e-map.svg");
  await deleteNewestTokenByName(page, "e2e-map.svg");
  const boardBox = await sceneBoard.boundingBox();
  expect(boardBox).not.toBeNull();
  const canvasAssetTile = page.getByRole("button", { name: "Select canvas asset e2e-map.svg" });
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
  await expect(page.getByText("e2e-map.svg marked archived")).toBeVisible();
  await expect(uploadedAsset.locator(".status-pill")).toContainText("archived");
  await expect(page.getByRole("region", { name: "Asset restore recovery" })).toContainText("e2e-map.svg");
  await page.getByRole("combobox", { name: "Asset lifecycle filter" }).selectOption("archived");
  await expect(uploadedAsset).toBeVisible();
  await uploadedAsset.getByRole("checkbox", { name: "Select e2e-map.svg asset" }).check();
  await page.getByRole("button", { name: "Batch restore assets" }).click();
  await expect(page.getByText("e2e-map.svg marked active")).toBeVisible();
  await page.getByRole("combobox", { name: "Asset lifecycle filter" }).selectOption("all");
  await expect(uploadedAsset.locator(".status-pill")).toContainText("active");
  await uploadedAsset.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("e2e-map.svg marked deleted")).toBeVisible();
  await expect(uploadedAsset.locator(".status-pill")).toContainText("deleted");
  await expect(uploadedAsset.getByRole("button", { name: "Place e2e-map.svg asset on scene" })).toBeDisabled();
  await expect(uploadedAsset.getByRole("button", { name: "Background", exact: true })).toBeDisabled();
  await expect(uploadedAsset.getByRole("button", { name: "Signed URL" })).toBeDisabled();
  await expect(page.getByRole("region", { name: "Asset restore recovery" })).toContainText("e2e-map.svg");
  await page.getByRole("combobox", { name: "Asset lifecycle filter" }).selectOption("deleted");
  await expect(uploadedAsset).toBeVisible();
  await uploadedAsset.getByRole("checkbox", { name: "Select e2e-map.svg asset" }).check();
  await page.getByRole("button", { name: "Batch restore assets" }).click();
  await expect(page.getByText("e2e-map.svg marked active")).toBeVisible();
  await page.getByRole("combobox", { name: "Asset lifecycle filter" }).selectOption("all");
  await expect(uploadedAsset.locator(".status-pill")).toContainText("active");
  await page.getByRole("combobox", { name: "Asset folder filter" }).selectOption("maps/revised");
  await expect(uploadedAsset).toBeVisible();
  await page.getByRole("combobox", { name: "Asset folder filter" }).selectOption("all");
  await uploadedAsset.getByRole("button", { name: "Background", exact: true }).click();
  await expect(page.getByText("e2e-map.svg set as Vault Entry background")).toBeVisible();
  await expect(page.locator(".scene-tab-thumb img").first()).toBeVisible();
  await page.getByRole("combobox", { name: "Edit scene background asset" }).selectOption({ label: "No background" });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".scene-background-preview")).toContainText("No background");
  await page.getByRole("combobox", { name: "Edit scene background asset" }).selectOption({ label: "e2e-map.svg" });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".scene-background-preview")).toContainText("e2e-map.svg");
  await expect(page.getByText("Content Import", { exact: true })).toBeVisible();

  await page.getByRole("combobox", { name: "Content import adapter" }).selectOption("csv_items");
  await page.getByRole("textbox", { name: "Adapter source name" }).fill("E2E CSV Adapter Source");
  await page.getByRole("textbox", { name: "Adapter source URL" }).fill("https://example.test/e2e-csv-items.csv");
  await page.getByRole("textbox", { name: "Adapter configuration" }).fill("columns=name|body;delimiter=|;kind=journal");
  await page.getByRole("textbox", { name: "Content import body" }).fill("name|body\nE2E Adapter Torch|Imported from a configured CSV adapter preset.\nE2E Adapter Rope|Second generated adapter journal.");
  await expect(page.getByLabel("Adapter preview summary")).toContainText("Adapter: csv-item-list-v1");
  await expect(page.getByLabel("Adapter preview summary")).toContainText("2 generated entities");
  await page.getByRole("button", { name: "Preview Batch" }).click();
  await expect(page.getByText("Content import previewed")).toBeVisible();
  const adapterImportReport = page.locator(".content-import-report", { hasText: "E2E Adapter Torch" });
  await expect(adapterImportReport.locator('[aria-label="Provenance and license"]')).toContainText("Source: Adapter");
  await expect(adapterImportReport.locator('[aria-label="Provenance and license"]')).toContainText("Adapter: csv-item-list-v1");
  await expect(adapterImportReport.locator('[aria-label="Import entity selection"]')).toContainText("Journal: E2E Adapter Rope");
  await adapterImportReport.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Content import deleted")).toBeVisible();

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
  await expect(page.getByText("Content import previewed")).toBeVisible();

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
  await expect(page.getByText("Content import applied")).toBeVisible();
  await expect(importReport).toContainText("applied to items");
  await page.getByRole("button", { name: "Actors" }).click();
  await page.getByRole("tab", { name: "Loadout" }).click();
  const assignment = page.getByLabel("Assign item to actor");
  await expect(assignment.getByRole("combobox", { name: "Unassigned item" })).toContainText("E2E Import Ledger");
  await page.getByRole("button", { name: "Drag E2E Import Ledger to actor loadout" }).dragTo(page.getByRole("region", { name: "Actor loadout sheet" }));
  const assignmentStatus = page.getByText("E2E Import Ledger assigned to Valen Ash");
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
  await expect(page.getByText("E2E Import Ledger updated")).toBeVisible();
  await expect(importedLoadoutItem).toContainText("E2E Import Ledger x2");
  await importedLoadoutItem.getByRole("button", { name: "Spend one" }).click();
  await expect(page.getByText("E2E Import Ledger updated")).toBeVisible();
  await expect(importedLoadoutItem).toContainText("E2E Import Ledger x1");
  await page.getByRole("button", { name: "Content" }).click();
  await importReport.getByRole("button", { name: "Rollback" }).click();
  await expect(page.getByText("Content import rolled back")).toBeVisible();
  await expect(importReport.locator('[aria-label="Import history"]')).toContainText("Rolled back:");
});

test("GM can create a campaign through the setup wizard", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByText("Campaign Setup", { exact: true })).toBeVisible();

  await page.getByRole("textbox", { name: "Campaign name", exact: true }).fill("E2E Setup Campaign");
  await page.getByRole("textbox", { name: "Campaign description", exact: true }).fill("Created through the campaign setup wizard");
  await page.getByRole("combobox", { name: "Campaign visibility", exact: true }).selectOption("invite_only");
  await page.getByRole("textbox", { name: "Setup initial scene name" }).fill("First Session");
  await page.getByRole("textbox", { name: "Setup initial scene folder" }).fill("session-1");
  await page.getByRole("spinbutton", { name: "Setup scene width" }).fill("1400");
  await page.getByRole("spinbutton", { name: "Setup scene height" }).fill("900");
  await page.getByRole("spinbutton", { name: "Setup scene grid size" }).fill("70");
  await page.getByRole("checkbox", { name: "Create starter invite" }).check();
  await page.getByRole("textbox", { name: "Setup invite email" }).fill("setup-player@example.com");
  await page.getByRole("combobox", { name: "Setup default player permission preset" }).selectOption("player");
  await page.getByRole("combobox", { name: "Setup campaign permission template" }).selectOption("player_authoring");
  await expect(page.getByText("Players can create actors, journal entries, and tokens for collaborative prep.")).toBeVisible();
  const setupImpact = page.locator('[aria-label="Campaign setup impact"]');
  await expect(setupImpact).toContainText("Invite only - Player invite for setup-player@example.com");
  await expect(setupImpact).toContainText("First Session - 1400x900 - grid 70 - session-1");
  await expect(setupImpact).toContainText("Player authoring");
  await page.getByRole("textbox", { name: "Setup onboarding title" }).fill("Welcome Heroes");
  await page.getByRole("textbox", { name: "Setup onboarding copy" }).fill("Session zero: agree on tone, safety tools, and the opening scene.");
  await expect(setupImpact).toContainText("Public handout: Welcome Heroes");

  await page.getByRole("button", { name: "Create Campaign Setup" }).click();

  await expect(page.getByRole("heading", { name: "E2E Setup Campaign" })).toBeVisible();
  await expect(page.getByText("E2E Setup Campaign created with First Session; player invite ready; Player authoring permissions applied")).toBeVisible();
  await expect(page.getByRole("button", { name: /First Session/ })).toBeVisible();
  await expect(page.locator('input[aria-label="Invite token"][readonly]')).toHaveValue(/^oti_/);

  await page.getByRole("button", { name: "Journal" }).click();
  await expect(page.getByText("Welcome Heroes")).toBeVisible();
  await expect(page.getByText("Session zero: agree on tone, safety tools, and the opening scene.")).toBeVisible();
});

test("GM can export and safely re-import a campaign archive", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  const exportWizard = page.getByRole("region", { name: "Archive export wizard" });
  await expect(exportWizard).toBeVisible();
  await expect(exportWizard.getByRole("combobox", { name: "Archive export scope" })).toHaveValue("campaign");
  await expect(exportWizard.getByRole("combobox", { name: "Archive export version" })).toHaveValue("0.2.0");
  await expect(exportWizard.getByRole("combobox", { name: "Archive redaction mode" })).toHaveValue("portable");
  await expect(exportWizard.getByLabel("Archive compatibility notes")).toContainText("v0.3/v1-compatible importer");

  const downloadPromise = page.waitForEvent("download");
  await exportWizard.getByRole("button", { name: "Export Archive" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("The Ember Vault");

  const archiveDirectory = mkdtempSync(join(tmpdir(), "otte-e2e-archive-"));
  const archivePath = join(archiveDirectory, download.suggestedFilename());
  await download.saveAs(archivePath);
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
  await expect(page.getByText("Archive import failed")).toBeVisible();
  await expect(page.getByLabel("Archive import recovery")).toContainText("broken.ottx.json");
  await page.getByRole("button", { name: "Retry import" }).click();
  await expect(page.getByLabel("Archive import recovery")).toContainText("broken.ottx.json");

  const importWizard = page.getByRole("region", { name: "Archive import wizard" });
  await expect(importWizard.getByRole("combobox", { name: "Archive import mode" })).toHaveValue("upsert");
  await importWizard.getByRole("combobox", { name: "Archive import mode" }).selectOption("reject_conflicts");
  await page.getByLabel("Import campaign archive").setInputFiles(archivePath);
  await expect(page.getByText("Archive import failed")).toBeVisible();
  await expect(page.locator("#import-status")).toContainText("import_conflict");
  await expect(page.getByLabel("Archive import recovery")).toContainText(download.suggestedFilename());
  await importWizard.getByRole("combobox", { name: "Archive import mode" }).selectOption("dry_run");
  await page.getByLabel("Import campaign archive").setInputFiles(archivePath);
  await expect(page.getByText(/Archive dry run found \d+ conflicts/)).toBeVisible();
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
  await importWizard.getByRole("combobox", { name: "Archive import scope" }).selectOption("all");

  await importWizard.getByRole("combobox", { name: "Archive import mode" }).selectOption("skip_conflicts");
  await page.getByLabel("Import campaign archive").setInputFiles(archivePath);
  await expect(page.getByText(/Imported non-conflicting records; skipped \d+ conflicts/)).toBeVisible();
  await expect(importWizard.getByLabel("Archive import validation")).toContainText("Skipped");
  await expect(importWizard.getByLabel("Archive import validation")).toContainText("Rollback snapshot");
  const rollbackDownloadPromise = page.waitForEvent("download");
  await importWizard.getByLabel("Archive import validation").getByRole("button", { name: "Download" }).click();
  const rollbackDownload = await rollbackDownloadPromise;
  expect(rollbackDownload.suggestedFilename()).toContain("rollback-before");

  await importWizard.getByRole("combobox", { name: "Archive import mode" }).selectOption("upsert");
  await page.getByLabel("Import campaign archive").setInputFiles(archivePath);
  await expect(page.getByText(/Imported with \d+ conflicts/)).toBeVisible();
  await expect(page.locator("#import-status")).toContainText(download.suggestedFilename());
  await expect(page.getByLabel("Archive import recovery")).toHaveCount(0);
});

test("GM can run the browser combat tracker lifecycle", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  await page.getByRole("button", { name: "SDK", exact: true }).click();
  const sdkPanel = page.locator(".panel-stack", { hasText: "Runtime SDK" });
  await sdkPanel.getByRole("button", { name: "Create Monster" }).click();
  await expect(page.getByText("Goblin Minion monster created")).toBeVisible();
  await expect(sdkPanel.locator(".metric-row", { hasText: "Created Monster" })).toContainText("Goblin Minion");

  await page.getByRole("button", { name: "Actors", exact: true }).click();
  await page.getByRole("textbox", { name: "Token name" }).fill("Goblin Minion");
  await page.getByRole("combobox", { name: "Token actor" }).selectOption({ label: "Goblin Minion" });
  await page.getByRole("combobox", { name: "Token disposition" }).selectOption("hostile");
  await page.getByRole("button", { name: "Token", exact: true }).click();
  await expect(page.getByText("Goblin Minion created")).toBeVisible();
  await expect(page.getByRole("button", { name: "Token Goblin Minion" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Combat", exact: true }).click();
  const combatPanel = page.locator(".panel-stack", { hasText: "Combat Tracker" });
  await expect(combatPanel.getByRole("button", { name: "Start from scene tokens" })).toBeVisible();
  await combatPanel.getByRole("button", { name: "Start from scene tokens" }).click();

  await expect(combatPanel.getByText("Round", { exact: true })).toBeVisible();
  await expect(combatPanel.locator(".metric-row", { hasText: "Round" })).toContainText("1");
  await expect(combatPanel.getByText("Valen Ash").first()).toBeVisible();
  await expect(combatPanel.getByText("Goblin Minion").first()).toBeVisible();
  await expect(combatPanel.getByText("Combat Audit")).toBeVisible();
  await expect(combatPanel.getByText("combat.started")).toBeVisible();

  const valenCombatant = combatPanel.locator(".combatant", { hasText: "Valen Ash" }).first();
  await expect(valenCombatant.getByLabel("Valen Ash initiative")).toHaveValue(/\d+/);
  await valenCombatant.getByLabel("Valen Ash initiative").fill("21");
  await expect(valenCombatant.getByLabel("Valen Ash initiative")).toHaveValue("21");
  await valenCombatant.getByLabel("Valen Ash readiness").selectOption("ready");
  await expect(valenCombatant.getByText("ready", { exact: true })).toBeVisible();
  await valenCombatant.getByLabel("Valen Ash combat conditions").fill("prone:2, concentrating, stunned");
  await valenCombatant.getByLabel("Valen Ash death save successes").fill("3");
  await valenCombatant.getByLabel("Valen Ash death save failures").fill("1");
  await valenCombatant.getByRole("checkbox", { name: /used$/ }).click();
  await expect(valenCombatant.getByRole("checkbox", { name: /used$/ })).toBeChecked();
  await expect(valenCombatant).toContainText("Death saves 3/3 successes, 1/3 failures");
  await expect(valenCombatant).toContainText("Outcome: stable");
  await expect(valenCombatant).toContainText("Focus 3 depleted");
  await expect(valenCombatant).toContainText("Conditions: prone:2, stunned, concentration lost, stable");
  await expect(valenCombatant.getByLabel("Valen Ash condition timing")).toContainText("prone expires in 2 rounds");
  await page.getByRole("button", { name: "Actors", exact: true }).click();
  const actorPanel = page.locator(".panel-stack", { hasText: "Selected Actor" });
  await expect(actorPanel.locator(".metric-row", { hasText: "Conditions" })).toContainText("prone:2, stunned, concentration lost, stable");
  await expect(actorPanel.locator(".metric-row", { hasText: "Combat State" })).toContainText("Death saves 3/3 successes, 1/3 failures");
  await expect(actorPanel.locator(".metric-row", { hasText: "Combat State" })).toContainText("Stable");
  await expect(actorPanel.locator(".metric-row", { hasText: "Combat State" })).toContainText("Focus 3 used and depleted");
  await actorPanel.getByLabel("Actor sheet current HP").fill("11");
  await expect(actorPanel.getByLabel("Actor sheet current HP")).toHaveValue("11");
  await actorPanel.getByLabel("Actor sheet current HP").fill("17");
  await expect(actorPanel.getByLabel("Actor sheet current HP")).toHaveValue("17");
  await actorPanel.getByLabel("Actor conditions").fill("blessed, prone");
  await actorPanel.getByLabel("Actor conditions").blur();
  await expect(actorPanel.locator(".metric-row", { hasText: "Conditions" })).toContainText("Blessed, prone");
  await actorPanel.getByLabel("Focus resource current").fill("2");
  await actorPanel.getByLabel("Focus resource current").blur();
  await expect(actorPanel.locator(".metric-row", { hasText: "Resources" })).toContainText("Focus 2");
  const targetManager = actorPanel.getByRole("region", { name: "Canvas target manager" });
  await expect(targetManager).toContainText("Initiative: Valen Ash");
  await expect(targetManager.getByRole("button", { name: "Target current turn" })).toBeEnabled();
  await targetManager.getByRole("button", { name: "Target current turn" }).click();
  await expect(page.getByText("Targeted 1 tokens")).toBeVisible();
  await expect(targetManager).toContainText("My targets 1 / 2");
  await page.getByRole("button", { name: "Combat", exact: true }).click();
  await valenCombatant.getByLabel("Defeated").click();
  await expect(valenCombatant.getByText("defeated", { exact: true })).toBeVisible();

  const roundRow = combatPanel.locator(".metric-row", { hasText: "Round" });
  async function advanceUntilRound(round: string) {
    for (let attempts = 0; attempts < 8; attempts += 1) {
      if ((await roundRow.textContent())?.includes(round)) return;
      await combatPanel.getByRole("button", { name: "Next" }).click();
    }
    await expect(roundRow).toContainText(round);
  }
  async function previousUntilRound(round: string) {
    for (let attempts = 0; attempts < 8; attempts += 1) {
      if ((await roundRow.textContent())?.includes(round)) return;
      await combatPanel.getByRole("button", { name: "Previous" }).click();
    }
    await expect(roundRow).toContainText(round);
  }

  await combatPanel.getByRole("button", { name: "Next" }).click();
  await expect(roundRow).toContainText("1");
  await advanceUntilRound("2");
  await expect(roundRow).toContainText("2");
  await expect(combatPanel.getByText("combat.updated").first()).toBeVisible();
  await expect(valenCombatant.getByLabel("Valen Ash condition timing")).toContainText("prone expires in 1 round");
  await advanceUntilRound("3");
  await expect(valenCombatant.getByLabel("Valen Ash condition timing")).toContainText("No timed conditions");
  await previousUntilRound("2");

  await combatPanel.getByRole("button", { name: "End" }).click();
  await expect(combatPanel.getByRole("button", { name: "Start from scene tokens" })).toBeVisible();
  await deleteNewestTokenByName(page, "Goblin Minion");
});

test("GM can draft and apply an AI proposal from the browser", async ({ page }) => {
  const comparisonSeed = await page.request.post(`${apiBaseUrl}/api/v1/campaigns/camp_demo/proposals`, {
    headers: { "x-user-id": "usr_demo_gm" },
    data: {
      title: "Scene comparison check",
      summary: "Shows the current scene values beside the proposed update.",
      createdByType: "ai",
      sourceId: "thread_comparison_check",
      changesJson: [
        {
          entity: "scene",
          action: "update",
          id: "scn_vault_entry",
          data: { name: "Vault Entry Revised", folder: "comparison" }
        }
      ],
      diffJson: {}
    }
  });
  expect(comparisonSeed.ok()).toBeTruthy();

  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

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
  const aiRecoveryImport = await page.request.post(`${apiBaseUrl}/api/v1/import/campaign`, {
    headers: { "x-user-id": "usr_demo_gm" },
    data: {
      archive: aiRecoveryArchive,
      mode: "upsert",
      scope: "all"
    }
  });
  expect(aiRecoveryImport.ok(), await aiRecoveryImport.text()).toBeTruthy();
  await page.reload();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  await page.getByRole("button", { name: "AI", exact: true }).click();
  const aiPanel = page.locator(".panel-stack", { hasText: "Permissioned AI" });
  await expect(aiPanel.getByRole("region", { name: "AI proposal review queue" })).toContainText("Apply permission: available");
  await expect(aiPanel.getByRole("region", { name: "AI proposal review queue" })).toContainText("Recovery:");
  const recoveryControls = aiPanel.getByRole("region", { name: "AI recovery controls" });
  await expect(recoveryControls).toContainText("E2E failed provider thread");
  await expect(recoveryControls).toContainText("E2E provider timeout");
  await expect(recoveryControls).toContainText("read_compendium");
  await expect(recoveryControls).toContainText("tool_failed");
  await recoveryControls.locator(".tool-call-row", { hasText: "E2E failed provider thread" }).getByRole("button", { name: "Replay prompt" }).click();
  await expect(page.getByText("AI thread replayed")).toBeVisible();
  const retryToolResponse = page.waitForResponse((response) =>
    response.request().method() === "POST" &&
    response.url().includes("/api/v1/campaigns/camp_demo/ai/tool-calls/tool_e2e_retryable_compendium_failure/retry")
  );
  await recoveryControls.locator(".tool-call-row", { hasText: "read_compendium" }).getByRole("button", { name: "Retry tool" }).click();
  const retryToolResult = await retryToolResponse;
  expect(retryToolResult.ok(), await retryToolResult.text()).toBeTruthy();
  const retryToolBody = await retryToolResult.json() as { retried: number; completed: number; failed: number; skipped: number };
  expect(retryToolBody).toMatchObject({ retried: 1, completed: 1, failed: 0, skipped: 0 });
  await expect(recoveryControls.locator(".tool-call-row", { hasText: "read_compendium" })).toHaveCount(0);
  const proposalHistory = aiPanel.getByRole("region", { name: "Proposal history" });
  const comparisonProposal = proposalHistory.locator("article", { hasText: "Scene comparison check" });
  const comparisonDiff = comparisonProposal.getByRole("region", { name: "Scene comparison check review diff" });
  await expect(comparisonDiff).toContainText("Existing Comparison");
  await expect(comparisonDiff).toContainText("Vault Entry Revised");
  await expect(comparisonDiff).toContainText("Current");
  await expect(comparisonDiff).toContainText("Proposed");

  await aiPanel.getByLabel("AI prompt").fill("Mirror sentries defend the sealed vault");
  await aiPanel.getByRole("button", { name: "Draft Encounter" }).click();

  const proposal = proposalHistory.locator("article", { hasText: "Encounter Designer Draft" });
  await expect(proposal).toContainText("pending");
  await expect(proposal).toContainText("Mirror sentries defend the sealed vault");
  await expect(proposal.getByRole("region", { name: "Encounter Designer Draft review diff" })).toContainText("encounter create");
  await expect(proposal.getByText("Review Diff")).toBeVisible();
  await expect(proposal.getByRole("region", { name: "Encounter Designer Draft proposal timeline" })).toContainText("Current pending");
  await expect(proposal.getByRole("button", { name: "Approve and apply" })).toBeVisible();

  await proposal.getByRole("button", { name: "Approve and apply" }).click();
  await expect(proposal).toContainText("applied");
  await expect(proposal.getByRole("region", { name: "Encounter Designer Draft proposal timeline" })).toContainText("Current applied");
  await expect(proposal.getByRole("button", { name: "Approve and apply" })).toHaveCount(0);

  await aiPanel.getByLabel("AI prompt").fill("The moonlit vault door only opens for the amber sigil.");
  await aiPanel.getByRole("button", { name: "Extract Memory" }).click();
  const memory = aiPanel.locator("article", { hasText: "amber sigil" });
  await expect(memory).toContainText("pending memory");
  await memory.getByRole("button", { name: "Approve memory" }).click();
  await expect(memory).toContainText("approved memory");
  await expect(memory.locator(".metric-row", { hasText: "Visibility" })).toContainText("gm_only");
  await expect(memory.locator(".metric-row", { hasText: "Source" })).toContainText("thr_");
  await expect(memory.locator(".metric-row", { hasText: "Approval" })).toContainText("usr_demo_gm");
  await memory.getByRole("button", { name: "Delete memory" }).click();
  await expect(page.getByText("Memory deleted")).toBeVisible();
  await expect(aiPanel.getByRole("region", { name: "AI memory facts" }).locator("article", { hasText: "amber sigil" })).toHaveCount(0);

  await aiPanel.getByRole("button", { name: "Recap Session" }).click();
  await expect(page.getByText("Session recap queued for approval")).toBeVisible();
  const recapProposal = proposalHistory.locator("article", { hasText: "Session Recap" });
  await expect(recapProposal).toContainText("pending");
  await expect(recapProposal.getByRole("region", { name: "Session Recap review diff" })).toContainText("journal create");
  await expect(recapProposal.getByRole("region", { name: "Session Recap proposal timeline" })).toContainText("Current pending");
  await expect(aiPanel.getByRole("region", { name: "AI memory facts" }).locator("article", { hasText: "Session recap:" })).toContainText("pending memory");
  await recapProposal.getByRole("button", { name: "Approve and apply" }).click();
  await expect(recapProposal).toContainText("applied");
  await expect(recapProposal.getByRole("region", { name: "Session Recap proposal timeline" })).toContainText("Current applied");

  await aiPanel.getByLabel("AI prompt").fill("A brittle bridge hazard should be rejected from prep.");
  await aiPanel.getByRole("button", { name: "Draft Encounter" }).click();
  const rejectedProposal = proposalHistory.locator("article", { hasText: "brittle bridge hazard" });
  await expect(rejectedProposal).toContainText("pending");
  await rejectedProposal.getByRole("button", { name: "Reject" }).click();
  await expect(rejectedProposal).toContainText("rejected");
  await expect(rejectedProposal.getByRole("region", { name: "Encounter Designer Draft proposal timeline" })).toContainText("Current rejected");
  await expect(rejectedProposal.getByRole("button", { name: "Approve and apply" })).toHaveCount(0);

  await aiPanel.getByLabel("Proposal status filter").selectOption("rejected");
  await expect(proposalHistory.locator("article", { hasText: "brittle bridge hazard" })).toContainText("rejected");
  await expect(proposalHistory.locator("article", { hasText: "Mirror sentries defend the sealed vault" })).toHaveCount(0);
  await aiPanel.getByLabel("Proposal status filter").selectOption("applied");
  await expect(proposalHistory.locator("article", { hasText: "Mirror sentries defend the sealed vault" })).toContainText("applied");
  await aiPanel.getByLabel("Proposal search").fill("mirror sentries");
  await expect(proposalHistory.locator("article", { hasText: "Mirror sentries defend the sealed vault" })).toContainText("Mirror sentries defend the sealed vault");

  await page.getByRole("button", { name: "Journal" }).click();
  const recapJournal = page.locator("article.journal-entry", { hasText: "Session Recap" });
  await expect(recapJournal).toContainText("gm_only");
  await expect(recapJournal).toContainText("Session recap:");
});

test("GM can run SDK plugin and system workflows from the browser", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  await page.getByRole("button", { name: "SDK", exact: true }).click();
  const sdkPanel = page.locator(".panel-stack", { hasText: "Runtime SDK" });
  await expect(sdkPanel.locator(".metric-row", { hasText: "Active System" })).toContainText("D&D 5.5e SRD");
  await expect(sdkPanel.locator(".metric-row", { hasText: "Registry Browser" })).toContainText("registry packages");
  await expect(sdkPanel.getByRole("button", { name: "Sync marketplace registries" })).toBeVisible();
  await expect(sdkPanel.getByRole("textbox", { name: "Plugin marketplace search" })).toBeVisible();
  await expect(sdkPanel.getByRole("combobox", { name: "Plugin marketplace source filter" })).toBeVisible();
  await expect(sdkPanel.getByRole("combobox", { name: "Plugin marketplace status filter" })).toBeVisible();
  await expect(sdkPanel.getByRole("combobox", { name: "Plugin marketplace core filter" })).toBeVisible();
  const marketplaceRiskReview = sdkPanel.getByRole("region", { name: "Plugin marketplace risk review" });
  await expect(marketplaceRiskReview).toContainText("Signature warnings");
  await expect(marketplaceRiskReview).toContainText("signature warning");
  const registryHistory = sdkPanel.getByRole("region", { name: "Plugin registry history" });
  await expect(registryHistory).toContainText("Registry sources");
  await expect(registryHistory).toContainText("Registry packages");
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
  await expect(pluginCard).toContainText("installed plugin");
  await expect(pluginCard).toContainText("Installed v");
  await pluginCard.getByRole("button", { name: "/spark" }).click();
  await expect(page.getByText(/Spark macro: from the browser tabletop near .*Valen Ash/)).toBeVisible();

  const versionedPluginCard = sdkPanel.locator("article", { hasText: "Versioned Browser Plugin" });
  await expect(versionedPluginCard).toContainText("Compatibility: latest 2.0.0");
  await expect(versionedPluginCard).toContainText("Versions: 2 compatible, 0 blocked");
  await versionedPluginCard.getByRole("button", { name: "Install 1.0.0" }).click();
  await expect(page.getByText("Versioned Browser Plugin installed")).toBeVisible();
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
  await expect(page.getByText("Versioned browser plugin v1")).toBeVisible();
  await versionedPluginCard.getByRole("button", { name: "Upgrade to 2.0.0" }).click();
  await expect(page.getByText("Versioned Browser Plugin upgraded")).toBeVisible();
  await expect(versionedPluginCard).toContainText("Installed v2.0.0");
  await versionedPluginCard.getByRole("button", { name: "/versioned" }).click();
  await expect(page.getByText("Versioned browser plugin v2")).toBeVisible();
  await versionedPluginCard.getByRole("button", { name: "Roll back to 1.0.0" }).click();
  await expect(page.getByText("Versioned Browser Plugin rolled back")).toBeVisible();
  await expect(versionedPluginCard).toContainText("Installed v1.0.0");
  await expect(versionedPluginCard).toContainText("Audit history: 3 plugin.install rows");

  await expect(sdkPanel.getByText("System Registry")).toBeVisible();
  await expect(sdkPanel.locator("article", { hasText: "D&D 5.5e SRD" })).toContainText("Manifest validation");
  await expect(sdkPanel.locator("article", { hasText: "D&D 5.5e SRD" })).toContainText("Activation impact");

  const fighterTemplate = sdkPanel.locator("article", { hasText: "SRD 5.2.1 martial character" });
  await fighterTemplate.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Fighter created")).toBeVisible();
  await page.getByRole("button", { name: "Actors", exact: true }).click();
  await page.getByRole("combobox", { name: "Token inspector actor" }).selectOption({ label: "Fighter" });
  await expect(page.getByText("Token updated")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fighter" })).toBeVisible();
  await page.getByRole("button", { name: "Open Full Sheet" }).click();
  const fullSheet = page.getByRole("dialog", { name: "Fighter full character sheet" });
  await expect(fullSheet.getByRole("region", { name: "Full sheet stats" })).toContainText("HP");
  await expect(fullSheet.getByRole("region", { name: "Full sheet loadout" })).toContainText("items");
  await expect(fullSheet.getByRole("region", { name: "Full sheet actions" })).toContainText("Actions");
  await expect(fullSheet.getByRole("region", { name: "Full sheet targeting" })).toContainText("Action target");
  await fullSheet.getByRole("button", { name: "Close" }).click();
  const fighterCompendium = page.locator('[aria-label="Actor compendium browser"]');
  await fighterCompendium.getByRole("textbox", { name: "Compendium search" }).fill("Arrows");
  const arrowsEntry = fighterCompendium.locator("article", { hasText: "Arrows" }).first();
  await expect(arrowsEntry).toContainText("1 gp");
  await arrowsEntry.getByRole("spinbutton", { name: "Arrows purchase quantity" }).fill("2");
  await arrowsEntry.getByRole("button", { name: "Purchase" }).click();
  await expect(page.getByText("Arrows purchased", { exact: true })).toBeVisible();
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
  await page.getByRole("button", { name: "SDK", exact: true }).click();
  await expect(sdkPanel.getByRole("region", { name: "Actor advancement choices" })).toContainText("1 choices");
  await expect(sdkPanel.getByRole("combobox", { name: "Advancement option" })).toContainText("Level 2");
  await expect(sdkPanel.getByRole("button", { name: "Level Up" })).toBeDisabled();
  await sdkPanel.getByRole("button", { name: "Review advancement" }).click();
  await expect(sdkPanel.getByRole("region", { name: "Advancement review step" })).toContainText("Level 2");
  await sdkPanel.getByLabel("Confirm advancement review").check();
  await sdkPanel.getByRole("button", { name: "Level Up" }).click();
  await expect(page.getByText("Fighter advanced to Level 2")).toBeVisible();
  await page.getByRole("button", { name: "Actors", exact: true }).click();
  await page.getByRole("tab", { name: "Actions" }).click();
  const actorPanel = page.locator(".panel-stack", { hasText: "Selected Actor" });
  const actorResources = actorPanel.locator(".metric-row", { hasText: "Resources" });
  await expect(actorResources).toContainText("Second Wind 2/2");
  await page.locator("#actor-hp").fill("1");
  await expect(page.locator("#actor-hp")).toHaveValue("1");
  await page.getByRole("combobox", { name: "Action target actor" }).selectOption({ label: "Fighter" });
  await page.getByRole("checkbox", { name: "Apply action effect" }).check();
  await page.getByRole("checkbox", { name: "Consume action resources" }).check();
  const secondWindCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Second Wind" }).first();
  await expect(secondWindCard).toContainText("effect supported");
  await secondWindCard.getByRole("button", { name: "Use action" }).click();
  await expect(page.getByText("Fighter used action: Second Wind 1; healing applied")).toBeVisible();
  await expect(actorResources).toContainText("Second Wind 1/2");
  await expect.poll(async () => Number(await page.locator("#actor-hp").inputValue())).toBeGreaterThan(1);
  await page.getByRole("checkbox", { name: "Apply action effect" }).check();
  const actionSurgeCard = page.locator("article", { hasText: "Action Surge" }).first();
  await expect(actionSurgeCard).toContainText("Effect unsupported: clear Apply action effect to roll this action.");
  await expect(actionSurgeCard.getByRole("button", { name: "Use action" })).toBeDisabled();
  await page.getByRole("checkbox", { name: "Apply action effect" }).uncheck();
  await expect(actionSurgeCard.getByRole("button", { name: "Use action" })).toBeEnabled();

  await page.getByRole("button", { name: "SDK", exact: true }).click();
  await sdkPanel.getByRole("button", { name: "Plan Encounter" }).click();
  await expect(sdkPanel.locator(".metric-row", { hasText: "encounter" })).toBeVisible();
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

  await page.getByRole("button", { name: "SDK", exact: true }).click();
  const genericSystemCard = sdkPanel.locator("article", { hasText: "Generic Fantasy" });
  await expect(genericSystemCard).toContainText("available system");
  await genericSystemCard.getByRole("button", { name: "Activate" }).click();
  await expect(page.getByText("Generic Fantasy activated")).toBeVisible();
  await expect(sdkPanel.locator(".metric-row", { hasText: "Active System" })).toContainText("Generic Fantasy");
  await expect(genericSystemCard).toContainText("active system");
});

test("GM can apply broader D&D SRD action effects from the browser", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  const suffix = Date.now().toString(36);
  const target = await createRulesTargetActor(page, { name: `E2E Rules Target ${suffix}`, hp: { current: 100, max: 100 } });
  const barbarian = await createSystemCharacter(page, { templateId: "barbarian", name: `E2E Barbarian ${suffix}`, ownerUserId: "usr_demo_player", advanceToLevel: 5 });
  const paladin = await createSystemCharacter(page, { templateId: "paladin", name: `E2E Paladin ${suffix}`, ownerUserId: "usr_demo_player", advanceToLevel: 5 });
  const monk = await createSystemCharacter(page, { templateId: "monk", name: `E2E Monk ${suffix}`, ownerUserId: "usr_demo_player", advanceToLevel: 5 });
  const ranger = await createSystemCharacter(page, { templateId: "ranger", name: `E2E Ranger ${suffix}`, ownerUserId: "usr_demo_player", advanceToLevel: 5 });
  const rogue = await createSystemCharacter(page, { templateId: "rogue", name: `E2E Rogue ${suffix}`, ownerUserId: "usr_demo_player", advanceToLevel: 5 });
  await createSceneToken(page, { name: `E2E Barbarian Token ${suffix}`, actorId: barbarian.id, x: 350, y: 330, ownerUserIds: ["usr_demo_player"] });
  await createSceneToken(page, { name: `E2E Paladin Token ${suffix}`, actorId: paladin.id, x: 410, y: 330, ownerUserIds: ["usr_demo_player"] });
  await createSceneToken(page, { name: `E2E Monk Token ${suffix}`, actorId: monk.id, x: 470, y: 330, ownerUserIds: ["usr_demo_player"] });
  await createSceneToken(page, { name: `E2E Ranger Token ${suffix}`, actorId: ranger.id, x: 530, y: 330, ownerUserIds: ["usr_demo_player"] });
  await createSceneToken(page, { name: `E2E Rogue Token ${suffix}`, actorId: rogue.id, x: 590, y: 330, ownerUserIds: ["usr_demo_player"] });

  await page.reload();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  await page.getByRole("button", { name: `Token E2E Paladin Token ${suffix}` }).click();
  await page.getByRole("button", { name: "Actors", exact: true }).click();
  await page.getByRole("tab", { name: "Actions" }).click();
  await expect(page.getByRole("heading", { name: `E2E Paladin ${suffix}` })).toBeVisible();
  await page.getByRole("combobox", { name: "Action target actor" }).selectOption({ label: target.name });
  await page.getByRole("checkbox", { name: "Apply action effect" }).check();
  await page.getByRole("checkbox", { name: "Consume action resources" }).check();
  const divineSmiteCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Divine Smite" }).first();
  await expect(divineSmiteCard).toContainText("effect supported");
  const targetHpBeforeSmite = (target.data.hp as { current: number }).current;
  await divineSmiteCard.getByRole("button", { name: "Use action" }).click();
  await expect(page.getByText(new RegExp(`E2E Paladin ${suffix} used action: Level 1 Spell Slot \\d+; damage applied`))).toBeVisible();
  await expect
    .poll(async () => ((await getActorById(page, target.id)).data.hp as { current: number }).current)
    .toBeLessThan(targetHpBeforeSmite);

  await page.getByRole("combobox", { name: "Token inspector actor" }).selectOption({ label: monk.name });
  await expect(page.getByText("Token updated")).toBeVisible();
  await expect(page.getByRole("heading", { name: `E2E Monk ${suffix}` })).toBeVisible();
  await page.getByRole("combobox", { name: "Action target actor" }).selectOption({ label: target.name });
  await page.getByRole("checkbox", { name: "Apply action effect" }).check();
  await page.getByRole("checkbox", { name: "Consume action resources" }).check();
  const stunningStrikeCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Stunning Strike" }).first();
  await expect(stunningStrikeCard).toContainText("effect supported");
  await stunningStrikeCard.getByRole("button", { name: "Use action" }).click();
  await expect(page.getByText(new RegExp(`E2E Monk ${suffix} used action: Focus Point \\d+; condition applied`))).toBeVisible();
  await expect
    .poll(async () => ((await getActorById(page, target.id)).data.conditions as Array<{ id: string }> | undefined)?.map((condition) => condition.id) ?? [])
    .toContain("stunned");
  const deflectCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Deflect" }).first();
  await expect(deflectCard).toContainText("Deflect Attacks Reaction Damage");
  await expect(deflectCard).toContainText("effect supported");

  await page.getByRole("combobox", { name: "Token inspector actor" }).selectOption({ label: ranger.name });
  await expect(page.getByText("Token updated")).toBeVisible();
  await expect(page.getByRole("heading", { name: `E2E Ranger ${suffix}` })).toBeVisible();
  await page.getByRole("combobox", { name: "Action target actor" }).selectOption({ label: target.name });
  await page.getByRole("checkbox", { name: "Apply action effect" }).check();
  await page.getByRole("checkbox", { name: "Consume action resources" }).check();
  const huntersMarkCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Hunter's Mark" }).first();
  await expect(huntersMarkCard).toContainText("effect supported");
  const targetHpBeforeHuntersMark = ((await getActorById(page, target.id)).data.hp as { current: number }).current;
  await huntersMarkCard.getByRole("button", { name: "Use action" }).click();
  await expect(page.getByText(new RegExp(`E2E Ranger ${suffix} used action: Level 1 Spell Slot \\d+; damage applied`))).toBeVisible();
  await expect
    .poll(async () => ((await getActorById(page, target.id)).data.hp as { current: number }).current)
    .toBeLessThan(targetHpBeforeHuntersMark);

  await page.getByRole("combobox", { name: "Token inspector actor" }).selectOption({ label: rogue.name });
  await expect(page.getByText("Token updated")).toBeVisible();
  await expect(page.getByRole("heading", { name: `E2E Rogue ${suffix}` })).toBeVisible();
  await page.getByRole("combobox", { name: "Action target actor" }).selectOption({ label: target.name });
  await page.getByRole("checkbox", { name: "Apply action effect" }).check();
  const sneakAttackCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Sneak Attack" }).first();
  await expect(sneakAttackCard).toContainText("effect supported");
  const targetHpBeforeSneakAttack = ((await getActorById(page, target.id)).data.hp as { current: number }).current;
  await sneakAttackCard.getByRole("button", { name: "Use action" }).click();
  await expect(page.getByText(new RegExp(`E2E Rogue ${suffix} action posted; damage applied`))).toBeVisible();
  await expect
    .poll(async () => ((await getActorById(page, target.id)).data.hp as { current: number }).current)
    .toBeLessThan(targetHpBeforeSneakAttack);

  await page.getByRole("combobox", { name: "Token inspector actor" }).selectOption({ label: barbarian.name });
  await expect(page.getByText("Token updated")).toBeVisible();
  await expect(page.getByRole("heading", { name: `E2E Barbarian ${suffix}` })).toBeVisible();
  await page.getByRole("combobox", { name: "Action target actor" }).selectOption({ label: target.name });
  await page.getByRole("checkbox", { name: "Apply action effect" }).check();
  const rageDamageCard = page.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Rage Damage" }).first();
  await expect(rageDamageCard).toContainText("effect supported");
  const targetHpBeforeRageDamage = ((await getActorById(page, target.id)).data.hp as { current: number }).current;
  await rageDamageCard.getByRole("button", { name: "Use action" }).click();
  await expect(page.getByText(new RegExp(`E2E Barbarian ${suffix} action posted; damage applied`))).toBeVisible();
  await expect
    .poll(async () => ((await getActorById(page, target.id)).data.hp as { current: number }).current)
    .toBeLessThan(targetHpBeforeRageDamage);
});

test("SDK marketplace blocks trust-policy failures in the browser", async ({ page }) => {
  await page.route("**/api/v1/campaigns/*/plugins", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
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
      ])
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  await page.getByRole("button", { name: "SDK", exact: true }).click();
  const sdkPanel = page.locator(".panel-stack", { hasText: "Runtime SDK" });
  const marketplaceRiskReview = sdkPanel.getByRole("region", { name: "Plugin marketplace risk review" });
  await expect(marketplaceRiskReview).toContainText("2 samples");
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

test("SDK marketplace is read-only for players in the browser", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  await page.getByLabel("Session user").selectOption("usr_demo_player");
  await expect(page.locator(".account-summary", { hasText: "Demo Player" })).toBeVisible();

  await page.getByRole("button", { name: "SDK", exact: true }).click();
  const sdkPanel = page.locator(".panel-stack", { hasText: "Runtime SDK" });
  await expect(sdkPanel.getByRole("button", { name: "Sync marketplace registries" })).toBeDisabled();
  const pluginCard = sdkPanel.locator("article", { hasText: "Example Macro Plugin" });
  await expect(pluginCard).toContainText("Permission review");
  const pluginMutationButtons = sdkPanel.getByRole("button", { name: /^(Review and install|Install |Upgrade to )/ });
  await expect(pluginMutationButtons.first()).toBeVisible();
  for (let index = 0; index < await pluginMutationButtons.count(); index += 1) {
    await expect(pluginMutationButtons.nth(index)).toBeDisabled();
  }
  await expect(sdkPanel.getByText("System Registry")).toBeVisible();
  const inactiveSystem = sdkPanel.locator("article", { hasText: "Stellar Frontiers" });
  await expect(inactiveSystem).toContainText("available system");
  await expect(inactiveSystem.getByRole("button", { name: "Activate" })).toBeDisabled();
  const characterTemplate = sdkPanel.locator("article", { hasText: "character template" }).first();
  await expect(characterTemplate.getByRole("button", { name: "Create" })).toBeDisabled();
});

test("player can accept an invite from a private browser session", async ({ browser, page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  await page.getByRole("textbox", { name: "Invite email", exact: true }).fill("e2e.invited@example.test");
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  const createdInviteToken = page.locator('input[aria-label="Invite token"][readonly]');
  await expect(createdInviteToken).toHaveValue(/^oti_/);
  const inviteToken = await createdInviteToken.inputValue();
  expect(inviteToken).toMatch(/^oti_/);
  await page.evaluate(async ({ apiBaseUrl }) => {
    const bearer = localStorage.getItem("otte:sessionToken");
    if (!bearer) throw new Error("No browser session token available for hidden-scene setup");
    const headers = { authorization: `Bearer ${bearer}` };
    const campaigns = await fetch(`${apiBaseUrl}/api/v1/campaigns`, { headers }).then((response) => response.json());
    const campaign = campaigns.find((item: { name?: string }) => item.name === "The Ember Vault") ?? campaigns[0];
    if (!campaign) throw new Error("No campaign available for hidden-scene setup");
    const response = await fetch(`${apiBaseUrl}/api/v1/campaigns/${campaign.id}/scenes`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ name: "GM Prep Hidden Scene", active: false, folder: "gm-prep", width: 900, height: 700, gridSize: 50 })
    });
    if (!response.ok) throw new Error(await response.text());
  }, { apiBaseUrl });
  await page.reload();
  await expect(page.getByRole("button", { name: /GM Prep Hidden Scene/ })).toBeVisible();

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
    await expect(privatePage.getByRole("button", { name: /Vault Entry/ })).toBeVisible();
    await expect(privatePage.getByRole("button", { name: /GM Prep Hidden Scene/ })).toHaveCount(0);
    await expect(privatePage.getByRole("button", { name: "Chat", exact: true })).toBeVisible();

    await page.getByRole("textbox", { name: "Chat message" }).fill("Realtime GM broadcast");
    await page.getByRole("button", { name: "Send chat message" }).click();
    await expect(privatePage.getByText("Realtime GM broadcast")).toBeVisible();

    await privatePage.getByRole("combobox", { name: "Chat visibility" }).selectOption("whisper");
    await expect(privatePage.getByRole("combobox", { name: "Whisper recipient" })).toBeEnabled();
    await privatePage.getByRole("combobox", { name: "Whisper recipient" }).selectOption("usr_demo_gm");
    await privatePage.getByRole("textbox", { name: "Chat message" }).fill("Realtime player whisper");
    await privatePage.getByRole("button", { name: "Send chat message" }).click();
    await expect(page.getByText("Realtime player whisper")).toBeVisible();

    await privatePage.getByRole("textbox", { name: "Dice formula" }).fill("1d20+1");
    await privatePage.getByLabel("Dice roll visibility").selectOption("public");
    await privatePage.getByRole("button", { name: "Roll dice" }).click();
    await expect(privatePage.getByText(/^Rolled \d+$/)).toBeVisible();
    await privatePage.getByRole("textbox", { name: "Dice formula" }).fill("1d20+2");
    await privatePage.getByLabel("Dice roll visibility").selectOption("gm_only");
    await privatePage.getByRole("button", { name: "Roll dice" }).click();
    await expect(privatePage.getByText(/^Rolled \d+$/)).toBeVisible();
    await privatePage.getByRole("button", { name: "Chat", exact: true }).click();
    const playerRollHistory = privatePage.locator(".roll-history-list");
    await expect(playerRollHistory).toContainText("1d20+1");
    await expect(playerRollHistory).toContainText("public");
    await expect(playerRollHistory).toContainText("1d20+2");
    await expect(playerRollHistory).toContainText("gm_only");

    const playerUserId = await privatePage.evaluate(() => localStorage.getItem("otte:userId"));
    expect(playerUserId).toBeTruthy();
    const tokenSuffix = Date.now().toString(36);
    const playerActor = await page.evaluate(
      async ({ apiBaseUrl, playerUserId, tokenSuffix }) => {
        const bearer = localStorage.getItem("otte:sessionToken");
        if (!bearer) throw new Error("No browser session token available for player actor setup");
        const headers = { authorization: `Bearer ${bearer}`, "content-type": "application/json" };
        const characterResponse = await fetch(`${apiBaseUrl}/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters`, {
          method: "POST",
          headers,
          body: JSON.stringify({ templateId: "fighter", name: `E2E Player Fighter ${tokenSuffix}`, ownerUserId: playerUserId })
        });
        if (!characterResponse.ok) throw new Error(await characterResponse.text());
        const character = await characterResponse.json();
        const advanceResponse = await fetch(`${apiBaseUrl}/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${character.actor.id}/advance`, {
          method: "POST",
          headers,
          body: JSON.stringify({ optionId: "level-up" })
        });
        if (!advanceResponse.ok) throw new Error(await advanceResponse.text());
        const advanced = await advanceResponse.json();
        return advanced.actor as { id: string; name: string };
      },
      { apiBaseUrl, playerUserId, tokenSuffix }
    );
    const ownedToken = await createSceneToken(page, { name: `E2E Owned ${tokenSuffix}`, x: 430, y: 350, ownerUserIds: [playerUserId!], actorId: playerActor.id });
    const unownedToken = await createSceneToken(page, { name: `E2E Unowned ${tokenSuffix}`, x: 560, y: 360, ownerUserIds: [] });
    createdTokenIds.push(ownedToken.id, unownedToken.id);

    await privatePage.reload();
    await expect(privatePage.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
    await privatePage.getByRole("button", { name: /Vault Entry/ }).click();
    await expect(privatePage.getByRole("button", { name: `Token ${ownedToken.name}` })).toBeVisible();
    await expect(privatePage.getByRole("button", { name: `Token ${unownedToken.name}` })).toBeVisible();
    await privatePage.getByRole("button", { name: `Token ${ownedToken.name}` }).click();
    await privatePage.getByRole("button", { name: "Actors", exact: true }).click();
    const actorPanel = privatePage.locator(".panel-stack", { hasText: "Selected Actor" });
    await expect(actorPanel.getByRole("heading", { name: playerActor.name })).toBeVisible();
    await expect(actorPanel.locator(".metric-row", { hasText: "Resources" })).toContainText("Action Surge 1/1");
    await privatePage.getByRole("tab", { name: "Actions" }).click();
    const playerActionSheet = privatePage.getByRole("region", { name: "Actor action sheet" });
    const actionSurgeCard = playerActionSheet.locator("article", { hasText: "Action Surge" }).first();
    await expect(actionSurgeCard).toContainText("roll only action");
    await actionSurgeCard.getByRole("button", { name: "Use action" }).click();
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

test("GM can bulk duplicate selected prep scenes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByText("Scene Manager")).toBeVisible();

  const prefix = `Bulk Prep ${Date.now()}`;
  const activeForPlayers = page.getByRole("checkbox", { name: "Activate for players" });
  if (await activeForPlayers.isChecked()) await activeForPlayers.uncheck();

  await page.getByRole("textbox", { name: "Scene name", exact: true }).fill(`${prefix} A`);
  await page.getByRole("button", { name: "Add Scene" }).click();
  await expect(page.getByRole("button", { name: new RegExp(`${prefix} A`) })).toBeVisible();
  await page.getByRole("textbox", { name: "Scene name", exact: true }).fill(`${prefix} B`);
  await page.getByRole("button", { name: "Add Scene" }).click();
  await expect(page.getByRole("button", { name: new RegExp(`${prefix} B`) })).toBeVisible();

  await page.getByRole("textbox", { name: "Scene search" }).fill(prefix);
  await expect(page.getByRole("status", { name: "Scene filter summary" })).toContainText("2 of");
  await page.getByRole("button", { name: "Select visible scenes" }).click();
  await expect(page.getByRole("status", { name: "Scene selection summary" })).toContainText("2 selected");
  await page.getByRole("button", { name: "Duplicate selected scenes" }).click();
  await expect(page.getByText("Duplicated 2 selected scenes")).toBeVisible();
  await expect(page.getByRole("status", { name: "Scene selection summary" })).toContainText("2 selected");

  await page.getByRole("textbox", { name: "Scene search" }).fill(`${prefix} A Copy`);
  await expect(page.getByRole("button", { name: new RegExp(`${prefix} A Copy`) })).toBeVisible();
  await page.getByRole("textbox", { name: "Scene search" }).fill(`${prefix} B Copy`);
  await expect(page.getByRole("button", { name: new RegExp(`${prefix} B Copy`) })).toBeVisible();
});
