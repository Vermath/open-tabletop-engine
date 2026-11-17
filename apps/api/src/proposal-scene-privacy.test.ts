import { createTimestamped, type Proposal } from "@open-tabletop/core";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

describe("scene proposal privacy", () => {
  it.each(["rename", "replace annotations", "clear annotations"] as const)("projects scene changes and rollback guards in reads/realtime without changing GM revert: %s", async (operation) => {
    const store = new MemoryStateStore();
    const scene = store.state.scenes.find((item) => item.id === "scn_vault_entry")!;
    const originalName = scene.name;
    scene.annotations = [
      createTimestamped("ann", { id: "ann_public", sceneId: scene.id, createdByUserId: "usr_demo_gm", kind: "drawing" as const, points: [{ x: 10, y: 20 }], label: "Public marker", color: "#ffffff", visibility: "public" as const }),
      createTimestamped("ann", { id: "ann_secret", sceneId: scene.id, createdByUserId: "usr_demo_gm", kind: "drawing" as const, points: [{ x: 500, y: 600 }], label: "Secret ambush entrance", color: "#ffffff", visibility: "gm" as const })
    ];
    const originalAnnotations = structuredClone(scene.annotations);
    const change = operation === "rename" ? { name: "Renamed vault" } : { annotations: operation === "clear annotations" ? [] : [...scene.annotations, { ...scene.annotations[1]!, id: "ann_forward_secret", label: "Secret forward marker" }] };
    const proposal = createTimestamped("prop", {
      campaignId: scene.campaignId, createdByUserId: "usr_demo_gm", createdByType: "user", title: "Rename scene", summary: "Rename only", status: "approved", approvedByUserId: "usr_demo_gm", approvalRequired: true,
      changesJson: [{ entity: "scene", action: "update", id: scene.id, data: change }], diffJson: {}
    }) satisfies Proposal;
    store.state.proposals.push(proposal);
    const app = await buildApp({ store });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address() as AddressInfo;
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/v1/realtime?campaignId=camp_demo&userId=usr_demo_player`);
    const events: Array<{ type: string; payload: unknown }> = [];
    socket.onmessage = (event) => events.push(JSON.parse(String(event.data)));
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Realtime socket did not open")), 2000);
        socket.onopen = () => { clearTimeout(timer); resolve(); };
        socket.onerror = () => { clearTimeout(timer); reject(new Error("Realtime socket failed")); };
      });
      const applied = await app.inject({ method: "POST", url: `/api/v1/proposals/${proposal.id}/apply`, headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "privacy-apply" }, payload: { expectedUpdatedAt: proposal.updatedAt } });
      expect(applied.statusCode).toBe(200);
      expect(applied.body).toContain("Secret ambush entrance");
      const stored = store.state.proposals.find((item) => item.id === proposal.id)!;
      const guards = structuredClone(stored.revertGuardsJson);
      const changes = structuredClone({ forward: stored.changesJson, inverse: stored.inverseChangesJson });
      for (const path of ["proposals", "snapshot"]) {
        const response = await app.inject({ method: "GET", url: `/api/v1/campaigns/camp_demo/${path}`, headers: { "x-user-id": "usr_demo_player" } });
        expect(response.statusCode).toBe(200);
        const publicProposal = (path === "proposals" ? response.json() : response.json().proposals).find((item: Proposal) => item.id === proposal.id);
        expect(publicProposal).toBeDefined();
        expect(JSON.stringify(publicProposal)).toContain("Public marker");
        expect(JSON.stringify(publicProposal)).not.toContain("Secret ambush entrance");
        expect(JSON.stringify(publicProposal)).not.toContain("ann_secret");
        expect(JSON.stringify(publicProposal)).not.toContain("Secret forward marker");
        expect(JSON.stringify(publicProposal)).not.toContain("ann_forward_secret");
      }
      await expect.poll(() => events.find((event) => event.type === "proposal.applied")).toBeDefined();
      const event = events.find((candidate) => candidate.type === "proposal.applied")!;
      expect(JSON.stringify(event.payload)).toContain("Public marker");
      expect(JSON.stringify(event.payload)).not.toContain("Secret ambush entrance");
      expect(JSON.stringify(event.payload)).not.toContain("Secret forward marker");
      expect(stored.revertGuardsJson).toEqual(guards);
      expect({ forward: stored.changesJson, inverse: stored.inverseChangesJson }).toEqual(changes);
      if (operation === "replace annotations") expect(JSON.stringify(changes.forward)).toContain("Secret forward marker");
      expect(JSON.stringify({ guards, changes })).toContain("Secret ambush entrance");
      const reverted = await app.inject({ method: "POST", url: `/api/v1/proposals/${proposal.id}/revert`, headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "privacy-revert" }, payload: { expectedUpdatedAt: stored.updatedAt } });
      expect(reverted.statusCode).toBe(200);
      expect(store.state.scenes.find((item) => item.id === scene.id)?.name).toBe(originalName);
      expect(store.state.scenes.find((item) => item.id === scene.id)?.annotations).toEqual(originalAnnotations);
    } finally {
      socket.close();
      await app.close();
    }
  });
  it("projects untrusted partial annotation data without exposing private entries or failing the read", async () => {
    const store = new MemoryStateStore();
    const proposal = createTimestamped("prop", {
      campaignId: "camp_demo", createdByUserId: "usr_demo_gm", createdByType: "user", title: "Unvalidated annotation draft", summary: "", status: "approved", approvalRequired: true,
      changesJson: [{ entity: "scene", action: "update", id: "scn_vault_entry", data: { annotations: [null, { visibility: "gm", label: "Private draft" }, { visibility: "public", label: "Public draft", affectedTokenIds: "invalid" }] } }], diffJson: {}
    }) satisfies Proposal;
    store.state.proposals.push(proposal);
    const original = structuredClone(proposal.changesJson);
    const app = await buildApp({ store });
    try {
      const response = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/proposals", headers: { "x-user-id": "usr_demo_player" } });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("Public draft");
      expect(response.body).not.toContain("Private draft");
      expect(store.state.proposals.find((item) => item.id === proposal.id)!.changesJson).toEqual(original);
    } finally {
      await app.close();
    }
  });

});
