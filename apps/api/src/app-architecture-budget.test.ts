import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appPath = fileURLToPath(new URL("./app.ts", import.meta.url));
const appSource = readFileSync(appPath, "utf8");
const campaignSessionRoutesSource = readFileSync(new URL("./campaign-session-routes.ts", import.meta.url), "utf8");
const campaignWebhookRoutesSource = readFileSync(new URL("./campaign-webhook-routes.ts", import.meta.url), "utf8");
const campaignWebhookLedgerSource = readFileSync(new URL("./campaign-webhook-ledger.ts", import.meta.url), "utf8");
const sceneDelegationRoutesSource = readFileSync(new URL("./scene-delegation-routes.ts", import.meta.url), "utf8");
const dndInventoryRouteTypesSource = readFileSync(new URL("./dnd-inventory-route-types.ts", import.meta.url), "utf8");
const adminIdentityRoutesSource = readFileSync(new URL("./admin-identity-routes.ts", import.meta.url), "utf8");
const scimRoutesSource = readFileSync(new URL("./scim-routes.ts", import.meta.url), "utf8");
const adminAssetRoutesSource = readFileSync(new URL("./admin-asset-routes.ts", import.meta.url), "utf8");

describe("API composition-root architecture budget", () => {
  it("keeps app.ts below the remediated 38,500-line ceiling", () => {
    const lineCount = appSource.split(/\r?\n/).length;
    expect(lineCount).toBeLessThanOrEqual(38_500);
  });

  it("keeps asset and archive machinery behind focused modules", () => {
    expect(appSource).toContain('from "./asset-operations.js"');
    expect(appSource).toContain('from "./archive-operations.js"');
    expect(appSource).not.toContain("async function migrateStoredAssets(");
    expect(appSource).not.toContain("function archiveForExportScope(");
  });

  it("keeps campaign-session, webhook, and scene-delegation transactions behind focused registrars", () => {
    expect(appSource).toContain('from "./campaign-session-routes.js"');
    expect(appSource).toContain('from "./campaign-webhook-routes.js"');
    expect(appSource).toContain('from "./campaign-webhook-ledger.js"');
    expect(appSource).toContain('from "./scene-delegation-routes.js"');
    expect(appSource).not.toContain('app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/sessions"');
    expect(appSource).not.toContain('app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/webhooks"');
    expect(appSource).not.toContain('app.get<{ Params: { sceneId: string } }>("/api/v1/scenes/:sceneId/delegations"');
    expect(campaignSessionRoutesSource).toContain("export function registerCampaignSessionRoutes");
    expect(campaignWebhookRoutesSource).toContain("export function registerCampaignWebhookRoutes");
    expect(campaignWebhookLedgerSource).toContain("export function createCampaignWebhookDelivery");
    expect(sceneDelegationRoutesSource).toContain("export function registerSceneDelegationRoutes");
    for (const source of [campaignSessionRoutesSource, campaignWebhookRoutesSource, sceneDelegationRoutesSource]) {
      expect(source).not.toMatch(/\/ai(?:\/|\")/);
    }
  });

  it("keeps D&D inventory and commerce request contracts out of the composition root", () => {
    expect(appSource).toContain('from "./dnd-inventory-route-types.js"');
    expect(appSource).not.toContain("interface DndInventoryItemPatchBody");
    expect(dndInventoryRouteTypesSource).toContain("export interface DndInventoryItemPatchBody");
    expect(dndInventoryRouteTypesSource).toContain("export interface DndMerchantCommerceBody");
    expect(dndInventoryRouteTypesSource).not.toMatch(/\/api\/v1\/(?:ai|agent)\//);
  });

  it("keeps identity, SCIM, and asset operator transactions behind focused registrars", () => {
    expect(appSource).toContain('from "./admin-identity-routes.js"');
    expect(appSource).toContain('from "./scim-routes.js"');
    expect(appSource).toContain('from "./admin-asset-routes.js"');
    expect(appSource).not.toContain('app.patch<{ Params: { userId: string }; Body: AdminUserPatchBody }>("/api/v1/admin/users/:userId"');
    expect(appSource).not.toContain('app.post<{ Body: ScimUserInput }>("/api/v1/scim/v2/Users"');
    expect(appSource).not.toContain('app.post<{ Body: AssetMigrationBody }>("/api/v1/admin/assets/migrate"');
    expect(adminIdentityRoutesSource).toContain("export function registerAdminIdentityRoutes");
    expect(scimRoutesSource).toContain("export function registerScimRoutes");
    expect(adminAssetRoutesSource).toContain("export function registerAdminAssetRoutes");
    for (const source of [adminIdentityRoutesSource, scimRoutesSource, adminAssetRoutesSource]) {
      expect(source).not.toMatch(/\/api\/v1\/(?:ai|agent)\//);
    }
  });
});
