import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownDocument, markdownBlocks, safeMarkdownHref } from "./markdown-document.js";

describe("MarkdownDocument", () => {
  it("parses useful handout blocks without accepting embedded HTML", () => {
    expect(markdownBlocks("# Briefing\n\n- First clue\n- Second clue\n\n```\nd20+5\n```")).toEqual([
      { kind: "heading", level: 1, text: "Briefing" },
      { kind: "list", ordered: false, items: ["First clue", "Second clue"] },
      { kind: "code", text: "d20+5" }
    ]);
    const html = renderToStaticMarkup(<MarkdownDocument source={'<script>alert(1)</script> **safe** [bad](javascript:alert(1))'} />);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("<strong>safe</strong>");
    expect(html).not.toContain("javascript:");
  });

  it("allows only navigable, non-script link schemes", () => {
    expect(safeMarkdownHref("https://example.test/clue")).toBe("https://example.test/clue");
    expect(safeMarkdownHref("/api/v1/assets/asset-1/blob")).toBe("/api/v1/assets/asset-1/blob");
    expect(safeMarkdownHref("javascript:alert(1)")).toBeUndefined();
  });
});
