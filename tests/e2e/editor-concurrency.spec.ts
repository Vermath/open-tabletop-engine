import { randomUUID } from "node:crypto";
import { expect, test, type APIResponse, type Page } from "@playwright/test";

const apiBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}`;
const campaignPath = "/api/v1/campaigns/camp_demo";
const gmHeaders = { "x-user-id": "usr_demo_gm" };

interface SavedRecord {
  id: string;
  updatedAt: string;
}

function mutationHeaders() {
  return { ...gmHeaders, "idempotency-key": `e2e-editor:${randomUUID()}` };
}

async function json<T = SavedRecord>(pending: Promise<Pick<APIResponse, "ok" | "text">>): Promise<T> {
  const response = await pending;
  const body = await response.text();
  expect(response.ok(), body).toBe(true);
  return JSON.parse(body) as T;
}

async function loginDemoGm(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM", exact: true }).click();
  await expect(page.getByLabel("Current campaign", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");
}

async function deleteRecord(page: Page, path: string) {
  const current = await json(page.request.get(`${apiBaseUrl}${path}`, { headers: gmHeaders }));
  await json(page.request.delete(`${apiBaseUrl}${path}?expectedUpdatedAt=${encodeURIComponent(current.updatedAt)}`, {
    headers: mutationHeaders(),
  }));
}

const editors = [
  { kind: "session", panel: "Sessions", region: "Session Desk", collection: "sessions", resource: "campaign-sessions", titleKey: "title", titleLabel: "Session title", contentKey: "notes", contentLabel: "Session notes", save: "Save" },
  { kind: "world", panel: "Worlds", region: "World Atlas", collection: "worlds", resource: "worlds", titleKey: "name", titleLabel: "World name", contentKey: "description", contentLabel: "World description", save: "Save world" },
  { kind: "handout", panel: "Handouts", region: "Handout Library", collection: "handouts", resource: "handouts", titleKey: "title", titleLabel: "Handout title", contentKey: "body", contentLabel: "Handout body", save: "Save handout" },
] as const;

for (const editor of editors) {
  test(`${editor.kind} editor preserves a dirty title when another writer changes saved content`, async ({ page }) => {
    const title = `Concurrent ${editor.kind} ${randomUUID().slice(0, 8)}`;
    const originalContent = `Original ${editor.kind} content.`;
    const remoteContent = `Another GM saved new ${editor.kind} content.`;
    await loginDemoGm(page);
    const campaign = await json(page.request.get(`${apiBaseUrl}${campaignPath}`, { headers: gmHeaders }));
    const created = await json(page.request.post(`${apiBaseUrl}${campaignPath}/${editor.collection}`, {
      headers: mutationHeaders(),
      data: {
        ...(editor.kind === "session" ? {} : { expectedUpdatedAt: campaign.updatedAt }),
        [editor.titleKey]: title,
        [editor.contentKey]: originalContent,
        ...(editor.kind === "handout" ? { visibility: "public", visibleToUserIds: [], visibleToActorIds: [], assetIds: [], tags: [] } : {}),
      },
    }));
    const recordPath = `/api/v1/${editor.resource}/${created.id}`;

    try {
      await page.getByRole("button", { name: "Prep", exact: true }).click();
      await page.getByRole("tab", { name: editor.panel, exact: true }).click();
      const panel = page.getByRole("region", { name: editor.region, exact: true });
      if (editor.kind === "world") {
        await panel.getByRole("group", { name: "Filter prep scenes by world" }).getByRole("button", { name: new RegExp(`^${title} `) }).click();
      } else {
        await panel.getByRole("listitem").filter({ hasText: title }).getByRole("button").first().click();
      }
      const form = panel.getByRole("form", { name: `Edit ${editor.kind} ${title}`, exact: true });
      const titleField = form.getByRole("textbox", { name: editor.titleLabel, exact: true });
      const contentField = form.getByRole("textbox", { name: editor.contentLabel, exact: true });
      await expect(contentField).toHaveValue(originalContent);
      await titleField.fill(`${title} local draft`);
      // Opening a handout may mark it read, so obtain the second writer's current revision after opening it.
      const current = await json(page.request.get(`${apiBaseUrl}${recordPath}`, { headers: gmHeaders }));
      await json(page.request.patch(`${apiBaseUrl}${recordPath}`, {
        headers: mutationHeaders(),
        data: { expectedUpdatedAt: current.updatedAt, [editor.contentKey]: remoteContent },
      }));

      const conflict = form.getByRole("alert").filter({ hasText: `This ${editor.kind} changed elsewhere` });
      await expect(conflict).toBeVisible();
      await expect(titleField).toHaveValue(`${title} local draft`);
      await expect(contentField).toHaveValue(originalContent);
      await expect(form.getByRole("button", { name: editor.save, exact: true })).toBeDisabled();
      await conflict.locator("summary").click();
      await expect(conflict.getByText(remoteContent, { exact: editor.kind !== "session" })).toBeVisible();
      const saved = await json(page.request.get(`${apiBaseUrl}${recordPath}`, { headers: gmHeaders }));
      expect(saved).toMatchObject({ [editor.titleKey]: title, [editor.contentKey]: remoteContent });

      await conflict.getByRole("button", { name: "Discard draft and load latest", exact: true }).click();
      await expect(conflict).toHaveCount(0);
      await expect(titleField).toHaveValue(title);
      await expect(contentField).toHaveValue(remoteContent);
      await expect(form.getByRole("button", { name: editor.save, exact: true })).toBeEnabled();
      await titleField.fill(`${title} merged`);
      const confirmedSave = page.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname === recordPath);
      await form.getByRole("button", { name: editor.save, exact: true }).click();
      const result = await json(confirmedSave);
      expect(result).toMatchObject({ [editor.titleKey]: `${title} merged`, [editor.contentKey]: remoteContent });
    } finally {
      await deleteRecord(page, recordPath);
    }
  });
}

test("replacing a session's linked scene clears its old start selection and starts the saved replacement", async ({ page }) => {
  await loginDemoGm(page);
  const campaignName = `Session scene replacement ${randomUUID().slice(0, 8)}`;
  const campaign = await json(page.request.post(`${apiBaseUrl}/api/v1/campaigns`, {
    headers: mutationHeaders(), data: { name: campaignName },
  }));
  const path = `/api/v1/campaigns/${campaign.id}`;

  try {
    const scenes: SavedRecord[] = [];
    for (const name of ["Original linked scene", "Replacement linked scene"]) {
      const latestCampaign = await json(page.request.get(`${apiBaseUrl}${path}`, { headers: gmHeaders }));
      scenes.push(await json(page.request.post(`${apiBaseUrl}${path}/scenes`, {
        headers: mutationHeaders(),
        data: { expectedUpdatedAt: latestCampaign.updatedAt, name, active: scenes.length === 0, width: 900, height: 700, gridSize: 50 },
      })));
    }
    const session = await json(page.request.post(`${apiBaseUrl}${path}/sessions`, {
      headers: mutationHeaders(), data: { title: "Swap the linked scene", sceneIds: [scenes[0]!.id] },
    }));
    await page.reload();
    await page.locator("details.campaign-switcher > summary").click();
    await page.getByRole("navigation", { name: "Campaigns" }).getByRole("button", { name: campaignName, exact: true }).click();
    await expect(page.getByLabel("Current campaign", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText(campaignName);
    await page.getByRole("button", { name: "Prep", exact: true }).click();
    await page.getByRole("tab", { name: "Sessions", exact: true }).click();
    await page.getByRole("region", { name: "Session Desk" }).getByRole("listitem").filter({ hasText: "Swap the linked scene" }).getByRole("button").first().click();
    const form = page.getByRole("form", { name: "Edit session Swap the linked scene", exact: true });
    const activation = form.getByRole("combobox", { name: "Scene to activate when session starts" });
    await expect(activation).toHaveValue(scenes[0]!.id);
    await form.locator("summary").filter({ hasText: "Linked scenes" }).click();
    await form.getByRole("checkbox", { name: "Original linked scene", exact: true }).uncheck();
    await form.getByRole("checkbox", { name: "Replacement linked scene", exact: true }).check();
    await expect(form.getByRole("button", { name: "Start session", exact: true })).toBeDisabled();
    const savedResponse = page.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname === `/api/v1/campaign-sessions/${session.id}`);
    await form.getByRole("button", { name: "Save", exact: true }).click();
    expect(await json(savedResponse)).toMatchObject({ sceneIds: [scenes[1]!.id] });
    await expect(activation).toHaveValue("");
    await expect(activation.getByRole("option", { name: "Original linked scene", exact: true })).toHaveCount(0);
    await activation.selectOption({ label: "Replacement linked scene" });
    const startedResponse = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/v1/campaign-sessions/${session.id}/start`);
    await form.getByRole("button", { name: "Start session", exact: true }).click();
    const started = await startedResponse;
    expect(started.request().postDataJSON()).toMatchObject({ activateSceneId: scenes[1]!.id });
    expect(await json(Promise.resolve(started))).toMatchObject({ status: "live", sceneIds: [scenes[1]!.id] });
    await expect(form.getByRole("button", { name: "Complete session", exact: true })).toBeEnabled();
    const persistedScenes = await json<Array<SavedRecord & { active: boolean }>>(page.request.get(`${apiBaseUrl}${path}/scenes`, { headers: gmHeaders }));
    expect(persistedScenes.filter((scene) => scene.active).map((scene) => scene.id)).toEqual([scenes[1]!.id]);
  } finally {
    await deleteRecord(page, path);
  }
});
