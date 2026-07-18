import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const apiBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}`;
const webBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_WEB_PORT ?? 5174}`;
const campaignId = "camp_demo";
const systemId = "dnd-5e-srd";
const cookieSessionMarker = "otte-cookie-session";

type JsonRecord = Record<string, unknown>;

interface E2EActor {
  id: string;
  name: string;
  updatedAt: string;
  data: JsonRecord;
}

interface E2EItem {
  id: string;
  name: string;
  updatedAt: string;
  data: JsonRecord;
}

function statusMessage(page: Page, text: string | RegExp): Locator {
  return page.getByRole("status").filter({ hasText: text }).first();
}

async function apiJson<T>(
  page: Page,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  data?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const response = await page.request.fetch(`${apiBaseUrl}${path}`, {
    method,
    data,
    headers: {
      authorization: `Bearer ${cookieSessionMarker}`,
      origin: webBaseUrl,
      ...headers,
    },
  });
  const body = await response.text();
  expect(response.ok(), `${method} ${path}: ${body}`).toBeTruthy();
  return JSON.parse(body) as T;
}

async function loginAsDemoGm(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  const cookies = await page.context().cookies(apiBaseUrl);
  expect(cookies.some((cookie) => cookie.name === "otte_session" || cookie.name === "__Host-otte_session")).toBe(true);
}

async function satisfyCountedCheckboxGroups(dialog: Locator): Promise<void> {
  const groups = dialog.locator("fieldset");
  for (let groupIndex = 0; groupIndex < await groups.count(); groupIndex += 1) {
    const group = groups.nth(groupIndex);
    const legend = (await group.locator("legend").textContent()) ?? "";
    const counts = legend.match(/\((\d+)\/(\d+)\)/);
    if (!counts) continue;
    let selected = Number(counts[1]);
    const required = Number(counts[2]);
    while (selected < required) {
      const choice = group.locator('input[type="checkbox"]:not(:checked):not(:disabled)').first();
      await expect(choice, `available choice for ${legend}`).toBeVisible();
      await choice.check();
      selected += 1;
    }
  }
}

async function openManageCategory(page: Page, categoryName: string): Promise<Locator> {
  const manageButton = page.getByRole("button", { name: "Manage", exact: true });
  if ((await manageButton.getAttribute("aria-pressed")) !== "true") await manageButton.click();
  const panel = page.getByRole("region", { name: "Manage workspace panel" });
  await expect(panel).toBeVisible();
  await panel.locator(".manage-category-button", { hasText: categoryName }).click();
  return panel;
}

async function openInspectorPanel(page: Page, panelName: "Actors" | "Plugins"): Promise<Locator> {
  await page.locator(".inspector-tabs").getByRole("tab", { name: panelName, exact: true }).click();
  const panel = page.getByRole("tabpanel", { name: panelName });
  await expect(panel).toBeVisible();
  return panel;
}

async function selectPartyActor(page: Page, actorName: string): Promise<void> {
  const actor = page.getByRole("region", { name: "Party" }).getByRole("button").filter({ hasText: actorName });
  await expect(actor).toBeVisible();
  await expect(async () => {
    await actor.click();
    await expect(actor).toHaveClass(/\bselected\b/);
  }).toPass({ timeout: 10_000 });
}

async function openActorView(page: Page, actorName: string, view: "Stats" | "Loadout" | "Actions"): Promise<Locator> {
  await page.getByRole("button", { name: "Live Table", exact: true }).click();
  await selectPartyActor(page, actorName);
  const actorPanel = await openInspectorPanel(page, "Actors");
  await expect(actorPanel.getByRole("heading", { name: actorName, exact: true })).toBeVisible();
  await actorPanel.getByRole("tab", { name: view, exact: true }).click();
  return actorPanel;
}

async function createTemplateCharacter(page: Page, templateId: string, name: string): Promise<E2EActor> {
  const created = await apiJson<{ actor: E2EActor }>(
    page,
    "POST",
    `/api/v1/campaigns/${campaignId}/systems/${systemId}/characters`,
    { templateId, name, ownerUserId: "usr_demo_gm" },
    { "idempotency-key": `final-browser-character:${crypto.randomUUID()}` },
  );
  return created.actor;
}

async function advanceCharacterByApi(page: Page, actor: E2EActor): Promise<E2EActor> {
  const preview = await apiJson<{
    status: string;
    preparation?: { preparedPreviewKey?: string; actorUpdatedAt?: string };
  }>(
    page,
    "POST",
    `/api/v1/campaigns/${campaignId}/systems/${systemId}/actors/${actor.id}/rules-preview`,
    {
      operation: "advancement",
      optionId: "level-up",
      hitPointMode: "fixed",
      weaponMasteryChoices: ["greatsword", "longbow", "flail"],
      prepare: true
    },
    { "idempotency-key": `final-browser-advancement-preview:${crypto.randomUUID()}` },
  );
  expect(preview.status).toBe("ready");
  expect(preview.preparation?.preparedPreviewKey).toBeTruthy();
  expect(preview.preparation?.actorUpdatedAt).toBeTruthy();
  const result = await apiJson<{ actor: E2EActor }>(
    page,
    "POST",
    `/api/v1/campaigns/${campaignId}/systems/${systemId}/actors/${actor.id}/advance`,
    {
      preparedPreviewKey: preview.preparation!.preparedPreviewKey,
      expectedUpdatedAt: preview.preparation!.actorUpdatedAt,
    },
    { "idempotency-key": `final-browser-advancement-commit:${crypto.randomUUID()}` },
  );
  return result.actor;
}

function classActorData(className: "Fighter" | "Monk" | "Barbarian", level: number, extra: JsonRecord = {}): JsonRecord {
  return {
    class: className,
    level,
    classes: [{ className, level }],
    speed: 30,
    attributes: {
      strength: 16,
      dexterity: 14,
      constitution: 14,
      intelligence: 10,
      wisdom: 14,
      charisma: 10,
    },
    hp: { current: 50, max: 50 },
    hitDice: {
      current: level,
      max: level,
      size: className === "Monk" ? "d8" : className === "Barbarian" ? "d12" : "d10",
    },
    conditions: [],
    ...extra,
  };
}

async function createCustomDndActor(page: Page, name: string, data: JsonRecord): Promise<E2EActor> {
  const campaign = await apiJson<{ updatedAt: string }>(page, "GET", `/api/v1/campaigns/${campaignId}`);
  return apiJson<E2EActor>(page, "POST", `/api/v1/campaigns/${campaignId}/actors`, {
    systemId,
    ownerUserId: "usr_demo_gm",
    type: "character",
    name,
    data,
    expectedUpdatedAt: campaign.updatedAt,
  }, { "idempotency-key": `final-browser-custom-actor:${crypto.randomUUID()}` });
}

async function createDndItem(page: Page, actorId: string, name: string, data: JsonRecord): Promise<E2EItem> {
  const campaign = await apiJson<{ updatedAt: string }>(page, "GET", `/api/v1/campaigns/${campaignId}`);
  return apiJson<E2EItem>(page, "POST", `/api/v1/campaigns/${campaignId}/items`, {
    systemId,
    actorId,
    type: "gear",
    name,
    data,
    expectedUpdatedAt: campaign.updatedAt,
  }, { "idempotency-key": `final-browser-item:${crypto.randomUUID()}` });
}

async function expectDisplayedSpeed(actorPanel: Locator, speed: number): Promise<void> {
  const statistics = actorPanel.getByRole("group", { name: "Core statistics and rolls" });
  await expect(statistics).toBeVisible();
  await expect(statistics.getByTitle("Speed")).toHaveText(`Speed ${speed} ft`);
}

async function setEquipmentState(page: Page, checkbox: Locator, equipped: boolean): Promise<void> {
  if ((await checkbox.isChecked()) === equipped) return;
  const updatedResponse = page.waitForResponse((response) => response.request().method() === "PATCH"
    && /\/api\/v1\/items\/[^/]+$/.test(new URL(response.url()).pathname));
  await checkbox.click();
  const response = await updatedResponse;
  expect(response.ok(), await response.text()).toBeTruthy();
  if (equipped) await expect(checkbox).toBeChecked();
  else await expect(checkbox).not.toBeChecked();
}

test.describe("final strict browser acceptance", () => {
  test.describe.configure({ mode: "serial" });

  test("N09/N10 reloads and resumes the real creator, assigns all six scores, previews, commits, and retains provenance", async ({ page }) => {
    test.setTimeout(180_000);
    await loginAsDemoGm(page);
    const characterName = `Final Standard Array Fighter ${Date.now().toString(36)}`;

    await page.getByRole("button", { name: "Open character creator", exact: true }).click();
    let creator = page.getByRole("dialog", { name: "Character creator" });
    await expect(creator).toBeVisible();
    await creator.getByRole("radio").filter({ hasText: "Fighter" }).click();
    await creator.getByRole("button", { name: /Next/ }).click();
    await creator.getByRole("radio").filter({ hasText: "Orc" }).click();
    await satisfyCountedCheckboxGroups(creator);
    const checkedOriginChoices = await creator.locator('input[type="checkbox"]:checked').count();
    expect(checkedOriginChoices).toBeGreaterThan(0);
    await expect(creator.getByRole("status").filter({ hasText: "Draft saved in this browser." })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
    await page.getByRole("button", { name: "Open character creator", exact: true }).click();
    const recovery = page.getByRole("dialog", { name: "Recover character draft?" });
    await expect(recovery).toContainText("A saved character is waiting in this browser");
    await recovery.getByRole("button", { name: "Resume saved draft" }).click();

    creator = page.getByRole("dialog", { name: "Character creator" });
    await expect(creator.locator(".creator-step.active")).toContainText("Origin");
    await expect(creator.getByRole("radio").filter({ hasText: "Orc" })).toHaveAttribute("aria-checked", "true");
    await expect(creator.locator('input[type="checkbox"]:checked')).toHaveCount(checkedOriginChoices);
    await creator.getByRole("button", { name: /Next/ }).click();

    await creator.getByRole("radio").filter({ hasText: "Soldier" }).click();
    const backgroundTool = creator.getByRole("combobox", { name: "Background tool proficiency" });
    if (await backgroundTool.isVisible().catch(() => false)) await backgroundTool.selectOption({ index: 1 });
    await satisfyCountedCheckboxGroups(creator);

    const abilities = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"] as const;
    const scoreControls = abilities.map((ability) => creator.getByRole("combobox", { name: `${ability} standard array score` }));
    for (let index = 0; index < scoreControls.length; index += 1) {
      const control = scoreControls[index]!;
      const nextControl = scoreControls[(index + 1) % scoreControls.length]!;
      const nextScore = await nextControl.inputValue();
      expect(nextScore).not.toBe(await control.inputValue());
      await control.selectOption(nextScore);
      await expect(control).toHaveValue(nextScore);
    }
    const finalAssignment = Object.fromEntries(await Promise.all(abilities.map(async (ability, index) => [ability.toLowerCase(), Number(await scoreControls[index]!.inputValue())]))) as Record<string, number>;
    expect(Object.values(finalAssignment).sort((left, right) => right - left)).toEqual([15, 14, 13, 12, 10, 8]);

    const plusTwo = await creator.getByRole("combobox", { name: "Plus two ability" }).inputValue();
    const plusOne = await creator.getByRole("combobox", { name: "Plus one ability" }).inputValue();
    await creator.getByRole("button", { name: /Next/ }).click();
    await creator.getByRole("textbox", { name: "Character name" }).fill(characterName);

    const finalPreview = creator.getByRole("region", { name: "Final ability score preview" });
    await expect(finalPreview).toBeVisible();
    const expectedFinalScores = Object.fromEntries(Object.entries(finalAssignment).map(([ability, base]) => [
      ability,
      base + (ability === plusTwo ? 2 : 0) + (ability === plusOne ? 1 : 0),
    ])) as Record<string, number>;
    for (const ability of abilities) {
      const row = finalPreview.locator("dt").filter({ hasText: ability }).locator("xpath=..");
      await expect(row).toContainText(String(expectedFinalScores[ability.toLowerCase()]));
    }
    const authoritativePreview = creator.getByRole("region", { name: "Authoritative character sheet preview" });
    await expect(authoritativePreview).toContainText("Armor Class");
    await expect(authoritativePreview).toContainText("Hit Points");
    await expect(authoritativePreview).toContainText("Speed");

    const creationResponse = page.waitForResponse((response) => response.request().method() === "POST"
      && /\/systems\/dnd-5e-srd\/characters$/.test(new URL(response.url()).pathname));
    await creator.getByRole("button", { name: "Create character" }).click();
    const createdResponse = await creationResponse;
    expect(createdResponse.ok(), await createdResponse.text()).toBeTruthy();
    const created = await createdResponse.json() as { actor: E2EActor };
    await expect(statusMessage(page, `${characterName} joined the party`)).toBeVisible();

    const committed = await apiJson<E2EActor>(page, "GET", `/api/v1/actors/${created.actor.id}`);
    const origin = committed.data.origin as JsonRecord;
    const creation = committed.data.dnd5eCharacterCreation as JsonRecord;
    const options = creation.options as JsonRecord;
    expect(origin.abilityScoreMethod).toBe("standard-array");
    expect(origin.standardArrayAssignment).toEqual(finalAssignment);
    expect(options.standardArrayAssignment).toEqual(finalAssignment);
    expect(committed.data.attributes).toEqual(expectedFinalScores);
    expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes("character-creator")))).toEqual([]);
  });

  test("N12/N13 keeps class speed prerequisites and explicit subclass gating correct through equipment changes and reload", async ({ page }) => {
    test.setTimeout(240_000);
    await loginAsDemoGm(page);
    const suffix = Date.now().toString(36);

    let champion = await createTemplateCharacter(page, "fighter", `Final Champion ${suffix}`);
    champion = await advanceCharacterByApi(page, champion);
    await page.reload();
    await selectPartyActor(page, champion.name);
    await page.getByRole("button", { name: "Prep", exact: true }).click();
    await openInspectorPanel(page, "Plugins");
    const sdkPanel = page.locator(".inspector .panel-stack", { hasText: "Runtime SDK" });
    const advancement = sdkPanel.getByRole("region", { name: "Actor advancement choices" });
    await expect(advancement.getByRole("combobox", { name: "Advancement option" })).toContainText("Level 3");
    await advancement.getByRole("radio", { name: /Fixed average/ }).check();
    await advancement.getByRole("combobox", { name: "Advancement subclass" }).selectOption({ label: "Champion" });
    await expect(advancement.getByRole("status").filter({ hasText: "Champion" })).toContainText("Champion");
    await advancement.getByRole("button", { name: "Review advancement" }).click();
    const review = advancement.getByRole("region", { name: "Advancement review step" });
    await expect(review).toContainText("Champion");
    await advancement.getByLabel("Confirm advancement review").check();
    await sdkPanel.getByRole("button", { name: "Level Up", exact: true }).click();
    await expect(statusMessage(page, `${champion.name} advanced to Level 3`)).toBeVisible();

    await page.reload();
    let actorPanel = await openActorView(page, champion.name, "Actions");
    const championActions = actorPanel.getByRole("region", { name: "Actor action sheet" });
    await expect(championActions).toContainText("Improved Critical");
    champion = await apiJson<E2EActor>(page, "GET", `/api/v1/actors/${champion.id}`);
    expect((champion.data.subclasses as JsonRecord).Fighter).toBe("champion");

    const conflictingName = `Final Conflicting Fighter ${suffix}`;
    const conflicting = await createCustomDndActor(page, conflictingName, classActorData("Fighter", 5, {
      subclass: "Battle Master",
      subclasses: { Fighter: "battle-master" },
      features: ["Champion", "Improved Critical", "Remarkable Athlete"],
    }));
    await page.reload();
    actorPanel = await openActorView(page, conflictingName, "Actions");
    const conflictingActions = actorPanel.getByRole("region", { name: "Actor action sheet" });
    await expect(conflictingActions).not.toContainText("Improved Critical");
    await expect(conflictingActions).not.toContainText("Remarkable Athlete");
    const reloadedConflict = await apiJson<E2EActor>(page, "GET", `/api/v1/actors/${conflicting.id}`);
    expect((reloadedConflict.data.subclasses as JsonRecord).Fighter).toBe("battle-master");
    expect(reloadedConflict.data.features).toEqual(expect.arrayContaining(["Improved Critical", "Remarkable Athlete"]));

    const monkName = `Final Armored Monk ${suffix}`;
    const monk = await createCustomDndActor(page, monkName, classActorData("Monk", 10));
    const monkArmorName = `Final Monk Leather ${suffix}`;
    await createDndItem(page, monk.id, monkArmorName, { quantity: 1, equipped: true, armorType: "light", armorBase: 11 });

    const barbarianName = `Final Equipped Barbarian ${suffix}`;
    const barbarian = await createCustomDndActor(page, barbarianName, classActorData("Barbarian", 5));
    const mediumArmorName = `Final Scale Mail ${suffix}`;
    const heavyArmorName = `Final Chain Mail ${suffix}`;
    await createDndItem(page, barbarian.id, mediumArmorName, { quantity: 1, equipped: true, armorType: "medium", armorBase: 14, dexCap: 2 });
    await createDndItem(page, barbarian.id, heavyArmorName, { quantity: 1, equipped: false, armorType: "heavy", armorBase: 16 });

    await page.reload();
    actorPanel = await openActorView(page, monkName, "Stats");
    await expectDisplayedSpeed(actorPanel, 30);
    await actorPanel.getByRole("tab", { name: "Loadout" }).click();
    const monkArmor = actorPanel.getByRole("region", { name: "Actor loadout sheet" }).locator("article", { hasText: monkArmorName });
    await setEquipmentState(page, monkArmor.getByRole("checkbox", { name: `${monkArmorName} equipped` }), false);
    await expect(statusMessage(page, `${monkArmorName} updated`)).toBeVisible();
    await actorPanel.getByRole("tab", { name: "Stats" }).click();
    await expectDisplayedSpeed(actorPanel, 50);
    await page.reload();
    actorPanel = await openActorView(page, monkName, "Stats");
    await expectDisplayedSpeed(actorPanel, 50);

    actorPanel = await openActorView(page, barbarianName, "Stats");
    await expectDisplayedSpeed(actorPanel, 40);
    await actorPanel.getByRole("tab", { name: "Loadout" }).click();
    const loadout = actorPanel.getByRole("region", { name: "Actor loadout sheet" });
    await setEquipmentState(page, loadout.locator("article", { hasText: mediumArmorName }).getByRole("checkbox", { name: `${mediumArmorName} equipped` }), false);
    await expect(statusMessage(page, `${mediumArmorName} updated`)).toBeVisible();
    await setEquipmentState(page, loadout.locator("article", { hasText: heavyArmorName }).getByRole("checkbox", { name: `${heavyArmorName} equipped` }), true);
    await expect(statusMessage(page, `${heavyArmorName} updated`)).toBeVisible();
    await actorPanel.getByRole("tab", { name: "Stats" }).click();
    await expectDisplayedSpeed(actorPanel, 30);
    await page.reload();
    actorPanel = await openActorView(page, barbarianName, "Stats");
    await expectDisplayedSpeed(actorPanel, 30);
  });

  test("N14 uploads a map as the background, calibrates it, and marks the same first-session scene ready", async ({ page }) => {
    test.setTimeout(180_000);
    await loginAsDemoGm(page);
    const mapName = `final-first-session-${Date.now().toString(36)}.svg`;

    await openManageCategory(page, "Scenes");
    await expect(page.getByRole("form", { name: "Edit scene Vault Entry" })).toBeVisible();
    await page.locator("#map-upload-file").setInputFiles({
      name: mapName,
      mimeType: "image/svg+xml",
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#1f2937"/><path d="M0 0H800V600H0Z" stroke="#f59e0b"/></svg>'),
    });

    await expect(statusMessage(page, `${mapName} is set as the background. Click two grid intersections to calibrate.`)).toBeVisible();
    const calibration = page.locator(".grid-calibration-panel");
    await expect(calibration.getByRole("heading", { name: "Match the map grid" })).toBeVisible();
    await calibration.getByRole("spinbutton", { name: "First calibration point X" }).fill("100");
    await calibration.getByRole("spinbutton", { name: "First calibration point Y" }).fill("100");
    await calibration.getByRole("spinbutton", { name: "Second calibration point X" }).fill("300");
    await calibration.getByRole("spinbutton", { name: "Second calibration point Y" }).fill("100");
    await calibration.getByRole("spinbutton", { name: "Grid cells between calibration points" }).fill("4");
    await expect(calibration.getByRole("status")).toContainText("Recommended grid: 50 px");
    await calibration.getByRole("button", { name: "Apply square grid" }).click();
    await expect(statusMessage(page, "Vault Entry grid calibrated to 50 px")).toBeVisible();

    await page.reload();
    await expect(page.locator('.scene-tab', { hasText: "Vault Entry" })).toBeVisible();
    const scenes = await apiJson<Array<{ id: string; name: string; gridSize: number; backgroundAssetId?: string; metadata: JsonRecord }>>(
      page,
      "GET",
      `/api/v1/campaigns/${campaignId}/scenes`,
    );
    const vaultEntry = scenes.find((scene) => scene.name === "Vault Entry");
    expect(vaultEntry).toMatchObject({ gridSize: 50, metadata: { mapCalibrationComplete: true } });
    expect(vaultEntry?.backgroundAssetId).toBeTruthy();

    const manage = await openManageCategory(page, "Campaign");
    const checklist = manage.locator(".first-session-setup");
    const sceneStep = checklist.getByRole("listitem").filter({ hasText: "Prepare scene, map & tokens" });
    await expect(sceneStep).toContainText("Done");
    await expect(sceneStep).toContainText("The first tabletop scene is ready.");
    const playStep = checklist.getByRole("listitem").filter({ hasText: "Start play" });
    await expect(playStep).toContainText("Done");
    await expect(playStep).toContainText("The table is ready to open.");
  });
});
