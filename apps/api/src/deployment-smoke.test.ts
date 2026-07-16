import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function readWorkspaceFile(path: string): string {
  return readFileSync(resolve(rootDir, path), "utf8");
}

describe("deployment smoke", () => {
  it("pins every third-party workflow action to an immutable commit", () => {
    const workflowDirectory = resolve(rootDir, ".github/workflows");
    for (const file of readdirSync(workflowDirectory).filter((name) => name.endsWith(".yml"))) {
      const workflow = readWorkspaceFile(`.github/workflows/${file}`);
      const actionReferences = [...workflow.matchAll(/^\s*(?:-\s+)?uses:\s+["']?([^#\s"']+)["']?\s*(?:#.*)?$/gm)].map((match) => match[1]);
      expect(actionReferences.length, `${file} should use at least one action`).toBeGreaterThan(0);
      for (const reference of actionReferences) {
        expect(reference, `${file} must pin ${reference} to a full commit SHA`).toMatch(/^[^@]+@[0-9a-f]{40}$/i);
      }
    }
  });

  it("keeps the release gate wired to Docker Compose and production-like deployment checks", () => {
    const packageJson = JSON.parse(readWorkspaceFile("package.json")) as { packageManager: string; scripts: Record<string, string> };
    expect(packageJson.packageManager).toBe("pnpm@10.28.0");
    expect(packageJson.scripts["deployment:smoke"]).toBe("pnpm --filter @open-tabletop/api exec vitest run src/deployment-smoke.test.ts");
    expect(packageJson.scripts["release:smoke"]).toContain("pnpm v1:worktree:check && pnpm security:audit && pnpm check && pnpm e2e");
    expect(packageJson.scripts["security:audit"]).toBe("node scripts/audit-production-dependencies.mjs");
    expect(packageJson.scripts["release:smoke"]).toContain("deployment:smoke");
    expect(packageJson.scripts["release:smoke"]).toContain("perf:soak");
    expect(packageJson.scripts["release:smoke"]).toContain("docs:site:check");
    expect(packageJson.scripts["release:smoke"]).toContain("sbom:test");
    expect(packageJson.scripts["release:smoke"]).toContain("v1:issues:check");

    const lockfile = readWorkspaceFile("pnpm-lock.yaml");
    expect(lockfile).toContain("lockfileVersion: '9.0'");
    expect(lockfile).toContain("overrides:\n  '@babel/core': 7.29.6");
    expect(lockfile).toContain("tsx>esbuild: 0.28.1");
    const workspace = readWorkspaceFile("pnpm-workspace.yaml");
    for (const dependency of ["electron", "electron-winstaller", "esbuild", "sharp", "workerd"]) {
      expect(workspace).toContain(`  ${dependency}: true`);
    }

    const workflow = readWorkspaceFile(".github/workflows/release-smoke.yml");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("issues: read");
    expect(workflow).toContain("pnpm release:smoke");
    expect(workflow).toContain("GH_TOKEN: ${{ github.token }}");

    const identityWorkflow = readWorkspaceFile(".github/workflows/identity-smoke.yml");
    expect(identityWorkflow).toContain("workflow_dispatch:");
    expect(identityWorkflow).toContain("smoke_target:");
    expect(identityWorkflow).toContain("deployed-api");
    expect(identityWorkflow).toContain("local-sandbox");
    expect(identityWorkflow).toContain("OTTE_IDENTITY_SMOKE_TARGET: ${{ inputs.smoke_target }}");
    expect(identityWorkflow).toContain("OTTE_IDENTITY_SMOKE_BASE_URL: ${{ secrets.OTTE_IDENTITY_SMOKE_BASE_URL }}");
    expect(identityWorkflow).toContain("OTTE_IDENTITY_SMOKE_ADMIN_TOKEN: ${{ secrets.OTTE_IDENTITY_SMOKE_ADMIN_TOKEN }}");
    expect(identityWorkflow).toContain("OTTE_SCIM_BEARER_TOKEN: ${{ secrets.OTTE_SCIM_BEARER_TOKEN }}");
    expect(identityWorkflow).toContain("Missing required identity-smoke secrets");
    expect(identityWorkflow).toContain("pnpm identity:smoke");

    const completionAuditWorkflow = readWorkspaceFile(".github/workflows/v1-completion-audit.yml");
    expect(completionAuditWorkflow).toContain("workflow_dispatch:");
    expect(completionAuditWorkflow).toContain("release_commit:");
    expect(completionAuditWorkflow).toContain("OTTE_RELEASE_COMMIT: ${{ inputs.release_commit }}");
    expect(completionAuditWorkflow).toContain("ref: ${{ inputs.release_commit }}");
    expect(completionAuditWorkflow).toContain("issues: read");
    expect(completionAuditWorkflow).toContain("GH_TOKEN: ${{ github.token }}");
    expect(completionAuditWorkflow).toContain("release_commit must be a full 40-character SHA");
    expect(completionAuditWorkflow).toContain("pnpm v1:completion:audit");

    const desktopReleaseWorkflow = readWorkspaceFile(".github/workflows/desktop-release.yml");
    expect(desktopReleaseWorkflow).toContain("pnpm audit --audit-level high");
    expect(desktopReleaseWorkflow).not.toContain("pnpm audit --prod");
    expect(desktopReleaseWorkflow).toContain("Verify release tag matches desktop package version");
    expect(desktopReleaseWorkflow).toContain('desktop_version="$(node -p "require(\'./apps/desktop/package.json\').version\")"');
    expect(desktopReleaseWorkflow).toContain('expected_tag="desktop-v${desktop_version}"');
    expect(desktopReleaseWorkflow).toContain('for artifact in *.dmg "$sbom" "$provenance"; do');
    expect(desktopReleaseWorkflow).toContain('if [ -f "$artifact" ]; then');
    expect(desktopReleaseWorkflow).toContain('if [ "${#checksum_files[@]}" -ne 3 ]; then');
    expect(desktopReleaseWorkflow).toContain(
      '[System.IO.File]::WriteAllText("$release/SHA256SUMS.txt", ($lines -join "`n") + "`n", [System.Text.UTF8Encoding]::new($false))'
    );
    expect(desktopReleaseWorkflow).toContain("$checksumBytes -contains [byte]0x0d");
    expect(desktopReleaseWorkflow).not.toMatch(/(?:Set-Content|Out-File)[^\r\n]*SHA256SUMS\.txt/i);
    expect(desktopReleaseWorkflow).not.toContain("shasum -a 256 *");

    const docsSiteWorkflow = readWorkspaceFile(".github/workflows/docs-site.yml");
    expect(docsSiteWorkflow).toContain("group: docs-site-${{ github.event_name == 'pull_request' && github.ref || 'publish' }}");

    const compose = readWorkspaceFile("docker-compose.yml");
    expect(compose).toContain("dockerfile: infra/docker/api.Dockerfile");
    expect(compose).toContain("dockerfile: infra/docker/web.Dockerfile");
    expect(compose).toContain("dockerfile: infra/docker/worker.Dockerfile");
    expect(compose).toContain("OTTE_SQLITE_PATH: /app/storage/opentabletop.sqlite");
    expect(compose).toContain("OTTE_ASSET_STORAGE: ${OTTE_ASSET_STORAGE:-s3}");
    expect(compose).toContain("OTTE_ALLOW_LEGACY_USER_HEADER: ${OTTE_ALLOW_LEGACY_USER_HEADER:-false}");
    expect(compose).toContain("OTTE_PLUGIN_TRUST_POLICY: ${OTTE_PLUGIN_TRUST_POLICY:-require_trusted}");
    expect(compose).toContain("OTTE_PLUGIN_REVIEW_POLICY: ${OTTE_PLUGIN_REVIEW_POLICY:-require_approved}");
    expect(compose).toContain("OTTE_PLUGIN_DIR: /app/storage/plugins");
    expect(compose).toContain("OTTE_BUNDLED_PLUGIN_DIR: /app/plugins");
    expect(compose).toContain("api-plugins:/app/storage/plugins");
    expect(compose).not.toContain("api-plugins:/app/plugins");
    expect(compose).toContain("OTTE_AI_PROVIDER: ${OTTE_AI_PROVIDER:-codex-app-server}");
    expect(compose).toContain("OTTE_ASSET_URL_SIGNING_SECRET: ${OTTE_ASSET_URL_SIGNING_SECRET:?");
    expect(compose).toContain("OTTE_SQLITE_BACKUP_RETENTION_COUNT: ${OTTE_SQLITE_BACKUP_RETENTION_COUNT:-30}");
    expect(compose).toContain("wget -qO- http://127.0.0.1:4000/api/v1/health");
    expect(compose).toContain("condition: service_healthy");
    expect(compose).toContain("OTTE_WORKER_LEASE_POLL: \"true\"");
    expect(compose).toContain("OTTE_WORKER_PROFILE_ENABLED: ${OTTE_WORKER_PROFILE_ENABLED:-false}");
    expect(compose).toContain("OTTE_WORKER_TOKEN_HASHES: ${OTTE_WORKER_TOKEN_HASHES:-}");
    expect(compose).toContain("OTTE_WORKER_TOKEN: ${OTTE_WORKER_TOKEN:-}");
    expect(compose).not.toContain("OTTE_SESSION_TOKEN: ${OTTE_WORKER_SESSION_TOKEN:-}");
    expect(compose).not.toContain("postgres:");
    expect(compose).not.toContain("redis:");
    expect(compose).not.toContain("POSTGRES_");
    expect(compose).not.toContain("REDIS_");
    expect(compose).toContain('${INFRA_BIND_ADDRESS:-127.0.0.1}:${MINIO_API_PORT:-9000}:9000');
    expect(compose).not.toContain("OTTE_USER_ID:");
    expect(compose).toContain("api-storage:");
    expect(compose).toContain("api-uploads:");
    expect(compose).toContain("api-plugins:");

    const apiPackage = JSON.parse(readWorkspaceFile("apps/api/package.json")) as { dependencies: Record<string, string> };
    expect(apiPackage.dependencies["@openai/codex"]).toBeTruthy();

    const systemSdkPackage = JSON.parse(readWorkspaceFile("packages/system-sdk/package.json")) as { license?: string; contentLicense?: string; contentNotice?: string; files?: string[] };
    expect(systemSdkPackage.license).toBe("MIT");
    expect(systemSdkPackage.contentLicense).toBe("CC-BY-4.0");
    expect(systemSdkPackage.contentNotice).toBe("CONTENT_NOTICE.md");
    expect(systemSdkPackage.files).toEqual(expect.arrayContaining(["dist", "LICENSE", "CONTENT_NOTICE.md"]));
    const systemSdkContentNotice = readWorkspaceFile("packages/system-sdk/CONTENT_NOTICE.md");
    expect(systemSdkContentNotice).toContain("System Reference Document 5.2.1");
    expect(systemSdkContentNotice).toContain("Creative Commons Attribution 4.0 International License");
    expect(systemSdkContentNotice).toContain("official SRD 5.2.1 PDF");

    const apiDockerfile = readWorkspaceFile("infra/docker/api.Dockerfile");
    expect(apiDockerfile).toContain("USER node");
    expect(apiDockerfile).toContain("/app/storage /app/uploads");

    const workerDockerfile = readWorkspaceFile("infra/docker/worker.Dockerfile");
    expect(workerDockerfile).toContain("USER node");

    const railwayApi = readWorkspaceFile("railway.api.json");
    expect(railwayApi).toContain("OTTE_SQLITE_PATH=/app/storage/opentabletop.sqlite");
    expect(railwayApi).toContain("OTTE_UPLOAD_DIR=/app/storage/uploads");
    expect(railwayApi).toContain("OTTE_PLUGIN_DIR=/app/storage/plugins");
    expect(railwayApi).toContain("OTTE_BUNDLED_PLUGIN_DIR=/app/plugins");
    expect(railwayApi).toContain("OTTE_DEMO_SEED=false");
    expect(railwayApi).toContain("OTTE_SQLITE_BACKUP_RUN_ON_START=true");
    expect(railwayApi).toContain("OTTE_SQLITE_BACKUP_INTERVAL_SECONDS=86400");
    expect(railwayApi).toContain("OTTE_SQLITE_BACKUP_REASON=railway-nightly");
    expect(railwayApi).toContain("\"numReplicas\": 1");
    expect(railwayApi).toContain("OTTE_CODEX_APP_SERVER_COMMAND=apps/api/node_modules/.bin/codex");
    expect(railwayApi).toContain("OTTE_CODEX_APP_SERVER_LOGIN_TYPE=chatgptDeviceCode");
    const apiServer = readWorkspaceFile("apps/api/src/server.ts");
    expect(apiServer).toContain("bundledPluginRoot: process.env.OTTE_BUNDLED_PLUGIN_DIR");

    const railwayWeb = readWorkspaceFile("railway.web.json");
    expect(railwayWeb).toContain('"startCommand": "NODE_ENV=production node apps/web/server.mjs"');
    expect(railwayWeb).toContain('"healthcheckPath": "/api/v1/health"');

    const selfHosting = readWorkspaceFile("docs/deployment/self-hosting.md");
    expect(selfHosting).toContain("docker compose up --build");
    expect(selfHosting).toContain("docker compose --profile worker up -d worker");
    expect(selfHosting).toContain("docker compose --profile worker up -d --scale worker=3 worker");
    expect(selfHosting).toContain("Authorization: Worker");
    expect(selfHosting).toContain("OTTE_WORKER_TOKEN_HASHES=worker-primary=sha256:<new-hex>,worker-primary=sha256:<old-hex>");
    expect(selfHosting).toContain("production hard-refuses them");
    expect(selfHosting).toContain("INFRA_BIND_ADDRESS=127.0.0.1");
    expect(selfHosting).toContain("preview-only");

    const hostedRecipes = readWorkspaceFile("docs/deployment/hosted-deployment-recipes.md");
    expect(hostedRecipes).toContain("Mount the API service volume at `/app/storage`");
    expect(hostedRecipes).toContain("`OTTE_PLUGIN_DIR=/app/storage/plugins`");
    expect(hostedRecipes).toContain("[Railway Persistence](./railway-persistence.md)");
    expect(hostedRecipes).toContain("OTTE_WORKER_PROFILE_ENABLED=true");

    const railwayPersistence = readWorkspaceFile("docs/deployment/railway-persistence.md");
    expect(railwayPersistence).toContain("Attach one Railway Volume to the API service");
    expect(railwayPersistence).toContain("/app/storage");
    expect(railwayPersistence).toContain("OTTE_SQLITE_PATH=/app/storage/opentabletop.sqlite");
    expect(railwayPersistence).toContain("OTTE_PLUGIN_DIR=/app/storage/plugins");
    expect(railwayPersistence).toContain("OTTE_BUNDLED_PLUGIN_DIR=/app/plugins");
    expect(railwayPersistence).toContain("never overwrites an existing persisted package directory");
    expect(railwayPersistence).toContain("OTTE_SQLITE_BACKUP_INTERVAL_SECONDS=86400");
    expect(railwayPersistence).toContain("GET /api/v1/admin/storage/operations");
    expect(railwayPersistence).toContain("POST /api/v1/admin/storage/restore-drill");
    expect(railwayPersistence).toContain("public `/api/v1/health`");

    const securityChecklist = readWorkspaceFile("docs/deployment/security-checklist.md");
    expect(securityChecklist).toContain("OTTE_PLUGIN_TRUST_POLICY=require_trusted");
    expect(securityChecklist).toContain("OTTE_ALLOW_LEGACY_USER_HEADER");
    expect(securityChecklist).toContain("asset signing secrets");
  });
});
