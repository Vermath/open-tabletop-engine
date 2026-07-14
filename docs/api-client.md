# API Client

`@open-tabletop/api-client` is the reusable TypeScript client for public v1 REST routes and the realtime WebSocket stream. It is MIT-licensed so external tools, bots, companion apps, and extension packages can depend on it without inheriting the platform server's AGPL license.

Install it next to the shared domain types:

```bash
pnpm add @open-tabletop/api-client @open-tabletop/core
```

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
import type { EngineEvent } from "@open-tabletop/core";
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

System registration and campaign activation are separate calls. Registration requires both server-admin authority and `campaign.update` for the explicit campaign context. External packages are currently data-model-only; runtime capabilities are server-controlled and unsupported feature calls return a structured `422` response.

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

const activated = await client.installSystem("camp_demo", registered.id);
console.log(activated.campaign.defaultSystemId);
```

Treat `400 invalid_system_manifest`, `403`, `409`, and `422 unsupported_system_capabilities` as expected registration outcomes. The catalog's `runtimeCapabilities` and `unsupportedCapabilities` fields are authoritative; manifest claims do not load or execute arbitrary server code.

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
