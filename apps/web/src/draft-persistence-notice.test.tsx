import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DraftPersistenceNotice, draftPersistenceStatus } from "./draft-persistence-notice.js";
import { writeLocalDraft } from "./local-draft-storage.js";

describe("recoverable draft persistence notices", () => {
  it("renders an honest alert when browser storage rejects a draft write", () => {
    const storage = {
      getItem: () => null,
      setItem: () => { throw new Error("quota exceeded"); },
      removeItem: () => undefined,
    };

    const status = draftPersistenceStatus(writeLocalDraft("draft", { title: "Keep me" }, storage));
    const html = renderToStaticMarkup(createElement(DraftPersistenceNotice, { subject: "Journal", status }));

    expect(html).toContain('role="alert"');
    expect(html).toContain("only in this open editor");
    expect(html).toContain("Browser storage is unavailable");
    expect(html).not.toContain("saved in this browser");
  });

  it("renders saved state only after storage confirms the write", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };

    const status = draftPersistenceStatus(writeLocalDraft("draft", { title: "Safe" }, storage));
    const html = renderToStaticMarkup(createElement(DraftPersistenceNotice, { subject: "Handout", status }));

    expect(html).toContain('role="status"');
    expect(html).toContain("Handout draft saved in this browser");
    expect(html).not.toContain('role="alert"');
  });
});
