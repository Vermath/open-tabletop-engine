# External systems with declarative-v1

`declarative-v1` lets an external JSON package describe bounded actor and item data, actor sheet fields, dice rolls, and fixed resource costs. The trusted host interprets these declarations and applies the caller's normal permissions. Packages provide no JavaScript, functions, remote schema references, or executable entrypoints.

This guide describes the workspace implementation. `@open-tabletop/system-sdk` and `@open-tabletop/api-client` are currently private workspace packages and still depend on `@open-tabletop/core`. Their package license labels do not establish a standalone permissive dependency closure. Publishing and any dependency or licensing changes require separate review and the user's approval.

## Original example: Lantern Road

[Lantern Road's complete manifest](../../packages/system-sdk/examples/lantern-road/system.json) describes surveyors charting a route between isolated settlements. It is original example content and does not contain D&D material.

- A `surveyor` has Wits and Grit from 0 to 4, and Stamina from 0 to 6. Defaults are Wits 2, Grit 1, Stamina 6.
- **Survey the route** rolls `2d6 + Wits` without a resource cost.
- **Press on** rolls `2d6 + Grit` and always spends one Stamina. It is unavailable when the resulting balance would violate the actor schema.
- A `kit` item has integer weight from 0 to 20 and quality `basic` or `refined`.

For a small table exercise, interpret 10 or more as a clear route, 7–9 as a route with a complication, and 6 or less as a new obstacle. Those narrative outcomes are table guidance; this package automates the dice and the declared Stamina cost only. Item quality and weight are stored data, with no implied equipment bonus.

The manifest uses empty `entrypoints`, inline `schemas.actor` and `schemas.item`, and `definition.kind: "declarative-v1"`. Its sheet lists explicit paths beneath `actor.data`; a path such as `["stamina"]` cannot address actor ownership, campaign membership, or other metadata.

## Supported definitions and limits

| Part | Supported shape or limit |
| --- | --- |
| Complete executable manifest | At most 65,536 bytes of inert JSON |
| Object schemas | Four object levels including the root; 64 declared properties across actor and item schemas; `additionalProperties: false` |
| Scalar schemas | `integer`, `number`, `string`, or `boolean`; numeric types require finite minimum and maximum; strings require `maxLength` from 0 to 1,000 |
| Enums | 1–16 unique values of the scalar's declared type |
| Actor and item types | 1–32 unique lowercase kebab-case identifiers per list, each at most 64 characters |
| Sheet fields | At most 32 fields; path, label, and boolean `editable` are required |
| Data paths | 1–4 safe own-property segments, each at most 128 characters; prototype-related names are rejected |
| Quick rolls | At most 32; fixed dice count 1–20; sides 4, 6, 8, 10, 12, 20, or 100 |
| Roll bonus | A safe integer plus at most four declared numeric actor-field paths; the whole roll must stay within safe-integer bounds |
| Resource cost | One fixed positive safe-integer amount at a nonnegative integer actor-data field |

Defaults must satisfy their schemas. Roll modifiers and resource fields must exist in those defaults and be safe integers. The runtime validates complete candidate data without coercion or silently inserting defaults into an update. Unknown schema keywords, arrays as field types, code entrypoints, and remote references are rejected.

Capabilities are derived from the definition: `data-model` is always available; nonempty sheet fields support `actor-sheet`; quick rolls support `quick-rolls`; and a declared cost supports `actions`. Manifest claims cannot add unsupported features such as rest automation, conditions, advancement, or a compendium. `editable` and a quick roll's `available` flag describe the UI and data, respectively; neither grants authorization.

## Validate the actual package

From the repository root, run:

```sh
pnpm --filter @open-tabletop/system-sdk exec vitest run src/declarative-example.test.ts
```

Verified on 2026-09-06: **1 test passed**. The test loads the actual Lantern Road JSON, calls the SDK's `validateSystemManifest`, and checks both defaults with `validateDeclarativeSystemData`. The validation calls are:

```ts
validateSystemManifest(manifest);
const actorIssues = validateDeclarativeSystemData(
  manifest.schemas.actor, manifest.definition.actorDefaults,
);
const itemIssues = validateDeclarativeSystemData(
  manifest.schemas.item, manifest.definition.itemDefaults,
);
// Verified result: actorIssues = [], itemIssues = [].
```

Passing these checks verifies this package's format and defaults. It does not replace host permission, revision, persistence, or browser integration tests.

## Register, bind, and choose the campaign default

Use the public REST API or the matching workspace TypeScript client. Supply the session token through the normal authenticated client. Each mutation needs a distinct `Idempotency-Key` for one logical operation. Save its exact body and key before sending; retry an uncertain request with the same body and key.

1. **Register the immutable package.** `POST /api/v1/systems/install` requires server-admin authority, `campaign.update` for the explicit campaign context, and an idempotency key. The body is `{ campaignId, manifest }`. Registration adds an installed version; it does not switch an existing campaign's binding or default.

   ```ts
   const registered = await client.registerSystem(
     campaignId, manifest, "lantern-road-install-v1-run-1",
   );
   const identity = registered.installedVersions?.find(
     (entry) => entry.version === manifest.version,
   );
   if (!identity) throw new Error("Installed version identity is missing");
   ```

   A `SystemManifestIdentity` is `{ systemId, version, checksum }`. The checksum is 64 lowercase hexadecimal characters: SHA-256 over the complete manifest with recursively sorted object keys. Use the server-returned identity. The same system ID and version cannot be replaced with different content. A changed package needs a new version and registration.

2. **Bind the exact version.** A GM calls `POST /api/v1/campaigns/{campaignId}/systems/{systemId}/binding` with `campaign.update`, the exact campaign revision, the exact requested identity, and the prior identity or `null` for its first binding.

   ```ts
   const campaign = await client.campaign(campaignId);
   const bound = await client.bindCampaignSystem(campaignId, manifest.id, {
     expectedUpdatedAt: campaign.updatedAt,
     system: identity,
     expectedBinding:
       campaign.systemBindings?.find((entry) => entry.systemId === manifest.id)
       ?? null,
   }, { idempotencyKey: "lantern-road-bind-v1-run-1" });
   ```

   The response is `{ campaign, binding }`. The host checks existing actors and items against the selected definition before accepting a version change. A mismatched campaign revision or prior binding conflicts; invalid existing data produces structured validation issues.

3. **Choose the campaign default when desired.** The existing activation route remains separate: `POST /api/v1/campaigns/{campaignId}/systems/{systemId}/install`. Its name refers to campaign activation, not server package registration. It requires `campaign.update`, `expectedUpdatedAt`, and an idempotency key. An external executable system must already have a valid binding.

   ```ts
   const activated = await client.installSystem(
     campaignId, manifest.id, bound.campaign.updatedAt,
     "lantern-road-activate-v1-run-1",
   );
   ```

   Binding alone does not change `defaultSystemId`. Existing actors retain their `systemId` when the default changes.

## Create an actor and edit a captured sheet

`POST /api/v1/campaigns/{campaignId}/actors` requires `actor.create`, the current campaign revision, and an idempotency key. Omit `data` to use the bound package's actor defaults; omitting `type` selects its first actor type. If you supply data, supply a complete valid object. Item creation follows the same rule using `itemDefaults` and the normal item route.

```ts
const campaign = await client.campaign(campaignId);
const actor = await client.createActor(campaignId, {
  expectedUpdatedAt: campaign.updatedAt,
  systemId: "lantern-road",
  type: "surveyor",
  name: "Mara of the North Road",
  // ownerUserId may name an eligible member of this campaign.
  // data is omitted so the host supplies Wits 2, Grit 1, Stamina 6.
}, "lantern-road-create-mara-run-1");
const sheet = await client.systemActorSheet(campaignId, actor.systemId, actor.id);
if (sheet.kind !== "declarative-v1") throw new Error("Expected a declarative sheet");
```

The sheet returns its `actorUpdatedAt`, exact `system` identity, fields, and quick rolls. Read access to private actor data is required. Capture an actor snapshot and matching sheet revision when the editor opens, and keep that revision with the draft. On save, send the complete candidate `data` through `PATCH /api/v1/actors/{actorId}` with that captured revision and a fresh logical-operation key:

```ts
if (actor.updatedAt !== sheet.actorUpdatedAt) throw new Error("Reload the actor before editing");
const draft = structuredClone(actor.data);
draft.wits = 3;
const updated = await client.updateActor(actor.id, {
  data: draft,
  expectedUpdatedAt: sheet.actorUpdatedAt,
}, "lantern-road-save-mara-run-1");
```

Normal owned-actor or GM update permissions still apply. A `409` means the draft is stale: reload and reconcile the draft explicitly. Do not fetch a newer revision and silently attach it to an old draft. Validation failures return issue paths instead of coercing values. Refresh the sheet after a successful save.

## Roll with the exact pin and mandatory cost

Use the existing actor roll endpoint: `POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/roll`. A declarative request has exactly three keys, and every declarative roll requires an idempotency key:

```ts
const sheet = await client.systemActorSheet(campaignId, "lantern-road", actor.id);
if (sheet.kind !== "declarative-v1") throw new Error("Expected a declarative sheet");
const result = await client.rollDeclarativeSystemActor(
  campaignId, "lantern-road", actor.id,
  {
    rollId: "press-on",
    expectedActorUpdatedAt: sheet.actorUpdatedAt,
    expectedSystem: sheet.system,
  },
  { idempotencyKey: "lantern-road-press-on-run-1" },
);
```

The caller needs `actor.read`, access to the actor's private data, `dice.roll`, and `chat.write`. A cost also requires permission to update that actor. The server derives the formula and cost from the selected package and current actor. Callers cannot override dice, add arbitrary formulas, turn off a cost, or use a generic dice request to obtain this system action's resource behavior.

A successful result contains `{ roll, chat, actor, sheet, quickRoll, cost? }`. With the example defaults, Press on rolls `2d6+1` and reports cost `{ path: ["stamina"], amount: 1, before: 6, after: 5 }`. The result's sheet contains the new revision. A free Survey roll requires the same request identity and idempotency discipline, even though it does not change actor data.

An unavailable sheet roll includes issues. Its projected `cost.after` can be negative; that projection is explanatory and is never authorization to spend below the schema minimum. Attempting it returns `422 roll_unavailable`. Stale actor and system identities return `409`. Reconcile changed state before creating a new logical operation.

## Upgrade and archive dependencies

Install a changed manifest under a new version, then use the binding route with the current campaign revision and old binding. The host validates existing campaign actors and items against the new schemas and type lists. Compatible changes retain their data; defaults are not a migration script. An accepted binding change advances the campaign revision and revisions of that system's actors and items, invalidating earlier drafts even when their data values are unchanged. Selecting a previously installed version uses the same checked binding route.

Campaign archives carry the exact identity and inert manifest in `manifest.systemRequirements`, with campaign bindings in the archived campaign data. An archive cannot install or replace an executable package. A server administrator must separately register the exact dependency on the target server before import. Import checks the identity and definition against that installation and rejects missing, altered, or incompatible dependencies with `422 archive_system_dependency` or a structured system-state failure. Editing the archive to remove its dependency metadata does not grant installation authority.

## Integration verification limits

As of 2026-09-06, the example passes native SDK validation, the contract/client package checks have passed, and the full API boots with its executable OpenAPI validation enabled. Permission, version-switching, archive, browser, and persistence checks are separate integration evidence; a format check is not evidence that those journeys all pass.

API failure-injection atomicity verification has failed and remains under review at this documentation checkpoint. Do not claim that every failed response has been proven to leave storage, replay records, events, and resource costs unchanged. That guarantee needs passing failure-injection evidence against the final integrated implementation. Browser system-management controls are also being integrated; the public REST and SDK names above are the documented author path, without assuming a completed management UI.

Relevant implementation checks include [declarative runtime tests](../../apps/api/src/declarative-system-runtime.test.ts), [public API tests](../../apps/api/src/declarative-system-api.test.ts), [state boundary tests](../../apps/api/src/declarative-system-state.test.ts), [archive dependency tests](../../apps/api/src/declarative-system-archive.test.ts), and [atomic event finalization tests](../../apps/api/src/atomic-event-finalization.test.ts). Keep the verification statement aligned with results for the final source revision before publishing a release.
