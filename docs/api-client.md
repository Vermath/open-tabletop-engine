# API Client

`@open-tabletop/api-client` is the MIT-licensed TypeScript client for public v1 REST routes and the realtime WebSocket stream. Its shared data contracts come from the MIT-licensed `@open-tabletop/api-contracts` package; using the client does not require the AGPL platform core package.

The client is currently a private workspace package. This repository does not establish that it is available as a published package. Resolve its dependencies from the repository root using the existing pnpm workspace:

```bash
pnpm install
```

Keep the client and API contracts versions aligned. Local package archives include their production JavaScript, declarations, and license notices. Registry publication remains a separate release action; the private workspace flags are unchanged.

Create a client with either a bearer session token or the legacy development `x-user-id` header. Production integrations should use bearer tokens returned by the normal auth flow.

```ts
import { OpenTabletopClient } from "@open-tabletop/api-client";

const client = new OpenTabletopClient("https://api.example.test", {
  token: process.env.OTTE_SESSION_TOKEN
});

const campaigns = await client.listCampaigns();
const campaign = await client.createCampaign({
  name: "Friday One-Shot",
  description: "External client smoke",
  defaultSystemId: "dnd-5e-srd",
  visibility: "private"
});
```

## Realtime

Use `connectRealtime` when the runtime provides `WebSocket`, or pass a constructor for Node-based tools and tests. The helper converts `http` to `ws`, converts `https` to `wss`, attaches `campaignId`, and sends the client token through an `otte.auth.<token>` WebSocket subprotocol unless a per-call token is provided.

```ts
import type { EngineEvent } from "@open-tabletop/api-contracts";
import { OpenTabletopClient } from "@open-tabletop/api-client";

const client = new OpenTabletopClient("https://api.example.test", { token });
const socket = client.connectRealtime("camp_demo");

socket.addEventListener("message", (message) => {
  const event = client.parseRealtimeMessage<EngineEvent>(message);
  console.log(event.type, event.targetId);
});
```

Use `realtimeUrl(campaignId)` if a framework owns socket construction. Pass the token as a WebSocket subprotocol, not as a URL query parameter:

```ts
const realtimeUrl = client.realtimeUrl("camp_demo");
const socket = new WebSocket(realtimeUrl, ["otte.v1", `otte.auth.${token}`]);
```

## Public Surface

The client wraps the public session, workspace, campaign/member/session/search, world, scene, token, actor, item, journal, handout/read-receipt, chat, dice, combat, encounter, proposal/revert, structured AI-memory lifecycle, plugin, system, content-import, archive, asset upload/delivery metadata, chat export, and dogfood report surfaces.

`campaignSnapshot(campaignId, sceneId?, historyLimit?)` accepts an optional per-history collection bound up to 200. The returned `history` metadata identifies which permission-filtered collections were truncated and their original and returned counts.

The reusable client intentionally excludes server-admin routes, SCIM bearer-provisioning routes, OIDC browser redirects, the websocket endpoint as a REST fetch wrapper, and raw asset blob delivery. Those surfaces either require privileged operator handling, browser redirects, direct media fetches, or the dedicated realtime helpers above.

## Rules-system registration

System registration, exact version binding, and campaign activation are separate operations. Registration requires server-admin authority, `campaign.update` for the explicit campaign context, and an idempotency key. Legacy manifests with schema path strings remain data-model metadata. Validated `declarative-v1` packages use bounded inline schemas and the trusted host adapter for actor sheets, quick rolls, and fixed resource costs. See the [declarative system guide](system-sdk/declarative-v1.md) for the executable package format, version binding, permissions, and current integration verification limits.

This example registers a legacy data-model manifest and activates it with the exact campaign revision and a separate replay key:

```ts
const registered = await client.registerSystem("camp_demo", {
  id: "my-data-system",
  name: "My Data System",
  version: "1.0.0",
  compatibleCore: ">=0.3.0 <1.0.0",
  entrypoints: {},
  schemas: { actor: "schemas/actor.json", item: "schemas/item.json" },
  permissions: ["actor.read"],
  capabilities: ["data-model"]
}, "system-register:camp_demo:my-data-system:attempt-1");

const campaignForActivation = await client.campaign("camp_demo");
const activated = await client.installSystem(
  "camp_demo",
  registered.id,
  campaignForActivation.updatedAt,
  "system-activate:camp_demo:my-data-system:attempt-1",
);
console.log(activated.campaign.defaultSystemId);
```

For an executable declarative system, first use `bindCampaignSystem(campaignId, systemId, { expectedUpdatedAt, system, expectedBinding }, { idempotencyKey })` to select its exact installed `{ systemId, version, checksum }`. This requires a GM with `campaign.update`; use `null` only when there is no previous binding. Binding does not change the campaign default. The separate `installSystem(campaignId, systemId, expectedUpdatedAt, idempotencyKey)` activation method requires the current campaign revision and an existing valid binding for declarative systems.

Treat `400 invalid_system_manifest`, `403`, `409`, and structured `422` errors as expected integration outcomes. The catalog's `runtimeCapabilities`, `unsupportedCapabilities`, `installedVersions`, and campaign `binding` describe the host's supported runtime and selected version. Manifest claims do not load arbitrary package code.

Package registration and registry synchronization are operator mutations. Pass a stable idempotency key to `registerPlugin(...)` and `syncPluginRegistry(...)`; registry sync also requires the exact `expectedRegistryRevision` from `GET /api/v1/admin/plugins/reviews` or `GET /api/v1/admin/plugins/operations`. A successful sync returns its previous and resulting revisions. Reuse the same key only when retrying the same request after an uncertain transport outcome.

## Author Checklist

- Keep `@open-tabletop/api-client`, `@open-tabletop/api-contracts`, and `@open-tabletop/core` versions aligned.
- Prefer exported core types such as `Campaign`, `Scene`, `Token`, `Actor`, `JournalEntry`, `ChatMessage`, `Proposal`, and `EngineEvent` instead of duplicating schemas.
- Preserve the AI agent's existing proposal and automatic-execution modes. Plugins and systems must use permissioned proposals or explicit typed API calls; clients must never mutate local campaign state and expect the server to reconcile it.
- Handle `401`, `403`, `409`, `429`, and structured error bodies as normal integration states.
- Preserve idempotency keys for retried mutating requests when your integration can retry after a network failure.
- Use the archive and chat-export helpers for backup/reporting tools instead of reading storage internals.

## Validation

Run the package checks before publishing an integration that depends on new client behavior:

```bash
pnpm --filter @open-tabletop/api-client typecheck
pnpm --filter @open-tabletop/api-client test
pnpm --filter @open-tabletop/api-client build
```

The package regression test drives real wrapper methods through a fake fetch and compares coverage against the served public OpenAPI route surface. When a public route is intentionally excluded, the exclusion must be listed in the client source with a reason.
