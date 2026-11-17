import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { computeApiSourceFingerprint, findWorkspaceRoot, runtimeApiBuildFingerprint } from "./build-fingerprint.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixtureWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "otte-api-fingerprint-"));
  temporaryRoots.push(root);
  for (const directory of ["apps/api/src", "infra/docker", "packages/core/src", "plugins/example"]) mkdirSync(join(root, directory), { recursive: true });
  const files: Array<readonly [string, string]> = [
    ["package.json", "{}"],
    ["pnpm-lock.yaml", "lockfileVersion: '9.0'"],
    ["pnpm-workspace.yaml", "packages: []"],
    ["tsconfig.base.json", "{}"],
    ["turbo.json", "{}"],
    ["apps/api/package.json", "{}"],
    ["apps/api/src/server.ts", "export const build = 1;"],
    ["infra/docker/api.Dockerfile", "FROM scratch"],
    ["packages/core/src/index.ts", "export {};"],
    ["plugins/example/plugin.manifest.json", "{}"]
  ];
  for (const [path, contents] of files) writeFileSync(join(root, path), contents);
  return root;
}

describe("API source build fingerprint", () => {
  it("is deterministic and changes with server source while ignoring build output", () => {
    const root = fixtureWorkspace();
    const first = computeApiSourceFingerprint(root);
    expect(first).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(findWorkspaceRoot(join(root, "apps/api/src"))).toBe(root);

    mkdirSync(join(root, "packages/core/dist"), { recursive: true });
    writeFileSync(join(root, "packages/core/dist/index.js"), "generated");
    expect(computeApiSourceFingerprint(root)).toBe(first);

    writeFileSync(join(root, "apps/api/src/server.ts"), "export const build = 2;");
    expect(computeApiSourceFingerprint(root)).not.toBe(first);
  });

  it("prefers an injected image build fingerprint without treating it as a secret", () => {
    expect(runtimeApiBuildFingerprint({ cwd: "C:/missing", env: { OTTE_BUILD_FINGERPRINT: "sha256:image" } })).toBe("sha256:image");
  });

  it("persists the exact source fingerprint into the shipped API image", () => {
    const root = findWorkspaceRoot();
    const dockerfile = readFileSync(join(root, "infra/docker/api.Dockerfile"), "utf8");
    expect(dockerfile).toContain("COPY infra/docker/api.Dockerfile ./infra/docker/api.Dockerfile");
    expect(dockerfile).toContain("computeApiSourceFingerprint('/app')");
    expect(dockerfile).toContain("COPY --from=build /app/api-build-fingerprint ./api-build-fingerprint");
  });
});
