import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import type { Route } from "@playwright/test";
import { expect, test } from "@playwright/test";

const apiBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}`;
const gmHeaders = { "x-user-id": "usr_demo_gm" };
const streamContentType = "application/vnd.open-tabletop.ottx-stream";
const previousBrowserFixtureBytes = 4 * 1024 * 1024;

test("GM streams an above-fixture archive, cancels import, retries, and restores bytes and references", async ({ page }) => {
  test.setTimeout(120_000);
  const destinationChunks: Buffer[] = [];
  let destinationClosed = false;
  let destinationAborted = false;
  await page.exposeFunction("e2eWriteArchiveChunk", (base64: string) => {
    destinationChunks.push(Buffer.from(base64, "base64"));
  });
  await page.exposeFunction("e2eCloseArchiveDestination", () => {
    destinationClosed = true;
  });
  await page.exposeFunction("e2eAbortArchiveDestination", () => {
    destinationAborted = true;
  });
  await page.addInitScript(() => {
    type ArchiveBindings = Window & {
      e2eWriteArchiveChunk: (base64: string) => Promise<void>;
      e2eCloseArchiveDestination: () => Promise<void>;
      e2eAbortArchiveDestination: () => Promise<void>;
    };
    Reflect.set(window, "showSaveFilePicker", async () => ({
      async createWritable() {
        return {
          async write(value: Uint8Array) {
            let binary = "";
            for (let index = 0; index < value.byteLength; index += 1) binary += String.fromCharCode(value[index]!);
            await (window as unknown as ArchiveBindings).e2eWriteArchiveChunk(btoa(binary));
            // Slow the test destination enough for the user-visible progress
            // state to be observable without slowing the network/server path.
            await new Promise((resolve) => window.setTimeout(resolve, 8));
          },
          async close() {
            await (window as unknown as ArchiveBindings).e2eCloseArchiveDestination();
          },
          async abort() {
            await (window as unknown as ArchiveBindings).e2eAbortArchiveDestination();
          },
        };
      },
    }));
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  const originalScene = await apiJson<{ id: string; name: string; backgroundAssetId?: string; updatedAt: string }>(
    await page.request.get(`${apiBaseUrl}/api/v1/scenes/scn_vault_entry`, { headers: gmHeaders }),
  );
  const assetBytes = Buffer.alloc(previousBrowserFixtureBytes + 65_537, 0x5a);
  expect(assetBytes.byteLength).toBeGreaterThan(previousBrowserFixtureBytes);
  const uploaded = await apiJson<{ asset: { id: string; updatedAt: string }; scene: { updatedAt: string } }>(
    await page.request.post(
      `${apiBaseUrl}/api/v1/campaigns/camp_demo/assets/upload?sceneId=scn_vault_entry&setAsBackground=true&expectedSceneUpdatedAt=${encodeURIComponent(originalScene.updatedAt)}`,
      {
        headers: {
          ...gmHeaders,
          "idempotency-key": `e2e-stream-upload:${randomUUID()}`,
          "content-type": "image/png",
          "x-asset-name": encodeURIComponent("Large streamed recovery map.png"),
        },
        data: assetBytes,
      },
    ),
  );

  await page.reload();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  await openArchives(page);
  const exportWizard = page.getByRole("region", { name: "Archive export wizard" });
  await exportWizard.getByRole("button", { name: "Export Large Archive (.ottx)" }).click();
  const transfer = page.getByLabel("Archive transfer progress");
  await expect(transfer).toContainText("transferring", { timeout: 15_000 });
  await expect(transfer.getByRole("progressbar")).toBeVisible();
  await expect(transfer).toContainText("complete", { timeout: 30_000 });
  expect(destinationClosed).toBe(true);
  expect(destinationAborted).toBe(false);
  const archiveBytes = Buffer.concat(destinationChunks);
  expect(archiveBytes.subarray(0, 10).toString("ascii")).toBe("OTTXSTRM1\n");
  expect(archiveBytes.byteLength).toBeGreaterThan(assetBytes.byteLength);

  const exportedScene = await apiJson<{ updatedAt: string }>(
    await page.request.get(`${apiBaseUrl}/api/v1/scenes/scn_vault_entry`, { headers: gmHeaders }),
  );
  await apiJson(await page.request.patch(`${apiBaseUrl}/api/v1/scenes/scn_vault_entry`, {
    headers: { ...gmHeaders, "idempotency-key": `e2e-stream-mutate:${randomUUID()}` },
    data: {
      name: "Mutated after streamed export",
      backgroundAssetId: null,
      expectedUpdatedAt: exportedScene.updatedAt,
    },
  }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  await openArchives(page);

  let releaseInterceptedImport: (() => void) | undefined;
  let markImportIntercepted: (() => void) | undefined;
  const importIntercepted = new Promise<void>((resolve) => { markImportIntercepted = resolve; });
  const routeGate = new Promise<void>((resolve) => { releaseInterceptedImport = resolve; });
  const firstImportHandler = async (route: Route) => {
    markImportIntercepted?.();
    await routeGate;
    await route.abort("aborted").catch(() => undefined);
  };
  await page.route("**/api/v1/import/campaign/stream?*", firstImportHandler);
  await page.getByLabel("Import campaign archive").setInputFiles({
    name: "large-campaign.ottx",
    mimeType: streamContentType,
    buffer: archiveBytes,
  });
  await importIntercepted;
  await expect(transfer).toContainText(/transferring|validating/);
  const cancel = transfer.getByRole("button", { name: "Cancel archive import" });
  await expect(cancel).toBeVisible();
  await cancel.click();
  await expect(transfer).toContainText("cancelled");
  await expect(transfer).toContainText("same idempotency key");
  await expect(page.getByLabel("Archive import recovery")).toContainText("Import cancelled");
  releaseInterceptedImport?.();
  await page.unroute("**/api/v1/import/campaign/stream?*", firstImportHandler);

  await page.getByRole("button", { name: "Retry import" }).click();
  await expect(transfer).toContainText(/transferring|validating/, { timeout: 15_000 });
  await expect(transfer).toContainText("complete", { timeout: 30_000 });
  await expect(page.getByLabel("Archive import recovery")).toHaveCount(0);

  const restoredScene = await apiJson<{ name: string; backgroundAssetId?: string; updatedAt: string }>(
    await page.request.get(`${apiBaseUrl}/api/v1/scenes/scn_vault_entry`, { headers: gmHeaders }),
  );
  expect(restoredScene.name).toBe(originalScene.name);
  expect(restoredScene.backgroundAssetId).toBe(uploaded.asset.id);
  const restoredBlob = await page.request.get(`${apiBaseUrl}/api/v1/assets/${uploaded.asset.id}/blob`, { headers: gmHeaders });
  expect(restoredBlob.ok(), await restoredBlob.text()).toBe(true);
  expect(sha256(await restoredBlob.body())).toBe(sha256(assetBytes));

  // Leave the shared seeded campaign in its pre-test scene shape. The E2E API
  // process is ephemeral, so lifecycle deletion is enough for the large test
  // object while preserving normal object-compensation assertions above.
  await apiJson(await page.request.patch(`${apiBaseUrl}/api/v1/scenes/scn_vault_entry`, {
    headers: { ...gmHeaders, "idempotency-key": `e2e-stream-scene-cleanup:${randomUUID()}` },
    data: {
      name: originalScene.name,
      backgroundAssetId: originalScene.backgroundAssetId ?? null,
      expectedUpdatedAt: restoredScene.updatedAt,
    },
  }));
  const assets = await apiJson<Array<{ id: string; updatedAt: string }>>(
    await page.request.get(`${apiBaseUrl}/api/v1/campaigns/camp_demo/assets`, { headers: gmHeaders }),
  );
  const cleanupAsset = assets.find((asset) => asset.id === uploaded.asset.id);
  expect(cleanupAsset).toBeDefined();
  await apiJson(await page.request.patch(`${apiBaseUrl}/api/v1/assets/${uploaded.asset.id}/lifecycle`, {
    headers: { ...gmHeaders, "idempotency-key": `e2e-stream-asset-cleanup:${randomUUID()}` },
    data: { status: "deleted", reason: "T33 browser stream E2E cleanup", expectedUpdatedAt: cleanupAsset!.updatedAt },
  }));
});

async function openArchives(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  const panel = page.getByRole("region", { name: "Manage workspace panel" });
  await expect(panel).toBeVisible();
  await panel.locator(".manage-category-button", { hasText: "Archives" }).click();
}

async function apiJson<Result = unknown>(response: import("@playwright/test").APIResponse): Promise<Result> {
  const body = await response.text();
  expect(response.ok(), body).toBe(true);
  return JSON.parse(body) as Result;
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
