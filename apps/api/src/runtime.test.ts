import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startApiRuntime } from "./runtime.js";

describe("api runtime entrypoint", () => {
  it("starts on an ephemeral local port and answers health checks", async () => {
    const root = mkdtempSync(join(tmpdir(), "otte-api-runtime-"));
    const runtime = await startApiRuntime({
      host: "127.0.0.1",
      port: 0,
      sqlitePath: join(root, "data", "opentabletop.sqlite"),
      uploadDir: join(root, "uploads"),
      pluginRoot: join(root, "plugins")
    });

    try {
      expect(runtime.port).toBeGreaterThan(0);
      const response = await fetch(`${runtime.url}/api/v1/health`);
      expect(response.status).toBe(200);
    } finally {
      await runtime.close();
    }
  });
});
