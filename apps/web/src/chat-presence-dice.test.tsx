import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatRail, diceFormulaRangeLabel } from "./chat-rail.js";
import type { Snapshot } from "./api.js";

describe("chat presence and dice transparency", () => {
  it("uses the shared dice engine range and explains unsupported or unbounded notation", () => {
    expect(diceFormulaRangeLabel("2d20kh1+5")).toBe("Possible total: 6 to 25");
    expect(diceFormulaRangeLabel("1d6!")).toContain("Range unavailable");
  });

  it("renders actual connected participants instead of membership as presence", () => {
    const members: Snapshot["members"] = [{
      id: "member-one",
      campaignId: "campaign-one",
      userId: "user-one",
      user: { id: "user-one", displayName: "Ari", email: "ari@example.test" },
      active: true,
      permissions: [],
      role: "player",
      createdAt: "2026-07-13T00:00:00.000Z",
      updatedAt: "2026-07-13T00:00:00.000Z"
    }];
    const presences = [{ campaignId: "campaign-one", userId: "user-one", displayName: "Ari", role: "player", connectionCount: 1, connectedAt: "2026-07-13T00:00:00.000Z", lastSeenAt: "2026-07-13T00:00:01.000Z", activeSceneIds: ["scene-one"] }] as Snapshot["presences"];
    const scenes = [{ id: "scene-one", name: "Ember Vault" }] as Snapshot["scenes"];
    const html = renderToStaticMarkup(<ChatRail campaignId="campaign-one" currentUserId="user-one" command="" setCommand={() => undefined} messages={[]} rolls={[]} concealedRollIds={new Set()} members={members} presences={presences} scenes={scenes} diceFormula="2d20kh1+5" setDiceFormula={() => undefined} diceVisibility="public" setDiceVisibility={() => undefined} savedDiceFormulas={[]} diceMacros={[]} onRollDice={async () => undefined} onSaveDiceFormula={async () => undefined} onSubmitCommand={async () => undefined} onClearReply={() => undefined} onReplyToMessage={() => undefined} onEditMessage={async () => undefined} onDeleteMessage={async () => undefined} onModerateMessage={async () => undefined} canModerate={false} canRollDice={true} dice3dEnabled={false} onToggleDice3d={() => undefined} notificationPreference="mentions" connectionState="connected" />);
    expect(html).toContain("1 online");
    expect(html).toContain("Ari");
    expect(html).toContain("Ember Vault");
    expect(html).toContain("Possible total: 6 to 25");
    expect(html).toContain("Dice notation");
    expect(html).not.toContain("active campaign members");
  });
});
