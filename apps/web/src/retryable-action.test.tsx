import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { RetryableActionNotice, retryableActionError } from "./retryable-action.js";

describe("retryable campaign actions", () => {
  it("keeps the action label and underlying failure in the user-facing message", () => {
    expect(retryableActionError("Move token", new Error("revision conflict"))).toBe(
      "Move token failed: revision conflict"
    );
  });

  it("renders an assertive retryable alert", () => {
    const html = renderToStaticMarkup(
      <RetryableActionNotice
        operation={{
          kind: "error",
          label: "Move token",
          message: "Move token failed: revision conflict",
          retry: async () => undefined
        }}
        onRetry={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain("Move token failed: revision conflict");
    expect(html).toContain("Retry");
    expect(html).toContain("Dismiss");
  });

  it("keeps common campaign mutations out of console-only failure paths", () => {
    for (const fileName of ["App.tsx", "combat-panel.tsx", "content-import-panel.tsx", "scene-canvas.tsx"]) {
      const source = readFileSync(resolve(__dirname, fileName), "utf8");
      expect(source, fileName).not.toContain("catch(console.error)");
      expect(source, fileName).not.toContain("console.error(error)");
    }
  });
});
