import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const apiBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}`;
const apiControlBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_API_CONTROL_PORT ?? Number(process.env.OTTE_E2E_API_PORT ?? 4100) + 1000}`;

type FirstSessionPath = {
  className: "Cleric" | "Rogue" | "Wizard";
  speciesName: "Dwarf" | "Elf" | "Halfling";
  characterName: string;
  encounterName: string;
  sessionTitle: string;
};

function statusMessage(page: Page, text: string | RegExp) {
  return page.getByRole("status").filter({ hasText: text }).first();
}

async function openDetails(details: Locator) {
  await expect(details.locator("summary")).toBeVisible();
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await details.evaluate((element) => {
      (element as HTMLDetailsElement).open = true;
      element.scrollIntoView({ block: "nearest" });
    });
  }
}

async function openInspectorPanel(page: Page, panelName: "Actors" | "Combat" | "Journal" | "Plugins" | "Sessions") {
  await page.locator(".inspector-tabs").getByRole("tab", { name: panelName, exact: true }).click();
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

async function loginAsDemoGm(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
}

function selectedActorPanel(page: Page) {
  return page.locator(".inspector");
}

function sdkRuntimePanel(page: Page) {
  return page.locator(".inspector .panel-stack", { hasText: "Runtime SDK" });
}

async function selectPartyActor(page: Page, actorName: string) {
  const partyRow = page.getByRole("region", { name: "Party" }).getByRole("button").filter({ hasText: actorName });
  await expect(partyRow).toBeVisible();
  await expect(async () => {
    await partyRow.click();
    await expect(partyRow).toHaveClass(/\bselected\b/, { timeout: 2_000 });
  }).toPass({ timeout: 10_000 });
  return partyRow;
}

async function openActorDisclosure(page: Page, summaryText: string) {
  const details = selectedActorPanel(page).locator("details.actor-detail-disclosure").filter({ hasText: summaryText }).first();
  await openDetails(details);
}

async function satisfyCountedCheckboxGroups(dialog: Locator) {
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

async function createCharacterThroughWizard(page: Page, input: { className: string; speciesName: string; name: string }) {
  await page.getByRole("button", { name: "Open character creator" }).click();
  const dialog = page.getByRole("dialog", { name: "Character creator" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("radio").filter({ hasText: input.className }).click();
  await dialog.getByRole("button", { name: /Next/ }).click();

  await dialog.getByRole("radio").filter({ hasText: input.speciesName }).click();
  await satisfyCountedCheckboxGroups(dialog);
  const finishOrigin = dialog.getByRole("button", { name: /Next/ });
  await expect(finishOrigin, (await dialog.locator(".creator-validation").allTextContents()).join("\n")).toBeEnabled();
  await finishOrigin.click();

  await dialog.getByRole("radio").filter({ hasText: "Soldier" }).click();
  const backgroundTool = dialog.getByRole("combobox", { name: "Background tool proficiency" });
  if (await backgroundTool.isVisible().catch(() => false)) {
    const options = backgroundTool.locator("option");
    expect(await options.count()).toBeGreaterThan(1);
    await backgroundTool.selectOption({ index: 1 });
  }
  await satisfyCountedCheckboxGroups(dialog);
  const finishBackground = dialog.getByRole("button", { name: /Next/ });
  await expect(finishBackground, (await dialog.locator(".creator-validation").allTextContents()).join("\n")).toBeEnabled();
  await finishBackground.focus();
  await finishBackground.press("Enter");

  await dialog.getByRole("textbox", { name: "Character name" }).fill(input.name);
  await dialog.getByRole("button", { name: "Create character" }).click();
  await expect(dialog).toBeHidden();
  await expect(statusMessage(page, `${input.name} joined the party`)).toBeVisible();
  const partyRow = page.getByRole("region", { name: "Party" }).getByRole("button").filter({ hasText: input.name });
  await expect(partyRow).toBeVisible();
  await partyRow.click();
  return partyRow;
}

async function prepareEncounterParty(dialog: Locator, characterName: string) {
  const party = dialog.locator(".encounter-party");
  const clearParty = party.getByRole("button", { name: "Clear party" });
  if (await clearParty.isEnabled()) await clearParty.click();
  await expect(clearParty).toBeDisabled();

  const characterChoice = party.getByRole("checkbox", { name: characterName, exact: true });
  await characterChoice.check();
  const characterRow = characterChoice.locator("xpath=ancestor::div[contains(@class, 'encounter-party-row')][1]");
  const placeOnScene = characterRow.getByRole("button", { name: "Place on scene" });
  if (await placeOnScene.isVisible()) await placeOnScene.click();
  await expect(characterRow).toContainText("On scene");
  await expect(party.locator(".encounter-party-readiness")).toContainText("All 1 selected character is on the scene.");
}

async function createSavedEncounterThroughBuilder(page: Page, input: { characterName: string; encounterName: string }) {
  const threatName = "Goblin Warrior";
  await page.reload();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Party" })).toContainText(input.characterName);
  await page.getByRole("button", { name: "Live Table", exact: true }).click();
  await openInspectorPanel(page, "Combat");
  await page.getByRole("button", { name: "Plan Encounter" }).click();
  const dialog = page.getByRole("dialog", { name: "Encounter builder" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Encounter name" }).fill(input.encounterName);
  await dialog.getByRole("textbox", { name: "Search encounter threats" }).fill("Goblin");

  const threatLabel = dialog.getByText(threatName, { exact: true });
  await expect(threatLabel).toBeVisible({ timeout: 30_000 });
  const goblin = threatLabel.locator("xpath=ancestor::article[contains(@class, 'encounter-threat')][1]");
  await goblin.getByRole("button", { name: "Add" }).click();
  const livePlan = dialog.getByRole("region", { name: "Live encounter plan" });
  await expect(livePlan).toContainText(`${threatName} x1`);
  await expect(livePlan).toContainText("Party");
  await prepareEncounterParty(dialog, input.characterName);
  const save = dialog.getByRole("button", { name: "Save encounter" });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(statusMessage(page, `${input.encounterName} saved`)).toBeVisible();
  await expect(dialog.getByRole("region", { name: "Saved encounters" })).toContainText(input.encounterName);
  const launch = dialog.getByRole("button", { name: "Place & review combat" });
  await expect(launch).toBeEnabled();
  await launch.click();
  await expect(dialog).toBeHidden();
  await expect(statusMessage(page, "Prepared 2 combatants (1 party, 1 hostile); review initiative to start.")).toBeVisible();

  const setup = page.getByRole("dialog", { name: "Review Vault Entry" });
  await expect(setup).toBeVisible();
  await expect(setup.getByRole("list", { name: "Scene combatants" })).toContainText(threatName);
  await setup.getByRole("spinbutton", { name: `${input.characterName} initiative` }).fill("15");
  const startCombat = setup.getByRole("button", { name: /Start combat \(2\)/ });
  await expect(startCombat).toBeEnabled();
  await startCombat.click();
  await expect(setup).toBeHidden();

  const combatPanel = page.locator(".inspector .panel-stack");
  await expect(combatPanel.getByRole("heading", { name: "Round 1" })).toBeVisible();
  await expect(combatPanel.getByRole("list", { name: "Initiative order" })).toContainText(threatName);
  await combatPanel.getByRole("button", { name: "End combat", exact: true }).click();
  await combatPanel.getByRole("button", { name: "Confirm end combat", exact: true }).click();
  await expect(combatPanel.getByRole("heading", { name: "No Active Combat" })).toBeVisible();
}

async function runLinkedSessionThroughDesk(page: Page, input: { encounterName: string; sessionTitle: string }) {
  await page.getByRole("button", { name: "Prep", exact: true }).click();
  await openInspectorPanel(page, "Sessions");
  const desk = page.getByRole("region", { name: "Session Desk" });
  await expect(desk).toBeVisible();
  await desk.getByRole("button", { name: "Plan session" }).click();
  const form = desk.getByRole("form", { name: "Plan campaign session" });
  await form.getByRole("textbox", { name: "Session title" }).fill(input.sessionTitle);
  await form.getByRole("textbox", { name: "Session agenda" }).fill(`Meet the party, face ${input.encounterName}, and close the first session.`);
  await form.getByRole("textbox", { name: "Session notes" }).fill("Browser evidence: creator, encounter, and session state stayed inside public product controls.");
  await form.getByRole("checkbox", { name: "Vault Entry" }).check();
  await openDetails(form.locator("details").filter({ hasText: "Linked encounters" }));
  await form.getByRole("checkbox", { name: input.encounterName }).check();
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(statusMessage(page, `${input.sessionTitle} planned`)).toBeVisible();

  const editor = desk.getByRole("form", { name: `Edit session ${input.sessionTitle}` });
  await editor.getByRole("combobox", { name: "Scene to activate when session starts" }).selectOption({ label: "Vault Entry" });
  await editor.getByRole("button", { name: "Start session" }).click();
  await expect(statusMessage(page, `${input.sessionTitle} is live`)).toBeVisible();
  await expect(desk.getByRole("listitem").filter({ hasText: input.sessionTitle })).toContainText("live");

  await editor.getByRole("button", { name: "Complete session" }).click();
  await editor.getByRole("button", { name: "Confirm complete session" }).click();
  await expect(statusMessage(page, `${input.sessionTitle} completed`)).toBeVisible();
  await expect(desk.getByRole("listitem").filter({ hasText: input.sessionTitle })).toContainText("completed");
}

async function runFirstSessionPath(page: Page, path: FirstSessionPath) {
  await loginAsDemoGm(page);
  await createCharacterThroughWizard(page, { className: path.className, speciesName: path.speciesName, name: path.characterName });
  await createSavedEncounterThroughBuilder(page, { characterName: path.characterName, encounterName: path.encounterName });
  await runLinkedSessionThroughDesk(page, { encounterName: path.encounterName, sessionTitle: path.sessionTitle });
}

async function assertPersistedFighterState(page: Page, actorName: string, expectedHp: number) {
  await page.getByRole("button", { name: "Live Table", exact: true }).click();
  await selectPartyActor(page, actorName);
  await openInspectorPanel(page, "Actors");
  const actorPanel = selectedActorPanel(page);
  await expect(actorPanel.getByRole("heading", { name: actorName, exact: true })).toBeVisible();
  await actorPanel.getByRole("tab", { name: "Stats" }).click();
  await expect(actorPanel.getByRole("region", { name: "Actor at a glance" })).toContainText("Second Wind 2/2");
  await expect(actorPanel.getByLabel("Actor sheet current HP")).toHaveValue(String(expectedHp));

  await page.getByRole("button", { name: "Prep", exact: true }).click();
  await openInspectorPanel(page, "Plugins");
  await expect(sdkRuntimePanel(page).getByRole("combobox", { name: "Advancement option" })).toContainText("Level 3");
}

test.describe("browser acceptance evidence", () => {
  test.setTimeout(90_000);

  test("Dwarf Cleric completes creator to encounter to first session", async ({ page }, testInfo) => {
    const suffix = `r${testInfo.retry}`;
    await runFirstSessionPath(page, {
      className: "Cleric",
      speciesName: "Dwarf",
      characterName: `Evidence Dwarf Cleric ${suffix}`,
      encounterName: `Cleric Goblin Watch ${suffix}`,
      sessionTitle: `Cleric First Session ${suffix}`,
    });
  });

  test("Elf Wizard completes creator to encounter to first session", async ({ page }, testInfo) => {
    const suffix = `r${testInfo.retry}`;
    await runFirstSessionPath(page, {
      className: "Wizard",
      speciesName: "Elf",
      characterName: `Evidence Elf Wizard ${suffix}`,
      encounterName: `Wizard Goblin Watch ${suffix}`,
      sessionTitle: `Wizard First Session ${suffix}`,
    });
  });

  test("Halfling Rogue completes creator to encounter to first session", async ({ page }, testInfo) => {
    const suffix = `r${testInfo.retry}`;
    await runFirstSessionPath(page, {
      className: "Rogue",
      speciesName: "Halfling",
      characterName: `Evidence Halfling Rogue ${suffix}`,
      encounterName: `Rogue Goblin Watch ${suffix}`,
      sessionTitle: `Rogue First Session ${suffix}`,
    });
  });

  test("reviewed D&D core state survives API restart and archive round trip", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const fighterName = `Evidence Orc Fighter r${testInfo.retry}`;

    await loginAsDemoGm(page);
    await createCharacterThroughWizard(page, { className: "Fighter", speciesName: "Orc", name: fighterName });

    await page.getByRole("button", { name: "Prep", exact: true }).click();
    await openInspectorPanel(page, "Plugins");
    const sdkPanel = sdkRuntimePanel(page);
    const advancement = sdkPanel.getByRole("region", { name: "Actor advancement choices" });
    await expect(advancement.getByRole("combobox", { name: "Advancement option" })).toContainText("Level 2");
    await expect(sdkPanel.getByRole("button", { name: "Level Up", exact: true })).toBeDisabled();
    await advancement.getByRole("button", { name: "Save advancement draft" }).click();
    const savedAdvancement = sdkPanel.getByLabel("Saved advancement");
    await expect(savedAdvancement).toContainText("Saved advancement draft");

    await page.reload();
    await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
    await selectPartyActor(page, fighterName);
    await page.getByRole("button", { name: "Prep", exact: true }).click();
    await openInspectorPanel(page, "Plugins");
    await expect(savedAdvancement).toContainText("Saved advancement draft");
    await savedAdvancement.getByRole("button", { name: "Cancel saved advancement" }).click();
    await expect(statusMessage(page, `${fighterName}'s saved advancement cancelled`)).toBeVisible();
    await expect(savedAdvancement).toBeHidden();

    await advancement.getByRole("radio", { name: /Fixed average/ }).check();
    await advancement.getByRole("button", { name: "Review advancement" }).click();
    await expect(advancement.getByRole("region", { name: "Advancement review step" })).toContainText("Level 2");
    await expect(savedAdvancement).toContainText("Saved advancement ready for review");

    await page.reload();
    await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
    await selectPartyActor(page, fighterName);
    await page.getByRole("button", { name: "Prep", exact: true }).click();
    await openInspectorPanel(page, "Plugins");
    await expect(savedAdvancement).toContainText("Saved advancement ready for review");
    await savedAdvancement.getByRole("button", { name: "Resume saved advancement" }).click();
    await expect(advancement.getByRole("region", { name: "Advancement review step" })).toContainText("Level 2");
    await advancement.getByLabel("Confirm advancement review").check();
    await sdkPanel.getByRole("button", { name: "Level Up", exact: true }).click();
    await expect(statusMessage(page, `${fighterName} advanced to Level 2`)).toBeVisible();

    await page.getByRole("button", { name: "Live Table", exact: true }).click();
    await selectPartyActor(page, fighterName);
    await openInspectorPanel(page, "Actors");
    const actorPanel = selectedActorPanel(page);
    await expect(actorPanel.getByRole("heading", { name: fighterName, exact: true })).toBeVisible();
    await actorPanel.getByRole("tab", { name: "Stats" }).click();
    const hpInput = actorPanel.getByLabel("Actor sheet current HP");
    await hpInput.fill("1");
    await hpInput.blur();
    await expect(actorPanel.getByLabel("Actor sheet current HP")).toHaveValue("1");

    await actorPanel.getByRole("tab", { name: "Actions" }).click();
    await openActorDisclosure(page, "Actor details");
    await actorPanel.getByRole("combobox", { name: "Action target actor" }).selectOption({ label: fighterName });
    await actorPanel.getByRole("checkbox", { name: "Apply action effect" }).check();
    await actorPanel.getByRole("checkbox", { name: "Consume action resources" }).check();
    const secondWind = actorPanel.getByRole("region", { name: "Actor action sheet" }).locator("article", { hasText: "Second Wind" }).first();
    await expect(secondWind).toContainText("effect supported");
    const dialogPromise = page.waitForEvent("dialog");
    const actionClickPromise = secondWind.getByRole("button", { name: "Use action" }).click();
    const reviewDialog = await dialogPromise;
    const exactActionReview = reviewDialog.message();
    expect(exactActionReview).toContain(`Review ${fighterName}'s exact server-prepared action`);
    // Chromium truncates very large native-confirm messages before the final prompt,
    // so prove the exact prepared consequence payload is presented and then accepted.
    expect(exactActionReview).toContain('"commitMode": "commit"');
    expect(exactActionReview).toContain('"label": "Second Wind"');
    await reviewDialog.accept();
    await actionClickPromise;
    await expect(statusMessage(page, `${fighterName} used action: Second Wind 1; healing applied`)).toBeVisible();
    await expect(actorPanel.getByRole("region", { name: "Actor at a glance" })).toContainText("Second Wind 1/2");
    await actorPanel.getByRole("tab", { name: "Stats" }).click();
    await expect.poll(async () => Number(await actorPanel.getByLabel("Actor sheet current HP").inputValue())).toBeGreaterThan(1);
    const expectedHp = Number(await actorPanel.getByLabel("Actor sheet current HP").inputValue());

    const recovery = actorPanel.locator("details.actor-rest-card").first();
    await openDetails(recovery);
    await recovery.getByRole("button", { name: "Review short rest" }).click();
    const restReview = recovery.locator('[aria-label="Exact short rest review"]');
    await expect(restReview).toBeVisible();
    await restReview.getByLabel("Confirm exact rest review").check();
    await restReview.getByRole("button", { name: "Apply short rest" }).click();
    await expect(restReview).toBeHidden();
    await expect(actorPanel.getByRole("region", { name: "Actor at a glance" })).toContainText("Second Wind 2/2");
    await expect(actorPanel.getByLabel("Actor sheet current HP")).toHaveValue(String(expectedHp));

    const beforeRestartResponse = await page.request.get(`${apiControlBaseUrl}/status`);
    expect(beforeRestartResponse.ok(), await beforeRestartResponse.text()).toBeTruthy();
    const beforeRestart = await beforeRestartResponse.json() as { generation: number; running: boolean };
    expect(beforeRestart.running).toBe(true);
    const restartResponse = await page.request.post(`${apiControlBaseUrl}/restart`);
    expect(restartResponse.ok(), await restartResponse.text()).toBeTruthy();
    const restarted = await restartResponse.json() as { generation: number; restarted: boolean };
    expect(restarted).toEqual({ generation: beforeRestart.generation + 1, restarted: true });
    await expect.poll(
      async () => page.request.get(`${apiBaseUrl}/api/v1/health`).then((response) => response.ok()).catch(() => false),
      { timeout: 30_000 },
    ).toBe(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
    await assertPersistedFighterState(page, fighterName, expectedHp);

    const managePanel = await openManageCategory(page, "Archives");
    const exportWizard = managePanel.getByRole("region", { name: "Archive export wizard" });
    const downloadPromise = page.waitForEvent("download");
    await exportWizard.getByRole("button", { name: "Export Archive" }).click();
    const download = await downloadPromise;
    const archiveDirectory = mkdtempSync(join(tmpdir(), "otte-browser-core-loop-"));
    const archivePath = join(archiveDirectory, download.suggestedFilename());
    await download.saveAs(archivePath);

    await closeManage(page);
    await page.getByRole("button", { name: "Live Table", exact: true }).click();
    await selectPartyActor(page, fighterName);
    await openInspectorPanel(page, "Actors");
    const mutatedHp = selectedActorPanel(page).getByLabel("Actor sheet current HP");
    await mutatedHp.fill("0");
    await mutatedHp.blur();
    await expect(selectedActorPanel(page).getByLabel("Actor sheet current HP")).toHaveValue("0");
    await page.reload();
    await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
    await page.getByRole("button", { name: "Live Table", exact: true }).click();
    await selectPartyActor(page, fighterName);
    await openInspectorPanel(page, "Actors");
    await expect(selectedActorPanel(page).getByLabel("Actor sheet current HP")).toHaveValue("0");

    const importPanel = await openManageCategory(page, "Archives");
    const importWizard = importPanel.getByRole("region", { name: "Archive import wizard" });
    await expect(importWizard.getByRole("combobox", { name: "Archive import mode" })).toHaveValue("upsert");
    await importPanel.getByLabel("Import campaign archive").setInputFiles(archivePath);
    const importStatus = importPanel.locator("#import-status");
    await expect(importStatus).toContainText(download.suggestedFilename());
    await expect(importStatus).toContainText(/: \d+ campaigns, \d+ scenes, \d+ tokens, \d+ actors, \d+ journals/);
    await expect(importPanel.getByLabel("Archive import recovery")).toHaveCount(0);
    await closeManage(page);
    await page.reload();
    await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
    await assertPersistedFighterState(page, fighterName, expectedHp);
  });
});
