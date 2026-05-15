import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function readWorkspaceFile(path: string): string {
  return readFileSync(resolve(rootDir, path), "utf8");
}

describe("deployment smoke", () => {
  it("keeps the release gate wired to Docker Compose and production-like deployment checks", () => {
    const packageJson = JSON.parse(readWorkspaceFile("package.json")) as { scripts: Record<string, string> };
    expect(packageJson.scripts["deployment:smoke"]).toBe('pnpm --filter @open-tabletop/api test -- --run -t "deployment smoke"');
    expect(packageJson.scripts["release:smoke"]).toContain("pnpm deployment:smoke");
    expect(packageJson.scripts["release:smoke"]).toContain("pnpm v1:issues:test");
    expect(packageJson.scripts["release:smoke"]).toContain("pnpm v1:issues:check");

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
    expect(identityWorkflow).toContain("OTTE_IDENTITY_SMOKE_BASE_URL: ${{ secrets.OTTE_IDENTITY_SMOKE_BASE_URL }}");
    expect(identityWorkflow).toContain("OTTE_IDENTITY_SMOKE_ADMIN_TOKEN: ${{ secrets.OTTE_IDENTITY_SMOKE_ADMIN_TOKEN }}");
    expect(identityWorkflow).toContain("OTTE_SCIM_BEARER_TOKEN: ${{ secrets.OTTE_SCIM_BEARER_TOKEN }}");
    expect(identityWorkflow).toContain("Missing required identity-smoke secrets");
    expect(identityWorkflow).toContain("pnpm identity:smoke");

    const compose = readWorkspaceFile("docker-compose.yml");
    expect(compose).toContain("dockerfile: infra/docker/api.Dockerfile");
    expect(compose).toContain("dockerfile: infra/docker/web.Dockerfile");
    expect(compose).toContain("dockerfile: infra/docker/worker.Dockerfile");
    expect(compose).toContain("OTTE_SQLITE_PATH: /app/storage/opentabletop.sqlite");
    expect(compose).toContain("OTTE_ASSET_STORAGE: ${OTTE_ASSET_STORAGE:-s3}");
    expect(compose).toContain("OTTE_ALLOW_LEGACY_USER_HEADER: ${OTTE_ALLOW_LEGACY_USER_HEADER:-false}");
    expect(compose).toContain("OTTE_PLUGIN_TRUST_POLICY: ${OTTE_PLUGIN_TRUST_POLICY:-allow_unsigned}");
    expect(compose).toContain("wget -qO- http://127.0.0.1:4000/api/v1/health");
    expect(compose).toContain("condition: service_healthy");
    expect(compose).toContain("OTTE_WORKER_LEASE_POLL: \"true\"");
    expect(compose).toContain("api-storage:");
    expect(compose).toContain("api-uploads:");

    const selfHosting = readWorkspaceFile("docs/deployment/self-hosting.md");
    expect(selfHosting).toContain("docker compose up --build");
    expect(selfHosting).toContain("docker compose --profile worker up -d worker");
    expect(selfHosting).toContain("docker compose --profile worker up -d --scale worker=3 worker");
    expect(selfHosting).toContain("OTTE_SESSION_TOKEN`/`OTTE_WORKER_SESSION_TOKEN");
    expect(selfHosting).toContain("preview-only");

    const securityChecklist = readWorkspaceFile("docs/deployment/security-checklist.md");
    expect(securityChecklist).toContain("OTTE_PLUGIN_TRUST_POLICY=require_trusted");
    expect(securityChecklist).toContain("OTTE_ALLOW_LEGACY_USER_HEADER");
    expect(securityChecklist).toContain("asset signing secrets");
  });
});
