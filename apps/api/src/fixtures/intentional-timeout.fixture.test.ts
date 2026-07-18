import { expect, it } from "vitest";
import { buildApp } from "../app.js";

it("emits machine-readable active-resource diagnostics for a timed-out fixture", async () => {
  expect.hasAssertions();
  const app = await buildApp();
  await app.listen({ host: "127.0.0.1", port: 0 });
  await new Promise<void>(() => undefined);
});
