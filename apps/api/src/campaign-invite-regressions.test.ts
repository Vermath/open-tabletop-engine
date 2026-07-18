import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };

describe("campaign invite regressions", () => {
  it("returns the advanced campaign revision so several organization invites can be created consecutively", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    const campaign = store.state.campaigns.find(
      (candidate) => candidate.id === "camp_demo",
    )!;

    try {
      const first = await app.inject({
        method: "POST",
        url: "/api/v1/organization/invites",
        headers: { ...gmHeaders, "idempotency-key": "invite-regression-first" },
        payload: {
          campaignId: campaign.id,
          email: "first.invite@example.test",
          role: "player",
          expectedCampaignUpdatedAt: campaign.updatedAt,
        },
      });
      expect(first.statusCode, first.body).toBe(201);
      expect(first.json()).toMatchObject({
        campaignUpdatedAt: campaign.updatedAt,
        invite: {
          campaignId: campaign.id,
          email: "first.invite@example.test",
          status: "pending",
        },
      });

      const second = await app.inject({
        method: "POST",
        url: "/api/v1/organization/invites",
        headers: {
          ...gmHeaders,
          "idempotency-key": "invite-regression-second",
        },
        payload: {
          campaignId: campaign.id,
          email: "second.invite@example.test",
          role: "player",
          expectedCampaignUpdatedAt: first.json().campaignUpdatedAt,
        },
      });
      expect(second.statusCode, second.body).toBe(201);
      expect(second.json()).toMatchObject({
        campaignUpdatedAt: campaign.updatedAt,
        invite: {
          campaignId: campaign.id,
          email: "second.invite@example.test",
          status: "pending",
        },
      });
      expect(
        store.state.invites.filter(
          (invite) => invite.campaignId === campaign.id,
        ),
      ).toHaveLength(2);
    } finally {
      await app.close();
    }
  });

  it("uses submitted invite credentials when an obsolete browser session cookie is present", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });

    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/invites",
        headers: {
          ...gmHeaders,
          "idempotency-key": "invite-regression-stale-cookie-create",
        },
        payload: { email: "cookie.recovery@example.test", role: "player" },
      });
      expect(created.statusCode, created.body).toBe(200);

      const tokenOnly = await app.inject({
        method: "POST",
        url: "/api/v1/invites/accept",
        headers: {
          cookie: "otte_session=ots_obsolete_browser_session",
          "sec-fetch-site": "same-origin",
          "idempotency-key": "invite-regression-stale-cookie-token-only",
        },
        payload: {
          token: created.json().token,
          expectedUpdatedAt: created.json().invite.updatedAt,
        },
      });
      expect(tokenOnly.statusCode).toBe(401);
      expect(tokenOnly.json()).toMatchObject({
        message: "Unknown user session",
      });

      const accepted = await app.inject({
        method: "POST",
        url: "/api/v1/invites/accept",
        headers: {
          cookie: "otte_session=ots_obsolete_browser_session",
          "sec-fetch-site": "same-origin",
          "idempotency-key": "invite-regression-stale-cookie-accept",
        },
        payload: {
          token: created.json().token,
          email: "cookie.recovery@example.test",
          displayName: "Cookie Recovery",
          password: "correct horse battery staple",
          expectedUpdatedAt: created.json().invite.updatedAt,
        },
      });

      expect(accepted.statusCode, accepted.body).toBe(200);
      expect(accepted.json()).toMatchObject({
        user: {
          email: "cookie.recovery@example.test",
          displayName: "Cookie Recovery",
        },
        invite: { status: "accepted" },
        membership: { campaignId: "camp_demo", role: "player" },
      });
      expect(accepted.json()).not.toMatchObject({
        message: "Unknown user session",
      });
    } finally {
      await app.close();
    }
  });
});
