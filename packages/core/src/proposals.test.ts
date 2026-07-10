import { describe, expect, it } from "vitest";
import { applyProposal, revertProposal } from "./proposals.js";
import { seedState } from "./state.js";
import { createTimestamped } from "./state.js";
import type {
  AiMemoryFact,
  Actor,
  CampaignSession,
  ChatMessage,
  Combat,
  CombatAction,
  DiceRoll,
  EngineState,
  Handout,
  Item,
  JournalEntry,
  MapAsset,
  Proposal,
  Scene,
  SceneAnnotation,
  SceneAnnotationHistoryEntry,
  SceneEditableState,
  Token,
  World,
} from "./types.js";

function approvedProposal(
  campaignId: string,
  changesJson: Proposal["changesJson"],
): Proposal {
  return createTimestamped("prop", {
    campaignId,
    createdByUserId: "usr_demo_gm",
    createdByType: "user" as const,
    title: "Test proposal",
    summary: "Exercise reversible domain semantics.",
    status: "approved" as const,
    changesJson,
    diffJson: {},
    approvalRequired: true,
    approvedByUserId: "usr_demo_gm",
  });
}

function sceneEditableState(
  scene: Scene,
  overrides: Partial<SceneEditableState> = {},
): SceneEditableState {
  return {
    worldId: scene.worldId,
    name: scene.name,
    width: scene.width,
    height: scene.height,
    gridType: scene.gridType,
    gridSize: scene.gridSize,
    backgroundAssetId: scene.backgroundAssetId,
    folder: scene.folder,
    fog: structuredClone(scene.fog),
    walls: structuredClone(scene.walls),
    lights: structuredClone(scene.lights),
    annotations: structuredClone(scene.annotations),
    metadata: structuredClone(scene.metadata),
    ...overrides,
  };
}

function appendCombatAction(
  state: EngineState,
  overrides: Partial<CombatAction> = {},
): Combat {
  const campaignId = state.campaigns[0]!.id;
  const actor = state.actors[0]!;
  const combat: Combat = createTimestamped("cmb", {
    campaignId,
    active: true,
    round: 1,
    turnIndex: 0,
    combatants: [],
    actions: [],
  });
  const action = createTimestamped("cact", {
    actorId: actor.id,
    actorName: actor.name,
    requestedByUserId: "usr_demo_gm",
    status: "confirmed" as const,
    rollId: "test-action",
    actionLabel: "Test action",
    targetActorIds: [],
    applyEffect: false,
    consumeResources: false,
    rolls: [],
    actorUpdates: [],
    itemUpdates: [],
    effects: [],
    ...overrides,
    campaignId,
    combatId: combat.id,
  }) satisfies CombatAction;
  combat.actions = [action];
  state.combats.push(combat);
  return combat;
}

const actorCombatReferenceCases = [
  {
    name: "action actor",
    reference: (actorId: string): Partial<CombatAction> => ({ actorId }),
  },
  {
    name: "action target",
    reference: (actorId: string): Partial<CombatAction> => ({
      targetActorIds: [actorId],
    }),
  },
  {
    name: "action roll target",
    reference: (actorId: string): Partial<CombatAction> => ({
      rolls: [
        {
          label: "Target roll",
          formula: "1",
          terms: [],
          total: 1,
          targetActorId: actorId,
          visibility: "public",
        },
      ],
    }),
  },
  {
    name: "action actor update",
    reference: (actorId: string): Partial<CombatAction> => ({
      actorUpdates: [{ actorId, before: {}, after: {} }],
    }),
  },
  {
    name: "action effect target",
    reference: (actorId: string): Partial<CombatAction> => ({
      effects: [{ type: "damage", targetActorId: actorId, amount: 1 }],
    }),
  },
] satisfies Array<{
  name: string;
  reference: (actorId: string) => Partial<CombatAction>;
}>;

const tokenAnnotationReferenceCases = [
  {
    name: "active annotation",
    link(scene: Scene, tokenId: string): void {
      scene.annotations.push(
        createTimestamped("ann", {
          sceneId: scene.id,
          kind: "template" as const,
          createdByUserId: "usr_demo_gm",
          affectedTokenIds: [tokenId],
          color: "#ef4444",
          points: [{ x: 0, y: 0 }],
        }) satisfies SceneAnnotation,
      );
    },
  },
  {
    name: "annotation history",
    link(scene: Scene, tokenId: string): void {
      const entry = createTimestamped("annh", {
        sceneId: scene.id,
        annotationId: "ann_historical_target",
        action: "create" as const,
        kind: "template" as const,
        affectedTokenIds: [tokenId],
        actorUserId: "usr_demo_gm",
      }) satisfies SceneAnnotationHistoryEntry;
      scene.annotationHistory = [...(scene.annotationHistory ?? []), entry];
    },
  },
  {
    name: "scene edit history annotation",
    link(scene: Scene, tokenId: string): void {
      const annotation = createTimestamped("ann", {
        sceneId: scene.id,
        kind: "template" as const,
        createdByUserId: "usr_demo_gm",
        affectedTokenIds: [tokenId],
        color: "#ef4444",
        points: [{ x: 0, y: 0 }],
      }) satisfies SceneAnnotation;
      scene.sceneEditHistory = [
        {
          id: "scene_edit_historical_token_reference",
          at: "2026-07-10T00:00:00.000Z",
          kind: "update",
          state: sceneEditableState(scene, { annotations: [annotation] }),
        },
      ];
    },
  },
] satisfies Array<{
  name: string;
  link: (scene: Scene, tokenId: string) => void;
}>;

describe("proposal domain semantics", () => {
  it("cascades scene deletion and restores every captured record on revert", () => {
    const state = seedState();
    const scene = state.scenes[0]!;
    const sceneTokens = state.tokens.filter(
      (token) => token.sceneId === scene.id,
    );
    const message = createTimestamped("msg", {
      campaignId: scene.campaignId,
      sceneId: scene.id,
      userId: "usr_demo_gm",
      type: "plain" as const,
      body: "Scene-bound message",
      visibility: "public" as const,
      recipientUserIds: [],
    }) satisfies ChatMessage;
    state.chat.push(message);
    const onlyToken = sceneTokens[0]!;
    const sceneCombat = createTimestamped("cmb", {
      campaignId: scene.campaignId,
      active: true,
      round: 1,
      turnIndex: 0,
      combatants: [
        {
          id: "cmbt_scene_only",
          tokenId: onlyToken.id,
          actorId: onlyToken.actorId,
          name: onlyToken.name,
          initiative: 12,
          defeated: false,
        },
      ],
    }) satisfies Combat;
    const session = createTimestamped("cses", {
      campaignId: scene.campaignId,
      status: "planned" as const,
      title: "Scene-linked session",
      number: 99,
      agenda: "Test the scene",
      notes: "",
      sceneIds: [scene.id],
      encounterIds: [],
      createdBy: "usr_demo_gm",
      updatedBy: "usr_demo_gm",
    }) satisfies CampaignSession;
    state.combats.push(sceneCombat);
    state.campaignSessions.push(session);
    const proposal = approvedProposal(scene.campaignId, [
      { entity: "scene", action: "delete", id: scene.id, data: {} },
    ]);
    state.proposals.push(proposal);

    const applied = applyProposal(state, proposal, "usr_demo_gm");
    const appliedProposal = applied.proposals.find(
      (item) => item.id === proposal.id,
    )!;
    expect(applied.scenes.some((item) => item.id === scene.id)).toBe(false);
    expect(applied.tokens.some((item) => item.sceneId === scene.id)).toBe(
      false,
    );
    expect(applied.chat.some((item) => item.id === message.id)).toBe(false);
    expect(applied.combats.some((item) => item.id === sceneCombat.id)).toBe(
      false,
    );
    expect(
      applied.campaignSessions.find((item) => item.id === session.id)?.sceneIds,
    ).toEqual([]);
    expect(appliedProposal.inverseChangesJson?.[0]).toEqual(
      expect.objectContaining({ entity: "scene", action: "create" }),
    );
    expect(state.scenes.some((item) => item.id === scene.id)).toBe(true);

    const reverted = revertProposal(applied, appliedProposal, "usr_demo_gm");
    expect(
      reverted.proposals.find((item) => item.id === proposal.id)?.status,
    ).toBe("reverted");
    expect(reverted.scenes.some((item) => item.id === scene.id)).toBe(true);
    expect(
      reverted.tokens.filter((item) => item.sceneId === scene.id),
    ).toHaveLength(sceneTokens.length);
    expect(reverted.chat.some((item) => item.id === message.id)).toBe(true);
    expect(
      reverted.combats.find((item) => item.id === sceneCombat.id)?.combatants,
    ).toHaveLength(1);
    expect(
      reverted.campaignSessions.find((item) => item.id === session.id)
        ?.sceneIds,
    ).toEqual([scene.id]);
  });

  it("detaches world records without deleting them and restores associations", () => {
    const state = seedState();
    const campaignId = state.campaigns[0]!.id;
    const world = createTimestamped("world", {
      campaignId,
      name: "The Reach",
      description: "Shared setting",
    }) satisfies World;
    state.worlds.push(world);
    state.scenes[0]!.worldId = world.id;
    state.actors[0]!.worldId = world.id;
    const memory = createTimestamped("memfact", {
      campaignId,
      worldId: world.id,
      text: "The Reach is canonical.",
      visibility: "gm_only" as const,
      sourceIds: [],
      status: "approved" as const,
    }) satisfies AiMemoryFact;
    state.aiMemory.push(memory);
    const proposal = approvedProposal(campaignId, [
      { entity: "world", action: "delete", id: world.id, data: {} },
    ]);
    state.proposals.push(proposal);

    const applied = applyProposal(state, proposal, "usr_demo_gm");
    const appliedProposal = applied.proposals.find(
      (item) => item.id === proposal.id,
    )!;
    expect(applied.worlds).toHaveLength(0);
    expect(applied.scenes[0]!.worldId).toBeUndefined();
    expect(applied.actors[0]!.worldId).toBeUndefined();
    expect(
      applied.aiMemory.find((item) => item.id === memory.id)?.worldId,
    ).toBeUndefined();

    const reverted = revertProposal(applied, appliedProposal, "usr_demo_gm");
    expect(reverted.worlds.find((item) => item.id === world.id)).toBeTruthy();
    expect(reverted.scenes[0]!.worldId).toBe(world.id);
    expect(reverted.actors[0]!.worldId).toBe(world.id);
    expect(
      reverted.aiMemory.find((item) => item.id === memory.id)?.worldId,
    ).toBe(world.id);
  });

  it("detaches actor-owned records and audience links, then restores them on revert", () => {
    const state = seedState();
    const campaignId = state.campaigns[0]!.id;
    const actor = state.actors[0]!;
    const item = createTimestamped("item", {
      campaignId,
      systemId: actor.systemId,
      actorId: actor.id,
      type: "gear",
      name: "Keepsake",
      data: {},
    }) satisfies Item;
    const journal = createTimestamped("jnl", {
      campaignId,
      title: "Private clue",
      body: "For one character",
      visibility: "specific_characters" as const,
      visibleToUserIds: [],
      visibleToActorIds: [actor.id],
      tags: [],
      createdBy: "usr_demo_gm",
      updatedBy: "usr_demo_gm",
    }) satisfies JournalEntry;
    const handout = createTimestamped("hnd", {
      campaignId,
      title: "Character letter",
      body: "A sealed letter",
      visibility: "specific_characters" as const,
      assetIds: [],
      visibleToUserIds: [],
      visibleToActorIds: [actor.id],
      tags: [],
      readByUserIds: [],
      createdBy: "usr_demo_gm",
      updatedBy: "usr_demo_gm",
    }) satisfies Handout;
    state.items.push(item);
    state.journals.push(journal);
    state.handouts.push(handout);
    const proposal = approvedProposal(campaignId, [
      { entity: "actor", action: "delete", id: actor.id, data: {} },
    ]);
    state.proposals.push(proposal);

    const applied = applyProposal(state, proposal, "usr_demo_gm");
    expect(
      applied.items.find((entry) => entry.id === item.id)?.actorId,
    ).toBeUndefined();
    expect(
      applied.journals.find((entry) => entry.id === journal.id)
        ?.visibleToActorIds,
    ).toEqual([]);
    expect(
      applied.handouts.find((entry) => entry.id === handout.id)
        ?.visibleToActorIds,
    ).toEqual([]);

    const reverted = revertProposal(
      applied,
      applied.proposals.find((entry) => entry.id === proposal.id)!,
      "usr_demo_gm",
    );
    expect(reverted.items.find((entry) => entry.id === item.id)?.actorId).toBe(
      actor.id,
    );
    expect(
      reverted.journals.find((entry) => entry.id === journal.id)
        ?.visibleToActorIds,
    ).toEqual([actor.id]);
    expect(
      reverted.handouts.find((entry) => entry.id === handout.id)
        ?.visibleToActorIds,
    ).toEqual([actor.id]);
  });

  it("restores session links when encounter and recap journal deletes are reverted", () => {
    const state = seedState();
    const campaignId = state.campaigns[0]!.id;
    const encounter = createTimestamped("enc", {
      campaignId,
      name: "Linked encounter",
      summary: "A session dependency",
      tokenIds: [],
    });
    const journal = createTimestamped("jnl", {
      campaignId,
      title: "Linked recap",
      body: "Session recap",
      visibility: "gm_only" as const,
      visibleToUserIds: [],
      visibleToActorIds: [],
      tags: ["recap"],
      createdBy: "usr_demo_gm",
      updatedBy: "usr_demo_gm",
    }) satisfies JournalEntry;
    state.encounters.push(encounter);
    state.journals.push(journal);
    const session = createTimestamped("cses", {
      campaignId,
      status: "completed" as const,
      title: "Linked session",
      number: 100,
      agenda: "",
      notes: "",
      sceneIds: [],
      encounterIds: [encounter.id],
      recapJournalId: journal.id,
      createdBy: "usr_demo_gm",
      updatedBy: "usr_demo_gm",
    }) satisfies CampaignSession;
    state.campaignSessions.push(session);
    const proposal = approvedProposal(campaignId, [
      { entity: "encounter", action: "delete", id: encounter.id, data: {} },
      { entity: "journal", action: "delete", id: journal.id, data: {} },
    ]);
    state.proposals.push(proposal);

    const applied = applyProposal(state, proposal, "usr_demo_gm");
    expect(
      applied.campaignSessions.find((entry) => entry.id === session.id),
    ).toMatchObject({ encounterIds: [], recapJournalId: undefined });

    const reverted = revertProposal(
      applied,
      applied.proposals.find((entry) => entry.id === proposal.id)!,
      "usr_demo_gm",
    );
    expect(
      reverted.campaignSessions.find((entry) => entry.id === session.id),
    ).toMatchObject({
      encounterIds: [encounter.id],
      recapJournalId: journal.id,
    });
  });

  it("captures create operations so proposed chat can be cleanly reverted", () => {
    const state = seedState();
    const campaignId = state.campaigns[0]!.id;
    const chat = createTimestamped("msg", {
      campaignId,
      userId: "usr_demo_gm",
      type: "plain" as const,
      body: "Review me first",
      visibility: "public" as const,
      recipientUserIds: [],
    }) satisfies ChatMessage;
    const proposal = approvedProposal(campaignId, [
      { entity: "chat", action: "create", data: { ...chat } },
    ]);
    state.proposals.push(proposal);
    const applied = applyProposal(state, proposal, "usr_demo_gm");
    expect(applied.chat.some((item) => item.id === chat.id)).toBe(true);
    const reverted = revertProposal(
      applied,
      applied.proposals.find((item) => item.id === proposal.id)!,
      "usr_demo_gm",
    );
    expect(reverted.chat.some((item) => item.id === chat.id)).toBe(false);
  });

  it("refuses to cascade-delete records linked after a proposed create was applied", () => {
    const state = seedState();
    const campaignId = state.campaigns[0]!.id;
    const createdScene = createTimestamped("scn", {
      campaignId,
      name: "Proposal-created scene",
      width: 800,
      height: 600,
      gridType: "square" as const,
      gridSize: 50,
      active: false,
      sortOrder: 2,
      fog: [],
      fogHistory: [],
      activationHistory: [],
      annotationHistory: [],
      walls: [],
      lights: [],
      annotations: [],
      metadata: {},
    }) satisfies Scene;
    const proposal = approvedProposal(campaignId, [
      { entity: "scene", action: "create", data: { ...createdScene } },
    ]);
    state.proposals.push(proposal);
    const applied = applyProposal(state, proposal, "usr_demo_gm");
    const laterToken = {
      ...structuredClone(state.tokens[0]!),
      id: "tok_created_after_proposal",
      sceneId: createdScene.id,
    } satisfies Token;
    applied.tokens.push(laterToken);

    const appliedProposal = applied.proposals.find(
      (item) => item.id === proposal.id,
    )!;
    expect(() =>
      revertProposal(applied, appliedProposal, "usr_demo_gm"),
    ).toThrow(
      `Proposal revert conflict: scene:${createdScene.id} has dependent record token:${laterToken.id}`,
    );
    expect(applied.scenes.some((item) => item.id === createdScene.id)).toBe(
      true,
    );
    expect(applied.tokens.some((item) => item.id === laterToken.id)).toBe(true);
    expect(appliedProposal.status).toBe("applied");
  });

  it.each([
    {
      name: "scene background",
      link(state: EngineState, assetId: string): string {
        const scene = state.scenes[0]!;
        scene.backgroundAssetId = assetId;
        return `scene:${scene.id}`;
      },
    },
    {
      name: "scene edit history",
      link(state: EngineState, assetId: string): string {
        const scene = state.scenes[0]!;
        scene.sceneEditHistory = [
          {
            id: "scene_edit_later_asset_reference",
            at: "2026-07-10T00:00:00.000Z",
            kind: "update",
            state: sceneEditableState(scene, { backgroundAssetId: assetId }),
          },
        ];
        return `scene:${scene.id}`;
      },
    },
    {
      name: "token image",
      link(state: EngineState, assetId: string): string {
        const token = state.tokens[0]!;
        token.imageAssetId = assetId;
        return `token:${token.id}`;
      },
    },
    {
      name: "actor image",
      link(state: EngineState, assetId: string): string {
        const actor = state.actors[0]!;
        actor.imageAssetId = assetId;
        return `actor:${actor.id}`;
      },
    },
    {
      name: "handout attachment",
      link(state: EngineState, assetId: string): string {
        const handout = createTimestamped("handout", {
          id: "handout_later_asset_reference",
          campaignId: state.campaigns[0]!.id,
          title: "Later attachment",
          body: "References the proposal-created asset.",
          visibility: "public" as const,
          assetIds: [assetId],
        }) satisfies Handout;
        state.handouts.push(handout);
        return `handout:${handout.id}`;
      },
    },
  ])(
    "refuses to delete a proposal-created asset referenced by $name",
    ({ link }) => {
      const state = seedState();
      const campaignId = state.campaigns[0]!.id;
      const asset = createTimestamped("asset", {
        id: "asset_created_by_proposal",
        campaignId,
        name: "Proposal-created asset",
        url: "/assets/proposal-created.png",
        mimeType: "image/png",
        sizeBytes: 1024,
      }) satisfies MapAsset;
      const proposal = approvedProposal(campaignId, [
        { entity: "asset", action: "create", data: { ...asset } },
      ]);
      state.proposals.push(proposal);
      const applied = applyProposal(state, proposal, "usr_demo_gm");
      const dependencyKey = link(applied, asset.id);
      const appliedProposal = applied.proposals.find(
        (item) => item.id === proposal.id,
      )!;

      expect(() =>
        revertProposal(applied, appliedProposal, "usr_demo_gm"),
      ).toThrow(
        `Proposal revert conflict: asset:${asset.id} has dependent record ${dependencyKey} created or linked after the proposal was applied`,
      );
      expect(applied.assets.some((item) => item.id === asset.id)).toBe(true);
      expect(appliedProposal.status).toBe("applied");
    },
  );

  it.each(actorCombatReferenceCases)(
    "refuses to delete a proposal-created actor referenced by $name",
    ({ reference }) => {
      const state = seedState();
      const campaignId = state.campaigns[0]!.id;
      const actor = {
        ...structuredClone(state.actors[0]!),
        id: "actor_created_by_proposal",
        name: "Proposal-created actor",
      } satisfies Actor;
      const proposal = approvedProposal(campaignId, [
        { entity: "actor", action: "create", data: { ...actor } },
      ]);
      state.proposals.push(proposal);
      const applied = applyProposal(state, proposal, "usr_demo_gm");
      const combat = appendCombatAction(applied, reference(actor.id));
      const appliedProposal = applied.proposals.find(
        (item) => item.id === proposal.id,
      )!;

      expect(() =>
        revertProposal(applied, appliedProposal, "usr_demo_gm"),
      ).toThrow(
        `Proposal revert conflict: actor:${actor.id} has dependent record combat:${combat.id} created or linked after the proposal was applied`,
      );
      expect(applied.actors.some((item) => item.id === actor.id)).toBe(true);
      expect(appliedProposal.status).toBe("applied");
    },
  );

  it("refuses to delete a proposal-created item referenced by combat action history", () => {
    const state = seedState();
    const campaignId = state.campaigns[0]!.id;
    const item = createTimestamped("item", {
      id: "item_created_by_proposal",
      campaignId,
      systemId: "generic-fantasy",
      type: "gear",
      name: "Proposal-created item",
      data: {},
    }) satisfies Item;
    const proposal = approvedProposal(campaignId, [
      { entity: "item", action: "create", data: { ...item } },
    ]);
    state.proposals.push(proposal);
    const applied = applyProposal(state, proposal, "usr_demo_gm");
    const combat = appendCombatAction(applied, {
      itemUpdates: [{ itemId: item.id, before: {}, after: {} }],
    });
    const appliedProposal = applied.proposals.find(
      (entry) => entry.id === proposal.id,
    )!;

    expect(() =>
      revertProposal(applied, appliedProposal, "usr_demo_gm"),
    ).toThrow(
      `Proposal revert conflict: item:${item.id} has dependent record combat:${combat.id} created or linked after the proposal was applied`,
    );
  });

  it("refuses to delete a proposal-created chat message with a later reply", () => {
    const state = seedState();
    const campaignId = state.campaigns[0]!.id;
    const message = createTimestamped("msg", {
      id: "chat_created_by_proposal",
      campaignId,
      userId: "usr_demo_gm",
      type: "plain" as const,
      body: "Proposal-created message",
      visibility: "public" as const,
      recipientUserIds: [],
    }) satisfies ChatMessage;
    const proposal = approvedProposal(campaignId, [
      { entity: "chat", action: "create", data: { ...message } },
    ]);
    state.proposals.push(proposal);
    const applied = applyProposal(state, proposal, "usr_demo_gm");
    const reply = createTimestamped("msg", {
      id: "chat_later_reply",
      campaignId,
      userId: "usr_demo_player",
      type: "plain" as const,
      body: "Later reply",
      visibility: "public" as const,
      recipientUserIds: [],
      replyToMessageId: message.id,
    }) satisfies ChatMessage;
    applied.chat.push(reply);
    const appliedProposal = applied.proposals.find(
      (entry) => entry.id === proposal.id,
    )!;

    expect(() =>
      revertProposal(applied, appliedProposal, "usr_demo_gm"),
    ).toThrow(
      `Proposal revert conflict: chat:${message.id} has dependent record chat:${reply.id} created or linked after the proposal was applied`,
    );
  });

  it("refuses to delete a proposal-created roll linked from later chat", () => {
    const state = seedState();
    const campaignId = state.campaigns[0]!.id;
    const roll = createTimestamped("roll", {
      id: "roll_created_by_proposal",
      campaignId,
      userId: "usr_demo_gm",
      formula: "1d20",
      visibility: "public" as const,
      terms: [],
      total: 12,
    }) satisfies DiceRoll;
    const proposal = approvedProposal(campaignId, [
      { entity: "roll", action: "create", data: { ...roll } },
    ]);
    state.proposals.push(proposal);
    const applied = applyProposal(state, proposal, "usr_demo_gm");
    const message = createTimestamped("msg", {
      id: "chat_later_roll_reference",
      campaignId,
      userId: "usr_demo_gm",
      type: "roll" as const,
      body: "Later roll card",
      visibility: "public" as const,
      recipientUserIds: [],
      rollId: roll.id,
    }) satisfies ChatMessage;
    applied.chat.push(message);
    const appliedProposal = applied.proposals.find(
      (entry) => entry.id === proposal.id,
    )!;

    expect(() =>
      revertProposal(applied, appliedProposal, "usr_demo_gm"),
    ).toThrow(
      `Proposal revert conflict: roll:${roll.id} has dependent record chat:${message.id} created or linked after the proposal was applied`,
    );
  });

  it.each(tokenAnnotationReferenceCases)(
    "refuses to delete a proposal-created token referenced by $name",
    ({ link }) => {
      const state = seedState();
      const campaignId = state.campaigns[0]!.id;
      const token = {
        ...structuredClone(state.tokens[0]!),
        id: "token_created_by_proposal",
        name: "Proposal-created token",
      } satisfies Token;
      const proposal = approvedProposal(campaignId, [
        { entity: "token", action: "create", data: { ...token } },
      ]);
      state.proposals.push(proposal);
      const applied = applyProposal(state, proposal, "usr_demo_gm");
      const scene = applied.scenes.find((entry) => entry.id === token.sceneId)!;
      link(scene, token.id);
      const appliedProposal = applied.proposals.find(
        (entry) => entry.id === proposal.id,
      )!;

      expect(() =>
        revertProposal(applied, appliedProposal, "usr_demo_gm"),
      ).toThrow(
        `Proposal revert conflict: token:${token.id} has dependent record scene:${scene.id} created or linked after the proposal was applied`,
      );
    },
  );

  it("refuses to delete a proposal-created world retained in scene edit history", () => {
    const state = seedState();
    const campaignId = state.campaigns[0]!.id;
    const world = createTimestamped("world", {
      id: "world_created_by_proposal",
      campaignId,
      name: "Proposal-created world",
      description: "Referenced by a later scene edit snapshot.",
    }) satisfies World;
    const proposal = approvedProposal(campaignId, [
      { entity: "world", action: "create", data: { ...world } },
    ]);
    state.proposals.push(proposal);
    const applied = applyProposal(state, proposal, "usr_demo_gm");
    const scene = applied.scenes[0]!;
    scene.sceneEditHistory = [
      {
        id: "scene_edit_later_world_reference",
        at: "2026-07-10T00:00:00.000Z",
        kind: "update",
        state: sceneEditableState(scene, { worldId: world.id }),
      },
    ];
    const appliedProposal = applied.proposals.find(
      (entry) => entry.id === proposal.id,
    )!;

    expect(() =>
      revertProposal(applied, appliedProposal, "usr_demo_gm"),
    ).toThrow(
      `Proposal revert conflict: world:${world.id} has dependent record scene:${scene.id} created or linked after the proposal was applied`,
    );
  });

  it.each([
    {
      name: "previous active scene history",
      reference: (sceneId: string) => ({
        previousActiveSceneId: sceneId,
        deactivatedSceneIds: [],
      }),
    },
    {
      name: "deactivated scene history",
      reference: (sceneId: string) => ({
        deactivatedSceneIds: [sceneId],
      }),
    },
  ])(
    "refuses to delete a proposal-created scene retained in $name",
    ({ reference }) => {
      const state = seedState();
      const campaignId = state.campaigns[0]!.id;
      const createdScene = createTimestamped("scn", {
        id: "scene_created_by_proposal",
        campaignId,
        name: "Proposal-created scene",
        width: 800,
        height: 600,
        gridType: "square" as const,
        gridSize: 50,
        active: false,
        sortOrder: 2,
        fog: [],
        fogHistory: [],
        activationHistory: [],
        annotationHistory: [],
        walls: [],
        lights: [],
        annotations: [],
        metadata: {},
      }) satisfies Scene;
      const proposal = approvedProposal(campaignId, [
        { entity: "scene", action: "create", data: { ...createdScene } },
      ]);
      state.proposals.push(proposal);
      const applied = applyProposal(state, proposal, "usr_demo_gm");
      const existingScene = applied.scenes.find(
        (entry) => entry.id !== createdScene.id,
      )!;
      existingScene.activationHistory = [
        ...(existingScene.activationHistory ?? []),
        {
          id: "scene_activation_later_reference",
          sceneId: existingScene.id,
          activatedAt: "2026-07-10T00:00:00.000Z",
          activatedByUserId: "usr_demo_gm",
          source: "activate",
          ...reference(createdScene.id),
        },
      ];
      const appliedProposal = applied.proposals.find(
        (entry) => entry.id === proposal.id,
      )!;

      expect(() =>
        revertProposal(applied, appliedProposal, "usr_demo_gm"),
      ).toThrow(
        `Proposal revert conflict: scene:${createdScene.id} has dependent record scene:${existingScene.id} created or linked after the proposal was applied`,
      );
    },
  );

  it("rejects immutable campaign fields even when an approved proposal bypasses API preparation", () => {
    for (const [field, value] of [
      ["ownerUserId", "usr_attacker"],
      ["organizationId", "org_other"],
    ] as const) {
      const state = seedState();
      const campaign = state.campaigns[0]!;
      const proposal = approvedProposal(campaign.id, [
        {
          entity: "campaign",
          action: "update",
          id: campaign.id,
          data: { [field]: value },
        },
      ]);
      state.proposals.push(proposal);

      expect(() => applyProposal(state, proposal, "usr_demo_gm")).toThrow(
        `Campaign field is not editable through proposals: ${field}`,
      );
      expect(state.campaigns[0]).toMatchObject({
        ownerUserId: "usr_demo_gm",
        organizationId: "org_demo",
      });
    }
  });

  it("fails closed when raw create changes point outside the proposal campaign", () => {
    const state = seedState();
    const campaignId = state.campaigns[0]!.id;
    const foreignScene = {
      ...structuredClone(state.scenes[0]!),
      id: "scn_foreign",
      campaignId: "camp_foreign",
    };
    state.scenes.push(foreignScene);

    const wrongCampaignProposal = approvedProposal(campaignId, [
      {
        entity: "journal",
        action: "create",
        data: {
          id: "jnl_wrong_campaign",
          campaignId: "camp_foreign",
          title: "Foreign journal",
          body: "Must not be created",
          visibility: "gm_only",
          visibleToUserIds: [],
          visibleToActorIds: [],
          tags: [],
          createdBy: "usr_demo_gm",
          updatedBy: "usr_demo_gm",
          createdAt: "2026-07-09T00:00:00.000Z",
          updatedAt: "2026-07-09T00:00:00.000Z",
        },
      },
    ]);
    state.proposals.push(wrongCampaignProposal);
    expect(() =>
      applyProposal(state, wrongCampaignProposal, "usr_demo_gm"),
    ).toThrow("Proposal change targets entity outside proposal campaign");

    const foreignSceneTokenProposal = approvedProposal(campaignId, [
      {
        entity: "token",
        action: "create",
        data: {
          id: "tok_wrong_scene",
          sceneId: foreignScene.id,
          name: "Foreign token",
          createdAt: "2026-07-09T00:00:00.000Z",
          updatedAt: "2026-07-09T00:00:00.000Z",
        },
      },
    ]);
    state.proposals.push(foreignSceneTokenProposal);
    expect(() =>
      applyProposal(state, foreignSceneTokenProposal, "usr_demo_gm"),
    ).toThrow("Proposal change targets entity outside proposal campaign");
    expect(
      state.journals.some((item) => item.id === "jnl_wrong_campaign"),
    ).toBe(false);
    expect(state.tokens.some((item) => item.id === "tok_wrong_scene")).toBe(
      false,
    );
  });

  it("rejects reverts after an affected record has changed", () => {
    const state = seedState();
    const actor = state.actors[0]!;
    const originalName = actor.name;
    const proposal = approvedProposal(actor.campaignId, [
      {
        entity: "actor",
        action: "update",
        id: actor.id,
        data: { name: "Proposal name" },
      },
    ]);
    state.proposals.push(proposal);

    const applied = applyProposal(state, proposal, "usr_demo_gm");
    const appliedProposal = applied.proposals.find(
      (item) => item.id === proposal.id,
    )!;
    const editedActor = applied.actors.find((item) => item.id === actor.id)!;
    editedActor.name = "Intervening manual edit";
    editedActor.updatedAt = "2026-07-09T01:00:00.000Z";

    expect(() =>
      revertProposal(applied, appliedProposal, "usr_demo_gm"),
    ).toThrow(
      `Proposal revert conflict: actor:${actor.id} changed after the proposal was applied`,
    );
    expect(editedActor.name).toBe("Intervening manual edit");
    expect(editedActor.name).not.toBe(originalName);
    expect(appliedProposal.status).toBe("applied");
  });
});
