import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Locator, Page, Response } from "@playwright/test";
import { expect, test } from "@playwright/test";

const apiPort = Number(process.env.OTTE_E2E_API_PORT ?? 4220);
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const campaignId = "camp_demo";
const systemId = "dnd-5e-srd";
const artifactRoot = resolve(process.cwd(), "artifacts", "e2e", "full-level-three-combat");

type JsonObject = Record<string, any>;

interface ActorRecord {
  id: string;
  name: string;
  type: string;
  systemId: string;
  ownerUserId?: string;
  updatedAt: string;
  data: JsonObject;
}

interface QuickRoll {
  id: string;
  label: string;
  formula: string;
  metadata?: JsonObject;
}

interface ActorSheet {
  data: JsonObject;
  quickRolls: QuickRoll[];
  inventory?: JsonObject[];
  spells?: JsonObject[];
}

interface CombatantRecord {
  id: string;
  tokenId: string;
  actorId?: string;
  name: string;
  initiative: number;
  defeated: boolean;
}

interface CombatRecord {
  id: string;
  campaignId: string;
  active: boolean;
  round: number;
  turnIndex: number;
  updatedAt: string;
  combatants: CombatantRecord[];
}

interface SnapshotRecord {
  actors: ActorRecord[];
  items: Array<JsonObject & { actorId?: string }>;
  tokens: Array<JsonObject & { id: string; actorId?: string; sceneId: string; name: string }>;
  scenes: Array<JsonObject & { id: string; name: string; active: boolean; backgroundAssetId?: string }>;
  assets: Array<JsonObject & { id: string; name: string }>;
  combats: CombatRecord[];
}

interface ApiResult<T> {
  status: number;
  body: T;
}

interface CharacterDefinition {
  templateId: "fighter" | "cleric" | "wizard" | "rogue";
  className: "Fighter" | "Cleric" | "Wizard" | "Rogue";
  subclassId: "champion" | "life-domain" | "evoker" | "thief";
  subclassName: "Champion" | "Life Domain" | "Evoker" | "Thief";
  name: string;
  creation: JsonObject;
  expected: {
    background: string;
    species: string;
    abilities: Record<string, number>;
    origin: JsonObject;
    skillProficiencies: string[];
    toolProficiencies: string[];
    languages: string[];
    feats: string[];
    inventoryIds: string[];
    weaponMasteryIds: string[];
    levelOneChoices: JsonObject;
    spellIds: string[];
    cantrips: string[];
    preparedSpells: string[];
    spellbookSpells: string[];
  };
}

const characters: CharacterDefinition[] = [
  {
    templateId: "fighter",
    className: "Fighter",
    subclassId: "champion",
    subclassName: "Champion",
    name: "Aric Emberguard",
    creation: {
      creationMode: "level-one-srd",
      backgroundId: "soldier",
      speciesId: "goliath",
      abilityScoreIncreases: { strength: 2, constitution: 1 },
      classSkillProficiencies: ["perception", "survival"],
      originLanguageChoices: ["dwarvish", "orc"],
      classLanguageChoices: [],
      giantAncestry: "fire",
      classEquipmentPackageId: "equipment-a",
      backgroundEquipmentPackageId: "equipment-a",
      backgroundToolProficiencyChoice: "dice-set",
      weaponMasteryChoices: ["greatsword", "flail", "javelin"],
      fightingStyle: "great-weapon-fighting",
    },
    expected: {
      background: "Soldier",
      species: "Goliath",
      abilities: { strength: 18, dexterity: 12, constitution: 15, intelligence: 10, wisdom: 10, charisma: 12 },
      origin: { backgroundId: "soldier", speciesId: "goliath", giantAncestry: "fire", giantAncestryBenefit: "Fire's Burn" },
      skillProficiencies: ["athletics", "intimidation", "perception", "survival"],
      toolProficiencies: ["dice-set"],
      languages: ["common", "dwarvish", "orc"],
      feats: ["Savage Attacker"],
      inventoryIds: ["chain-mail", "greatsword", "flail", "javelin", "dungeoneers-pack", "spear", "shortbow", "arrows", "healers-kit", "quiver", "travelers-clothes", "dice-set"],
      weaponMasteryIds: ["greatsword", "flail", "javelin"],
      levelOneChoices: { fightingStyle: { id: "great-weapon-fighting", selectedAtLevel: 1 } },
      spellIds: [],
      cantrips: [],
      preparedSpells: [],
      spellbookSpells: [],
    },
  },
  {
    templateId: "cleric",
    className: "Cleric",
    subclassId: "life-domain",
    subclassName: "Life Domain",
    name: "Sister Maelin",
    creation: {
      creationMode: "level-one-srd",
      backgroundId: "acolyte",
      speciesId: "dwarf",
      abilityScoreIncreases: { wisdom: 2, intelligence: 1 },
      classSkillProficiencies: ["medicine", "persuasion"],
      originLanguageChoices: ["dwarvish", "elvish"],
      classLanguageChoices: [],
      classEquipmentPackageId: "equipment-a",
      backgroundEquipmentPackageId: "equipment-a",
      classEquipmentChoices: { "holy-symbol": "holy-symbol-amulet" },
      backgroundEquipmentChoices: { "holy-symbol": "holy-symbol-emblem" },
      weaponMasteryChoices: [],
      divineOrder: "protector",
      classCantripChoices: ["guidance", "sacred-flame", "spare-the-dying"],
      classPreparedSpellChoices: ["bless", "command", "cure-wounds", "healing-word"],
      backgroundMagicInitiateCantrips: ["light", "thaumaturgy"],
      backgroundMagicInitiateSpell: "sanctuary",
      backgroundMagicInitiateAbility: "wisdom",
    },
    expected: {
      background: "Acolyte",
      species: "Dwarf",
      abilities: { strength: 10, dexterity: 12, constitution: 12, intelligence: 14, wisdom: 18, charisma: 10 },
      origin: { backgroundId: "acolyte", speciesId: "dwarf" },
      skillProficiencies: ["insight", "religion", "medicine", "persuasion"],
      toolProficiencies: ["calligraphers-supplies"],
      languages: ["common", "dwarvish", "elvish"],
      feats: ["Magic Initiate (Cleric)"],
      inventoryIds: ["chain-shirt", "shield-armor", "mace", "holy-symbol-amulet", "priests-pack", "calligraphers-supplies", "book", "parchment", "robe", "holy-symbol-emblem"],
      weaponMasteryIds: [],
      levelOneChoices: { divineOrder: { id: "protector", selectedAtLevel: 1 } },
      spellIds: ["guidance", "sacred-flame", "spare-the-dying", "bless", "command", "cure-wounds", "healing-word", "guiding-bolt", "spiritual-weapon", "light", "thaumaturgy", "sanctuary"],
      cantrips: ["guidance", "sacred-flame", "spare-the-dying"],
      preparedSpells: ["bless", "command", "cure-wounds", "healing-word", "guiding-bolt", "spiritual-weapon"],
      spellbookSpells: [],
    },
  },
  {
    templateId: "wizard",
    className: "Wizard",
    subclassId: "evoker",
    subclassName: "Evoker",
    name: "Ilyra Ashquill",
    creation: {
      creationMode: "level-one-srd",
      backgroundId: "sage",
      speciesId: "elf",
      abilityScoreIncreases: { intelligence: 2, constitution: 1 },
      classSkillProficiencies: ["insight", "investigation"],
      originLanguageChoices: ["common-sign-language", "dwarvish"],
      classLanguageChoices: [],
      elfLineage: "high-elf",
      elfCantrip: "prestidigitation",
      speciesSpellcastingAbility: "intelligence",
      classEquipmentPackageId: "equipment-a",
      backgroundEquipmentPackageId: "equipment-a",
      weaponMasteryChoices: [],
      classCantripChoices: ["fire-bolt", "light", "mage-hand"],
      wizardSpellbookChoices: ["alarm", "burning-hands", "charm-person", "detect-magic", "magic-missile", "shield"],
      classPreparedSpellChoices: ["burning-hands", "detect-magic", "magic-missile", "shield"],
      backgroundMagicInitiateCantrips: ["ray-of-frost", "shocking-grasp"],
      backgroundMagicInitiateSpell: "chromatic-orb",
      backgroundMagicInitiateAbility: "intelligence",
    },
    expected: {
      background: "Sage",
      species: "Elf",
      abilities: { strength: 8, dexterity: 14, constitution: 15, intelligence: 18, wisdom: 12, charisma: 10 },
      origin: { backgroundId: "sage", speciesId: "elf", elfLineage: "high-elf", elfCantrip: "prestidigitation", speciesSpellcastingAbility: "intelligence" },
      skillProficiencies: ["arcana", "history", "insight", "investigation"],
      toolProficiencies: ["calligraphers-supplies"],
      languages: ["common", "common-sign-language", "dwarvish"],
      feats: ["Magic Initiate (Wizard)"],
      inventoryIds: ["dagger", "arcane-focus-staff", "robe", "spellbook", "scholars-pack", "quarterstaff", "calligraphers-supplies", "book", "parchment"],
      weaponMasteryIds: [],
      levelOneChoices: {},
      spellIds: ["fire-bolt", "light", "mage-hand", "alarm", "burning-hands", "charm-person", "detect-magic", "magic-missile", "shield", "disguise-self", "find-familiar", "scorching-ray", "web", "ray-of-frost", "shocking-grasp", "chromatic-orb", "prestidigitation", "misty-step"],
      cantrips: ["fire-bolt", "light", "mage-hand"],
      preparedSpells: ["burning-hands", "magic-missile", "shield", "disguise-self", "scorching-ray", "web"],
      spellbookSpells: ["alarm", "burning-hands", "charm-person", "detect-magic", "magic-missile", "shield", "disguise-self", "find-familiar", "scorching-ray", "web"],
    },
  },
  {
    templateId: "rogue",
    className: "Rogue",
    subclassId: "thief",
    subclassName: "Thief",
    name: "Nox Quickstep",
    creation: {
      creationMode: "level-one-srd",
      backgroundId: "criminal",
      speciesId: "human",
      abilityScoreIncreases: { dexterity: 2, constitution: 1 },
      classSkillProficiencies: ["acrobatics", "deception", "investigation", "perception"],
      originLanguageChoices: ["halfling", "orc"],
      classLanguageChoices: ["undercommon"],
      skillProficiency: "persuasion",
      originFeat: "Skilled",
      skilledProficiencyChoices: ["athletics", "insight", "herbalism-kit"],
      classEquipmentPackageId: "equipment-a",
      backgroundEquipmentPackageId: "equipment-a",
      weaponMasteryChoices: ["shortbow", "shortsword"],
      rogueExpertiseChoices: ["stealth", "perception"],
    },
    expected: {
      background: "Criminal",
      species: "Human",
      abilities: { strength: 10, dexterity: 18, constitution: 15, intelligence: 12, wisdom: 12, charisma: 10 },
      origin: { backgroundId: "criminal", speciesId: "human", humanSkillProficiency: "persuasion", humanOriginFeat: "Skilled" },
      skillProficiencies: ["sleight-of-hand", "stealth", "acrobatics", "deception", "investigation", "perception", "persuasion", "athletics", "insight"],
      toolProficiencies: ["thieves-tools", "herbalism-kit"],
      languages: ["common", "halfling", "orc", "thieves-cant", "undercommon"],
      feats: ["Alert", "Skilled"],
      inventoryIds: ["leather-armor", "dagger", "shortsword", "shortbow", "arrows", "quiver", "thieves-tools", "burglars-pack", "crowbar", "pouch", "travelers-clothes"],
      weaponMasteryIds: ["shortbow", "shortsword"],
      levelOneChoices: { rogueExpertise: ["stealth", "perception"], skilledProficiencies: ["athletics", "insight", "herbalism-kit"] },
      spellIds: [],
      cantrips: [],
      preparedSpells: [],
      spellbookSpells: [],
    },
  },
];

const mapName = "ember-gauntlet-level-3.svg";
const sceneName = "Level 3 Ember Gauntlet";
const encounterName = "Ember Gauntlet Goblin Ambush";
const combatFormation: Record<string, { x: number; y: number }> = {
  "Aric Emberguard": { x: 400, y: 500 },
  "Sister Maelin": { x: 450, y: 500 },
  "Ilyra Ashquill": { x: 500, y: 500 },
  "Nox Quickstep": { x: 550, y: 500 },
  "Goblin Warrior 1": { x: 400, y: 450 },
  "Goblin Warrior 2": { x: 450, y: 450 },
  "Goblin Warrior 3": { x: 400, y: 550 },
};

const generatedMapSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs>
    <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
      <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#6f5946" stroke-width="2" opacity="0.5"/>
    </pattern>
    <linearGradient id="floor" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#332c2a"/><stop offset="1" stop-color="#17191c"/>
    </linearGradient>
    <radialGradient id="lava"><stop offset="0" stop-color="#ffd166"/><stop offset="0.45" stop-color="#ef6f2e"/><stop offset="1" stop-color="#7c241b"/></radialGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#floor)"/>
  <path d="M0 0h1200v110H0zM0 690h1200v110H0zM0 0h110v800H0zM1090 0h110v800h-110z" fill="#111315"/>
  <path d="M450 110h300v160H450zM450 530h300v160H450z" fill="#262a2d" stroke="#8b7358" stroke-width="12"/>
  <path d="M100 365h1000v70H100z" fill="url(#lava)" stroke="#ff9f43" stroke-width="5"/>
  <path d="M520 365h160v70H520z" fill="#4f453b" stroke="#b79a75" stroke-width="6"/>
  <g fill="#101214" stroke="#94795d" stroke-width="7">
    <circle cx="265" cy="225" r="42"/><circle cx="935" cy="225" r="42"/>
    <circle cx="265" cy="575" r="42"/><circle cx="935" cy="575" r="42"/>
  </g>
  <rect width="1200" height="800" fill="url(#grid)"/>
  <g font-family="serif" fill="#f6d7a8" text-anchor="middle">
    <text x="600" y="70" font-size="38" font-weight="700">THE EMBER GAUNTLET</text>
    <text x="600" y="325" font-size="24">Bridge of Cinders</text>
    <text x="600" y="500" font-size="20">Party staging</text>
  </g>
</svg>`;

function statusMessage(page: Page, text: string | RegExp): Locator {
  return page.getByRole("status").filter({ hasText: text }).first();
}

async function apiJson<T>(
  page: Page,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: JsonObject,
  acceptedStatuses: number[] = [200],
): Promise<ApiResult<T>> {
  const response = await page.evaluate(
    async ({ apiBaseUrl, method, path, body, idempotencyKey }) => {
      const response = await fetch(`${apiBaseUrl}${path}`, {
        method,
        credentials: "include",
        headers: {
          ...(body ? { "content-type": "application/json" } : {}),
          ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, text: await response.text() };
    },
    {
      apiBaseUrl,
      method,
      path,
      body,
      idempotencyKey: method === "GET" ? undefined : `full-combat:${randomUUID()}`,
    },
  );
  const text = response.text;
  const parsed = text ? JSON.parse(text) as T : undefined as T;
  if (!acceptedStatuses.includes(response.status)) {
    throw new Error(`${method} ${path} returned ${response.status}: ${text}`);
  }
  return { status: response.status, body: parsed };
}

async function apiJsonWithoutBrowserConsole<T>(
  page: Page,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: JsonObject,
  acceptedStatuses: number[] = [200],
): Promise<ApiResult<T>> {
  const response = await page.request.fetch(`${apiBaseUrl}${path}`, {
    method,
    ...(body ? { data: body } : {}),
    headers: method === "GET" ? undefined : { "idempotency-key": `full-combat:${randomUUID()}` },
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) as T : undefined as T;
  if (!acceptedStatuses.includes(response.status())) {
    throw new Error(`${method} ${path} returned ${response.status()}: ${text}`);
  }
  return { status: response.status(), body: parsed };
}

async function snapshot(page: Page): Promise<SnapshotRecord> {
  return (await apiJson<SnapshotRecord>(page, "GET", `/api/v1/campaigns/${campaignId}/snapshot`)).body;
}

async function actorSheet(page: Page, actorId: string): Promise<ActorSheet> {
  return (await apiJson<ActorSheet>(page, "GET", `/api/v1/campaigns/${campaignId}/systems/${systemId}/actors/${actorId}/sheet`)).body;
}

async function loginAsDemoGm(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM", exact: true }).click();
  await expect(page.getByRole("heading", { name: "The Ember Vault", exact: true })).toBeVisible();
}

async function openDetails(details: Locator): Promise<void> {
  await expect(details.locator("summary")).toBeVisible();
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await details.evaluate((element) => {
      (element as HTMLDetailsElement).open = true;
      element.scrollIntoView({ block: "nearest" });
    });
  }
}

async function openManageCategory(page: Page, categoryName: string): Promise<Locator> {
  const panel = page.getByRole("region", { name: "Manage workspace panel" });
  if (!(await panel.isVisible().catch(() => false))) await page.getByRole("button", { name: "Manage", exact: true }).click();
  await expect(panel).toBeVisible();
  await panel.locator(".manage-category-button", { hasText: categoryName }).click();
  return panel;
}

async function closeManage(page: Page): Promise<void> {
  const panel = page.getByRole("region", { name: "Manage workspace panel" });
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  await expect(panel).toBeHidden();
}

async function openInspectorPanel(page: Page, name: "Actors" | "Combat" | "Assets"): Promise<void> {
  await page.locator(".inspector-tabs").getByRole("tab", { name, exact: true }).click();
}

async function selectPartyActor(page: Page, actorName: string): Promise<void> {
  const actor = page.getByRole("region", { name: "Party" }).getByRole("button").filter({ hasText: actorName });
  await expect(actor).toBeVisible();
  await expect(async () => {
    await actor.click();
    await expect(actor).toHaveClass(/\bselected\b/, { timeout: 2_000 });
  }).toPass({ timeout: 10_000 });
}

async function createGeneratedSceneAndMap(page: Page): Promise<{ scene: JsonObject; asset: JsonObject }> {
  const panel = await openManageCategory(page, "Scenes");
  const drawer = panel.locator("details.create-drawer", { hasText: "New scene" });
  await openDetails(drawer);
  const form = drawer.locator("form");
  await form.getByRole("textbox", { name: "Scene name" }).fill(sceneName);
  await form.getByRole("spinbutton", { name: "Scene width" }).fill("1200");
  await form.getByRole("spinbutton", { name: "Scene height" }).fill("800");
  await form.getByRole("combobox", { name: "Scene grid type" }).selectOption("square");
  await form.getByRole("spinbutton", { name: "Scene grid size" }).fill("50");
  const active = form.getByRole("checkbox", { name: "Activate for players" });
  if (!(await active.isChecked())) await active.check();
  const createdResponse = page.waitForResponse((response) => response.request().method() === "POST" && /\/campaigns\/camp_demo\/scenes$/.test(new URL(response.url()).pathname));
  await form.getByRole("button", { name: "Add Scene", exact: true }).click();
  const sceneResponse = await createdResponse;
  expect(sceneResponse.ok(), await sceneResponse.text()).toBeTruthy();
  const scene = await sceneResponse.json() as JsonObject;
  await expect(statusMessage(page, `${sceneName} created`)).toBeVisible();
  await closeManage(page);

  await page.getByRole("button", { name: "Prep", exact: true }).click();
  await openInspectorPanel(page, "Assets");
  const assetLibrary = page.getByRole("region", { name: "Asset library" });
  await expect(assetLibrary).toBeVisible();
  await page.locator("#asset-library-upload").setInputFiles({
    name: mapName,
    mimeType: "image/svg+xml",
    buffer: Buffer.from(generatedMapSvg),
  });
  await expect(statusMessage(page, `${mapName} uploaded`)).toBeVisible();
  await page.getByRole("textbox", { name: "Asset search" }).fill("ember-gauntlet-level-3");
  const assetCard = assetLibrary.locator("article", { hasText: mapName });
  await expect(assetCard).toBeVisible();
  const backgroundResponse = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().includes(`/api/v1/scenes/${scene.id}`));
  await assetCard.getByRole("button", { name: "Background", exact: true }).click();
  const setBackground = await backgroundResponse;
  expect(setBackground.ok(), await setBackground.text()).toBeTruthy();
  await expect(statusMessage(page, `${mapName} set as ${sceneName} background`)).toBeVisible();
  await expect(page.locator("img.scene-map")).toBeVisible();

  const current = await snapshot(page);
  const persistedScene = current.scenes.find((candidate) => candidate.id === scene.id);
  const asset = current.assets.find((candidate) => candidate.name === mapName);
  expect(persistedScene?.backgroundAssetId).toBe(asset?.id);
  expect(asset).toBeTruthy();
  return { scene: persistedScene!, asset: asset! };
}

function advancementChoices(definition: CharacterDefinition, targetLevel: number): JsonObject {
  const subclass = targetLevel === 3 ? { subclassId: definition.subclassId } : {};
  if (definition.templateId === "cleric") {
    return {
      ...subclass,
      classPreparedSpellChoices: targetLevel === 2
        ? ["bless", "command", "cure-wounds", "healing-word", "guiding-bolt"]
        : ["bless", "command", "cure-wounds", "healing-word", "guiding-bolt", "spiritual-weapon"],
    };
  }
  if (definition.templateId === "wizard") {
    return {
      ...subclass,
      wizardSpellbookAdditions: targetLevel === 2 ? ["disguise-self", "find-familiar"] : ["scorching-ray", "web"],
      classPreparedSpellChoices: targetLevel === 2
        ? ["alarm", "burning-hands", "charm-person", "magic-missile", "shield"]
        : ["burning-hands", "magic-missile", "shield", "disguise-self", "scorching-ray", "web"],
    };
  }
  return subclass;
}

async function createLevelThreeCharacter(page: Page, definition: CharacterDefinition): Promise<ActorRecord> {
  const created = await apiJson<{ actor: ActorRecord }>(
    page,
    "POST",
    `/api/v1/campaigns/${campaignId}/systems/${systemId}/characters`,
    { templateId: definition.templateId, name: definition.name, ownerUserId: "usr_demo_player", ...definition.creation },
  );
  let actor = created.body.actor;

  for (let targetLevel = 2; targetLevel <= 3; targetLevel += 1) {
    const preview = await apiJson<JsonObject>(
      page,
      "POST",
      `/api/v1/campaigns/${campaignId}/systems/${systemId}/actors/${actor.id}/rules-preview`,
      {
        operation: "advancement",
        optionId: "level-up",
        hitPointMode: "fixed",
        prepare: true,
        ...advancementChoices(definition, targetLevel),
      },
    );
    expect(preview.body.status, JSON.stringify(preview.body.blockers ?? [])).toBe("ready");
    const preparation = preview.body.preparation as { preparedPreviewKey: string; actorUpdatedAt: string };
    const advanced = await apiJson<{ actor: ActorRecord }>(
      page,
      "POST",
      `/api/v1/campaigns/${campaignId}/systems/${systemId}/actors/${actor.id}/advance`,
      { preparedPreviewKey: preparation.preparedPreviewKey, expectedUpdatedAt: preparation.actorUpdatedAt },
    );
    actor = advanced.body.actor;
  }
  return actor;
}

async function ensurePairedCombatEquipment(page: Page, actor: ActorRecord, definition: CharacterDefinition): Promise<ActorRecord> {
  const sheet = await actorSheet(page, actor.id);
  if (findPairedAttack(sheet)) return actor;
  const entryId = definition.templateId === "cleric" ? "mace" : definition.templateId === "wizard" ? "quarterstaff" : undefined;
  if (!entryId) return actor;
  const purchase = await apiJson<{ actor: ActorRecord; item: JsonObject; sheet: ActorSheet }>(
    page,
    "POST",
    `/api/v1/campaigns/${campaignId}/systems/${systemId}/actors/${actor.id}/purchase`,
    { entryId, quantity: 1, expectedUpdatedAt: actor.updatedAt },
  );
  expect(findPairedAttack(purchase.body.sheet), `${definition.name} has a purchased paired weapon action`).toBeTruthy();
  return purchase.body.actor;
}

async function applyTypedDamage(page: Page, actorId: string, amount: number): Promise<ActorRecord> {
  const base = `/api/v1/campaigns/${campaignId}/systems/${systemId}/actors/${actorId}`;
  const preview = await apiJson<JsonObject>(page, "POST", `${base}/rules-preview`, {
    operation: "typed-damage",
    prepare: true,
    amount,
    damageType: "fire",
  });
  expect(preview.body.status).toBe("ready");
  const preparation = preview.body.preparation as {
    preparedPreviewKey: string;
    actorUpdatedAt: Record<string, string>;
    itemUpdatedAt: Record<string, string>;
    combatUpdatedAt?: string;
  };
  const applied = await apiJson<{ actor: ActorRecord }>(page, "POST", `${base}/typed-damage/apply`, {
    preparedPreviewKey: preparation.preparedPreviewKey,
    expectedActorUpdatedAt: preparation.actorUpdatedAt,
    expectedItemUpdatedAt: preparation.itemUpdatedAt,
    ...(preparation.combatUpdatedAt ? { expectedCombatUpdatedAt: preparation.combatUpdatedAt } : {}),
  });
  return applied.body.actor;
}

async function completeReviewedLongRest(page: Page, actor: ActorRecord): Promise<{ actor: ActorRecord; rest: JsonObject }> {
  const base = `/api/v1/campaigns/${campaignId}/systems/${systemId}/actors/${actor.id}`;
  const preview = await apiJson<JsonObject>(page, "POST", `${base}/rules-preview`, {
    operation: "rest",
    restType: "long",
    prepare: true,
  });
  expect(preview.body.status, JSON.stringify(preview.body.blockers ?? [])).toBe("ready");
  const preparation = preview.body.preparation as { preparedPreviewKey: string; actorUpdatedAt: string };
  const committed = await apiJson<{ actor: ActorRecord; rest: JsonObject }>(page, "POST", `${base}/rest`, {
    preparedPreviewKey: preparation.preparedPreviewKey,
    expectedUpdatedAt: preparation.actorUpdatedAt,
  });
  expect(committed.body.rest).toMatchObject({ actorId: actor.id, restType: "long" });
  return committed.body;
}

function sixAbilityScores(data: JsonObject): Record<string, number> {
  const attributes = data.attributes as Record<string, number>;
  return Object.fromEntries(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map((key) => [key, Number(attributes?.[key])]));
}

function itemCompendiumId(item: JsonObject): string {
  return String(item.data?.compendiumId ?? item.data?.compendiumEntryId ?? "");
}

function sortedUniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))].sort();
}

function canonicalItemEvidence(item: JsonObject): JsonObject {
  return {
    itemId: item.id,
    name: item.name,
    type: item.type,
    compendiumId: itemCompendiumId(item),
    quantity: item.data?.quantity,
    level: item.data?.level,
    prepared: item.data?.prepared,
    alwaysPrepared: item.data?.alwaysPrepared,
    inSpellbook: item.data?.inSpellbook,
    minimumCharacterLevel: item.data?.minimumCharacterLevel,
    startingEquipment: item.data?.startingEquipment,
    spellSources: item.data?.spellSources,
    source: item.data?.source,
    contentVersion: item.data?.compendiumProvenance?.contentVersion,
  };
}

async function finishLevelThreeSpellPreparation(page: Page, actor: ActorRecord): Promise<{ actor: ActorRecord; review: JsonObject }> {
  const sheet = await actorSheet(page, actor.id);
  const spellItems = sheet.spells ?? [];
  const normalClassSpells = spellItems.filter((item) =>
    item.data?.classSpell === true
    && item.data?.alwaysPrepared !== true
    && item.data?.cantrip !== true
    && Number(item.data?.level ?? 0) >= 1
  );
  if (normalClassSpells.length === 0) {
    return { actor, review: { actorId: actor.id, className: actor.data.class, applicable: false, reason: "no normal prepared-spell class" } };
  }
  const preparedEntryIds = sortedUniqueStrings((actor.data.spellcasting as JsonObject | undefined)?.preparedSpells);
  const selectedSpells = normalClassSpells.filter((item) => preparedEntryIds.includes(itemCompendiumId(item)));
  expect(sortedUniqueStrings(selectedSpells.map(itemCompendiumId)), `${actor.name} must own every spell selected by reviewed advancement`).toEqual(preparedEntryIds);
  const revisions = Object.fromEntries(spellItems.map((item) => [String(item.id), String(item.updatedAt)]));
  const preview = await apiJson<JsonObject>(
    page,
    "POST",
    `/api/v1/campaigns/${campaignId}/systems/${systemId}/actors/${actor.id}/spell-preparation/preview`,
    {
      selectedSpellIds: selectedSpells.map((item) => item.id),
      timing: "long-rest",
      expectedActorUpdatedAt: actor.updatedAt,
      expectedItemUpdatedAt: revisions,
    },
  );
  expect(preview.body.status, JSON.stringify(preview.body.blockers ?? [])).toBe("ready");
  expect(preview.body.capacity).toMatchObject({ className: actor.data.class, limit: 6, selected: 6, source: "stored" });
  expect(preview.body.changes, `${actor.name} advancement and owned spell items must already agree`).toEqual([]);
  return { actor, review: { applicable: true, applied: false, plan: preview.body, advancementOwnedAndPrepared: true } };
}

async function verifyCharacterSheets(page: Page, actors: ActorRecord[]): Promise<JsonObject[]> {
  const evidence: JsonObject[] = [];
  await page.reload();
  await expect(page.getByRole("heading", { name: "The Ember Vault", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Live Table", exact: true }).click();

  for (const definition of characters) {
    const actor = actors.find((candidate) => candidate.name === definition.name)!;
    const sheet = await actorSheet(page, actor.id);
    const abilities = sixAbilityScores(sheet.data);
    const hp = sheet.data.hp as { current: number; max: number };
    const hitDice = sheet.data.hitDice as { current?: number; max?: number; size?: string };
    const subclasses = sheet.data.subclasses as Record<string, string> | undefined;
    const origin = sheet.data.origin as JsonObject;
    const creation = sheet.data.dnd5eCharacterCreation as JsonObject;
    const spellcasting = (sheet.data.spellcasting ?? {}) as JsonObject;
    const inventory = sheet.inventory ?? [];
    const spells = sheet.spells ?? [];
    const inventoryIds = inventory.map(itemCompendiumId);
    const spellIds = sortedUniqueStrings(spells.map(itemCompendiumId));
    const paired = findPairedAttack(sheet);
    const { creationMode: expectedCreationMode, ...expectedCreationOptions } = definition.creation;
    expect(actor.ownerUserId).toBe("usr_demo_player");
    expect(sheet.data.class).toBe(definition.className);
    expect(sheet.data.level).toBe(3);
    expect(sheet.data.subclass).toBe(definition.subclassName);
    expect(subclasses?.[definition.className]).toBe(definition.subclassId);
    expect(abilities).toEqual(definition.expected.abilities);
    expect(sheet.data.species).toBe(definition.expected.species);
    expect(sheet.data.background).toBe(definition.expected.background);
    expect(creation).toMatchObject({ version: 1, mode: expectedCreationMode, templateId: definition.templateId, options: expectedCreationOptions });
    expect(origin).toMatchObject({
      source: "SRD 5.2.1",
      ...definition.expected.origin,
      abilityScoreIncreases: definition.creation.abilityScoreIncreases,
      classSkillProficiencies: definition.creation.classSkillProficiencies,
      originLanguageChoices: definition.creation.originLanguageChoices,
      classLanguageChoices: definition.creation.classLanguageChoices,
      startingEquipment: {
        source: "SRD 5.2.1",
        class: { templateId: definition.templateId, packageId: "equipment-a" },
        background: { backgroundId: definition.creation.backgroundId, packageId: "equipment-a" },
      },
      weaponMasteryChoices: definition.expected.weaponMasteryIds,
    });
    expect(Number(hp.max)).toBeGreaterThan(0);
    expect(Number(hitDice.current)).toBeGreaterThanOrEqual(0);
    expect(Number(hitDice.max)).toBe(3);
    expect(String(hitDice.size ?? "")).toMatch(/^d(?:6|8|10|12)$/);
    expect(Number(sheet.data.armorClass)).toBeGreaterThan(0);
    expect((sheet.data.saveProficiencies as unknown[] | undefined)?.length ?? 0).toBeGreaterThan(0);
    expect(sortedUniqueStrings(sheet.data.skillProficiencies)).toEqual([...definition.expected.skillProficiencies].sort());
    expect(sortedUniqueStrings(sheet.data.toolProficiencies)).toEqual([...definition.expected.toolProficiencies].sort());
    expect(sortedUniqueStrings(sheet.data.languages)).toEqual([...definition.expected.languages].sort());
    expect(sortedUniqueStrings(sheet.data.feats)).toEqual([...definition.expected.feats].sort());
    expect(sheet.data.levelOneChoices ?? {}).toMatchObject(definition.expected.levelOneChoices);
    expect(sortedUniqueStrings((sheet.data.weaponMasteries as JsonObject[] | undefined)?.map((mastery) => mastery.weaponId))).toEqual([...definition.expected.weaponMasteryIds].sort());
    if (definition.templateId === "rogue") {
      expect(sortedUniqueStrings(sheet.data.skillExpertise)).toEqual(["perception", "stealth"]);
    }
    expect((sheet.data.features as unknown[] | undefined)?.length ?? 0).toBeGreaterThan(0);
    expect(sheet.quickRolls.length).toBeGreaterThan(15);
    expect(inventoryIds).toEqual(expect.arrayContaining(definition.expected.inventoryIds));
    for (const entryId of definition.expected.inventoryIds) {
      const item = inventory.find((candidate) => itemCompendiumId(candidate) === entryId);
      expect(item, `${definition.name} must own canonical starting equipment ${entryId}`).toBeDefined();
      expect(item?.data?.startingEquipment, `${definition.name} ${entryId} must retain its starting-equipment source`).toMatchObject({ source: "SRD 5.2.1", packageId: "equipment-a" });
      expect(item?.data?.source, `${definition.name} ${entryId} must retain its SRD source`).toBe("SRD 5.2.1");
    }
    expect(spellIds).toEqual([...definition.expected.spellIds].sort());
    for (const spell of spells) {
      expect(itemCompendiumId(spell), `${definition.name} spell ${spell.name} must be compendium-backed`).not.toBe("");
      expect(spell.data?.source, `${definition.name} spell ${spell.name} must retain its SRD source`).toBe("SRD 5.2.1");
      expect(Array.isArray(spell.data?.spellSources) && spell.data.spellSources.length > 0, `${definition.name} spell ${spell.name} must retain a rules source`).toBe(true);
    }
    expect(sortedUniqueStrings(spellcasting.cantrips)).toEqual([...definition.expected.cantrips].sort());
    expect(sortedUniqueStrings(spellcasting.preparedSpells)).toEqual([...definition.expected.preparedSpells].sort());
    expect(sortedUniqueStrings(spellcasting.spellbookSpells)).toEqual([...definition.expected.spellbookSpells].sort());
    if (definition.templateId === "cleric" || definition.templateId === "wizard") {
      expect(sheet.data.spellSlots).toMatchObject({
        level1: { current: 4, max: 4, recovery: "long" },
        level2: { current: 2, max: 2, recovery: "long" },
      });
    } else {
      expect(sheet.data.spellSlots).toEqual({});
    }
    expect(paired, `${definition.name} must have a legal paired attack and damage action from the completed loadout`).toBeTruthy();

    await selectPartyActor(page, definition.name);
    await openInspectorPanel(page, "Actors");
    const actorPanel = page.locator(".inspector");
    await expect(actorPanel.getByRole("heading", { name: definition.name, exact: true })).toBeVisible();
    await actorPanel.getByRole("tab", { name: "Stats", exact: true }).click();
    await expect(actorPanel.getByRole("region", { name: "Actor stats sheet" })).toBeVisible();
    await expect(actorPanel.getByRole("region", { name: "Actor at a glance" })).toBeVisible();
    await actorPanel.getByRole("tab", { name: "Actions", exact: true }).click();
    await expect(actorPanel.getByRole("region", { name: "Actor action sheet" }).locator("article").first()).toBeVisible();
    await page.screenshot({ path: resolve(artifactRoot, `02-sheet-${definition.templateId}.png`) });

    evidence.push({
      actorId: actor.id,
      name: actor.name,
      ownerUserId: actor.ownerUserId,
      class: sheet.data.class,
      level: sheet.data.level,
      subclass: sheet.data.subclass,
      species: sheet.data.species,
      background: sheet.data.background,
      creationWorkflow: creation,
      origin,
      abilities,
      hp,
      hitDice,
      armorClass: sheet.data.armorClass,
      proficiencyBonus: sheet.data.proficiencyBonus,
      saveProficiencies: sheet.data.saveProficiencies,
      skillProficiencies: sheet.data.skillProficiencies,
      skillExpertise: sheet.data.skillExpertise,
      toolProficiencies: sheet.data.toolProficiencies,
      languages: sheet.data.languages,
      feats: sheet.data.feats,
      features: sheet.data.features,
      levelOneChoices: sheet.data.levelOneChoices,
      weaponMasteries: sheet.data.weaponMasteries,
      spellcasting,
      spellSlots: sheet.data.spellSlots,
      inventory: inventory.map(canonicalItemEvidence),
      spells: spells.map(canonicalItemEvidence),
      inventoryCount: inventory.length,
      spellCount: spells.length,
      quickRollCount: sheet.quickRolls.length,
      combatReadyPair: paired ? {
        attack: { id: paired.attack.id, label: paired.attack.label, formula: paired.attack.formula, metadata: paired.attack.metadata },
        damage: { id: paired.damage.id, label: paired.damage.label, formula: paired.damage.formula, metadata: paired.damage.metadata },
      } : undefined,
      completeness: {
        guidedCreationRecorded: creation.mode === "level-one-srd",
        canonicalOriginRecorded: Boolean(origin.backgroundId && origin.speciesId),
        sixAbilityScoresRecorded: Object.keys(abilities).length === 6,
        levelThreeSubclassRecorded: sheet.data.level === 3 && sheet.data.subclass === definition.subclassName,
        proficienciesRecorded: definition.expected.skillProficiencies.length > 0 && definition.expected.toolProficiencies.length > 0,
        canonicalLoadoutRecorded: definition.expected.inventoryIds.every((entryId) => inventoryIds.includes(entryId)),
        canonicalLevelOneSpellSelectionsRecorded: spellIds.length === definition.expected.spellIds.length,
        combatActionAvailable: Boolean(paired),
      },
    });
  }
  return evidence;
}

async function placeEncounterThroughUi(page: Page, actorNames: string[]): Promise<{ combat: CombatRecord; snapshot: SnapshotRecord }> {
  await page.getByRole("button", { name: "Live Table", exact: true }).click();
  await openInspectorPanel(page, "Combat");
  await page.getByRole("button", { name: "Open command palette" }).click();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.getByRole("textbox", { name: "Command palette search" }).fill("Open Encounter Builder");
  await palette.getByRole("option", { name: /Open Encounter Builder/ }).click();
  const dialog = page.getByRole("dialog", { name: "Encounter builder" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Encounter name" }).fill(encounterName);
  await dialog.getByRole("textbox", { name: "Search encounter threats" }).fill("Goblin");
  const threat = dialog.getByText("Goblin Warrior", { exact: true }).locator("xpath=ancestor::article[contains(@class, 'encounter-threat')][1]");
  await expect(threat).toBeVisible({ timeout: 30_000 });
  for (let count = 0; count < 3; count += 1) await threat.locator(".encounter-threat-stepper button").last().click();
  await expect(dialog.getByRole("region", { name: "Live encounter plan" })).toContainText("Goblin Warrior x3");

  const party = dialog.locator(".encounter-party");
  const clearParty = party.getByRole("button", { name: "Clear party", exact: true });
  if (await clearParty.isEnabled()) await clearParty.click();
  for (const actorName of actorNames) {
    const checkbox = party.getByRole("checkbox", { name: actorName, exact: true });
    await checkbox.check();
    const row = checkbox.locator("xpath=ancestor::div[contains(@class, 'encounter-party-row')][1]");
    await row.getByRole("button", { name: "Place on scene", exact: true }).click();
    await expect(row).toContainText("On scene");
  }
  await expect(party.locator(".encounter-party-readiness")).toContainText("All 4 selected characters are on the scene.");

  await dialog.getByRole("button", { name: "Save encounter", exact: true }).click();
  await expect(statusMessage(page, `${encounterName} saved`)).toBeVisible();
  await dialog.getByRole("button", { name: "Place & review combat", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(statusMessage(page, /Prepared 7 combatants \(4 party, 3 hostile\)/)).toBeVisible();

  const review = page.getByRole("dialog", { name: new RegExp(`^Review ${sceneName}`) });
  await expect(review).toBeVisible();
  const serverRoll = review.getByRole("checkbox", { name: /Server-roll initiative/ });
  if (await serverRoll.isChecked()) await serverRoll.uncheck();
  const initiativeInputs = review.locator('input[type="number"]:enabled');
  for (let index = 0; index < await initiativeInputs.count(); index += 1) await initiativeInputs.nth(index).fill(String(70 - index));
  await review.getByRole("spinbutton", { name: `${characters[0]!.name} initiative` }).fill("99");
  await review.getByRole("spinbutton", { name: `${characters[1]!.name} initiative` }).fill("90");
  await review.getByRole("spinbutton", { name: `${characters[2]!.name} initiative` }).fill("80");
  await review.getByRole("spinbutton", { name: `${characters[3]!.name} initiative` }).fill("70");
  const startResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(`/api/v1/campaigns/${campaignId}/combats/start`));
  await review.getByRole("button", { name: "Start combat (7)", exact: true }).click();
  const started = await startResponse;
  expect(started.ok(), await started.text()).toBeTruthy();
  await expect(review).toBeHidden();
  const state = await snapshot(page);
  const combat = state.combats.find((candidate) => candidate.active)!;
  expect(combat.combatants).toHaveLength(7);
  expect(combat.combatants[combat.turnIndex]?.name).toBe(characters[0]!.name);
  await page.screenshot({ path: resolve(artifactRoot, "03-party-and-enemies-placed.png") });
  return { combat, snapshot: state };
}

function rollResponseMatches(response: Response, actorId: string, predicate: (body: JsonObject) => boolean): boolean {
  if (response.request().method() !== "POST" || !response.url().endsWith(`/actors/${actorId}/roll`)) return false;
  try {
    return predicate(JSON.parse(response.request().postData() ?? "{}") as JsonObject);
  } catch {
    return false;
  }
}

async function commitReviewedUiAction(page: Page, actorId: string, useButton: Locator): Promise<{ prepared: JsonObject; committed: JsonObject }> {
  const preparedResponse = page.waitForResponse((response) => rollResponseMatches(response, actorId, (body) => body.prepare === true && !body.preparedPreviewKey));
  await useButton.click();
  const review = page.getByRole("dialog", { name: /Review .* action/ });
  await expect(review).toBeVisible();
  const prepared = await preparedResponse;
  expect(prepared.ok(), await prepared.text()).toBeTruthy();
  const preparedBody = await prepared.json() as JsonObject;
  const committedResponse = page.waitForResponse((response) => rollResponseMatches(response, actorId, (body) => typeof body.preparedPreviewKey === "string"));
  await review.getByRole("button", { name: "Commit exact action", exact: true }).click();
  const committed = await committedResponse;
  expect(committed.ok(), await committed.text()).toBeTruthy();
  await expect(review).toBeHidden();
  return { prepared: preparedBody, committed: await committed.json() as JsonObject };
}

async function exerciseSecondWindThenAttack(
  page: Page,
  fighter: ActorRecord,
  fighterSheet: ActorSheet,
  target: ActorRecord,
): Promise<JsonObject> {
  await selectPartyActor(page, fighter.name);
  await openInspectorPanel(page, "Actors");
  const panel = page.locator(".inspector");
  await panel.getByRole("tab", { name: "Actions", exact: true }).click();
  await openDetails(panel.locator("details.actor-detail-disclosure").filter({ hasText: "Actor details" }).first());
  const targetSelect = panel.getByRole("combobox", { name: "Action target actor" });
  const applyEffect = panel.getByRole("checkbox", { name: "Apply action effect" });
  const consumeResources = panel.getByRole("checkbox", { name: "Consume action resources" });
  if (!(await applyEffect.isChecked())) await applyEffect.check();
  if (!(await consumeResources.isChecked())) await consumeResources.check();
  await targetSelect.selectOption({ label: fighter.name });

  const actionSheet = panel.getByRole("region", { name: "Actor action sheet" });
  const secondWindCard = actionSheet.locator("article").filter({ hasText: "Second Wind Healing" }).first();
  await expect(secondWindCard).toBeVisible();
  await secondWindCard.getByRole("button", { name: "Preview", exact: true }).click();
  const resolutionPreview = actionSheet.getByRole("region", { name: "Action resolution preview" });
  await expect(resolutionPreview).toContainText("Second Wind Healing");
  const secondWind = await commitReviewedUiAction(page, fighter.id, resolutionPreview.getByRole("button", { name: "Continue to final review for previewed action", exact: true }));
  await expect(statusMessage(page, new RegExp(`${fighter.name} used action`))).toBeVisible();
  expect(secondWind.prepared.resolution?.action?.kind).toBe("bonusAction");
  expect(secondWind.prepared.resolution?.auditEvents).toEqual(expect.arrayContaining([expect.objectContaining({ code: "bonus_action.used" })]));

  if (await applyEffect.isChecked()) await applyEffect.uncheck();
  if (await consumeResources.isChecked()) await consumeResources.uncheck();
  await targetSelect.selectOption({ label: target.name });
  const attackRoll = fighterSheet.quickRolls.find((roll) => roll.id.endsWith("-attack") && /Attack$/.test(roll.label));
  expect(attackRoll, "Fighter sheet has a weapon Attack action").toBeTruthy();
  const attackCard = actionSheet.locator("article").filter({ hasText: attackRoll!.label }).first();
  await attackCard.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(resolutionPreview).toContainText(attackRoll!.label);
  const attack = await commitReviewedUiAction(page, fighter.id, resolutionPreview.getByRole("button", { name: "Continue to final review for previewed action", exact: true }));
  await expect(statusMessage(page, `${fighter.name} action posted`)).toBeVisible();
  expect(attack.prepared.resolution?.action).toMatchObject({ kind: "action", ledger: { actionsUsed: 1, actionSurgeGrants: 0 } });
  expect(attack.committed.resolution?.action).toMatchObject({ kind: "action", ledger: { actionsUsed: 1, actionSurgeGrants: 0 } });
  await page.screenshot({ path: resolve(artifactRoot, "04-r04-second-wind-then-attack.png") });

  return {
    secondWind: {
      rollId: "feature-second-wind-healing",
      preparedAction: secondWind.prepared.resolution?.action,
      auditEvents: secondWind.prepared.resolution?.auditEvents,
      resourceConsumption: secondWind.prepared.resolution?.resourceConsumption,
      committedUsage: secondWind.committed.usage,
      healingEffect: secondWind.committed.effect,
    },
    sameTurnAttack: {
      rollId: attackRoll!.id,
      preparedAction: attack.prepared.resolution?.action,
      committedAction: attack.committed.resolution?.action,
      total: committedRollTotal(attack.committed),
      naturalD20: committedNaturalD20(attack.committed),
    },
  };
}

async function prepareAction(page: Page, source: ActorRecord, rollId: string, targetActorId: string, applyEffect: boolean, options: JsonObject = {}): Promise<JsonObject> {
  const route = `/api/v1/campaigns/${campaignId}/systems/${systemId}/actors/${source.id}/roll`;
  const prepared = await apiJson<JsonObject>(page, "POST", route, {
    rollId,
    targetActorId,
    applyEffect,
    consumeResources: false,
    expectedUpdatedAt: source.updatedAt,
    prepare: true,
    commit: false,
    ...options,
  });
  expect(prepared.body.status, JSON.stringify(prepared.body)).toBe("ready");
  return prepared.body;
}

async function commitPreparedAction(page: Page, sourceActorId: string, prepared: JsonObject): Promise<JsonObject> {
  const route = `/api/v1/campaigns/${campaignId}/systems/${systemId}/actors/${sourceActorId}/roll`;
  const preparation = prepared.preparation as {
    preparedPreviewKey: string;
    sourceActorId: string;
    revisions: { actorUpdatedAt: Record<string, string> };
  };
  return (await apiJson<JsonObject>(page, "POST", route, {
    preparedPreviewKey: preparation.preparedPreviewKey,
    expectedUpdatedAt: preparation.revisions.actorUpdatedAt[preparation.sourceActorId],
  })).body;
}

async function prepareAndCommitAction(page: Page, source: ActorRecord, rollId: string, targetActorId: string, applyEffect: boolean, options: JsonObject = {}): Promise<JsonObject> {
  const prepared = await prepareAction(page, source, rollId, targetActorId, applyEffect, options);
  return { prepared, committed: await commitPreparedAction(page, source.id, prepared) };
}

function findPairedAttack(sheet: ActorSheet): { attack: QuickRoll; damage: QuickRoll } | undefined {
  const pairs = sheet.quickRolls.flatMap((attack) => {
    if (!attack.id.endsWith("-attack") || !/Attack$/.test(attack.label)) return [];
    const prefix = attack.id.slice(0, -"-attack".length);
    const damage = sheet.quickRolls.find((candidate) => candidate.id === `${prefix}-damage` && /Damage$/.test(candidate.label));
    return damage ? [{ attack, damage }] : [];
  });
  return pairs.find((pair) => pair.attack.id.startsWith("monster-"))
    ?? pairs.find((pair) => pair.attack.id.startsWith("item-"))
    ?? pairs.find((pair) => pair.attack.id.startsWith("spell-"))
    ?? pairs[0];
}

function pairedAttack(sheet: ActorSheet): { attack: QuickRoll; damage: QuickRoll } {
  const preferred = findPairedAttack(sheet);
  if (!preferred) throw new Error("No paired Attack and Damage actions were available on the current actor sheet");
  return preferred;
}

function directOffensiveAction(sheet: ActorSheet): QuickRoll | undefined {
  return sheet.quickRolls.find((roll) => roll.id.endsWith("-damage") && /Damage$/.test(roll.label) && roll.metadata?.activation !== "on-hit");
}

function hitPoints(actor: ActorRecord | undefined): { current: number; max: number } {
  const hp = actor?.data.hp as { current?: number; max?: number } | undefined;
  return { current: Number(hp?.current ?? 0), max: Number(hp?.max ?? 0) };
}

function actorToken(state: SnapshotRecord, actorId: string): JsonObject & { id: string; x: number; y: number } {
  const token = state.tokens.find((candidate) => candidate.actorId === actorId && Number.isFinite(Number(candidate.x)) && Number.isFinite(Number(candidate.y)));
  if (!token) throw new Error(`Actor ${actorId} has no positioned scene token`);
  return token as unknown as JsonObject & { id: string; x: number; y: number };
}

function gridDistanceFt(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return Math.max(Math.abs(Number(left.x) - Number(right.x)), Math.abs(Number(left.y) - Number(right.y))) / 50 * 5;
}

function attackRangeFt(actor: ActorRecord): number {
  if (actor.data.class === "Wizard") return 120;
  if (actor.data.class === "Rogue") return 20;
  return 5;
}

function committedRollTotal(response: JsonObject): number {
  return Number(response.roll?.total ?? response.rolls?.[0]?.total ?? 0);
}

function committedNaturalD20(response: JsonObject): number | undefined {
  const terms = response.roll?.terms ?? response.rolls?.[0]?.terms;
  if (!Array.isArray(terms)) return undefined;
  for (const candidate of terms) {
    if (!candidate || typeof candidate !== "object") continue;
    const term = candidate as { type?: unknown; sides?: unknown; count?: unknown; results?: unknown; kept?: unknown };
    if (term.type !== "die" || term.sides !== 20) continue;
    const kept = Array.isArray(term.kept) ? term.kept.filter((value): value is number => typeof value === "number") : [];
    if (kept.length === 1) return kept[0];
    const results = Array.isArray(term.results) ? term.results.filter((value): value is number => typeof value === "number") : [];
    if (term.count === 1 && results.length === 1) return results[0];
  }
  return undefined;
}

function nextTurn(combat: CombatRecord): { turnIndex: number; round: number } {
  if (combat.combatants.length === 0 || combat.combatants.every((combatant) => combatant.defeated)) return { turnIndex: combat.turnIndex, round: combat.round };
  let turnIndex = combat.turnIndex;
  let round = combat.round;
  for (let count = 0; count < combat.combatants.length; count += 1) {
    turnIndex += 1;
    if (turnIndex >= combat.combatants.length) {
      turnIndex = 0;
      round += 1;
    }
    if (!combat.combatants[turnIndex]?.defeated) return { turnIndex, round };
  }
  return { turnIndex: combat.turnIndex, round: combat.round };
}

async function advanceCombatApi(page: Page, combat: CombatRecord): Promise<CombatRecord> {
  const next = nextTurn(combat);
  return (await apiJson<CombatRecord>(page, "PATCH", `/api/v1/combats/${combat.id}`, {
    expectedUpdatedAt: combat.updatedAt,
    ...next,
  })).body;
}

async function runCombatToDefeat(page: Page, partyActorIds: Set<string>, hostileActorIds: Set<string>): Promise<{ turns: JsonObject[]; finalCombat: CombatRecord; finalSnapshot: SnapshotRecord }> {
  const turnLog: JsonObject[] = [];
  const sheetCache = new Map<string, ActorSheet>();
  let state = await snapshot(page);
  let combat = state.combats.find((candidate) => candidate.active)!;
  let partyTargetIndex = 0;

  for (let step = 0; step < 60; step += 1) {
    const livingHostiles = combat.combatants.filter((combatant) => combatant.actorId && hostileActorIds.has(combatant.actorId) && !combatant.defeated);
    if (livingHostiles.length === 0) return { turns: turnLog, finalCombat: combat, finalSnapshot: state };
    const livingParty = combat.combatants.filter((combatant) => combatant.actorId && partyActorIds.has(combatant.actorId) && !combatant.defeated);
    if (livingParty.length === 0) throw new Error("The full level-3 party was defeated before the hostile encounter completed");

    const current = combat.combatants[combat.turnIndex];
    if (!current?.actorId || current.defeated) {
      combat = await advanceCombatApi(page, combat);
      state = await snapshot(page);
      continue;
    }
    const source = state.actors.find((actor) => actor.id === current.actorId);
    if (!source) throw new Error(`Combatant ${current.name} has no linked actor`);
    const sourceIsParty = partyActorIds.has(source.id);
    if (sourceIsParty && source.data.class !== "Rogue" && !turnLog.some((turn) => turn.triggeredFeatureRollId === "feature-sneak-attack-damage")) {
      turnLog.push({ step, round: combat.round, turnIndex: combat.turnIndex, sourceActorId: source.id, source: source.name, side: "party", resolutionMode: "take-no-action-for-sneak-attack-coverage" });
      combat = await advanceCombatApi(page, combat);
      state = await snapshot(page);
      continue;
    }
    const sourceToken = actorToken(state, source.id);
    const maximumRangeFt = attackRangeFt(source);
    const inRangeTargets = (sourceIsParty ? livingHostiles : livingParty).filter((candidate) => candidate.actorId && gridDistanceFt(sourceToken, actorToken(state, candidate.actorId)) <= maximumRangeFt);
    const targetCombatant = sourceIsParty ? inRangeTargets[0] : inRangeTargets[partyTargetIndex++ % inRangeTargets.length];
    if (!targetCombatant?.actorId) throw new Error(`No living ${sourceIsParty ? "hostile" : "party"} target was available for ${source.name}`);
    const target = state.actors.find((actor) => actor.id === targetCombatant.actorId);
    if (!target) throw new Error(`Target combatant ${targetCombatant.name} has no linked actor`);
    const targetToken = actorToken(state, target.id);
    const distanceFt = gridDistanceFt(sourceToken, targetToken);
    expect(distanceFt, `${source.name} must use an attack that can reach ${target.name}`).toBeLessThanOrEqual(maximumRangeFt);
    const adjacentQualifyingAlly = source.data.class === "Rogue" && livingParty.some((candidate) =>
      candidate.actorId && candidate.actorId !== source.id && gridDistanceFt(actorToken(state, candidate.actorId), targetToken) <= 5
    );
    let sheet = sheetCache.get(source.id);
    if (!sheet) {
      sheet = await actorSheet(page, source.id);
      sheetCache.set(source.id, sheet);
    }
    let targetSheet = sheetCache.get(target.id);
    if (!targetSheet) {
      targetSheet = await actorSheet(page, target.id);
      sheetCache.set(target.id, targetSheet);
    }
    const pair = findPairedAttack(sheet);
    const direct = pair ? undefined : directOffensiveAction(sheet);
    if (!pair && !direct) {
      throw new Error(`${source.name} has no legal paired Attack/Damage or direct damage action; available actions: ${sheet.quickRolls.filter((roll) => /Attack|Damage/.test(roll.label)).map((roll) => `${roll.id}:${roll.label}`).join(", ") || "none"}`);
    }
    const targetBefore = hitPoints(target);
    const targetArmorClass = Number(targetSheet.data.armorClass ?? target.data.armorClass ?? 10);
    let attack: JsonObject | undefined;
    let damage: JsonObject | undefined;
    let triggeredFeature: JsonObject | undefined;
    let attackTotal: number | undefined;
    let hit: boolean | undefined;
    let save: JsonObject | undefined;
    if (pair) {
      attack = await prepareAndCommitAction(page, source, pair.attack.id, target.id, false, adjacentQualifyingAlly ? { sneakAttackEligible: true } : {});
      state = await snapshot(page);
      combat = state.combats.find((candidate) => candidate.active)!;
      attackTotal = committedRollTotal(attack.committed);
      const naturalD20 = committedNaturalD20(attack.committed);
      if (source.data.class === "Rogue") {
        expect(adjacentQualifyingAlly, "Sneak Attack coverage requires a non-incapacitated ally adjacent to the target").toBe(true);
        expect(String(attack.committed.resolution?.rolls?.[0]?.d20Mode ?? "normal")).not.toBe("disadvantage");
      }
      hit = naturalD20 !== 1 && (naturalD20 === 20 || attackTotal >= targetArmorClass);
      if (hit) {
        const sourceAfterAttack = state.actors.find((actor) => actor.id === source.id)!;
        damage = await prepareAndCommitAction(page, sourceAfterAttack, pair.damage.id, target.id, true);
        expect(damage.committed.resolution?.action?.kind).toBe("free");
        state = await snapshot(page);
        combat = state.combats.find((candidate) => candidate.active)!;
        const sneakAttack = source.data.class === "Rogue" ? sheet.quickRolls.find((roll) => roll.id === "feature-sneak-attack-damage") : undefined;
        if (sneakAttack) {
          const sourceAfterDamage = state.actors.find((actor) => actor.id === source.id)!;
          const triggeringItem = state.items.find((item) => pair.damage.id === `item-${item.id}-damage` || pair.damage.id === `spell-${item.id}-damage`);
          const inheritedDamageType = typeof pair.damage.metadata?.damageType === "string" ? pair.damage.metadata.damageType : typeof triggeringItem?.data?.damageType === "string" ? triggeringItem.data.damageType : undefined;
          expect(inheritedDamageType, "Sneak Attack must inherit the triggering weapon's damage type").toBeTruthy();
          triggeredFeature = await prepareAndCommitAction(page, sourceAfterDamage, sneakAttack.id, target.id, true);
          expect(triggeredFeature.committed.resolution?.action).toMatchObject({ kind: "free", metadata: { activation: "on-hit", damageType: inheritedDamageType!.toLowerCase() } });
          state = await snapshot(page);
          combat = state.combats.find((candidate) => candidate.active)!;
        }
      }
    } else {
      const saveMetadata = direct!.metadata?.save as { ability?: string; dc?: number; success?: string } | undefined;
      const saveOutcomes: Record<string, "success" | "failure"> = {};
      if (saveMetadata?.ability && Number.isFinite(Number(saveMetadata.dc))) {
        const saveRoll = targetSheet.quickRolls.find((roll) => roll.id === `save-${saveMetadata.ability}`);
        if (!saveRoll) throw new Error(`${target.name} has no ${saveMetadata.ability} saving throw for ${direct!.label}`);
        const saved = await apiJson<JsonObject>(page, "POST", `/api/v1/campaigns/${campaignId}/systems/${systemId}/actors/${target.id}/roll`, {
          rollId: saveRoll.id,
          consumeResources: false,
          applyEffect: false,
          expectedUpdatedAt: target.updatedAt,
        });
        const saveTotal = committedRollTotal(saved.body);
        const outcome = saveTotal >= Number(saveMetadata.dc) ? "success" : "failure";
        saveOutcomes[target.id] = outcome;
        save = { rollId: saveRoll.id, formula: saveRoll.formula, total: saveTotal, dc: Number(saveMetadata.dc), outcome, successEffect: saveMetadata.success };
      }
      damage = await prepareAndCommitAction(page, source, direct!.id, target.id, true, Object.keys(saveOutcomes).length > 0 ? { saveOutcomes } : {});
      state = await snapshot(page);
      combat = state.combats.find((candidate) => candidate.active)!;
    }
    const targetAfter = hitPoints(state.actors.find((actor) => actor.id === target.id));
    const syncedCombatant = combat.combatants.find((combatant) => combatant.actorId === target.id);
    turnLog.push({
      step: step + 1,
      round: combat.round,
      turnIndex: combat.turnIndex,
      sourceActorId: source.id,
      source: source.name,
      side: sourceIsParty ? "party" : "hostile",
      targetActorId: target.id,
      target: target.name,
      distanceFt,
      maximumRangeFt,
      sneakAttackEligible: adjacentQualifyingAlly,
      resolutionMode: pair ? "paired-attack-damage" : "direct-damage-or-save",
      attackRollId: pair?.attack.id,
      attackLabel: pair?.attack.label,
      attackFormula: pair?.attack.formula,
      attackTotal,
      targetArmorClass,
      hit,
      attackAction: attack?.committed.resolution?.action,
      save,
      damageRollId: pair ? (hit ? pair.damage.id : undefined) : direct!.id,
      damageLabel: pair ? (hit ? pair.damage.label : undefined) : direct!.label,
      damageFormula: pair ? (hit ? pair.damage.formula : undefined) : direct!.formula,
      damageTotal: damage ? committedRollTotal(damage.committed) : undefined,
      damageAction: damage?.committed.resolution?.action,
      triggeredFeatureRollId: triggeredFeature ? "feature-sneak-attack-damage" : undefined,
      triggeredFeatureTotal: triggeredFeature ? committedRollTotal(triggeredFeature.committed) : undefined,
      triggeredFeatureAction: triggeredFeature?.committed.resolution?.action,
      hpBefore: targetBefore.current,
      hpAfter: targetAfter.current,
      damageApplied: Math.max(0, targetBefore.current - targetAfter.current),
      defeated: Boolean(syncedCombatant?.defeated),
    });

    if (combat.combatants.filter((combatant) => combatant.actorId && hostileActorIds.has(combatant.actorId)).every((combatant) => combatant.defeated)) {
      return { turns: turnLog, finalCombat: combat, finalSnapshot: state };
    }
    combat = await advanceCombatApi(page, combat);
    state = await snapshot(page);
  }
  throw new Error("Combat did not defeat every hostile within 60 resolved turns");
}

function issueMarkdown(evidence: JsonObject): string {
  const issues = evidence.observedIssues as JsonObject[];
  const issueLines = issues.length === 0
    ? evidence.status === "passed"
      ? ["- No blocking product issue was observed in this journey."]
      : [`- **Journey failed** - ${String(evidence.failure?.message ?? "Inspect evidence.json and the retained Playwright trace.").split("\n")[0]}`]
    : issues.map((issue) => `- **${issue.id}: ${issue.title}** - ${issue.detail}`);
  return [
    "# Full level-3 combat journey issues",
    "",
    `Run: ${evidence.runId}`,
    `Status: ${evidence.status}`,
    "",
    "## R-04 result",
    "",
    evidence.r04
      ? "Second Wind committed as a Bonus Action, then a weapon Attack committed in the same fighter turn with the standard-action ledger at 1/1."
      : "The R-04 checkpoint did not complete; inspect evidence.json and the retained Playwright trace.",
    "",
    "## Observed issues",
    "",
    ...issueLines,
    "",
    "## Evidence",
    "",
    "- `evidence.json` contains actor sheets, placement IDs, exact R-04 resolver output, every damage turn, HP deltas, and final combat state.",
    "- PNG files capture the generated map, all four character sheets, party/enemy placement, R-04 completion, hostile defeat, and ended combat.",
    "- `test-results/` contains the Playwright trace (and failure video/screenshot when applicable).",
    "",
  ].join("\n");
}

test("generated map, four legal level-3 sheets, encounter placement, R-04, and combat completion", async ({ page }) => {
  mkdirSync(artifactRoot, { recursive: true });
  const evidence: JsonObject = {
    runId: randomUUID(),
    startedAt: new Date().toISOString(),
    status: "running",
    environment: { apiBaseUrl, webBaseUrl: process.env.OTTE_E2E_WEB_PORT ? `http://127.0.0.1:${process.env.OTTE_E2E_WEB_PORT}` : "configured Playwright baseURL" },
    generatedMap: undefined,
    characters: [],
    longRestReviews: [],
    spellPreparationReviews: [],
    encounter: undefined,
    r04: undefined,
    combatTurns: [],
    finalCombat: undefined,
    observedIssues: [],
    resolvedIssues: [],
    browserErrors: [],
  };
  const browserErrors: string[] = evidence.browserErrors;
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(`console.error: ${message.text()}`); });

  try {
    await loginAsDemoGm(page);
    const initialState = await snapshot(page);
    const fixedNameCollisions = [
      ...initialState.scenes.filter((scene) => scene.name === sceneName).map((scene) => `scene:${scene.id}`),
      ...initialState.assets.filter((asset) => asset.name === mapName).map((asset) => `asset:${asset.id}`),
      ...initialState.actors.filter((actor) => characters.some((definition) => definition.name === actor.name)).map((actor) => `actor:${actor.id}`),
    ];
    expect(fixedNameCollisions, "the full-combat config requires a fresh seeded server; restart before a reused-server rerun").toEqual([]);
    const generated = await createGeneratedSceneAndMap(page);
    evidence.generatedMap = {
      generator: "deterministic SVG dungeon generator embedded in the journey",
      assetId: generated.asset.id,
      assetName: generated.asset.name,
      sceneId: generated.scene.id,
      sceneName: generated.scene.name,
      backgroundAssetId: generated.scene.backgroundAssetId,
      dimensions: { width: 1200, height: 800, gridSize: 50 },
    };
    await page.screenshot({ path: resolve(artifactRoot, "01-generated-map.png") });

    const actorRecords: ActorRecord[] = [];
    for (const definition of characters) actorRecords.push(await createLevelThreeCharacter(page, definition));
    for (let index = 0; index < actorRecords.length; index += 1) {
      actorRecords[index] = await ensurePairedCombatEquipment(page, actorRecords[index]!, characters[index]!);
    }
    for (let index = 0; index < actorRecords.length; index += 1) {
      const rested = await completeReviewedLongRest(page, actorRecords[index]!);
      actorRecords[index] = rested.actor;
      evidence.longRestReviews.push({ name: actorRecords[index]!.name, rest: rested.rest });
    }
    for (let index = 0; index < actorRecords.length; index += 1) {
      const preparation = await finishLevelThreeSpellPreparation(page, actorRecords[index]!);
      actorRecords[index] = preparation.actor;
      evidence.spellPreparationReviews.push({ name: actorRecords[index]!.name, ...preparation.review });
    }
    const casterPlans = (evidence.spellPreparationReviews as JsonObject[]).filter((review) => review.applicable === true);
    expect(casterPlans).toHaveLength(2);
    for (const review of casterPlans) expect(review.plan?.capacity?.selected).toBe(review.plan?.capacity?.limit);
    evidence.resolvedIssues.push({
      id: "E2E-CHAR-01",
      title: "Level-3 caster spell advancement now owns and prepares a complete legal list",
      detail: "Reviewed advancement added canonical Cleric choices and two Wizard spellbook spells per Wizard level, retained exact item revisions and SRD provenance, and left both level-3 prepared lists at 6/6 with no follow-up preparation mutation.",
      affectedCharacters: casterPlans.map((review) => ({ name: review.name, capacity: review.plan?.capacity })),
    });
    const fighterBeforeWound = actorRecords[0];
    if (!fighterBeforeWound) throw new Error("The fighter character was not created");
    const woundedFighter = await applyTypedDamage(page, fighterBeforeWound.id, 8);
    actorRecords[0] = woundedFighter;
    evidence.characters = await verifyCharacterSheets(page, actorRecords);
    evidence.preCombatFighterHp = hitPoints(woundedFighter);

    const placed = await placeEncounterThroughUi(page, actorRecords.map((actor) => actor.name));
    const partyActorIds = new Set(actorRecords.map((actor) => actor.id));
    const hostileCombatants = placed.combat.combatants.filter((combatant) => combatant.actorId && !partyActorIds.has(combatant.actorId));
    const hostileActorIds = new Set(hostileCombatants.map((combatant) => combatant.actorId!));
    expect(hostileCombatants).toHaveLength(3);
    const firstHostile = hostileCombatants[0];
    if (!firstHostile?.actorId) throw new Error("The encounter did not produce a linked hostile actor");
    const initiallyPlacedPartyTokens = placed.snapshot.tokens.filter((token) => token.sceneId === generated.scene.id && token.actorId && partyActorIds.has(token.actorId));
    expect(initiallyPlacedPartyTokens).toHaveLength(4);
    const formationTokens = placed.snapshot.tokens.filter((token) => token.sceneId === generated.scene.id && combatFormation[token.name]);
    expect(formationTokens).toHaveLength(7);
    for (const token of formationTokens) {
      const position = combatFormation[token.name]!;
      await apiJson<JsonObject>(page, "PATCH", `/api/v1/tokens/${token.id}`, {
        ...position,
        ...(token.actorId && partyActorIds.has(token.actorId) ? { ownerUserIds: ["usr_demo_player"] } : {}),
        expectedUpdatedAt: token.updatedAt,
      });
    }
    const playerPermissionState = await snapshot(page);
    const placedPartyTokens = playerPermissionState.tokens.filter((token) => token.sceneId === generated.scene.id && token.actorId && partyActorIds.has(token.actorId));
    expect(placedPartyTokens).toHaveLength(4);
    for (const token of placedPartyTokens) {
      expect(token.ownerUserIds).toContain("usr_demo_player");
      expect({ x: token.x, y: token.y }).toEqual(combatFormation[token.name]);
    }
    for (const token of playerPermissionState.tokens.filter((candidate) => candidate.sceneId === generated.scene.id && candidate.actorId && hostileActorIds.has(candidate.actorId))) {
      expect({ x: token.x, y: token.y }).toEqual(combatFormation[token.name]);
    }
    evidence.encounter = {
      name: encounterName,
      combatId: placed.combat.id,
      round: placed.combat.round,
      currentCombatant: placed.combat.combatants[placed.combat.turnIndex],
      party: placed.combat.combatants.filter((combatant) => combatant.actorId && partyActorIds.has(combatant.actorId)),
      hostiles: hostileCombatants,
      playerControlledPartyTokens: placedPartyTokens,
      sceneTokens: playerPermissionState.tokens.filter((token) => token.sceneId === generated.scene.id && token.actorId && (partyActorIds.has(token.actorId) || hostileActorIds.has(token.actorId))),
    };

    const fighterRecord = actorRecords[0]!;
    const fighterSheet = await actorSheet(page, fighterRecord.id);
    const hostileTarget = playerPermissionState.actors.find((actor) => actor.id === firstHostile.actorId)!;
    const openingDistanceFt = gridDistanceFt(actorToken(playerPermissionState, fighterRecord.id), actorToken(playerPermissionState, hostileTarget.id));
    expect(openingDistanceFt, "the R-04 Greatsword Attack target must be within melee reach").toBeLessThanOrEqual(5);
    evidence.r04 = { ...(await exerciseSecondWindThenAttack(page, fighterRecord, fighterSheet, hostileTarget)), distanceFt: openingDistanceFt, maximumRangeFt: 5 };
    const healedFighter = (await snapshot(page)).actors.find((actor) => actor.id === fighterRecord.id);
    evidence.postSecondWindFighterHp = hitPoints(healedFighter);
    expect(evidence.postSecondWindFighterHp.current).toBeGreaterThan(evidence.preCombatFighterHp.current);

    const fighterPair = pairedAttack(fighterSheet);
    let postAttackState = await snapshot(page);
    const currentFighter = postAttackState.actors.find((actor) => actor.id === fighterRecord.id)!;
    const targetBeforeOpeningDamage = hitPoints(postAttackState.actors.find((actor) => actor.id === hostileTarget.id));
    const openingAttackTotal = Number(evidence.r04.sameTurnAttack.total ?? 0);
    const openingNaturalD20 = Number(evidence.r04.sameTurnAttack.naturalD20 ?? Number.NaN);
    const openingTargetArmorClass = Number(hostileTarget.data.armorClass ?? 10);
    const openingHit = openingNaturalD20 !== 1 && (openingNaturalD20 === 20 || openingAttackTotal >= openingTargetArmorClass);
    // A miss deliberately probes the rejected on-hit continuation. Use the
    // context request client so that this expected 409 is evidence, not a
    // misleading browser console error.
    const sameTurnDamageProbe = await apiJsonWithoutBrowserConsole<JsonObject>(
      page,
      "POST",
      `/api/v1/campaigns/${campaignId}/systems/${systemId}/actors/${currentFighter.id}/roll`,
      {
        rollId: fighterPair.damage.id,
        targetActorId: hostileTarget.id,
        applyEffect: true,
        consumeResources: false,
        expectedUpdatedAt: currentFighter.updatedAt,
        prepare: true,
        commit: false,
      },
      openingHit ? [200] : [409],
    );
    evidence.r04.sameTurnDamageProbe = { status: sameTurnDamageProbe.status, body: sameTurnDamageProbe.body };
    if (openingHit && sameTurnDamageProbe.status === 409) {
      evidence.observedIssues.push({
        id: "E2E-01",
        title: "Paired weapon damage regressed to a second standard Action",
        detail: "After the valid same-turn Second Wind + Attack sequence, the matching weapon Damage preparation was rejected instead of resolving as the on-hit continuation of that Attack.",
        response: sameTurnDamageProbe.body,
      });
    }
    expect(sameTurnDamageProbe.status, JSON.stringify(sameTurnDamageProbe.body)).toBe(openingHit ? 200 : 409);
    if (openingHit) {
      expect(sameTurnDamageProbe.body.status).toBe("ready");
      expect(sameTurnDamageProbe.body.resolution?.action).toMatchObject({ kind: "free", metadata: { activation: "on-hit" } });
    } else expect(String(sameTurnDamageProbe.body.message)).toContain("matching predecessor");
    let openingDamage: JsonObject | undefined;
    if (openingHit) {
      openingDamage = await commitPreparedAction(page, currentFighter.id, sameTurnDamageProbe.body);
      expect(openingDamage.resolution?.action?.kind).toBe("free");
      postAttackState = await snapshot(page);
    }
    const targetAfterOpeningDamage = hitPoints(postAttackState.actors.find((actor) => actor.id === hostileTarget.id));
    const openingTurn = {
      step: 0,
      round: placed.combat.round,
      turnIndex: placed.combat.turnIndex,
      sourceActorId: currentFighter.id,
      source: currentFighter.name,
      side: "party",
      targetActorId: hostileTarget.id,
      target: hostileTarget.name,
      attackRollId: fighterPair.attack.id,
      attackTotal: openingAttackTotal,
      targetArmorClass: openingTargetArmorClass,
      hit: openingHit,
      attackAction: evidence.r04.sameTurnAttack.committedAction,
      damageRollId: openingHit ? fighterPair.damage.id : undefined,
      damageTotal: openingDamage ? committedRollTotal(openingDamage) : undefined,
      damageAction: openingDamage?.resolution?.action,
      hpBefore: targetBeforeOpeningDamage.current,
      hpAfter: targetAfterOpeningDamage.current,
      damageApplied: Math.max(0, targetBeforeOpeningDamage.current - targetAfterOpeningDamage.current),
      defeated: postAttackState.combats.find((combat) => combat.active)?.combatants.find((combatant) => combatant.actorId === hostileTarget.id)?.defeated ?? false,
    };

    const combatAfterOpeningAction = postAttackState.combats.find((combat) => combat.active);
    if (!combatAfterOpeningAction) throw new Error("Combat disappeared after the opening fighter action");
    await advanceCombatApi(page, combatAfterOpeningAction);

    const resolved = await runCombatToDefeat(page, partyActorIds, hostileActorIds);
    evidence.combatTurns = [openingTurn, ...resolved.turns];
    evidence.finalCombat = resolved.finalCombat;
    const allHostilesDefeated = resolved.finalCombat.combatants.filter((combatant) => combatant.actorId && hostileActorIds.has(combatant.actorId)).every((combatant) => combatant.defeated);
    expect(allHostilesDefeated).toBe(true);
    expect(resolved.turns.some((turn) => turn.side === "party" && turn.damageApplied > 0)).toBe(true);
    expect(resolved.turns.some((turn) => turn.side === "hostile" && turn.attackAction?.kind === "action")).toBe(true);
    const sneakAttackTurn = resolved.turns.find((turn) => turn.triggeredFeatureRollId === "feature-sneak-attack-damage");
    expect(sneakAttackTurn, "combat must execute Rogue Sneak Attack at least once").toBeDefined();
    expect(sneakAttackTurn?.triggeredFeatureAction, "Sneak Attack must be classified as a free on-hit action").toMatchObject({
      kind: "free",
      metadata: { activation: "on-hit" },
    });
    evidence.sneakAttack = {
      executed: true,
      step: sneakAttackTurn?.step,
      round: sneakAttackTurn?.round,
      total: sneakAttackTurn?.triggeredFeatureTotal,
      action: sneakAttackTurn?.triggeredFeatureAction,
    };

    await page.reload();
    await expect(page.getByRole("heading", { name: "The Ember Vault", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Live Table", exact: true }).click();
    await openInspectorPanel(page, "Combat");
    const finalPanel = page.locator(".inspector .panel-stack").filter({ has: page.locator(".combat-hero") });
    await expect(finalPanel.getByRole("heading", { name: new RegExp(`Round ${resolved.finalCombat.round}`) })).toBeVisible();
    await expect(finalPanel).toContainText("3 defeated");
    await expect(finalPanel.getByRole("button", { name: /Goblin Warrior \d+ Defeated - dead/ })).toHaveCount(3);
    await page.screenshot({ path: resolve(artifactRoot, "05-all-hostiles-defeated.png") });

    const endResponse = page.waitForResponse((response) => response.request().method() === "DELETE" && /\/api\/v1\/combats\/[^/]+$/.test(new URL(response.url()).pathname));
    await finalPanel.getByRole("button", { name: "End combat", exact: true }).click();
    await finalPanel.getByRole("button", { name: "Confirm end combat", exact: true }).click();
    const ended = await endResponse;
    expect(ended.ok(), await ended.text()).toBeTruthy();
    await expect(finalPanel.getByRole("heading", { name: "No Active Combat", exact: true })).toBeVisible();
    await page.screenshot({ path: resolve(artifactRoot, "06-combat-ended.png") });
    evidence.endedCombat = await ended.json();
    expect(browserErrors, "the full combat journey must not emit browser console or page errors").toEqual([]);
    evidence.status = "passed";
  } catch (error) {
    evidence.status = "failed";
    evidence.failure = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
    throw error;
  } finally {
    evidence.finishedAt = new Date().toISOString();
    if (browserErrors.length > 0) {
      evidence.observedIssues.push({
        id: "E2E-RUNTIME",
        title: "Browser runtime errors were observed",
        detail: `${browserErrors.length} console or page error(s) were captured. See browserErrors in evidence.json.`,
      });
    }
    writeFileSync(resolve(artifactRoot, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    writeFileSync(resolve(artifactRoot, "issues.md"), issueMarkdown(evidence), "utf8");
  }
});
