import { expect, test, type Locator, type Page } from "@playwright/test";

const apiBaseUrl = `http://127.0.0.1:${Number(process.env.OTTE_E2E_API_PORT ?? 4100)}`;

async function loginDemoGm(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "gm@example.test" }),
    });
    if (!response.ok) throw new Error(await response.text());
    const login = await response.json() as { user: { id: string } };
    localStorage.setItem("otte:userId", login.user.id);
    localStorage.setItem("otte:sessionTransport", "cookie");
  }, apiBaseUrl);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
}

async function openPeople(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  const panel = page.getByRole("region", { name: "Manage workspace panel" });
  await panel.getByRole("button", { name: /^People\b/ }).click();
  await expect(panel.getByRole("region", { name: "Campaign members" })).toBeVisible();
  return panel;
}

test("owner changes an invited member role and removal revokes that live session", async ({ browser, page }) => {
  const email = `campaign-member-${Date.now()}@example.test`;
  const displayName = "Campaign Member E2E";
  await loginDemoGm(page);

  let people = await openPeople(page);
  await people.getByRole("textbox", { name: "Invite email", exact: true }).fill(email);
  await people.getByRole("combobox", { name: "Invite role" }).selectOption("player");
  await people.getByRole("button", { name: "Invite", exact: true }).click();
  const inviteToken = await people.locator('input[aria-label="Invite token"][readonly]').inputValue();

  const playerContext = await browser.newContext();
  const playerPage = await playerContext.newPage();
  await playerPage.goto(`/join?invite=${encodeURIComponent(inviteToken)}`);
  await playerPage.getByRole("textbox", { name: "Join email" }).fill(email);
  await playerPage.getByRole("textbox", { name: "Display name" }).fill(displayName);
  await playerPage.getByLabel("Join password").fill("correct horse");
  await playerPage.getByRole("button", { name: "Accept Invite" }).click();
  await expect(playerPage.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  await page.reload();
  people = await openPeople(page);
  const member = people.locator("article", { hasText: displayName });
  const roleUpdate = page.waitForResponse((response) => response.request().method() === "PATCH" && /\/campaigns\/camp_demo\/members\//.test(response.url()));
  await member.getByRole("combobox", { name: `Campaign role for ${displayName}` }).selectOption("observer");
  expect((await roleUpdate).status()).toBe(200);
  await expect(member.getByRole("combobox", { name: `Campaign role for ${displayName}` })).toHaveValue("observer");

  await member.getByRole("button", { name: "Review removal" }).click();
  const review = people.getByRole("alertdialog", { name: `Remove ${displayName} from campaign` });
  await expect(review).toContainText("immediately ends campaign access");
  const removal = page.waitForResponse((response) => response.request().method() === "DELETE" && /\/campaigns\/camp_demo\/members\//.test(response.url()));
  await review.getByRole("button", { name: "Remove campaign member" }).click();
  expect((await removal).status()).toBe(200);
  await expect(people.locator("article", { hasText: displayName })).toHaveCount(0);

  const accessStatus = await playerPage.evaluate(async (baseUrl) => {
    return (await fetch(`${baseUrl}/api/v1/campaigns/camp_demo/snapshot`, { credentials: "include" })).status;
  }, apiBaseUrl);
  expect(accessStatus).toBe(403);
  await playerContext.close();
});
