import type { AiProvider, AiProviderEvent, AiProviderRequest } from "@open-tabletop/ai-core";
import type { Actor, DeclarativeSystemManifest, EngineEvent, EngineState, Item, Proposal, ProposalChange, SystemManifestIdentity } from "@open-tabletop/core";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { declarativeSystemManifestChecksum } from "./declarative-system-runtime.js";
import { RealtimeHub } from "./realtime.js";
import { MemoryStateStore } from "./store.js";

/** Observe real validation/flush behavior; do not replace it with a permissive test store. */
class ObservedStateStore extends MemoryStateStore {
  persisted: EngineState = structuredClone(this.state);

  override flush(): void {
    super.flush();
    this.persisted = structuredClone(this.state);
  }
}

function manifest(version = "1.0.0", maximum = 4): DeclarativeSystemManifest {
  return {
    id: "proposal-survey", name: "Proposal Survey", version, compatibleCore: ">=0.3.0 <0.4.0", entrypoints: {},
    schemas: {
      actor: { type: "object", additionalProperties: false, required: ["wits", "stamina"], properties: {
        wits: { type: "integer", minimum: 0, maximum }, stamina: { type: "integer", minimum: 0, maximum: 6 },
      } },
      item: { type: "object", additionalProperties: false, required: ["weight"], properties: { weight: { type: "integer", minimum: 0, maximum: 20 } } },
    },
    permissions: ["actor.read", "actor.updateOwned", "dice.roll", "chat.write"], capabilities: ["data-model", "actor-sheet", "quick-rolls"],
    definition: {
      kind: "declarative-v1", actorTypes: ["surveyor"], itemTypes: ["gear"], actorDefaults: { wits: 2, stamina: 6 }, itemDefaults: { weight: 1 },
      sheet: { fields: [{ path: ["wits"], label: "Wits", editable: true }, { path: ["stamina"], label: "Stamina", editable: true }] },
      quickRolls: [{ id: "survey", label: "Survey", dice: { count: 2, sides: 6, bonus: 0, addFields: [["wits"]] } }],
    },
  };
}

function headers(key: string) { return { "x-user-id": "usr_demo_gm", "idempotency-key": key }; }
function campaignRevision(store: MemoryStateStore) { return store.state.campaigns.find((campaign) => campaign.id === "camp_demo")!.updatedAt; }
type App = Awaited<ReturnType<typeof buildApp>>;

async function installAndSelect(app: App, store: MemoryStateStore, definition: DeclarativeSystemManifest): Promise<SystemManifestIdentity> {
  const registration = await app.inject({ method: "POST", url: "/api/v1/systems/install", headers: headers(`register-${definition.version}`), payload: { campaignId: "camp_demo", manifest: definition } });
  expect(registration.statusCode, registration.body).toBe(200);
  const identity = { systemId: definition.id, version: definition.version, checksum: declarativeSystemManifestChecksum(definition) };
  const campaign = store.state.campaigns.find((entry) => entry.id === "camp_demo")!;
  const binding = await app.inject({
    method: "POST", url: `/api/v1/campaigns/camp_demo/systems/${definition.id}/binding`, headers: headers(`bind-${definition.version}`),
    payload: { expectedUpdatedAt: campaign.updatedAt, system: identity, expectedBinding: campaign.systemBindings?.find((entry) => entry.systemId === definition.id) ?? null },
  });
  expect(binding.statusCode, binding.body).toBe(200);
  expect(binding.json().binding).toEqual(identity);
  return identity;
}

async function baseSetup(provider?: AiProvider) {
  const store = new ObservedStateStore();
  store.state.users.find((user) => user.id === "usr_demo_gm")!.serverAdmin = true;
  store.save();
  store.flush();
  const app = await buildApp({ store, ...(provider ? { aiProvider: provider } : {}) });
  try {
    const definition = manifest();
    await installAndSelect(app, store, definition);
    return { app, store, definition };
  } catch (error) {
    await app.close();
    throw error;
  }
}

async function setup(wits = 2) {
  const { app, store, definition } = await baseSetup();
  try {
    const createdActor = await app.inject({
      method: "POST", url: "/api/v1/campaigns/camp_demo/actors", headers: headers("create-surveyor"),
      payload: { name: "Proposal Surveyor", type: "surveyor", systemId: definition.id, ownerUserId: "usr_demo_gm", data: { wits, stamina: 6 }, expectedUpdatedAt: campaignRevision(store) },
    });
    expect(createdActor.statusCode, createdActor.body).toBe(200);
    const actor = createdActor.json() as Actor;
    const createdItem = await app.inject({
      method: "POST", url: "/api/v1/campaigns/camp_demo/items", headers: headers("create-surveyor-gear"),
      payload: { name: "Survey Gear", type: "gear", systemId: definition.id, actorId: actor.id, data: { weight: 1 }, expectedUpdatedAt: campaignRevision(store) },
    });
    expect(createdItem.statusCode, createdItem.body).toBe(200);
    const item = createdItem.json() as Item;
    return { app, store, actor, item };
  } catch (error) {
    await app.close();
    throw error;
  }
}

async function createApprovedProposal(app: App, store: MemoryStateStore, title: string, changesJson: ProposalChange[]): Promise<Proposal> {
  const created = await app.inject({
    method: "POST", url: "/api/v1/campaigns/camp_demo/proposals", headers: headers(`create-${title}`),
    payload: { title, summary: title, changesJson, expectedUpdatedAt: campaignRevision(store) },
  });
  expect(created.statusCode, created.body).toBe(200);
  const pending = created.json() as Proposal;
  const approved = await app.inject({ method: "POST", url: `/api/v1/proposals/${pending.id}/approve`, headers: headers(`approve-${title}`), payload: { expectedUpdatedAt: pending.updatedAt } });
  expect(approved.statusCode, approved.body).toBe(200);
  return approved.json() as Proposal;
}

class ProposalSequenceProvider implements AiProvider {
  readonly id = "declarative-proposal-sequence";
  readonly label = "Declarative proposal sequence";
  readonly executesToolsInTurn = true;
  readonly outputs: unknown[] = [];

  async *stream(input: AiProviderRequest): AsyncIterable<AiProviderEvent> {
    if (!input.executeTool) throw new Error("Proposal test provider has no tool context");
    for (const [title, wits] of [["Invalid automatic survey update", 99], ["Valid automatic survey update", 3]] as const) {
      const request = { title, summary: title, changes: [{ entity: "actor", action: "create", data: { id: wits === 99 ? "act_ai_invalid_surveyor" : "act_ai_valid_surveyor", systemId: "proposal-survey", type: "surveyor", name: title, ownerUserId: "usr_demo_gm", permissions: {}, data: { wits, stamina: 6 } } }] };
      yield { type: "tool.started", toolName: "create_proposal", input: request };
      const output = await input.executeTool("create_proposal", request);
      this.outputs.push(output);
      yield { type: "tool.completed", toolName: "create_proposal", output };
    }
    yield { type: "message.completed", content: "Reviewed the rejected update and applied the valid survey update." };
  }
}

class ApprovedProposalSequenceProvider implements AiProvider {
  readonly id = "declarative-approved-proposal-sequence";
  readonly label = "Declarative approved proposal sequence";
  readonly executesToolsInTurn = true;
  readonly proposalIds: string[] = [];
  readonly outputs: unknown[] = [];

  async *stream(input: AiProviderRequest): AsyncIterable<AiProviderEvent> {
    if (!input.executeTool) throw new Error("Proposal test provider has no tool context");
    for (const proposalId of this.proposalIds) {
      const request = { proposalId };
      yield { type: "tool.started", toolName: "apply_approved_proposal", input: request };
      const output = await input.executeTool("apply_approved_proposal", request);
      this.outputs.push(output);
      yield { type: "tool.completed", toolName: "apply_approved_proposal", output };
    }
    yield { type: "message.completed", content: "Finished the approved proposal sequence." };
  }
}

describe("declarative schemas at proposal execution boundaries", () => {
  it.each(["actor", "item"] as const)("rejects a late invalid %s change without applying the earlier valid change or changing proposal status", async (kind) => {
    const { app, store, actor, item } = await setup();
    try {
      const target = kind === "actor" ? actor : item;
      const other = kind === "actor" ? item : actor;
      const otherKind = kind === "actor" ? "item" : "actor";
      const invalidData = kind === "actor" ? { ...actor.data, wits: 99 } : { ...item.data, weight: -1 };
      const proposal = await createApprovedProposal(app, store, `Invalid ${kind} batch`, [
        { entity: otherKind, action: "update", id: other.id, data: { name: "Must not persist" } },
        { entity: kind, action: "update", id: target.id, data: { data: invalidData } },
      ]);
      const before = structuredClone({ actor: store.state.actors.find((entry) => entry.id === actor.id), item: store.state.items.find((entry) => entry.id === item.id), proposal });
      const response = await app.inject({ method: "POST", url: `/api/v1/proposals/${proposal.id}/apply`, headers: headers(`apply-invalid-${kind}`), payload: { expectedUpdatedAt: proposal.updatedAt } });
      expect(response.statusCode, response.body).toBe(409);
      expect(response.json()).toMatchObject({ error: "proposal_not_ready", message: expect.stringMatching(/declared|range/i) });
      expect(store.state.actors.find((entry) => entry.id === actor.id)).toEqual(before.actor);
      expect(store.state.items.find((entry) => entry.id === item.id)).toEqual(before.item);
      expect(store.state.proposals.find((entry) => entry.id === proposal.id)).toEqual(before.proposal);
      expect(store.persisted.actors.find((entry) => entry.id === actor.id)).toEqual(before.actor);
      expect(store.persisted.items.find((entry) => entry.id === item.id)).toEqual(before.item);
      expect(store.persisted.proposals.find((entry) => entry.id === proposal.id)).toEqual(before.proposal);
      expect(store.state.auditLogs.some((entry) => entry.targetId === proposal.id && entry.action === "proposal.apply")).toBe(false);
    } finally { await app.close(); }
  });

  it("rejects schema-invalid historical inverse data with intact revert guards", async () => {
    const { app, store, actor } = await setup(4);
    try {
      const proposal = await createApprovedProposal(app, store, "Reduce survey stat", [{ entity: "actor", action: "update", id: actor.id, data: { data: { ...actor.data, wits: 2 } } }]);
      const appliedResponse = await app.inject({ method: "POST", url: `/api/v1/proposals/${proposal.id}/apply`, headers: headers("apply-valid-before-upgrade"), payload: { expectedUpdatedAt: proposal.updatedAt } });
      expect(appliedResponse.statusCode, appliedResponse.body).toBe(200);
      const applied = appliedResponse.json() as Proposal;
      expect(applied.inverseChangesJson).toEqual(expect.arrayContaining([expect.objectContaining({ entity: "actor", data: expect.objectContaining({ data: expect.objectContaining({ wits: 4 }) }) })]));
      // Simulate an imported historical inverse payload while leaving the valid
      // current actor and its revert guards intact. Only test fixture state changes.
      const historical = store.state.proposals.find((entry) => entry.id === applied.id)!;
      const actorInverse = historical.inverseChangesJson!.find((change) => change.entity === "actor")!;
      actorInverse.data = { ...actorInverse.data, data: { ...actor.data, wits: 99 } };
      store.save();
      store.flush();
      const beforeActor = structuredClone(store.state.actors.find((entry) => entry.id === actor.id));
      const beforeProposal = structuredClone(store.state.proposals.find((entry) => entry.id === applied.id));
      const reverted = await app.inject({ method: "POST", url: `/api/v1/proposals/${applied.id}/revert`, headers: headers("revert-incompatible-actor"), payload: { expectedUpdatedAt: beforeProposal!.updatedAt } });
      expect(reverted.statusCode, reverted.body).toBe(409);
      expect(reverted.json()).toMatchObject({ error: "proposal_not_revertible" });
      expect(reverted.body).toMatch(/declarative|schema|declared|range/i);
      expect(store.state.actors.find((entry) => entry.id === actor.id)).toEqual(beforeActor);
      expect(store.state.proposals.find((entry) => entry.id === applied.id)).toEqual(beforeProposal);
      expect(store.persisted.actors.find((entry) => entry.id === actor.id)).toEqual(beforeActor);
      expect(store.persisted.proposals.find((entry) => entry.id === applied.id)).toEqual(beforeProposal);
      expect(store.state.auditLogs.some((entry) => entry.targetId === applied.id && entry.action === "proposal.revert")).toBe(false);
    } finally { await app.close(); }
  });

  it("returns a schema error from the approved-proposal tool without changing its approval and applies the next valid proposal", async () => {
    const provider = new ApprovedProposalSequenceProvider();
    const { app, store } = await baseSetup(provider);
    try {
      const proposals: Proposal[] = [];
      for (const [name, wits] of [["Invalid approved surveyor", 99], ["Valid approved surveyor", 3]] as const) {
        proposals.push(await createApprovedProposal(app, store, name, [{ entity: "actor", action: "create", data: { systemId: "proposal-survey", type: "surveyor", name, ownerUserId: "usr_demo_gm", permissions: {}, data: { wits, stamina: 6 } } }]));
      }
      const invalidBefore = structuredClone(store.state.proposals.find((entry) => entry.id === proposals[0]!.id));
      provider.proposalIds.push(...proposals.map((proposal) => proposal.id));
      const response = await app.inject({
        method: "POST", url: "/api/v1/campaigns/camp_demo/ai/threads", headers: headers("approved-schema-rejection-continue"),
        payload: { approvalMode: "manual", prompt: "Apply the approved survey proposals in order, continuing after an invalid update.", expectedUpdatedAt: campaignRevision(store) },
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().thread).toMatchObject({ status: "completed", provider: provider.id });
      expect(provider.outputs).toHaveLength(2);
      expect(provider.outputs[0]).toMatchObject({ error: "tool_failed", message: expect.stringMatching(/declared|range/i) });
      expect(provider.outputs[1]).toMatchObject({ proposal: { id: proposals[1]!.id, status: "applied" } });
      for (const state of [store.state, store.persisted]) {
        expect(state.proposals.find((entry) => entry.id === proposals[0]!.id)).toEqual(invalidBefore);
        expect(state.actors.find((entry) => entry.name === "Invalid approved surveyor")).toBeUndefined();
        expect(state.actors.find((entry) => entry.name === "Valid approved surveyor")?.data).toEqual({ wits: 3, stamina: 6 });
        expect(state.auditLogs.some((entry) => entry.targetId === proposals[0]!.id && entry.action === "proposal.apply")).toBe(false);
      }
    } finally { await app.close(); }
  });

  it("keeps a schema-invalid automatic proposal pending, records failure, and still automatically applies the following valid proposal", async () => {
    const provider = new ProposalSequenceProvider();
    const { app, store } = await baseSetup(provider);
    const publications: EngineEvent[] = [];
    const broadcast = RealtimeHub.prototype.broadcast;
    const broadcastSpy = vi.spyOn(RealtimeHub.prototype, "broadcast").mockImplementation(function (this: RealtimeHub, event, filter) {
      publications.push(structuredClone(event));
      broadcast.call(this, event, filter);
    });
    try {
      const response = await app.inject({
        method: "POST", url: "/api/v1/campaigns/camp_demo/ai/threads", headers: headers("automatic-schema-rejection-continue"),
        // Exercise the existing explicit automatic mode without changing its authority.
        payload: { approvalMode: "auto", prompt: "Apply the two survey updates in order, continuing after an invalid update.", expectedUpdatedAt: campaignRevision(store) },
      });
      expect.soft(response.statusCode, response.body).toBe(200);
      expect.soft(response.json().thread).toMatchObject({ status: "completed", provider: provider.id });
      const invalid = store.state.proposals.find((entry) => entry.title === "Invalid automatic survey update");
      const valid = store.state.proposals.find((entry) => entry.title === "Valid automatic survey update");
      expect.soft(invalid).toMatchObject({ status: "pending", createdByType: "ai" });
      expect.soft(invalid?.approvedByUserId).toBeUndefined();
      expect.soft((invalid?.history?.some((entry) => entry.action === "approved" || entry.action === "applied") ?? false)).toBe(false);
      expect.soft(valid).toMatchObject({ status: "applied", createdByType: "ai", approvedByUserId: "usr_demo_gm" });
      expect.soft(store.state.actors.find((entry) => entry.name === "Invalid automatic survey update")).toBeUndefined();
      expect.soft(store.state.actors.find((entry) => entry.name === "Valid automatic survey update")?.data).toEqual({ wits: 3, stamina: 6 });
      expect.soft(store.persisted.actors.find((entry) => entry.name === "Valid automatic survey update")?.data).toEqual({ wits: 3, stamina: 6 });
      expect.soft(store.persisted.proposals.find((entry) => entry.id === invalid?.id)?.status).toBe("pending");
      expect.soft(store.persisted.proposals.find((entry) => entry.id === invalid?.id)).toEqual(invalid);
      expect.soft(provider.outputs).toHaveLength(2);
      expect.soft(provider.outputs[0]).not.toHaveProperty("autoApplied");
      expect.soft(provider.outputs[1]).toMatchObject({ autoApplied: true, autoAppliedProposal: { proposalId: valid?.id } });
      expect.soft(store.state.auditLogs).toContainEqual(expect.objectContaining({ action: "ai.proposal.apply.failed", targetId: invalid?.id, after: expect.objectContaining({ reason: "auto_apply_failed", status: "pending" }) }));
      expect.soft(store.state.auditLogs.some((entry) => entry.targetId === invalid?.id && entry.action === "proposal.apply")).toBe(false);
      expect.soft(response.json().events ?? []).toContainEqual({ type: "proposal.applied", proposalId: valid?.id });
      expect.soft(response.json().events ?? []).not.toContainEqual({ type: "proposal.applied", proposalId: invalid?.id });
      expect.soft(publications.filter((event) => event.targetId === invalid?.id && ["proposal.approved", "proposal.applied"].includes(event.type))).toEqual([]);
      const validLifecycle = publications.filter((event) => event.targetId === valid?.id && ["proposal.approved", "proposal.applied"].includes(event.type));
      expect.soft(validLifecycle.map((event) => event.type)).toEqual(["proposal.approved", "proposal.applied"]);
      expect.soft(validLifecycle[0]?.payload).toMatchObject({ status: "approved", approvedByUserId: "usr_demo_gm" });
      expect.soft(validLifecycle[1]?.payload).toMatchObject({ status: "applied", approvedByUserId: "usr_demo_gm" });
    } finally { broadcastSpy.mockRestore(); await app.close(); }
  });

  it("rolls back automatic approval and fails the thread when replacement fails after accepting a valid candidate into live state", async () => {
    const provider = new ProposalSequenceProvider();
    const { app, store } = await baseSetup(provider);
    const replace = store.replace.bind(store);
    let injectedFailure = false;
    const replaceSpy = vi.spyOn(store, "replace").mockImplementation((state, options) => {
      if (!injectedFailure && state.proposals.some((proposal) => proposal.title === "Valid automatic survey update" && proposal.status === "applied")) {
        injectedFailure = true;
        store.state = state;
        throw new Error("Injected proposal replacement failure");
      }
      replace(state, options);
    });
    try {
      const response = await app.inject({
        method: "POST", url: "/api/v1/campaigns/camp_demo/ai/threads", headers: headers("automatic-replacement-failure"),
        payload: { approvalMode: "auto", prompt: "Apply the survey updates in order.", expectedUpdatedAt: campaignRevision(store) },
      });
      expect(injectedFailure).toBe(true);
      expect(response.statusCode, response.body).toBe(502);
      expect(response.json()).toMatchObject({ error: "ai_provider_failed", message: "Injected proposal replacement failure", thread: { status: "failed" } });
      expect(provider.outputs).toHaveLength(1);
      for (const state of [store.state, store.persisted]) {
        const proposal = state.proposals.find((entry) => entry.title === "Valid automatic survey update");
        expect(proposal).toMatchObject({ status: "pending", createdByType: "ai" });
        expect(proposal?.approvedByUserId).toBeUndefined();
        expect(proposal?.history?.some((entry) => entry.action === "approved" || entry.action === "applied") ?? false).toBe(false);
        expect(state.actors.find((entry) => entry.name === "Valid automatic survey update")).toBeUndefined();
        expect(state.auditLogs.some((entry) => entry.targetId === proposal?.id && ["proposal.apply", "ai.proposal.apply.failed"].includes(entry.action))).toBe(false);
        expect(state.aiThreads.find((entry) => entry.id === response.json().thread.id)?.status).toBe("failed");
      }
    } finally { replaceSpy.mockRestore(); await app.close(); }
  });
});
