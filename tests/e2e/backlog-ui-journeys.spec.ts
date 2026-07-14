import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const apiBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}`;

async function loginAsDemoGm(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
}

async function openInspectorPanel(page: Page, panelName: "Actors" | "Compendium"): Promise<Locator> {
  if (panelName === "Compendium") {
    const prep = page.getByRole("button", { name: "Prep", exact: true });
    await prep.click();
    await expect(prep).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".inspector-tabs").getByRole("tab", { name: "Sessions", exact: true })).toBeVisible();
  }
  await page.locator(".inspector-tabs").getByRole("tab", { name: panelName, exact: true }).click();
  const panel = page.getByRole("tabpanel", { name: panelName });
  await expect(panel).toBeVisible();
  return panel;
}

async function openManageCampaign(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  const panel = page.getByRole("region", { name: "Manage workspace panel" });
  await expect(panel).toBeVisible();
  await panel.locator(".manage-category-button", { hasText: "Campaign" }).click();
  await expect(panel.getByText("Campaign Settings")).toBeVisible();
  return panel;
}

function statusMessage(page: Page, text: string | RegExp): Locator {
  return page.getByRole("status").filter({ hasText: text }).first();
}

async function createSystemCharacter(
  page: Page,
  input: { templateId: string; name: string; ownerUserId?: string },
): Promise<{ id: string; name: string }> {
  return page.evaluate(
    async ({ apiBaseUrl, input }) => {
      const bearer = localStorage.getItem("otte:sessionToken");
      if (!bearer) throw new Error("No browser session token available for controlled-creature setup");
      const response = await fetch(`${apiBaseUrl}/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${bearer}`,
          "content-type": "application/json",
          "idempotency-key": `e2e-character:${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          templateId: input.templateId,
          name: input.name,
          ownerUserId: input.ownerUserId ?? "usr_demo_gm",
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      const result = (await response.json()) as { actor: { id: string; name: string } };
      return result.actor;
    },
    { apiBaseUrl, input },
  );
}

async function createActorFeature(page: Page, actorId: string, name: string): Promise<void> {
  await page.evaluate(
    async ({ apiBaseUrl, actorId, name }) => {
      const bearer = localStorage.getItem("otte:sessionToken");
      if (!bearer) throw new Error("No browser session token available for controlled-creature source setup");
      const campaignResponse = await fetch(`${apiBaseUrl}/api/v1/campaigns/camp_demo`, {
        headers: { authorization: `Bearer ${bearer}` },
      });
      if (!campaignResponse.ok) throw new Error(await campaignResponse.text());
      const campaign = (await campaignResponse.json()) as { updatedAt: string };
      const response = await fetch(`${apiBaseUrl}/api/v1/campaigns/camp_demo/items`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${bearer}`,
          "content-type": "application/json",
          "idempotency-key": `e2e-feature:${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          actorId,
          systemId: "dnd-5e-srd",
          type: "feature",
          name,
          data: { rulesVersion: "SRD 5.2.1", description: "Reviewed controlled-creature source feature." },
          expectedUpdatedAt: campaign.updatedAt,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
    },
    { apiBaseUrl, actorId, name },
  );
}

async function selectFirstRealOption(select: Locator): Promise<void> {
  await expect.poll(() => select.locator("option").count()).toBeGreaterThan(1);
  const value = await select.locator("option").nth(1).getAttribute("value");
  expect(value).toBeTruthy();
  await select.selectOption(value!);
}

async function previewAndConfirmControlledLifecycle(panel: Locator): Promise<void> {
  await panel.getByRole("button", { name: "Preview lifecycle" }).click();
  const manualReview = panel.getByRole("checkbox", { name: "I reviewed these ambiguities with the DM." });
  if (await manualReview.isVisible().catch(() => false)) {
    await expect(panel.getByText("Human review required")).toBeVisible();
    await manualReview.check();
    await panel.getByRole("button", { name: "Preview reviewed choices" }).click();
  }
  await expect(panel.getByText("Ready to confirm", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Confirm reviewed lifecycle" }).click();
}

test("T30 explains an actor total and exposes the campaign compatibility report", async ({ page }) => {
  test.setTimeout(90_000);
  await loginAsDemoGm(page);

  await page.getByRole("button", { name: "Token Valen Ash" }).first().click();
  const actorsPanel = await openInspectorPanel(page, "Actors");
  await actorsPanel.getByRole("tab", { name: "Stats", exact: true }).click();

  const displayedArmorClass = await actorsPanel
    .locator(".metric-row", { hasText: "Armor class" })
    .locator("strong")
    .innerText();
  const rulesTraceDisclosure = actorsPanel.locator("details.actor-rules-trace-disclosure");
  await rulesTraceDisclosure.locator("summary").click();
  const explanation = rulesTraceDisclosure.locator("section.calculation-explanation");
  await expect(explanation.getByRole("heading", { name: "How the numbers work" })).toBeVisible();

  const armorField = explanation.locator("article.calculation-field").filter({ hasText: "Armor class" }).first();
  const explainedArmorClass = await armorField.locator(".calculation-field-result > span").innerText();
  expect(Number.parseInt(explainedArmorClass, 10)).toBe(Number.parseInt(displayedArmorClass, 10));
  const armorTerms = armorField.getByRole("list", { name: "Ordered terms for Armor class" });
  await expect(armorTerms.getByRole("listitem").first()).toBeVisible();
  await expect(armorTerms.locator(".calculation-term-value").first()).toHaveText(/[+-]\d+/);

  const overrideForm = explanation.getByRole("form", { name: "Create calculation override" });
  const overrideField = overrideForm.getByRole("combobox").first();
  const armorOption = overrideField.locator("option").filter({ hasText: "Armor class" }).first();
  const armorFieldId = await armorOption.getAttribute("value");
  expect(armorFieldId).toBeTruthy();
  await overrideField.selectOption(armorFieldId!);
  await overrideForm.getByRole("combobox").nth(1).selectOption("house_rule");
  await overrideForm.getByRole("textbox", { name: "Effective value" }).fill("99");
  await overrideForm.getByRole("textbox", { name: "Reason" }).fill("E2E compatibility provenance check");
  await overrideForm.getByRole("button", { name: "Record override" }).click();
  await expect(statusMessage(page, "Override recorded for Armor class.")).toBeVisible();
  const overrideLedger = explanation.getByRole("region", { name: "Manual and override ledger" });
  await expect(overrideLedger).toContainText("Armor class");
  await expect(overrideLedger).toContainText("99");
  await expect(overrideLedger).toContainText("Override");

  const overrideHistory = explanation.getByRole("region", { name: "Durable calculation override history" });
  const recordedOverride = overrideHistory
    .getByRole("listitem")
    .filter({ hasText: "E2E compatibility provenance check" })
    .first();
  const clearReason = "E2E isolation cleanup after compatibility check";
  await recordedOverride.getByRole("textbox", { name: "Reason to clear Armor class override" }).fill(clearReason);
  await recordedOverride.getByRole("button", { name: "Clear override" }).click();
  await expect(statusMessage(page, "Override cleared for Armor class.")).toBeVisible();
  await expect(recordedOverride).toContainText("cleared");
  await expect(recordedOverride).toContainText(`Cleared: ${clearReason}`);
  await expect(overrideLedger).not.toContainText("Armor class");

  const compendiumTab = await openInspectorPanel(page, "Compendium");
  const compatibility = compendiumTab.locator("section.compatibility-panel");
  await expect(compatibility.getByRole("heading", { name: "Campaign compatibility" })).toBeVisible();
  await expect(compatibility.locator(".compatibility-report")).toBeVisible();
  await expect(compatibility).toContainText("Rules-system coverage");
  await expect(compatibility).toContainText("Read-only preview. Nothing changed automatically");
  await expect(compatibility.locator(".compatibility-version-grid").getByText("0", { exact: true })).toBeVisible();
  await expect(compatibility).toContainText("Manual calculations");
});

test("T31 creates, edits, and imports representative custom D&D content", async ({ page }) => {
  test.setTimeout(90_000);
  await loginAsDemoGm(page);
  const suffix = Date.now().toString(36);
  const originalName = `E2E Ember Instinct ${suffix}`;
  const revisedName = `${originalName} Revised`;

  const compendiumTab = await openInspectorPanel(page, "Compendium");
  const builder = compendiumTab.locator("section.dnd-custom-content");
  const form = builder.locator("form.custom-content-form");
  await expect(builder.getByRole("heading", { name: "Campaign builders" })).toBeVisible();
  await form.getByRole("combobox", { name: "Content type" }).selectOption("spell");
  await form.getByRole("textbox", { name: "Name", exact: true }).fill(originalName);
  await form.getByRole("textbox", { name: "Summary", exact: true }).fill("A campaign-authored instinct used to prove the full builder boundary.");
  await form.getByRole("textbox", { name: "Description", exact: true }).fill("The bearer can read the drifting ember signs.");
  await form.getByRole("checkbox", { name: "Verbal component" }).uncheck();
  await form.getByRole("textbox", { name: "Manual adjudication notes" }).fill("The exact benefit remains deliberately descriptive and requires a table ruling.");
  await form.getByRole("button", { name: "Preview", exact: true }).click();
  const preview = form.getByRole("article", { name: "Custom content preview" });
  await expect(preview).toContainText(originalName);
  await expect(preview).toContainText("1 manual-review warning");
  await form.getByRole("button", { name: "Create reviewed content" }).click();
  await expect(statusMessage(page, `${originalName} created.`)).toBeVisible();

  let customRow = builder.getByRole("listitem").filter({ hasText: originalName });
  await expect(customRow).toContainText("version 1.0.0");
  await customRow.getByRole("button", { name: "Edit" }).click();
  await form.getByRole("textbox", { name: "Name", exact: true }).fill(revisedName);
  await form.getByRole("textbox", { name: "Content version" }).fill("1.1.0");
  await form.getByRole("textbox", { name: "Description", exact: true }).fill("The revised bearer reads ember signs and remembers their source.");
  await form.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(preview).toContainText(revisedName);
  await form.getByRole("button", { name: "Save reviewed update" }).click();
  await expect(statusMessage(page, `${revisedName} updated.`)).toBeVisible();
  customRow = builder.getByRole("listitem").filter({ hasText: revisedName });
  await expect(customRow).toContainText("version 1.1.0");

  const catalog = compendiumTab.locator("section.standalone-compendium");
  await catalog.getByRole("combobox", { name: "Actor for actions" }).selectOption({ label: "Valen Ash" });
  await catalog.getByRole("searchbox", { name: "Search" }).fill(revisedName);
  const entry = catalog.locator("article.compendium-entry").filter({ hasText: revisedName });
  await expect(entry).toContainText("Campaign homebrew v1");
  await expect(entry).toContainText("v1.1.0");
  await expect(entry).toContainText("Private home game");
  await entry.getByRole("button", { name: "Import to Valen Ash" }).click();
  await expect(catalog.locator(".admin-status")).toContainText(`${revisedName}: imported.`);
});

test("T33 completes summon, command, dismiss, transform, and revert journeys", async ({ page }) => {
  test.setTimeout(120_000);
  await loginAsDemoGm(page);
  const suffix = Date.now().toString(36);
  const sourceName = `E2E Controller ${suffix}`;
  const targetName = `E2E Transform Target ${suffix}`;
  const summonName = `E2E Ember Spirit ${suffix}`;
  const transformedName = `E2E Ash Form ${suffix}`;
  const sourceActor = await createSystemCharacter(page, { templateId: "fighter", name: sourceName });
  await createSystemCharacter(page, { templateId: "rogue", name: targetName });
  await createActorFeature(page, sourceActor.id, `E2E Ember Command ${suffix}`);
  await page.reload();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  const compendiumTab = await openInspectorPanel(page, "Compendium");
  const controlled = compendiumTab.locator("section.controlled-creatures-panel");
  await expect(controlled.getByRole("heading", { name: "Summons, transformations, and companions" })).toBeVisible();

  await controlled.getByRole("combobox", { name: "Lifecycle" }).selectOption("summon");
  await controlled.getByRole("combobox", { name: "Source actor" }).selectOption({ label: sourceName });
  await selectFirstRealOption(controlled.getByRole("combobox", { name: "Source spell or feature" }));
  await controlled.getByRole("textbox", { name: "Rules/content version" }).fill("SRD 5.2.1");
  await selectFirstRealOption(controlled.getByRole("combobox", { name: "Token scene" }));
  await controlled.getByRole("textbox", { name: "Reviewed form name" }).fill(summonName);
  await controlled.getByRole("spinbutton", { name: "Current HP" }).fill("7");
  await controlled.getByRole("spinbutton", { name: "Maximum HP" }).fill("7");
  await previewAndConfirmControlledLifecycle(controlled);
  await expect(statusMessage(page, "Controlled creature created.")).toBeVisible();

  let lifecycleRow = controlled.getByRole("listitem").filter({ hasText: summonName });
  await expect(lifecycleRow).toContainText("Summon");
  await lifecycleRow.getByRole("textbox", { name: "Command note" }).fill("Guard the vault threshold");
  await lifecycleRow.getByRole("button", { name: "Record command" }).click();
  await expect(statusMessage(page, `${summonName} command recorded (bonus action).`)).toBeVisible();
  lifecycleRow = controlled.getByRole("listitem").filter({ hasText: summonName });
  await expect(lifecycleRow).toContainText("Last commanded");
  await lifecycleRow.getByRole("button", { name: "Dismiss" }).click();
  await expect(statusMessage(page, `${summonName} dismissed.`)).toBeVisible();
  await expect(controlled.getByRole("listitem").filter({ hasText: summonName })).toHaveCount(0);

  await controlled.getByRole("combobox", { name: "Lifecycle" }).selectOption("transformation");
  await controlled.getByRole("combobox", { name: "Source actor" }).selectOption({ label: sourceName });
  await selectFirstRealOption(controlled.getByRole("combobox", { name: "Source spell or feature" }));
  await controlled.getByRole("textbox", { name: "Rules/content version" }).fill("SRD 5.2.1");
  await controlled.getByRole("combobox", { name: "Transformation target" }).selectOption({ label: targetName });
  await controlled.getByRole("textbox", { name: "Reviewed form name" }).fill(transformedName);
  await controlled.getByRole("spinbutton", { name: "Current HP" }).fill("12");
  await controlled.getByRole("spinbutton", { name: "Maximum HP" }).fill("12");
  await previewAndConfirmControlledLifecycle(controlled);
  await expect(statusMessage(page, "Transformation applied from the reviewed snapshot.")).toBeVisible();

  lifecycleRow = controlled.getByRole("listitem").filter({ hasText: transformedName });
  await expect(lifecycleRow).toContainText("Transformation");
  await lifecycleRow.getByRole("button", { name: "Revert form" }).click();
  await expect(statusMessage(page, `${transformedName} reverted to its preserved form.`)).toBeVisible();
  await expect(controlled.getByRole("listitem").filter({ hasText: transformedName })).toHaveCount(0);
  await expect(compendiumTab.locator("section.standalone-compendium").getByRole("combobox", { name: "Actor for actions" })).toContainText(targetName);
});

test("T35 creates, rotates, tests, and disables a campaign webhook", async ({ page }) => {
  test.setTimeout(90_000);
  await loginAsDemoGm(page);
  const suffix = Date.now().toString(36);
  const webhookName = `E2E Campaign Hook ${suffix}`;
  const managePanel = await openManageCampaign(page);
  const webhooks = managePanel.locator("section.campaign-webhooks-panel");
  await expect(webhooks.getByText("Outbound Webhooks", { exact: true })).toBeVisible();

  const createDrawer = webhooks.locator("details.webhook-create-drawer");
  await createDrawer.locator("summary").click();
  await createDrawer.getByRole("textbox", { name: "Name", exact: true }).fill(webhookName);
  await createDrawer.getByRole("textbox", { name: "HTTPS endpoint URL" }).fill(`https://example.com/open-tabletop/${suffix}`);
  await createDrawer.getByRole("button", { name: "Create webhook" }).click();
  await expect(statusMessage(page, "Campaign webhook created")).toBeVisible();
  await expect(webhooks.getByRole("alert")).toContainText("Signing secret shown once");

  let card = webhooks.locator("article.webhook-card").filter({ hasText: webhookName });
  await expect(card.locator(".webhook-card-heading .webhook-status")).toHaveText("Enabled");
  const actions = card.locator(".webhook-actions");
  await actions.getByRole("button", { name: "Rotate secret" }).click();
  await card.getByRole("group", { name: `Confirm secret rotation for ${webhookName}` }).getByRole("button", { name: "Confirm rotation" }).click();
  await expect(statusMessage(page, `Signing secret rotated for ${webhookName}`)).toBeVisible();
  await expect(webhooks.getByRole("alert")).toContainText("The old secret is invalid now.");

  card = webhooks.locator("article.webhook-card").filter({ hasText: webhookName });
  await card.locator(".webhook-actions").getByRole("button", { name: "Test", exact: true }).click();
  await expect(statusMessage(page, `Test delivery queued for ${webhookName}`)).toBeVisible();
  await expect(card.getByLabel(`Delivery ledger for ${webhookName}`)).toBeVisible();

  await card.locator(".webhook-actions").getByRole("button", { name: "Disable" }).click();
  await expect(statusMessage(page, `Webhook ${webhookName} disabled`)).toBeVisible();
  card = webhooks.locator("article.webhook-card").filter({ hasText: webhookName });
  await expect(card.locator(".webhook-card-heading .webhook-status")).toHaveText("Disabled");
  await expect(card.locator(".webhook-actions").getByRole("button", { name: "Test", exact: true })).toBeEnabled();
});
