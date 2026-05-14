import { Buffer } from "node:buffer";
import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";

const apiBaseUrl = `http://127.0.0.1:${Number(process.env.OTTE_E2E_BOOTSTRAP_API_PORT ?? 4110)}`;
const emailWebhookPort = Number(process.env.OTTE_E2E_BOOTSTRAP_EMAIL_WEBHOOK_PORT ?? 4112);
const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
let emailWebhookServer: Server | undefined;
let emailWebhookShouldSucceed = false;
let emailWebhookDeliveries = 0;

test.afterEach(async () => {
  const server = emailWebhookServer;
  emailWebhookServer = undefined;
  emailWebhookShouldSucceed = false;
  emailWebhookDeliveries = 0;
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function startEmailWebhook(): Promise<void> {
  emailWebhookServer = createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/email") {
      response.writeHead(404).end();
      return;
    }
    emailWebhookDeliveries += 1;
    if (!emailWebhookShouldSucceed) {
      response.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ ok: false }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((resolve) => emailWebhookServer!.listen(emailWebhookPort, "127.0.0.1", resolve));
}

function base32Decode(input: string): Buffer {
  const bytes: number[] = [];
  let value = 0;
  let bits = 0;
  for (const char of input.toUpperCase().replace(/[=\s-]/g, "")) {
    const index = base32Alphabet.indexOf(char);
    if (index < 0) throw new Error(`Invalid base32 character: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
      value &= (1 << bits) - 1;
    }
  }
  return Buffer.from(bytes);
}

function totpCode(secret: string, nowMs = Date.now()): string {
  const counter = Math.floor(nowMs / 30_000);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBytes.writeUInt32BE(counter % 0x100000000, 4);
  const digest = createHmac("sha1", base32Decode(secret)).update(counterBytes).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = ((digest[offset]! & 0x7f) << 24) | ((digest[offset + 1]! & 0xff) << 16) | ((digest[offset + 2]! & 0xff) << 8) | (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

test("clean deployment routes to owner bootstrap and opens the starter campaign", async ({ page }) => {
  test.setTimeout(150_000);
  await startEmailWebhook();
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Create Owner" })).toBeVisible();
  await page.getByRole("textbox", { name: "Owner email" }).fill("owner.e2e@example.test");
  await page.getByRole("textbox", { name: "Owner display name" }).fill("Bootstrap Owner");
  await page.getByLabel("Owner password").fill("correct horse");
  await page.getByRole("textbox", { name: "Initial campaign name" }).fill("Bootstrap E2E Campaign");
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page.getByRole("heading", { name: "Bootstrap E2E Campaign" })).toBeVisible();
  await expect(page.getByText("Campaign Settings")).toBeVisible();
  await expect(page.getByRole("button", { name: "Admin" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Demo GM" })).not.toBeVisible();

  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
  await expect(page.getByRole("button", { name: "SSO" })).toHaveCount(0);
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByRole("heading", { name: "Reset Password" })).toBeVisible();
  await page.getByRole("textbox", { name: "Reset email" }).fill("owner.e2e@example.test");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Reset email queued")).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
  await page.getByRole("textbox", { name: "Login email" }).fill("owner.e2e@example.test");
  await page.getByLabel("Login password").fill("correct horse");
  await page.locator("form").filter({ has: page.getByLabel("Login password") }).getByRole("button", { name: "Login" }).click();
  await expect(page.getByRole("heading", { name: "Bootstrap E2E Campaign" })).toBeVisible();

  await page.getByLabel("Current password").fill("correct horse");
  await page.getByLabel("New password").fill("updated horse");
  await page.getByRole("button", { name: "Password" }).click();
  await expect(page.getByText("Password changed")).toBeVisible();
  await page.getByLabel("MFA password").fill("updated horse");
  await page.getByRole("button", { name: "Enable MFA" }).click();
  await expect(page.getByText("Scan or enter the TOTP secret")).toBeVisible();
  const mfaSecret = await page.getByLabel("MFA secret").inputValue();
  await page.getByLabel("MFA code").fill(totpCode(mfaSecret));
  await page.getByRole("button", { name: "Confirm MFA" }).click();
  await expect(page.locator(".status", { hasText: /^MFA enabled$/ })).toBeVisible();
  await expect(page.getByLabel("MFA recovery codes")).toContainText("-");

  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
  await page.getByRole("textbox", { name: "Login email" }).fill("owner.e2e@example.test");
  await page.getByLabel("Login password").fill("updated horse");
  await page.locator("form").filter({ has: page.getByLabel("Login password") }).getByRole("button", { name: "Login" }).click();
  await expect(page.getByText(/mfa_required|MFA code required/)).toBeVisible();
  await page.getByLabel("Login MFA code").fill(totpCode(mfaSecret));
  await page.locator("form").filter({ has: page.getByLabel("Login password") }).getByRole("button", { name: "Login" }).click();
  await expect(page.getByRole("heading", { name: "Bootstrap E2E Campaign" })).toBeVisible();
  await page.getByLabel("MFA password").fill("updated horse");
  await page.getByLabel("MFA code").fill(totpCode(mfaSecret));
  await page.getByRole("button", { name: "Disable MFA" }).click();
  await expect(page.locator(".status", { hasText: /^MFA disabled$/ })).toBeVisible();

  const resetToken = await page.evaluate(
    async ({ apiBaseUrl }) => {
      const bearer = localStorage.getItem("otte:sessionToken");
      if (!bearer) throw new Error("No browser session token available for reset setup");
      const userId = localStorage.getItem("otte:userId");
      if (!userId) throw new Error("No browser user id available for reset setup");
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/users/${encodeURIComponent(userId)}/password-reset`, {
        method: "POST",
        headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
        body: JSON.stringify({ returnTo: `${window.location.origin}/reset-password` })
      });
      if (!response.ok) throw new Error(await response.text());
      const payload = await response.json();
      const token = String(payload.email?.text ?? "").match(/token=(opr_[A-Za-z0-9_-]+)|token: (opr_[A-Za-z0-9_-]+)/)?.slice(1).find(Boolean);
      if (!token) throw new Error("Password reset token not found in outbox text");
      return token;
    },
    { apiBaseUrl }
  );
  await page.goto(`/reset-password?token=${encodeURIComponent(resetToken)}`);
  await expect(page.getByRole("heading", { name: "Reset Password" })).toBeVisible();
  await page.getByLabel("New password").fill("reset horse");
  await page.getByLabel("Confirm password").fill("reset horse");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bootstrap E2E Campaign" })).toBeVisible();

  const workspaceSelector = page.getByLabel("Active organization workspace");
  await expect(workspaceSelector).toContainText("Bootstrap Owner's Workspace - owner - 1 campaigns");
  await page.getByRole("textbox", { name: "New workspace name" }).fill("Side Workspace");
  await page.getByRole("button", { name: "Workspace" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Workspace created: Side Workspace" })).toBeVisible();
  await expect(workspaceSelector).toContainText("Side Workspace - owner - 0 campaigns");
  await page.getByRole("textbox", { name: "Campaign name", exact: true }).fill("Side Workspace Campaign");
  await page.getByRole("button", { name: "Create Campaign Setup" }).click();
  await expect(page.getByRole("heading", { name: "Side Workspace Campaign" })).toBeVisible();
  await expect(workspaceSelector).toContainText("Side Workspace - owner - 1 campaigns");
  await workspaceSelector.selectOption({ label: "Bootstrap Owner's Workspace - owner - 1 campaigns" });
  await expect(page.getByRole("status").filter({ hasText: "Workspace switched to Bootstrap Owner's Workspace" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bootstrap E2E Campaign" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Side Workspace Campaign" })).not.toBeVisible();
  await page.getByRole("textbox", { name: "Invite email", exact: true }).fill("revoked-invite.e2e@example.test");
  await page.getByRole("combobox", { name: "Invite role" }).selectOption("observer");
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  const organizationInviteRoster = page.getByLabel("Organization invite roster");
  const revokedInviteRow = organizationInviteRoster.locator(".operator-row", { hasText: "revoked-invite.e2e@example.test" });
  await expect(revokedInviteRow).toContainText("pending");
  await revokedInviteRow.getByRole("button", { name: "Revoke invite" }).click();
  await expect(revokedInviteRow).toContainText("revoked");
  await workspaceSelector.selectOption({ label: "Side Workspace - owner - 1 campaigns" });
  await expect(page.getByRole("status").filter({ hasText: "Workspace switched to Side Workspace" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Side Workspace Campaign" })).toBeVisible();
  await expect(organizationInviteRoster).not.toContainText("revoked-invite.e2e@example.test");
  await page.getByRole("textbox", { name: "Invite email", exact: true }).fill("side-invite.e2e@example.test");
  await page.getByRole("combobox", { name: "Invite role" }).selectOption("player");
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  const sideInviteRow = organizationInviteRoster.locator(".operator-row", { hasText: "side-invite.e2e@example.test" });
  await expect(sideInviteRow).toContainText("pending");
  await workspaceSelector.selectOption({ label: "Bootstrap Owner's Workspace - owner - 1 campaigns" });
  await expect(page.getByRole("status").filter({ hasText: "Workspace switched to Bootstrap Owner's Workspace" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bootstrap E2E Campaign" })).toBeVisible();
  await expect(organizationInviteRoster).not.toContainText("side-invite.e2e@example.test");
  const memberRegister = await page.request.post(`${apiBaseUrl}/api/v1/auth/register`, {
    data: {
      email: "org-member.e2e@example.test",
      displayName: "Org Member",
      password: "correct horse"
    }
  });
  expect(memberRegister.ok()).toBeTruthy();
  const sideMemberRegister = await page.request.post(`${apiBaseUrl}/api/v1/auth/register`, {
    data: {
      email: "side-member.e2e@example.test",
      displayName: "Side Member",
      password: "correct horse"
    }
  });
  expect(sideMemberRegister.ok()).toBeTruthy();

  let riskSessionCleanupRequests = 0;
  let expiredPasswordResetPruneRequests = 0;
  let adminPasswordResetRequests = 0;
  await page.route("**/api/v1/admin/auth/operations", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.sessions.totals.sessionCount = Math.max(body.sessions.totals.sessionCount ?? 0, riskSessionCleanupRequests === 0 ? 1 : 0);
    body.sessions.totals.riskSessionCount = riskSessionCleanupRequests === 0 ? 1 : 0;
    body.sessions.totals.staleSessionCount = riskSessionCleanupRequests === 0 ? 1 : 0;
    body.sessions.recentRiskSessions = riskSessionCleanupRequests === 0
      ? [{ session: { id: "sess_risk_e2e" }, user: { displayName: "Risk Session User" }, reasons: ["stale"], lastSeenAgeDays: 45, expiresInMs: 0 }]
      : [];
    body.passwordResets.expiredUnusedCount = expiredPasswordResetPruneRequests === 0 ? 1 : 0;
    await route.fulfill({ response, json: body });
  });
  await page.route("**/api/v1/admin/sessions/risk/revoke", async (route) => {
    riskSessionCleanupRequests += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ matched: 1, revoked: 1, remainingRiskSessionCount: 0 }) });
  });
  await page.route("**/api/v1/admin/password-resets/prune", async (route) => {
    expiredPasswordResetPruneRequests += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ matched: 1, pruned: 1, expiredRemaining: 0 }) });
  });
  await page.route("**/api/v1/admin/users/*/password-reset", async (route) => {
    adminPasswordResetRequests += 1;
    const response = await route.fetch();
    await route.fulfill({ response });
  });

  let assetIntegrityQuarantined = false;
  let quarantineRequests = 0;
  let assetCdnPurgeRequests = 0;
  let assetStorageMigrationRequests = 0;
  let assetStorageCleanupRequests = 0;
  await page.route("**/api/v1/admin/assets/storage", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.runtime.delivery.purgeWebhookConfigured = true;
    body.runtime.delivery.purgeWebhookTokenConfigured = true;
    body.operations.migrationBacklog = {
      ...(body.operations.migrationBacklog ?? {}),
      assetCount: assetStorageMigrationRequests === 0 ? 1 : 0,
      bytes: assetStorageMigrationRequests === 0 ? 4096 : 0,
      providerCounts: assetStorageMigrationRequests === 0 ? { legacy: 1 } : {},
      assets: assetStorageMigrationRequests === 0
        ? [{ assetId: "asset_migration_e2e", name: "Migration E2E Asset", fromProvider: "legacy", toProvider: "local", sizeBytes: 4096 }]
        : []
    };
    body.operations.cleanupBacklog = {
      ...(body.operations.cleanupBacklog ?? {}),
      assetCount: assetStorageCleanupRequests === 0 ? 1 : 0,
      bytes: assetStorageCleanupRequests === 0 ? 2048 : 0,
      deletedAssetCount: assetStorageCleanupRequests === 0 ? 1 : 0,
      expiredAssetCount: 0,
      oldestEligibleAgeSeconds: assetStorageCleanupRequests === 0 ? 172800 : 0,
      assets: assetStorageCleanupRequests === 0
        ? [{ assetId: "asset_cleanup_e2e", name: "Cleanup E2E Asset", provider: "local", sizeBytes: 2048, reason: "deleted_asset", eligibleAgeSeconds: 172800 }]
        : []
    };
    body.operations.delivery.purgeOperations.totalCount = assetCdnPurgeRequests;
    body.operations.delivery.purgeOperations.purgedCount = assetCdnPurgeRequests;
    body.operations.delivery.purgeOperations.recent = assetCdnPurgeRequests === 0
      ? []
      : [{ id: "purge_e2e_missing_asset", assetId: "asset_missing_e2e", status: "purged", reason: "Purged from admin console", createdAt: new Date().toISOString() }];
    await route.fulfill({ response, json: body });
  });
  await page.route("**/api/v1/admin/assets/integrity", async (route) => {
    const body = assetIntegrityQuarantined
      ? {
          provider: "local",
          assetCount: 1,
          verified: 1,
          missing: 0,
          mismatched: 0,
          cleanupEligible: 0,
          skipped: 0,
          failed: 0,
          actionRequired: 0,
          actionReasons: [],
          remediationQueue: [],
          healthy: true,
          results: [{ assetId: "asset_missing_e2e", name: "Missing E2E Asset", campaignId: "camp_demo", provider: "local", status: "verified" }]
        }
      : {
          provider: "local",
          assetCount: 1,
          verified: 0,
          missing: 1,
          mismatched: 0,
          cleanupEligible: 0,
          skipped: 0,
          failed: 0,
          actionRequired: 1,
          actionReasons: ["missing_asset_bytes"],
          remediationQueue: [{ code: "restore_missing_asset_bytes", severity: "error", action: "Restore object storage backup or archive the affected asset.", affectedCount: 1 }],
          healthy: false,
          results: [{ assetId: "asset_missing_e2e", name: "Missing E2E Asset", campaignId: "camp_demo", provider: "local", status: "missing", reason: "object bytes missing", expectedSizeBytes: 2048, actualSizeBytes: 0 }]
        };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route("**/api/v1/admin/assets/integrity/quarantine", async (route) => {
    quarantineRequests += 1;
    assetIntegrityQuarantined = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ dryRun: false, assetCount: 1, matched: 1, archived: 1, planned: 0, skipped: 0, failed: 0, changed: true, reason: "Archived from admin integrity console" })
    });
  });
  await page.route("**/api/v1/admin/assets/*/purge-cache", async (route) => {
    assetCdnPurgeRequests += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ assetId: "asset_missing_e2e", status: "purged", reason: "Purged from admin console" }) });
  });
  await page.route("**/api/v1/admin/assets/migrate", async (route) => {
    assetStorageMigrationRequests += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ migrated: 1, skipped: 0, failed: 0, targetProvider: "local", changed: true }) });
  });
  await page.route("**/api/v1/admin/assets/cleanup", async (route) => {
    assetStorageCleanupRequests += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ deleted: 1, missingMarked: 0, skipped: 0, failed: 0, changed: true }) });
  });
  let staleAiThreadsCleared = false;
  let staleAiToolsCleared = false;
  let staleAiProposalsCleared = false;
  let staleAiApprovedProposalsCleared = false;
  let staleAiThreadRecoveryRequests = 0;
  let staleAiToolRecoveryRequests = 0;
  let staleAiProposalRecoveryRequests = 0;
  let staleAiApprovedProposalRecoveryRequests = 0;
  await page.route("**/api/v1/admin/ai/operations", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.actionRequired = !staleAiThreadsCleared || !staleAiToolsCleared || !staleAiProposalsCleared || !staleAiApprovedProposalsCleared;
    body.risk.staleRunningThreadCount = staleAiThreadsCleared ? 0 : 1;
    body.risk.recentStaleRunningThreads = staleAiThreadsCleared
      ? []
      : [{ id: "thr_admin_stale_browser", campaignId: "cmp_bootstrap", title: "Admin stale thread", provider: "local-echo", startedAt: new Date(Date.now() - 120_000).toISOString(), ageMs: 120_000 }];
    body.risk.staleStartedToolCallCount = staleAiToolsCleared ? 0 : 1;
    body.risk.recentStaleStartedToolCalls = staleAiToolsCleared
      ? []
      : [{ id: "tool_admin_stale_browser", threadId: "thr_admin_stale_browser", campaignId: "cmp_bootstrap", provider: "local-echo", toolName: "read_compendium", status: "started", createdAt: new Date(Date.now() - 120_000).toISOString(), ageMs: 120_000 }];
    body.proposalReview.stalePendingCount = staleAiProposalsCleared ? 0 : 1;
    body.proposalReview.stalePending = staleAiProposalsCleared
      ? []
      : [{ id: "prop_admin_stale_browser", campaignId: "cmp_bootstrap", campaignName: "Bootstrap E2E Campaign", title: "Admin stale proposal", status: "pending", changeCount: 1, entities: ["journal"], createdAt: new Date(Date.now() - 172_800_000).toISOString(), updatedAt: new Date(Date.now() - 172_800_000).toISOString() }];
    body.proposalReview.staleApprovedCount = staleAiApprovedProposalsCleared ? 0 : 1;
    body.proposalReview.staleApproved = staleAiApprovedProposalsCleared
      ? []
      : [{ id: "prop_admin_stale_approved_browser", campaignId: "cmp_bootstrap", campaignName: "Bootstrap E2E Campaign", title: "Admin stale approved proposal", status: "approved", changeCount: 1, entities: ["journal"], createdAt: new Date(Date.now() - 172_800_000).toISOString(), updatedAt: new Date(Date.now() - 172_800_000).toISOString() }];
    await route.fulfill({ response, json: body });
  });
  await page.route("**/api/v1/admin/ai/threads/stale/fail", async (route) => {
    staleAiThreadRecoveryRequests += 1;
    staleAiThreadsCleared = true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ matched: 1, updated: 1 }) });
  });
  await page.route("**/api/v1/admin/ai/tool-calls/stale/fail", async (route) => {
    staleAiToolRecoveryRequests += 1;
    staleAiToolsCleared = true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ matched: 1, updated: 1 }) });
  });
  await page.route("**/api/v1/admin/ai/proposals/stale/reject", async (route) => {
    const requestBody = route.request().postDataJSON() as { includeApproved?: boolean };
    if (requestBody.includeApproved) {
      staleAiApprovedProposalRecoveryRequests += 1;
      staleAiApprovedProposalsCleared = true;
    } else {
      staleAiProposalRecoveryRequests += 1;
      staleAiProposalsCleared = true;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ matched: 1, updated: 1 }) });
  });
  let pluginRegistrySyncRequests = 0;
  await page.route("**/api/v1/admin/plugins/operations", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.registryOperations.configuredRegistryCount = 1;
    body.registryOperations.actionRequired = pluginRegistrySyncRequests === 0;
    body.registryOperations.actionReasons = pluginRegistrySyncRequests === 0 ? ["stale_plugin_registry"] : [];
    await route.fulfill({ response, json: body });
  });
  await page.route("**/api/v1/admin/plugins/registry/sync", async (route) => {
    pluginRegistrySyncRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ registries: [{ url: "https://registry.e2e.test/plugins.json" }], plugins: [{ id: "plugin_registry_e2e" }] })
    });
  });
  let jobAlertDeliveryRequests = 0;
  await page.route("**/api/v1/admin/jobs/operations", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.actionRequired = true;
    body.actionReasons = ["failed_jobs"];
    body.totals = {
      ...(body.totals ?? {}),
      failedCount: Math.max(body.totals?.failedCount ?? 0, 1),
      retryableCount: Math.max(body.totals?.retryableCount ?? 0, 1)
    };
    body.failures = {
      ...(body.failures ?? {}),
      failedCount: Math.max(body.failures?.failedCount ?? 0, 1),
      retryableCount: Math.max(body.failures?.retryableCount ?? 0, 1)
    };
    body.remediationQueue = body.remediationQueue?.length
      ? body.remediationQueue
      : [{ code: "retry_or_inspect_failed_jobs", severity: "warning", action: "Inspect retryable failed jobs.", affectedCount: 1 }];
    await route.fulfill({ response, json: body });
  });
  await page.route("**/api/v1/admin/jobs/alerts", async (route) => {
    const requestBody = route.request().postDataJSON() as { dryRun?: boolean; reason?: string };
    if (!requestBody.dryRun) jobAlertDeliveryRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: requestBody.dryRun ? "dry_run" : "delivered",
        configured: true,
        webhookStatus: requestBody.dryRun ? undefined : 202,
        actionRequired: true,
        remediationCount: 1,
        deliveredAt: requestBody.dryRun ? undefined : new Date().toISOString(),
        reason: requestBody.reason ?? (requestBody.dryRun ? "admin_ui_dry_run" : "admin_ui_delivery")
      })
    });
  });

  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await expect(page.getByText("Server Admin", { exact: true })).toBeVisible();
  await expect(page.getByText("Admin operations synced")).toBeVisible();
  const workspaceDefaults = page.getByRole("region", { name: "Organization workspace defaults" });
  await expect(workspaceDefaults).toBeVisible();
  await workspaceDefaults.getByRole("textbox", { name: "Workspace default scene name" }).fill("Workspace Opening");
  await workspaceDefaults.getByRole("combobox", { name: "Workspace default permission template" }).selectOption("player_authoring");
  await workspaceDefaults.getByRole("button", { name: "Save workspace defaults" }).click();
  await expect(workspaceDefaults).toContainText("Workspace defaults saved");
  await expect(page.getByRole("textbox", { name: "Setup initial scene name" })).toHaveValue("Workspace Opening");
  await expect(page.getByLabel("Setup campaign permission template")).toHaveValue("player_authoring");
  const organizationMembers = page.getByRole("region", { name: "Organization members" });
  await expect(organizationMembers).toBeVisible();
  await expect(organizationMembers).toContainText("Bootstrap Owner");
  await expect(organizationMembers).toContainText("owner");
  await organizationMembers.getByRole("textbox", { name: "Organization member email" }).fill("org-member.e2e@example.test");
  await organizationMembers.getByRole("combobox", { name: "Organization member role" }).selectOption("admin");
  await organizationMembers.getByRole("button", { name: "Add organization member" }).click();
  await expect(organizationMembers).toContainText("Organization member org-member.e2e@example.test saved as admin");
  const orgMemberCard = organizationMembers.getByRole("article").filter({ hasText: "Org Member" });
  await expect(orgMemberCard).toContainText("admin");
  await workspaceSelector.selectOption({ label: "Side Workspace - owner - 1 campaigns" });
  await expect(page.getByRole("status").filter({ hasText: "Workspace switched to Side Workspace" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Side Workspace Campaign" })).toBeVisible();
  await expect(orgMemberCard).toHaveCount(0);
  await organizationMembers.getByRole("textbox", { name: "Organization member email" }).fill("side-member.e2e@example.test");
  await organizationMembers.getByRole("combobox", { name: "Organization member role" }).selectOption("member");
  await organizationMembers.getByRole("button", { name: "Add organization member" }).click();
  await expect(organizationMembers).toContainText("Organization member side-member.e2e@example.test saved as member");
  const sideMemberCard = organizationMembers.getByRole("article").filter({ hasText: "Side Member" });
  await expect(sideMemberCard).toContainText("member");
  await workspaceSelector.selectOption({ label: "Bootstrap Owner's Workspace - owner - 1 campaigns" });
  await expect(page.getByRole("status").filter({ hasText: "Workspace switched to Bootstrap Owner's Workspace" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bootstrap E2E Campaign" })).toBeVisible();
  await expect(sideMemberCard).toHaveCount(0);
  await expect(orgMemberCard).toBeVisible();
  await organizationMembers.getByRole("combobox", { name: "Organization member role for Org Member" }).selectOption("member");
  await expect(organizationMembers).toContainText("Organization member Org Member saved as member");
  await organizationMembers.getByRole("button", { name: "Remove member" }).click();
  await expect(organizationMembers).toContainText("Organization member Org Member removed");
  await expect(organizationMembers).not.toContainText("org-member.e2e@example.test");
  const readiness = page.getByRole("region", { name: "Production readiness" });
  await expect(readiness).toBeVisible();
  await expect(readiness).toContainText("Auth operations");
  await expect(readiness).toContainText("SQLite storage");
  await expect(readiness).toContainText("Job ledger");
  await expect(readiness).toContainText("Asset storage");
  await expect(readiness).toContainText("Rules systems");
  await expect(readiness).toContainText("AI operations");
  await expect(readiness).toContainText("Audit export");
  const readinessPlaybooks = readiness.locator("[aria-label='Production readiness remediation playbooks']");
  await expect(readinessPlaybooks).toContainText("Auth operations playbook");
  await expect(readinessPlaybooks).toContainText("Run redacted OIDC and SCIM connection tests");
  await expect(readinessPlaybooks).toContainText("SQLite storage playbook");
  await expect(readinessPlaybooks).toContainText("Create a backup, run a restore drill");
  await expect(readinessPlaybooks).toContainText("Proof:");
  const storageOps = page.getByRole("region", { name: "SQLite storage operations" });
  await expect(storageOps).toBeVisible();
  await expect(storageOps).toContainText("SQLite Storage");
  await expect(storageOps.getByRole("button", { name: "Create Backup" })).toBeVisible();
  await expect(storageOps.getByRole("button", { name: "Run Restore Drill" })).toBeVisible();
  await storageOps.getByRole("button", { name: "Create Backup" }).click();
  await expect(storageOps).toContainText("Backup created");
  await expect(storageOps.getByRole("button", { name: "Run Restore Drill" })).toBeEnabled();
  await storageOps.getByRole("button", { name: "Run Restore Drill" }).click();
  await expect(storageOps).toContainText("Restore drill passed");
  const latestBackupName = (await storageOps.getByLabel("Confirm storage restore backup filename").getAttribute("placeholder")) ?? "";
  expect(latestBackupName).toMatch(/^opentabletop-.*\.sqlite$/);
  await expect(storageOps.getByRole("button", { name: "Restore Backup" })).toBeDisabled();
  await storageOps.getByLabel("Confirm storage restore backup filename").fill(latestBackupName);
  await storageOps.getByRole("button", { name: "Restore Backup" }).click();
  await expect(storageOps).toContainText("Backup restored");
  await expect(storageOps.getByRole("button", { name: "Queue Backup Job" })).toBeEnabled();
  await storageOps.getByRole("button", { name: "Queue Backup Job" }).click();
  await expect(storageOps).toContainText("storage.backup queued");
  const jobLedger = page.getByRole("region", { name: "Job ledger" });
  await expect(jobLedger).toBeVisible();
  await expect(jobLedger).toContainText("Job Ledger");
  await expect(jobLedger).toContainText("storage.backup");
  const storageBackupJob = jobLedger.getByRole("article").filter({ hasText: "storage.backup" }).first();
  await expect(storageBackupJob).toContainText("queued");
  await storageBackupJob.getByRole("button", { name: "Cancel" }).click();
  await expect(jobLedger).toContainText("storage.backup cancelled");
  await expect(storageBackupJob).toContainText("cancelled");
  await storageBackupJob.getByRole("button", { name: "Retry" }).click();
  await expect(jobLedger).toContainText("storage.backup requeued");
  await expect(storageBackupJob).toContainText("queued");
  await storageOps.getByRole("button", { name: "Queue Drill Job" }).click();
  await expect(storageOps).toContainText("storage.restoreDrill queued");
  await expect(jobLedger).toContainText("storage.restoreDrill");
  const restoreDrillJob = jobLedger.getByRole("article").filter({ hasText: "storage.restoreDrill" }).first();
  await expect(restoreDrillJob).toContainText("queued");
  await expect(jobLedger.getByLabel("Job alert delivery")).toContainText("ready to send - failed_jobs");
  await expect(jobLedger.getByRole("button", { name: "Dry Run Alert" })).toBeEnabled();
  await jobLedger.getByRole("button", { name: "Dry Run Alert" }).click();
  await expect(jobLedger).toContainText("dry_run: 1 remediations - webhook configured");
  await expect(jobLedger.getByRole("button", { name: "Send Alert" })).toBeEnabled();
  await jobLedger.getByRole("button", { name: "Send Alert" }).click();
  await expect.poll(() => jobAlertDeliveryRequests).toBe(1);
  await expect(jobLedger).toContainText("delivered: 1 remediations - webhook 202");
  const assetStorage = page.getByRole("region", { name: "Asset storage operations" });
  await expect(assetStorage).toBeVisible();
  await expect(assetStorage).toContainText("Migration E2E Asset");
  await expect(assetStorage.getByRole("button", { name: "Migrate assets" })).toBeEnabled();
  await assetStorage.getByRole("button", { name: "Migrate assets" }).click();
  await expect.poll(() => assetStorageMigrationRequests).toBe(1);
  await expect(assetStorage.getByRole("button", { name: "Migrate assets" })).toBeDisabled();
  await expect(assetStorage).toContainText("Cleanup E2E Asset");
  await expect(assetStorage.getByRole("button", { name: "Run cleanup" })).toBeEnabled();
  await assetStorage.getByRole("button", { name: "Run cleanup" }).click();
  await expect.poll(() => assetStorageCleanupRequests).toBe(1);
  await expect(assetStorage.getByRole("button", { name: "Run cleanup" })).toBeDisabled();
  const assetIntegrity = page.getByRole("region", { name: "Asset integrity operations" });
  await expect(assetIntegrity).toBeVisible();
  await expect(assetIntegrity).toContainText("Missing E2E Asset");
  await expect(assetIntegrity).toContainText("missing_asset_bytes");
  await expect(assetIntegrity.getByRole("button", { name: "Purge CDN" }).first()).toBeEnabled();
  await assetIntegrity.getByRole("button", { name: "Purge CDN" }).first().click();
  await expect.poll(() => assetCdnPurgeRequests).toBe(1);
  await expect(assetIntegrity.getByRole("button", { name: "Archive broken assets" })).toBeEnabled();
  await assetIntegrity.getByRole("button", { name: "Archive broken assets" }).click();
  await expect.poll(() => quarantineRequests).toBe(1);
  await expect(assetIntegrity).toContainText("0 actionable");
  await expect(assetIntegrity.getByRole("button", { name: "Archive broken assets" })).toBeDisabled();
  const authOperations = page.getByRole("region", { name: "Auth operations" });
  await expect(authOperations).toBeVisible();
  await expect(authOperations).toContainText("Risk Session User");
  await expect(authOperations.getByRole("button", { name: "Revoke risk sessions" })).toBeEnabled();
  await authOperations.getByRole("button", { name: "Revoke risk sessions" }).click();
  await expect.poll(() => riskSessionCleanupRequests).toBe(1);
  await expect(authOperations.getByRole("button", { name: "Revoke risk sessions" })).toBeDisabled();
  await expect(authOperations.getByRole("button", { name: "Prune expired resets" })).toBeEnabled();
  await authOperations.getByRole("button", { name: "Prune expired resets" }).click();
  await expect.poll(() => expiredPasswordResetPruneRequests).toBe(1);
  await expect(authOperations.getByRole("button", { name: "Prune expired resets" })).toBeDisabled();
  const emailOutbox = page.getByRole("region", { name: "Email outbox" });
  await expect(emailOutbox).toBeVisible();
  await expect(emailOutbox).toContainText("failed");
  await expect(emailOutbox).toContainText("owner.e2e@example.test");
  const failedDeliveryAttempts = emailWebhookDeliveries;
  emailWebhookShouldSucceed = true;
  await emailOutbox.getByRole("button", { name: "Retry all" }).click();
  await expect.poll(() => emailWebhookDeliveries).toBeGreaterThan(failedDeliveryAttempts);
  await expect(emailOutbox).toContainText("delivered");
  await expect(page.getByRole("region", { name: "Auth setup" })).toBeVisible();
  await expect(page.getByText("Single sign-on")).toBeVisible();
  await expect(page.getByText("Directory provisioning")).toBeVisible();
  await expect(page.getByLabel("Identity provider setup guides")).toContainText("Okta");
  await expect(page.getByLabel("Identity provider setup guides")).toContainText("Microsoft Entra ID");
  await expect(page.getByLabel("Identity provider setup guides")).toContainText("Google Workspace");
  const organizationAccess = page.getByRole("region", { name: "Organization access" });
  await expect(organizationAccess).toBeVisible();
  await organizationAccess.getByRole("textbox", { name: "SCIM group identifier" }).fill("Bootstrap Players");
  await organizationAccess.getByRole("button", { name: "Add mapping" }).click();
  const scimMapping = organizationAccess.getByRole("article").filter({ hasText: "Bootstrap Players" });
  await expect(scimMapping).toBeVisible();
  await expect(scimMapping).toContainText("pending");
  await expect(scimMapping).toContainText("player");
  await expect(scimMapping).toContainText("display name Bootstrap Players");
  await scimMapping.getByRole("button", { name: "Delete mapping" }).click();
  await expect(organizationAccess).toContainText("No SCIM group role mappings");
  await page.getByRole("button", { name: "Test OIDC" }).click();
  await expect(page.getByText("OIDC blocked")).toBeVisible();
  await page.getByRole("button", { name: "Test SCIM" }).click();
  await expect(page.getByText("SCIM blocked")).toBeVisible();
  const adminUsers = page.getByRole("region", { name: "Admin users" });
  await expect(adminUsers).toBeVisible();
  const sideUserCard = adminUsers.getByRole("article").filter({ hasText: "Side Member" });
  await expect(sideUserCard).toContainText("active");
  await sideUserCard.getByRole("button", { name: "Require" }).click();
  await expect(sideUserCard).toContainText("reset required");
  await sideUserCard.getByRole("button", { name: "Reset" }).click();
  await expect.poll(() => adminPasswordResetRequests).toBe(1);
  await sideUserCard.getByRole("button", { name: "Revoke" }).click();
  await expect(sideUserCard).toContainText("0 sessions");
  await sideUserCard.getByRole("button", { name: "Disable" }).click();
  await expect(sideUserCard).toContainText("disabled");
  await sideUserCard.getByRole("button", { name: "Enable" }).click();
  await expect(sideUserCard).toContainText("active");
  const activeSessions = page.getByRole("region", { name: "Active sessions" });
  await expect(activeSessions).toBeVisible();
  const orgMemberSession = activeSessions.getByRole("article").filter({ hasText: "Org Member" }).first();
  await expect(orgMemberSession).toBeVisible();
  await orgMemberSession.getByRole("button", { name: "Revoke session" }).click();
  await expect(orgMemberSession).toHaveCount(0);
  const adminAiOperations = page.getByRole("region", { name: "Admin AI operations" });
  await expect(adminAiOperations).toBeVisible();
  await expect(adminAiOperations.getByRole("button", { name: "Fail stale threads" })).toBeEnabled();
  await adminAiOperations.getByRole("button", { name: "Fail stale threads" }).click();
  await expect.poll(() => staleAiThreadRecoveryRequests).toBe(1);
  await expect(adminAiOperations.getByRole("button", { name: "Fail stale threads" })).toBeDisabled();
  await expect(adminAiOperations.getByRole("button", { name: "Fail stale tools" })).toBeEnabled();
  await adminAiOperations.getByRole("button", { name: "Fail stale tools" }).click();
  await expect.poll(() => staleAiToolRecoveryRequests).toBe(1);
  await expect(adminAiOperations.getByRole("button", { name: "Fail stale tools" })).toBeDisabled();
  await expect(adminAiOperations.getByRole("button", { name: "Reject stale pending" })).toBeEnabled();
  await adminAiOperations.getByRole("button", { name: "Reject stale pending" }).click();
  await expect.poll(() => staleAiProposalRecoveryRequests).toBe(1);
  await expect(adminAiOperations.getByRole("button", { name: "Reject stale pending" })).toBeDisabled();
  await expect(adminAiOperations.getByRole("button", { name: "Reject stale approved" })).toBeEnabled();
  await adminAiOperations.getByRole("button", { name: "Reject stale approved" }).click();
  await expect.poll(() => staleAiApprovedProposalRecoveryRequests).toBe(1);
  await expect(adminAiOperations.getByRole("button", { name: "Reject stale approved" })).toBeDisabled();
  const pluginOperations = page.getByRole("region", { name: "Plugin operations" });
  await expect(pluginOperations).toBeVisible();
  await expect(pluginOperations.getByRole("button", { name: "Sync registries" })).toBeEnabled();
  await pluginOperations.getByRole("button", { name: "Sync registries" }).click();
  await expect.poll(() => pluginRegistrySyncRequests).toBe(1);
  const pluginReviews = page.getByRole("region", { name: "Plugin marketplace reviews" });
  await expect(pluginReviews).toBeVisible();
  await expect(pluginReviews).toContainText("Plugin Reviews");
  const reviewCard = pluginReviews.getByRole("article").filter({ hasText: "Example Macro Plugin" });
  await expect(reviewCard).toContainText("permissions");
  await reviewCard.getByRole("button", { name: "Approve" }).click();
  await expect(reviewCard).toContainText("approved");
  await reviewCard.getByRole("button", { name: "Reject" }).click();
  await expect(reviewCard).toContainText("rejected");
  await reviewCard.getByRole("button", { name: "Reset" }).click();
  await expect(reviewCard).toContainText("pending");
  const auditLog = page.getByRole("region", { name: "Audit log" });
  await expect(auditLog).toBeVisible();
  const auditAction = auditLog.getByRole("textbox", { name: "Audit action filter" });
  await auditAction.focus();
  await expect(auditAction).toBeFocused();
  await auditAction.fill("admin.storage.backup");
  await expect(auditAction).toHaveValue("admin.storage.backup");
  const auditActor = auditLog.getByRole("combobox", { name: "Audit actor filter" });
  await auditActor.focus();
  await expect(auditActor).toBeFocused();
  await auditActor.selectOption("user");
  await expect(auditActor).toHaveValue("user");
  await auditLog.getByRole("button", { name: "Export Redacted JSON" }).click();
  await expect(auditLog).toContainText("Exported");
  await expect(auditLog).toContainText("redacted audit rows");
});
