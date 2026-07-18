import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const apiPort = Number(process.env.OTTE_E2E_API_PORT ?? 4100);
const webPort = Number(process.env.OTTE_E2E_WEB_PORT ?? 5174);
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const webBaseUrl = `http://127.0.0.1:${webPort}`;
const apiControlBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_API_CONTROL_PORT ?? apiPort + 1000}`;
const campaignId = "camp_demo";
const providerDelayMarker = "[e2e-provider-delay]";

interface BrowserApiResult<T> {
  status: number;
  body: T;
}

interface AiThreadSummary {
  id: string;
  status?: "running" | "completed" | "failed" | "cancelled";
  prompt?: string;
  assistantMessage?: string;
}

interface AiThreadResponse {
  thread: AiThreadSummary;
}

interface CombatSummary {
  id: string;
  campaignId: string;
  active: boolean;
  round: number;
  turnIndex: number;
  manualTurnOrder?: boolean;
  combatants: unknown[];
  updatedAt: string;
}

interface CampaignSnapshot {
  combats: CombatSummary[];
  bundled?: {
    aiThreads?: AiThreadSummary[];
  };
}

interface CampaignSummary {
  id: string;
  updatedAt: string;
}

async function loginAsDemoGm(page: Page): Promise<void> {
  await page.goto(webBaseUrl);
  await page.getByRole("button", { name: "Demo GM", exact: true }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault", exact: true })).toBeVisible();
}

async function browserApi<T>(
  page: Page,
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: Record<string, unknown>,
): Promise<BrowserApiResult<T>> {
  return page.evaluate(async ({ url, method: requestMethod, requestBody, idempotencyKey }) => {
    const response = await fetch(url, {
      method: requestMethod,
      credentials: "include",
      headers: {
        ...(requestBody ? { "content-type": "application/json" } : {}),
        ...(requestMethod === "GET" ? {} : { "idempotency-key": idempotencyKey }),
      },
      ...(requestBody ? { body: JSON.stringify(requestBody) } : {}),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: (text ? JSON.parse(text) : undefined) as T,
    };
  }, {
    url: `${apiBaseUrl}${path}`,
    method,
    requestBody: body,
    idempotencyKey: `e2e-ai-concurrency:${randomUUID()}`,
  });
}

test("a blocked AI provider does not block combat and reconnect restores both durable outcomes", async ({ browser, request }) => {
  test.setTimeout(60_000);
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const aiPage = await firstContext.newPage();
  const tablePage = await secondContext.newPage();
  let aiResponsePromise: Promise<BrowserApiResult<AiThreadResponse>> | undefined;

  try {
    const reset = await request.post(`${apiControlBaseUrl}/ai/reset`);
    expect(reset.ok(), await reset.text()).toBe(true);
    await Promise.all([loginAsDemoGm(aiPage), loginAsDemoGm(tablePage)]);
    const campaign = await browserApi<CampaignSummary>(
      aiPage,
      "GET",
      `/api/v1/campaigns/${campaignId}`,
    );
    expect(campaign.status).toBe(200);

    aiResponsePromise = browserApi<AiThreadResponse>(
      aiPage,
      "POST",
      `/api/v1/campaigns/${campaignId}/ai/threads`,
      {
        prompt: `${providerDelayMarker} hold this turn while another browser updates combat`,
        approvalMode: "manual",
        expectedUpdatedAt: campaign.body.updatedAt,
      },
    );
    void aiResponsePromise.catch(() => undefined);

    let runningThread: AiThreadSummary | undefined;
    await expect.poll(async () => {
      const response = await browserApi<AiThreadSummary[]>(tablePage, "GET", `/api/v1/campaigns/${campaignId}/ai/threads`);
      expect(response.status).toBe(200);
      runningThread = response.body.find((thread) => thread.prompt?.includes(providerDelayMarker));
      return runningThread?.status;
    }, { timeout: 10_000, intervals: [50, 100, 250] }).toBe("running");

    const campaignBeforeCombat = await browserApi<CampaignSummary>(
      tablePage,
      "GET",
      `/api/v1/campaigns/${campaignId}`,
    );
    expect(campaignBeforeCombat.status).toBe(200);

    const combatMutation = await browserApi<CombatSummary>(
      tablePage,
      "POST",
      `/api/v1/campaigns/${campaignId}/combats`,
      {
        manualTurnOrder: true,
        combatants: [],
        expectedUpdatedAt: campaignBeforeCombat.body.updatedAt,
      },
    );
    expect(combatMutation.status, JSON.stringify(combatMutation.body)).toBe(200);
    expect(combatMutation.body).toMatchObject({ campaignId, active: true, manualTurnOrder: true });

    const providerState = await Promise.race([
      aiResponsePromise.then(() => "settled" as const),
      new Promise<"blocked">((resolve) => setTimeout(() => resolve("blocked"), 150)),
    ]);
    expect(providerState).toBe("blocked");

    const release = await request.post(`${apiControlBaseUrl}/ai/release`);
    expect(release.ok(), await release.text()).toBe(true);
    const aiResponse = await aiResponsePromise;
    expect(aiResponse.status).toBe(200);
    expect(aiResponse.body.thread).toMatchObject({
      id: runningThread?.id,
      status: "completed",
      assistantMessage: "The controlled E2E provider turn completed after the table mutation.",
    });

    const reconnectedSnapshot = tablePage.waitForResponse(
      (response) => response.request().method() === "GET"
        && new URL(response.url()).pathname === `/api/v1/campaigns/${campaignId}/snapshot`
        && response.ok(),
      { timeout: 30_000 },
    );
    const beforeRestart = await request.get(`${apiControlBaseUrl}/status`);
    expect(beforeRestart.ok(), await beforeRestart.text()).toBe(true);
    const beforeRestartBody = await beforeRestart.json() as { generation: number; running: boolean };
    expect(beforeRestartBody.running).toBe(true);

    const restart = await request.post(`${apiControlBaseUrl}/restart`);
    expect(restart.ok(), await restart.text()).toBe(true);
    expect(await restart.json()).toMatchObject({ generation: beforeRestartBody.generation + 1, restarted: true });
    await expect.poll(
      async () => request.get(`${apiBaseUrl}/api/v1/health`).then((response) => response.ok()).catch(() => false),
      { timeout: 30_000 },
    ).toBe(true);

    const snapshotResponse = await reconnectedSnapshot;
    const snapshot = await snapshotResponse.json() as CampaignSnapshot;
    expect(snapshot.combats).toContainEqual(expect.objectContaining({
      id: combatMutation.body.id,
      active: true,
      manualTurnOrder: true,
      updatedAt: combatMutation.body.updatedAt,
    }));
    expect(snapshot.bundled?.aiThreads).toContainEqual(expect.objectContaining({
      id: aiResponse.body.thread.id,
      status: "completed",
      assistantMessage: "The controlled E2E provider turn completed after the table mutation.",
    }));
    await expect(tablePage.getByRole("heading", { name: "The Ember Vault", exact: true })).toBeVisible();
  } finally {
    await request.post(`${apiControlBaseUrl}/ai/release`).catch(() => undefined);
    await aiResponsePromise?.catch(() => undefined);
    await firstContext.close().catch(() => undefined);
    await secondContext.close().catch(() => undefined);
  }
});
