import { readFile } from "node:fs/promises";
import { nowIso, type Actor, type Encounter, type MapAsset, type Token, type Wall } from "@open-tabletop/core";
import type { StateStore } from "./store.js";

type IngestDemoAsset = (campaignId: string, name: string, bytes: Buffer) => Promise<MapAsset>;

const campaignId = "camp_demo";
const sceneId = "scn_vault_entry";
const width = 2800;
const height = 2100;
const gridSize = 100;
const adversaries = [
  { id: "sentry", name: "Cinder Sentry", x: 1300, y: 950, hp: 22 },
  { id: "scout", name: "Ember Scout", x: 1980, y: 1040, hp: 13 },
  { id: "elemental", name: "Ash Elemental", x: 1440, y: 265, hp: 30 }
] as const;

const wallSegments: ReadonlyArray<readonly [string, number, number, number, number, "wall" | "door"]> = [
  ["north", 135, 105, 2660, 105, "wall"],
  ["east", 2660, 105, 2660, 1980, "wall"],
  ["south", 2660, 1980, 135, 1980, "wall"],
  ["west", 135, 1980, 135, 105, "wall"],
  ["upper-west", 135, 472, 1376, 472, "wall"],
  ["upper-door", 1376, 472, 1518, 472, "door"],
  ["upper-east", 1518, 472, 2660, 472, "wall"],
  ["lower-west", 135, 1450, 648, 1450, "wall"],
  ["lower-midwest", 810, 1450, 1376, 1450, "wall"],
  ["lower-door", 1376, 1450, 1518, 1450, "door"],
  ["lower-mideast", 1518, 1450, 2260, 1450, "wall"],
  ["lower-east", 2420, 1450, 2660, 1450, "wall"]
];

export async function seedDemoPresentation(store: StateStore, ingest: IngestDemoAsset): Promise<void> {
  const { state } = store;
  const campaign = state.campaigns.find((candidate) => candidate.id === campaignId);
  const scene = state.scenes.find((candidate) => candidate.id === sceneId && candidate.campaignId === campaignId);
  const sceneTokens = state.tokens.filter((token) => token.sceneId === sceneId);
  const [valenToken] = sceneTokens;
  const mira = state.actors.find((actor) => actor.id === "act_generic_demo" && actor.campaignId === campaignId);
  if (!campaign || !scene || !mira || scene.name !== "Vault Entry" || scene.backgroundAssetId || scene.metadata.demoPresentationVersion) return;
  if (scene.updatedAt !== scene.createdAt || sceneTokens.length !== 1 || valenToken?.id !== "tok_valen" || valenToken.updatedAt !== valenToken.createdAt) return;

  async function load(name: string, title: string): Promise<MapAsset> {
    return ingest(campaignId, title, await readFile(new URL(`../demo-art/${name}.webp`, import.meta.url)));
  }

  const background = await load("ember-vault", "Ember Vault.webp");
  const valenPortrait = await load("valen", "Valen Ash.webp");
  const miraPortrait = await load("mira", "Mira Vale.webp");
  const monsters = [];
  for (const monster of adversaries) monsters.push({ ...monster, art: await load(monster.id, `${monster.name}.webp`) });

  const timestamp = nowIso();
  const timestamps = { createdAt: timestamp, updatedAt: timestamp };
  const walls = wallSegments.map(([id, x1, y1, x2, y2, kind]): Wall => ({
    id: `wall_ember_vault_${id}`, x1, y1, x2, y2, kind, blocksVision: true, blocksMovement: true,
    ...(kind === "door" ? { open: false } : {})
  }));
  Object.assign(scene, {
    backgroundAssetId: background.id,
    width,
    height,
    gridSize,
    gridOrigin: { x: 0, y: 0 },
    metadata: { ...scene.metadata, gridOverlayVisible: true, mapCalibrationComplete: true, mapCalibrationCompletedAt: timestamp, demoPresentationVersion: 1 },
    walls,
    fog: [{
      id: "fog_ember_vault_entry", x: 1400, y: 1610, radius: 0, shape: "polygon", hidden: false, mode: "reveal",
      points: [{ x: 0, y: 1120 }, { x: width, y: 1120 }, { x: width, y: height }, { x: 0, y: height }]
    }],
    lights: [
      { id: "light_brazier", x: 398, y: 1730, radius: 400, color: "#f59e0b", intensity: 0.34 },
      { id: "light_ember_vault_coals", x: 1435, y: 964, radius: 410, color: "#ffb56c", intensity: 0.32 },
      { id: "light_ember_vault_ward", x: 2380, y: 270, radius: 385, color: "#73dfd4", intensity: 0.31 }
    ],
    updatedAt: timestamp
  });

  const tokenDefaults = { sceneId, width: gridSize, height: gridSize, rotation: 0, layer: "player", hidden: false, locked: false, metadata: {} } as const;
  Object.assign(valenToken, { x: 1260, y: 1730, width: gridSize, height: gridSize, visionRadius: 350, imageAssetId: valenPortrait.id, updatedAt: timestamp });
  const miraToken: Token = {
    ...tokenDefaults, ...timestamps, id: "tok_ember_vault_mira", actorId: mira.id, name: mira.name, x: 1510, y: 1730,
    visionEnabled: true, visionRadius: 350, disposition: "friendly", imageAssetId: miraPortrait.id
  };
  state.tokens.push(miraToken);
  for (const monster of monsters) {
    const actor: Actor = {
      ...timestamps, id: `act_ember_vault_${monster.id}`, name: monster.name, campaignId,
      type: "monster", systemId: campaign.defaultSystemId, imageAssetId: monster.art.id,
      data: { hp: { current: monster.hp, max: monster.hp } }, permissions: {}
    };
    const token: Token = {
      ...tokenDefaults, ...timestamps, id: `tok_ember_vault_${monster.id}`, actorId: actor.id, name: monster.name,
      x: monster.x, y: monster.y, visionEnabled: false, visionRadius: 0, disposition: "hostile", imageAssetId: monster.art.id
    };
    state.actors.push(actor);
    state.tokens.push(token);
  }
  const encounter: Encounter = {
    ...timestamps, id: "enc_ember_vault_watch", campaignId, name: "The Vault Watch",
    summary: "A sentry and scout watch the crossing while an ash elemental guards the inner vault.",
    tokenIds: monsters.map((monster) => `tok_ember_vault_${monster.id}`)
  };
  state.encounters.push(encounter);
  store.save();
}
