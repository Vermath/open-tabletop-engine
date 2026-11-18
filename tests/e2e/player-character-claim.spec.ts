import { expect, test } from "@playwright/test";

const api = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}/api/v1`;

test("an invited player claims a GM-prepared character, reconnects to its token and rolls from its sheet", async ({ page, browser }) => {
  test.slow();
  const name = "Claimant " + Date.now();
  const email = `claim-${Date.now()}@example.test`;
  await page.goto("/");
  const fixture = await page.evaluate(async ({ api, name }) => {
    const request = async (path: string, body?: unknown) => {
      const response = await fetch(api + path, { method: body ? "POST" : "GET", credentials: "include",
        headers: body ? { "content-type": "application/json", "idempotency-key": crypto.randomUUID() } : {},
        body: body ? JSON.stringify(body) : undefined });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    };
    const gm = await request("/auth/login", { email: "gm@example.test" });
    localStorage.setItem("otte:userId", gm.user.id);
    localStorage.setItem("otte:sessionTransport", "cookie");
    const campaign = "/campaigns/camp_demo";
    const { actor } = await request(campaign + "/systems/dnd-5e-srd/characters", { templateId: "fighter", name });
    const scenes = await request(campaign + "/scenes") as { id: string; active: boolean; updatedAt: string }[];
    const scene = scenes.find((entry) => entry.active)!;
    const token = await request(`/scenes/${scene.id}/tokens`, { name, actorId: actor.id, x: 80, y: 80, ownerUserIds: [gm.user.id], expectedUpdatedAt: scene.updatedAt });
    return { actorId: actor.id as string, tokenId: token.id as string };
  }, { api, name });
  await page.reload();
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  const manage = page.getByRole("region", { name: "Manage workspace panel" });
  await manage.getByRole("button", { name: /^People\b/ }).click();
  await manage.getByRole("button", { name: "Offer " + name, exact: true }).click();
  await expect(manage.getByRole("button", { name: "Withdraw " + name, exact: true })).toBeVisible();
  await manage.getByRole("textbox", { name: "Invite email", exact: true }).fill(email);
  await manage.getByRole("combobox", { name: "Invite role" }).selectOption("player");
  await manage.getByRole("button", { name: "Invite", exact: true }).click();
  const invite = await manage.locator('input[aria-label="Invite token"][readonly]').inputValue();

  const context = await browser.newContext();
  try {
    const player = await context.newPage();
    await player.goto("/join?invite=" + encodeURIComponent(invite));
    await player.getByRole("textbox", { name: "Join email" }).fill(email);
    await player.getByRole("textbox", { name: "Display name" }).fill("Invited player");
    await player.getByLabel("Join password").fill("correct horse battery staple");
    await player.getByRole("button", { name: "Accept Invite" }).click();
    const choice = player.getByRole("button", { name: "Claim " + name, exact: true });
    await expect(choice).toBeVisible();
    await choice.click();
    const token = player.locator(`button[data-token-id="${fixture.tokenId}"]`);
    await expect(token).toHaveAttribute("aria-pressed", "true");
    await expect(player.getByRole("region", { name: "Choose your character" })).toHaveCount(0);
    await player.reload();
    await expect(token).toHaveAttribute("aria-pressed", "true");
    const rollResponse = player.waitForResponse((response) => {
      const request = response.request();
      if (request.method() !== "POST" || !response.url().endsWith(`/actors/${fixture.actorId}/roll`)) return false;
      const body = request.postDataJSON();
      return body.rollId === "ability-strength" && body.commit !== false && body.prepare !== true;
    });
    await player.getByRole("button", { name: /Roll Strength check/ }).click();
    const roll = await rollResponse;
    expect(roll.status(), await roll.text()).toBe(200);
    expect((await roll.json()).roll.total).toEqual(expect.any(Number));
  } finally { await context.close(); }
});
