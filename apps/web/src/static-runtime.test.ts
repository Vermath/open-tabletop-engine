import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startWebStaticRuntime } from "./static-runtime.js";

describe("web static runtime", () => {
  it("serves the built SPA and proxies API calls to the local API", async () => {
    const root = mkdtempSync(join(tmpdir(), "otte-web-runtime-"));
    const dist = join(root, "dist");
    mkdirSync(join(dist, "assets"), { recursive: true });
    writeFileSync(join(dist, "index.html"), "<main>OpenTabletop Desktop</main>");

    const api = await BunlessApiServer.fake({ "/api/v1/health": Response.json({ ok: true }) });
    const web = await startWebStaticRuntime({ host: "127.0.0.1", port: 0, root: dist, apiBaseUrl: api.url });

    try {
      expect(await (await fetch(`${web.url}/`)).text()).toContain("OpenTabletop Desktop");
      expect(await (await fetch(`${web.url}/api/v1/health`)).json()).toEqual({ ok: true });
    } finally {
      await web.close();
      await api.close();
    }
  });
});

class BunlessApiServer {
  static async fake(routes: Record<string, Response>): Promise<{ url: string; close(): Promise<void> }> {
    const { createServer } = await import("node:http");
    const server = createServer((request, response) => {
      const route = routes[request.url ?? ""];
      if (!route) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(route.status, Object.fromEntries(route.headers.entries()));
      route.body?.pipeTo(
        new WritableStream({
          write(chunk) {
            response.write(Buffer.from(chunk));
          },
          close() {
            response.end();
          }
        })
      ).catch((error) => response.destroy(error));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Fake API server did not bind to a TCP port");
    return {
      url: `http://127.0.0.1:${address.port}`,
      close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    };
  }
}
