import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  DndCharacterReviewPanel,
  dndCharacterReviewStatusLabel,
  dndCharacterReviewsPath,
} from "./dnd-character-review-panel.js";

describe("DndCharacterReviewPanel", () => {
  it("renders an accessible player and DM workflow while the queue loads", () => {
    const html = renderToStaticMarkup(
      <DndCharacterReviewPanel campaignId="campaign/demo" currentUserId="user" canManage canSubmit={() => true} onChanged={() => undefined} onStatus={() => undefined} />,
    );
    expect(html).toContain("Validation and DM approval");
    expect(html).toContain("Players submit a fingerprinted build");
    expect(html).toContain("Loading character review queue...");
    expect(html).toContain('role="status"');

    const source = readFileSync(resolve(__dirname, "dnd-character-review-panel.tsx"), "utf8");
    expect(source).toContain("Submit for DM review");
    expect(source).toContain("Request changes");
    expect(source).toContain("Approve with a documented validation exception.");
    expect(source).toContain("Legacy default: optional. Existing campaigns are unchanged");
    expect(source).toContain("The queue was refreshed; review the current character and try again.");
    expect(source).not.toContain("JSON.stringify");
    expect(source).not.toContain("console.");
  });

  it("encodes campaign paths and gives every durable state a human label", () => {
    expect(dndCharacterReviewsPath("campaign/demo")).toBe("/api/v1/campaigns/campaign%2Fdemo/dnd/character-reviews");
    expect(dndCharacterReviewStatusLabel("not_submitted")).toBe("Not submitted");
    expect(dndCharacterReviewStatusLabel("submitted")).toBe("Submitted");
    expect(dndCharacterReviewStatusLabel("approved")).toBe("Approved");
    expect(dndCharacterReviewStatusLabel("changes_requested")).toBe("Changes requested");
    expect(dndCharacterReviewStatusLabel("stale")).toBe("Stale");
  });

  it("is mounted for D&D campaigns with permission-aware submission and management", () => {
    const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
    expect(appSource).toContain("<LazyDndCharacterReviewPanel");
    expect(appSource).toContain('canManage={hasPermission("campaign.update")}');
    expect(appSource).toContain('hasPermission("actor.updateOwned")');
  });
});
