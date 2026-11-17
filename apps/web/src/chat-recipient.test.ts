import { describe, expect, it } from "vitest";
import { resolveChatRecipientId } from "./chat-recipient.js";

const member = (id: string, displayName: string, email?: string) => ({ user: { id, displayName, email } });
const members = [member("usr_sam", "Sam", "sam@example.test"), member("usr_samantha", "Samantha", "samantha@example.test"), member("usr_rowan", "Rowan Vale")];

describe("resolveChatRecipientId", () => {
  it("prefers an exact match over longer names that contain it", () => {
    expect(resolveChatRecipientId(members, "sam")).toBe("usr_sam");
    expect(resolveChatRecipientId(members, " SAMANTHA ")).toBe("usr_samantha");
    expect(resolveChatRecipientId(members, "usr_rowan")).toBe("usr_rowan");
  });

  it("uses a partial match only when it is unique", () => {
    expect(resolveChatRecipientId(members, "row")).toBe("usr_rowan");
    expect(resolveChatRecipientId(members, "sa")).toBeUndefined();
  });

  it("refuses ambiguous exact matches and empty queries", () => {
    expect(resolveChatRecipientId([...members, member("usr_other_sam", "Sam")], "sam")).toBeUndefined();
    expect(resolveChatRecipientId(members, "  ")).toBeUndefined();
    expect(resolveChatRecipientId(members, "nobody")).toBeUndefined();
  });
});
