import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { sanitizeRequestUrl } from "./request-logging.js";
import { MemoryStateStore } from "./store.js";

describe("request log redaction", () => {
  it("redacts normalized secret query keys while retaining path and benign query diagnostics", () => {
    const sanitized = sanitizeRequestUrl(
      "/api/v1/assets/asset_demo/blob?signature=sig-secret&token=token-secret&session_token=session-secret&code=code-secret&state=state-secret&access_token=access-secret&client-secret=client-secret-value&pluginToken=plugin-secret&view=gm&tab=scene"
    );
    const parsed = new URL(sanitized, "http://request.invalid");

    expect(parsed.pathname).toBe("/api/v1/assets/asset_demo/blob");
    for (const key of ["signature", "token", "session_token", "code", "state", "access_token", "client-secret", "pluginToken"]) {
      expect(parsed.searchParams.get(key)).toBe("[REDACTED]");
    }
    expect(parsed.searchParams.get("view")).toBe("gm");
    expect(parsed.searchParams.get("tab")).toBe("scene");
    expect(sanitized).not.toMatch(/sig-secret|token-secret|session-secret|code-secret|state-secret|access-secret|client-secret-value|plugin-secret/);
  });

  it("does not expose origin credentials or malformed raw request targets", () => {
    expect(sanitizeRequestUrl("https://raw-user:raw-pass@example.test/api/v1/health?view=ready")).toBe("/api/v1/health?view=ready");
    expect(sanitizeRequestUrl("http://[")).toBe("/[invalid-request-target]");
  });

  it("uses the sanitizer in the actual Fastify request logger configuration", async () => {
    const logLines: string[] = [];
    const secrets = {
      signature: "live-signature-secret",
      sessionToken: "live-session-secret",
      code: "live-code-secret",
      state: "live-state-secret",
      accessToken: "live-access-secret"
    };
    const app = await buildApp({
      store: new MemoryStateStore(),
      requestLogStream: {
        write(message) {
          logLines.push(message);
        }
      }
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/health?signature=${secrets.signature}&sessionToken=${secrets.sessionToken}&code=${secrets.code}&state=${secrets.state}&access_token=${secrets.accessToken}&probe=logger`
      });
      expect(response.statusCode).toBe(200);
    } finally {
      await app.close();
    }

    const completeLog = logLines.join("");
    for (const secret of Object.values(secrets)) expect(completeLog).not.toContain(secret);

    const entries = logLines
      .flatMap((line) => line.split("\n"))
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { msg?: string; req?: { method?: string; url?: string } });
    const incomingRequest = entries.find((entry) => entry.msg === "incoming request");
    expect(incomingRequest?.req?.method).toBe("GET");

    const loggedUrl = new URL(incomingRequest?.req?.url ?? "", "http://request.invalid");
    expect(loggedUrl.pathname).toBe("/api/v1/health");
    expect(loggedUrl.searchParams.get("probe")).toBe("logger");
    for (const key of ["signature", "sessionToken", "code", "state", "access_token"]) {
      expect(loggedUrl.searchParams.get(key)).toBe("[REDACTED]");
    }
  });
});
