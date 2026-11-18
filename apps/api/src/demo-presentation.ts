import { readFile } from "node:fs/promises";
import { createId, createTimestamped, normalizeHandout, nowIso, type Actor, type Campaign, type Encounter, type Handout, type Item, type MapAsset, type Scene, type Token, type Wall } from "@open-tabletop/core";
import { dnd5eSrdCharacterTemplate, dnd5eSrdMonsterActorData, type CharacterTemplate } from "@open-tabletop/system-sdk";
import type { StateStore } from "./store.js";

type IngestDemoAsset = (campaignId: string, name: string, bytes: Buffer) => Promise<MapAsset>;


const width = 2800;
const height = 2100;
const gridSize = 100;
const adversaries = [
  { id: "sentry", threatId: "animated-armor", name: "Cinder Sentry", x: 1300, y: 950 },
  { id: "scout", threatId: "goblin-warrior", name: "Ember Scout", x: 1980, y: 1040 },
  { id: "elemental", threatId: "magma-mephit", name: "Ash Elemental", x: 1440, y: 265 }
] as const;

const wallSegments: ReadonlyArray<readonly [string, number, number, number, number, "wall" | "door"]> = [
  ["north", 135, 105, 2660, 105, "wall"],
  ["east", 2660, 105, 2660, 1980, "wall"],
  ["south", 2660, 1980, 135, 1980, "wall"],
  ["west", 135, 1980, 135, 105, "wall"],
  ["upper-west", 135, 472, 646, 472, "wall"],
  ["upper-midwest", 810, 472, 1350, 472, "wall"],
  ["upper-door", 1350, 472, 1540, 472, "door"],
  ["upper-mideast", 1540, 472, 2260, 472, "wall"],
  ["upper-east", 2420, 472, 2660, 472, "wall"],
  ["lower-west", 135, 1450, 648, 1450, "wall"],
  ["lower-midwest", 810, 1450, 1376, 1450, "wall"],
  ["lower-door", 1376, 1450, 1518, 1450, "door"],
  ["lower-mideast", 1518, 1450, 2260, 1450, "wall"],
  ["lower-east", 2420, 1450, 2660, 1450, "wall"]
];

export async function seedDemoPresentation(store: StateStore, ingest: IngestDemoAsset): Promise<void> {
  const campaignId = "camp_demo";
  const sceneId = "scn_vault_entry";
  const { state } = store;
  const campaign = state.campaigns.find((candidate) => candidate.id === campaignId);
  const scene = state.scenes.find((candidate) => candidate.id === sceneId && candidate.campaignId === campaignId);
  const sceneTokens = state.tokens.filter((token) => token.sceneId === sceneId);
  const [valenToken] = sceneTokens;
  const mira = state.actors.find((actor) => actor.id === "act_generic_demo" && actor.campaignId === campaignId);
  if (!campaign || !scene || !mira || scene.name !== "Vault Entry" || scene.backgroundAssetId || scene.metadata.demoPresentationVersion) return;
  if (scene.updatedAt !== scene.createdAt || sceneTokens.length !== 1 || valenToken?.id !== "tok_valen" || valenToken.updatedAt !== valenToken.createdAt) return;

  await populateVault(store, campaign, scene, valenToken, mira, ingest, (prefix, slug) => `${prefix}_${slug}`);
  scene.metadata.demoPresentationVersion = 1;
  store.save();
}

/** Construct a new adventure in a private staging store before publishing the campaign. */
export async function buildEmberVaultStarter(
  store: StateStore, campaign: Campaign, ingest: IngestDemoAsset,
  createItems: (campaignId: string, actor: Actor, template: CharacterTemplate) => Item[],
) {
  const campaignId = campaign.id;
  const scene: Scene = createTimestamped("scn", {
    campaignId, name: "Vault Entry", width, height, gridType: "square", gridSize, active: true, sortOrder: 1,
    walls: [], lights: [], fog: [], fogHistory: [], annotations: [], metadata: { starterAdventure: "ember-vault" },
  });
  store.state.scenes.push(scene);
  function hero(name: string, templateId: string): Actor {
    const template = dnd5eSrdCharacterTemplate(templateId);
    if (!template) throw new Error(`Missing starter character template: ${templateId}`);
    const actor = createTimestamped("act", { campaignId, type: "character" as const, systemId: template.systemId,
      name, data: structuredClone(template.data), permissions: {}, characterClaimOffered: true });
    store.state.actors.push(actor);
    store.state.items.push(...createItems(campaignId, actor, template));
    return actor;
  }
  const valen = hero("Valen Ash", "fighter");
  const mira = hero("Mira Vale", "rogue");
  const valenToken: Token = createTimestamped("tok", {
    sceneId: scene.id, actorId: valen.id, name: valen.name, layer: "player", disposition: "friendly",
    x: 1260, y: 1730, width: gridSize, height: gridSize, rotation: 0, hidden: false, locked: false,
    visionEnabled: true, visionRadius: 350, metadata: {},
  });
  store.state.tokens.push(valenToken);
  const { encounter, miraToken } = await populateVault(store, campaign, scene, valenToken, mira, ingest, createId);
  valen.imageAssetId = valenToken.imageAssetId;
  mira.imageAssetId = miraToken.imageAssetId;
  encounter.partyActorIds = [valen.id, mira.id];
  encounter.tokenIds.unshift(valenToken.id, miraToken.id);
  encounter.systemId = campaign.defaultSystemId;
  encounter.threats = adversaries.map((monster) => ({ id: monster.threatId, count: 1 }));
  const handout = normalizeHandout(createTimestamped("hnd", {
    campaignId, title: "The Ember Key", visibility: "public", tags: ["adventure"], assetIds: [],
    body: "At dawn the mountain vents will open. Bring the ember key from the inner vault to the village before the warning bell falls silent. You enter from the south. A sentinel watches the crossing, and a blue ward marks the key chamber to the northeast.",
    createdBy: campaign.ownerUserId, updatedBy: campaign.ownerUserId,
  }) satisfies Handout);
  store.state.handouts.push(handout);
  return scene;
}

async function populateVault(store: StateStore, campaign: Campaign, scene: Scene, valenToken: Token, mira: Actor, ingest: IngestDemoAsset, recordId: (prefix: string, slug: string) => string) {
  const { state } = store;
  const campaignId = campaign.id;
  const sceneId = scene.id;
  async function load(name: string, title: string): Promise<MapAsset> {
    return ingest(campaignId, title, await readFile(new URL(`../demo-art/${name}.webp`, import.meta.url)));
  }

  const background = await load("ember-vault", "Ember Vault.webp");
  const valenPortrait = await load("valen", "Valen Ash.webp");
  const miraPortrait = await load("mira", "Mira Vale.webp");
  const monsters = [];
  for (const monster of adversaries) {
    const data = dnd5eSrdMonsterActorData(monster.threatId);
    if (!data) throw new Error(`Missing bundled demo monster: ${monster.threatId}`);
    monsters.push({ ...monster, data, art: await load(monster.id, `${monster.name}.webp`) });
  }

  const timestamp = nowIso();
  const timestamps = { createdAt: timestamp, updatedAt: timestamp };
  const walls = wallSegments.map(([id, x1, y1, x2, y2, kind]): Wall => ({
    id: recordId("wall", `ember_vault_${id}`), x1, y1, x2, y2, kind, blocksVision: true, blocksMovement: true,
    ...(kind === "door" ? { open: false } : {})
  }));
  Object.assign(scene, {
    backgroundAssetId: background.id,
    width,
    height,
    gridSize,
    gridOrigin: { x: 0, y: 0 },
    metadata: { ...scene.metadata, gridOverlayVisible: true, mapCalibrationComplete: true, mapCalibrationCompletedAt: timestamp },
    walls,
    fog: [{
      id: recordId("fog", "ember_vault_entry"), x: 1400, y: 1610, radius: 0, shape: "polygon", hidden: false, mode: "reveal",
      points: [{ x: 0, y: 1120 }, { x: width, y: 1120 }, { x: width, y: height }, { x: 0, y: height }]
    }],
    lights: [
      { id: recordId("light", "brazier"), x: 398, y: 1730, radius: 400, color: "#f59e0b", intensity: 0.34 },
      { id: recordId("light", "ember_vault_coals"), x: 1435, y: 964, radius: 410, color: "#ffb56c", intensity: 0.32 },
      { id: recordId("light", "ember_vault_ward"), x: 2380, y: 270, radius: 385, color: "#73dfd4", intensity: 0.31 }
    ],
    updatedAt: timestamp
  });

  const tokenDefaults = { sceneId, width: gridSize, height: gridSize, rotation: 0, layer: "player", hidden: false, locked: false, metadata: {} } as const;
  Object.assign(valenToken, { x: 1260, y: 1730, width: gridSize, height: gridSize, visionRadius: 350, imageAssetId: valenPortrait.id, updatedAt: timestamp });
  const miraToken: Token = {
    ...tokenDefaults, ...timestamps, id: recordId("tok", "ember_vault_mira"), actorId: mira.id, name: mira.name, x: 1510, y: 1730,
    visionEnabled: true, visionRadius: 350, disposition: "friendly", imageAssetId: miraPortrait.id
  };
  state.tokens.push(miraToken);
  const hostileTokens: Token[] = [];
  for (const monster of monsters) {
    const actor: Actor = {
      ...timestamps, id: recordId("act", `ember_vault_${monster.id}`), name: monster.name, campaignId,
      type: "monster", systemId: campaign.defaultSystemId, imageAssetId: monster.art.id,
      data: structuredClone(monster.data), permissions: {}
    };
    const token: Token = {
      ...tokenDefaults, ...timestamps, id: recordId("tok", `ember_vault_${monster.id}`), actorId: actor.id, name: monster.name,
      x: monster.x, y: monster.y, visionEnabled: false, visionRadius: 0, disposition: "hostile", imageAssetId: monster.art.id
    };
    state.actors.push(actor);
    state.tokens.push(token);
    hostileTokens.push(token);
  }
  const encounter: Encounter = {
    ...timestamps, id: recordId("enc", "ember_vault_watch"), campaignId, name: "The Vault Watch",
    summary: "A sentry and scout watch the crossing while an ash elemental guards the inner vault.",
    tokenIds: hostileTokens.map((token) => token.id)
  };
  state.encounters.push(encounter);
  return { encounter, miraToken };
}
