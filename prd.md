You’re right. The previous version was a pile of parts, not an implementation plan.

Here’s the actual plan: **an open-source, API-first virtual tabletop platform with built-in LLM assistance, a permissioned plugin ecosystem, and a Codex-backed GM/dev copilot.**

I’m going to call the project **OpenTabletop Engine** for now, just so the plan has a name.

---

# OpenTabletop Engine: Full Implementation Plan

## 0. Core thesis

Do **not** build “Roll20 but cheaper.”

Build:

> **An open-source, API-first VTT operating system for tabletop games, where every core feature is exposed through a public API, every rule system is modular, every campaign is portable, and AI assistance is permissioned, auditable, and optional.**

The main differentiators:

1. **Open source core**
2. **Public API from day one**
3. **Self-hostable**
4. **Plugin/module SDK**
5. **Game-system agnostic**
6. **Campaign data portability**
7. **AI-assisted GM prep and campaign memory**
8. **No vendor lock-in**
9. **No “you can only build what we allow” nonsense**
10. **Every UI action maps to an API action**

---

# 1. Product scope

## 1.1 What we are building

A browser-based VTT with:

```text
Campaigns
Worlds
Scenes
Maps
Tokens
Actors
Items
Character sheets
Dice
Chat
Journals
Handouts
Compendia
Fog of war
Lighting
Walls
Measurement tools
Turn tracker
Encounter builder
Rules/system modules
Plugin marketplace
Public REST API
Realtime WebSocket API
Plugin SDK
AI assistant
Self-hosted deployment
Hosted deployment option
```

## 1.2 What we are not building first

Avoid these at the start:

```text
Native desktop app
Native mobile app
3D tabletop
Video chat
Full marketplace payments
Every rules system
Automated rules for every game
Procedural battlemap generation
Full voice transcription
Enterprise admin console
```

Those can come later. The first target is:

> A GM can run a real campaign session with maps, tokens, sheets, dice, chat, notes, encounters, permissions, and AI-assisted prep.

---

# 2. Legal and project identity

This should **not** copy Roll20’s UI, branding, assets, marketplace content, internal workflows, proprietary character sheets, or anything that would make it look like a literal clone.

The safe framing is:

```text
Category: Virtual tabletop platform
Inspiration: Existing VTT pain points
Implementation: Original code, original UX, original data model, open APIs
```

We can support compatibility/import tools later, but the core should be original.

## 2.1 Licensing recommendation

Use a dual-license-friendly open-source structure:

```text
Core platform: AGPL-3.0 or GPL-3.0
SDK/client libraries: MIT or Apache-2.0
Example plugins: MIT
Documentation: CC BY 4.0
Content packs: separate licenses
```

My recommendation:

```text
AGPL-3.0 for server/platform core
MIT for SDKs
CC BY 4.0 for docs
```

Reason: AGPL protects the open-source platform from being taken, modified, hosted commercially, and never contributed back. MIT SDKs make it easy for third-party developers to build plugins without license anxiety.

Potential structure:

```text
/LICENSE
/packages/core/LICENSE              AGPL-3.0
/packages/server/LICENSE            AGPL-3.0
/packages/web-client/LICENSE        AGPL-3.0
/packages/plugin-sdk/LICENSE        MIT
/packages/api-client/LICENSE        MIT
/packages/system-sdk/LICENSE        MIT
/docs/LICENSE                       CC BY 4.0
/examples/LICENSE                   MIT
```

---

# 3. Target users

## 3.1 Primary users

```text
Game Masters
Players
Rules-system creators
Homebrew designers
Module developers
Actual-play producers
Self-hosters
Open-source contributors
```

## 3.2 Primary developer personas

```text
1. The GM who wants to automate their campaign.
2. The indie RPG designer who wants a digital rules system.
3. The module developer who wants a real API.
4. The self-hoster who wants control.
5. The AI-heavy GM who wants prep, memory, and encounter help.
```

---

# 4. Product principles

These should go in the project README.

```text
1. API-first.
2. Self-hostable by default.
3. No campaign lock-in.
4. Plugins are first-class citizens.
5. Rules systems are data-driven.
6. The GM owns campaign state.
7. AI proposes; humans approve.
8. Secrets are permissioned.
9. Everything important is exportable.
10. Every destructive action is reversible or auditable.
```

---

# 5. High-level architecture

## 5.1 System overview

```text
Browser Client
   |
   | REST API
   | WebSocket Realtime API
   v
API Server
   |
   |---- Auth Service
   |---- Campaign Service
   |---- Scene Service
   |---- Actor/Item Service
   |---- Journal Service
   |---- Dice Service
   |---- Realtime Event Service
   |---- Plugin Runtime Service
   |---- AI Gateway
   |---- Export/Import Service
   |
   v
Database / Storage
   |
   |---- PostgreSQL
   |---- Redis
   |---- Object Storage
   |---- Search Index
   |---- Optional Vector Store
```

## 5.2 AI-specific architecture

```text
Browser Client
   |
   v
AI Panel / Encounter Builder / Memory UI
   |
   v
AI Gateway
   |
   |---- Provider Adapter: Codex App Server
   |---- Provider Adapter: OpenAI API
   |---- Provider Adapter: Local LLM
   |---- Provider Adapter: Bring-your-own endpoint
   |
   v
Permissioned VTT Tools
   |
   |---- campaign.search
   |---- encounter.design
   |---- encounter.balance
   |---- journal.createDraft
   |---- memory.extract
   |---- proposal.apply
   |---- rules.lookup
   |---- actor.proposePatch
   |---- scene.createDraft
```

The AI should **never** directly mutate campaign state. It proposes changes through structured tools. The GM approves.

---

# 6. Recommended tech stack

## 6.1 Monorepo

Use:

```text
pnpm
Turborepo
TypeScript
ESLint
Prettier
Vitest
Playwright
Docker Compose
```

## 6.2 Frontend

```text
React
Vite
TypeScript
PixiJS or custom WebGL canvas layer
Zustand or Jotai for local UI state
TanStack Query for API state
Yjs or server-event reconciliation for realtime shared state
```

PixiJS is probably the fastest practical choice for 2D maps, tokens, layers, lighting masks, and measurement tools.

## 6.3 Backend

```text
Node.js
TypeScript
Fastify or NestJS
PostgreSQL
Redis
Prisma or Drizzle
BullMQ for background jobs
MinIO/S3-compatible object storage
OpenAPI spec generation
WebSocket gateway
```

My preference:

```text
Fastify + Drizzle + PostgreSQL + Redis + BullMQ
```

Reason: fast, explicit, modular, less framework gravity than Nest.

## 6.4 Plugin sandboxing

Use multiple plugin execution modes:

```text
Client plugins:
  - Sandboxed iframe
  - Web Worker
  - Capability-limited API bridge

Server plugins:
  - Separate worker process
  - WASM option later
  - Permission manifest
  - No direct DB access

System modules:
  - Signed package
  - Schema definitions
  - Sheet components
  - Rules hooks
```

## 6.5 AI provider support

```text
Codex App Server adapter
OpenAI API adapter
Local model adapter
Ollama adapter
OpenRouter-compatible adapter
Custom HTTP adapter
```

Codex App Server should be an adapter, not a hard dependency. Official OpenAI docs describe Codex app-server as the interface used to power rich clients, including authentication, conversation history, approvals, and streamed agent events, which is exactly the kind of integration we want for an in-app assistant. ([OpenAI Developers][1])

---

# 7. Repository layout

```text
open-tabletop-engine/
  README.md
  LICENSE
  CONTRIBUTING.md
  CODE_OF_CONDUCT.md
  SECURITY.md
  GOVERNANCE.md
  AGENTS.md

  apps/
    web/
    api/
    worker/
    ai-gateway/
    docs/
    storybook/

  packages/
    core/
    database/
    auth/
    config/
    logger/
    errors/

    api-contracts/
    api-client/
    realtime-client/

    scene-engine/
    canvas-renderer/
    lighting-engine/
    fog-engine/
    measurement-engine/

    dice-engine/
    rules-engine/
    system-sdk/
    plugin-sdk/
    plugin-runtime/

    ai-core/
    ai-tools/
    ai-memory/
    ai-prompts/
    ai-providers/
      codex-app-server/
      openai/
      local-llm/
      ollama/
      custom-http/

    content/
      srd/
      sample-worlds/

    importer/
    exporter/

  plugins/
    example-macro-plugin/
    example-sheet-plugin/
    example-system-dnd5e-srd/
    example-system-generic-fantasy/

  .agents/
    skills/
      encounter-designer/
      campaign-librarian/
      session-recap/
      vtt-module-builder/
      rules-system-builder/

  docs/
    architecture/
    api/
    plugin-sdk/
    system-sdk/
    ai/
    deployment/
    governance/

  infra/
    docker/
    helm/
    terraform/

  tests/
    e2e/
    load/
    fixtures/
```

---

# 8. Data model

## 8.1 Core entities

```text
User
Organization
Campaign
CampaignMember
World
Scene
SceneLayer
MapAsset
Token
Actor
Item
JournalEntry
Handout
ChatMessage
DiceRoll
Encounter
Combat
CombatTurn
Compendium
CompendiumPack
Plugin
SystemModule
PermissionGrant
AuditLog
Proposal
AiThread
AiMemoryFact
AiToolCall
```

## 8.2 Campaign

```text
Campaign
  id
  ownerUserId
  name
  description
  defaultSystemId
  visibility
  createdAt
  updatedAt
```

## 8.3 Scene

```text
Scene
  id
  campaignId
  name
  width
  height
  gridType
  gridSize
  backgroundAssetId
  active
  sortOrder
  metadata
```

## 8.4 Token

```text
Token
  id
  sceneId
  actorId
  name
  x
  y
  width
  height
  rotation
  hidden
  locked
  visionEnabled
  lightConfig
  disposition
  imageAssetId
  metadata
```

## 8.5 Actor

```text
Actor
  id
  campaignId
  systemId
  ownerUserId
  type
  name
  imageAssetId
  data
  permissions
  createdAt
  updatedAt
```

The `data` field is system-specific and validated through the game system schema.

## 8.6 Item

```text
Item
  id
  campaignId
  systemId
  actorId nullable
  type
  name
  data
  createdAt
  updatedAt
```

## 8.7 JournalEntry

```text
JournalEntry
  id
  campaignId
  parentId nullable
  title
  body
  visibility
  tags
  createdBy
  updatedBy
  createdAt
  updatedAt
```

Visibility should support:

```text
gm_only
public
specific_players
specific_characters
```

## 8.8 Proposal

This is critical for AI and plugins.

```text
Proposal
  id
  campaignId
  createdByUserId
  createdByType: user | ai | plugin
  sourceId
  title
  summary
  status: draft | pending | approved | rejected | applied | reverted
  changesJson
  diffJson
  approvalRequired
  approvedByUserId nullable
  createdAt
  updatedAt
```

A proposal is a pending state change. It lets the AI say:

```text
“I drafted an encounter, three journal notes, and six tokens. Review?”
```

Instead of silently modifying the game.

---

# 9. Event model

The platform should use evented state changes.

## 9.1 Event envelope

```json
{
  "id": "evt_01H...",
  "campaignId": "camp_123",
  "type": "scene.token.moved",
  "actorUserId": "usr_123",
  "targetId": "tok_456",
  "timestamp": "2026-05-01T18:00:00.000Z",
  "payload": {
    "x": 420,
    "y": 300
  },
  "causationId": "cmd_789",
  "correlationId": "corr_abc"
}
```

## 9.2 Why this matters

Events enable:

```text
Realtime multiplayer
Undo/redo
Audit logs
Replay
Plugin hooks
AI summaries
Conflict resolution
Session recaps
```

---

# 10. Public API design

The API must exist before the UI is complete.

## 10.1 Rule

> Every action the UI can perform must be possible through the public API.

## 10.2 API surfaces

```text
REST API
WebSocket Realtime API
Plugin SDK
System SDK
AI Tool API
Import/Export API
Admin API
```

## 10.3 REST API examples

```text
GET    /api/v1/campaigns
POST   /api/v1/campaigns
GET    /api/v1/campaigns/{campaignId}
PATCH  /api/v1/campaigns/{campaignId}
DELETE /api/v1/campaigns/{campaignId}

GET    /api/v1/campaigns/{campaignId}/scenes
POST   /api/v1/campaigns/{campaignId}/scenes
GET    /api/v1/scenes/{sceneId}
PATCH  /api/v1/scenes/{sceneId}
DELETE /api/v1/scenes/{sceneId}

GET    /api/v1/scenes/{sceneId}/tokens
POST   /api/v1/scenes/{sceneId}/tokens
PATCH  /api/v1/tokens/{tokenId}
DELETE /api/v1/tokens/{tokenId}

GET    /api/v1/campaigns/{campaignId}/actors
POST   /api/v1/campaigns/{campaignId}/actors
GET    /api/v1/actors/{actorId}
PATCH  /api/v1/actors/{actorId}
DELETE /api/v1/actors/{actorId}

GET    /api/v1/campaigns/{campaignId}/journal
POST   /api/v1/campaigns/{campaignId}/journal
GET    /api/v1/journal/{entryId}
PATCH  /api/v1/journal/{entryId}
DELETE /api/v1/journal/{entryId}

POST   /api/v1/dice/roll
POST   /api/v1/chat/messages
GET    /api/v1/chat/messages

GET    /api/v1/plugins
POST   /api/v1/plugins/install
DELETE /api/v1/plugins/{pluginId}

GET    /api/v1/systems
POST   /api/v1/systems/install
```

## 10.4 Realtime WebSocket events

```text
campaign.member.joined
campaign.member.left

scene.created
scene.updated
scene.deleted
scene.activated

token.created
token.updated
token.moved
token.deleted

actor.created
actor.updated
actor.deleted

journal.created
journal.updated
journal.deleted

chat.message.created
dice.roll.created

combat.started
combat.roundAdvanced
combat.turnChanged
combat.ended

proposal.created
proposal.updated
proposal.approved
proposal.rejected
proposal.applied

ai.thread.started
ai.message.delta
ai.message.completed
ai.tool.started
ai.tool.completed
ai.proposal.created
```

## 10.5 API documentation

Generate:

```text
OpenAPI spec
Typed TypeScript client
Plugin SDK docs
System SDK docs
Example apps
Postman collection
CLI client
```

---

# 11. Permissions model

This has to be robust from day one.

## 11.1 Roles

```text
Owner
GM
Assistant GM
Player
Observer
Plugin
AI Assistant
```

## 11.2 Permission categories

```text
campaign.read
campaign.update
campaign.delete

scene.read
scene.create
scene.update
scene.delete
scene.activate

token.read
token.create
token.update
token.move
token.delete
token.reveal

actor.read
actor.create
actor.update
actor.delete
actor.readPrivate
actor.updateOwned

journal.read
journal.readSecret
journal.create
journal.update
journal.delete

chat.read
chat.write
chat.moderate

combat.manage

plugin.install
plugin.configure

ai.use
ai.readPublicMemory
ai.readGmMemory
ai.proposeChanges
ai.applyChanges
```

## 11.3 Permission rule

AI and plugins should never receive ambient authority.

They get scoped grants:

```json
{
  "subjectType": "ai_assistant",
  "subjectId": "assistant_encounter_builder",
  "campaignId": "camp_123",
  "permissions": [
    "campaign.read",
    "actor.read",
    "journal.readSecret",
    "ai.proposeChanges"
  ],
  "expiresAt": "2026-05-01T23:59:59.000Z"
}
```

---

# 12. Scene and canvas engine

## 12.1 Required scene layers

```text
Background layer
Map layer
Tile layer
Wall layer
Lighting layer
Token layer
Template layer
Fog layer
Annotation layer
UI interaction layer
```

## 12.2 Canvas tools

```text
Select
Pan
Measure
Draw
Ping
Reveal fog
Hide fog
Add wall
Add light
Add token
Area template
Ruler
Notes pin
```

## 12.3 Scene engine modules

```text
scene-engine/
  SceneState
  SceneStore
  LayerManager
  GridManager
  TokenManager
  AssetManager
  InteractionManager
  ViewportController
  CommandDispatcher
```

## 12.4 Grid support

Initial:

```text
Square grid
Gridless
```

Later:

```text
Hex horizontal
Hex vertical
Isometric
Zone maps
```

## 12.5 Lighting and vision

MVP lighting:

```text
Token vision radius
Basic light sources
Line-of-sight walls
GM reveal/hide
Player-specific visibility
```

Advanced lighting later:

```text
Colored lighting
Animated lights
Darkvision modes
One-way walls
Windows
Terrain walls
Elevation-aware vision
Weather/atmosphere effects
```

---

# 13. Dice engine

## 13.1 Core dice notation

Support:

```text
d20
2d6
4d6kh3
1d20+5
2d20kh1
1d100
3d10!
/roll 1d20 + @abilities.str.mod
```

## 13.2 Dice engine package

```text
dice-engine/
  parser.ts
  roller.ts
  probability.ts
  formatter.ts
  macros.ts
  system-bindings.ts
```

## 13.3 Dice API

```text
POST /api/v1/dice/roll
```

Payload:

```json
{
  "campaignId": "camp_123",
  "formula": "1d20 + 5",
  "visibility": "public",
  "label": "Attack roll"
}
```

Response:

```json
{
  "id": "roll_123",
  "formula": "1d20 + 5",
  "terms": [
    {
      "type": "die",
      "sides": 20,
      "results": [14]
    },
    {
      "type": "modifier",
      "value": 5
    }
  ],
  "total": 19
}
```

---

# 14. Chat system

## 14.1 Message types

```text
plain
emote
whisper
roll
system
gm
ooc
ai
plugin
```

## 14.2 Chat commands

```text
/roll
/r
/gmroll
/w
/em
/ooc
/table
/desc
/ai
```

## 14.3 Chat permissions

```text
Public message
GM-only message
Whisper to user
Whisper to character
AI-visible
AI-hidden
```

Important: chat logs should not automatically become AI memory. The GM should control what gets summarized and stored.

---

# 15. Character sheets and game systems

This is where most VTTs become painful. The fix is a real **System SDK**.

## 15.1 System module structure

```text
systems/
  example-fantasy/
    system.manifest.json
    actor.schema.json
    item.schema.json
    sheets/
      CharacterSheet.tsx
      NpcSheet.tsx
      ItemSheet.tsx
    rules/
      actions.ts
      dice.ts
      automation.ts
    compendium/
      actors.json
      items.json
      spells.json
    styles.css
```

## 15.2 System manifest

```json
{
  "id": "example-fantasy",
  "name": "Example Fantasy",
  "version": "0.1.0",
  "compatibleCore": ">=0.1.0",
  "entrypoints": {
    "client": "./dist/client.js",
    "server": "./dist/server.js"
  },
  "schemas": {
    "actor": "./actor.schema.json",
    "item": "./item.schema.json"
  },
  "permissions": [
    "actor.read",
    "actor.updateOwned",
    "dice.roll",
    "chat.write"
  ]
}
```

## 15.3 Actor schema example

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Character",
  "type": "object",
  "properties": {
    "attributes": {
      "type": "object",
      "properties": {
        "strength": { "type": "number" },
        "dexterity": { "type": "number" },
        "constitution": { "type": "number" },
        "intelligence": { "type": "number" },
        "wisdom": { "type": "number" },
        "charisma": { "type": "number" }
      },
      "required": [
        "strength",
        "dexterity",
        "constitution",
        "intelligence",
        "wisdom",
        "charisma"
      ]
    },
    "hp": {
      "type": "object",
      "properties": {
        "current": { "type": "number" },
        "max": { "type": "number" }
      },
      "required": ["current", "max"]
    }
  },
  "required": ["attributes", "hp"]
}
```

## 15.4 Sheet rendering

System authors should be able to build sheets using:

```text
React components
Schema-driven forms
Prebuilt UI components
System hooks
```

Example SDK API:

```ts
registerActorSheet({
  systemId: "example-fantasy",
  actorType: "character",
  component: CharacterSheet
});

registerDiceFormula({
  id: "ability-check",
  label: "Ability Check",
  buildFormula: ({ actor, ability }) => {
    return `1d20 + ${actor.data.attributes[ability].modifier}`;
  }
});
```

---

# 16. Plugin platform

## 16.1 Plugin philosophy

Plugins should be powerful but not reckless.

A plugin should be able to:

```text
Add UI panels
Add scene tools
Add chat commands
Add macros
Read campaign data with permission
Create proposals
Listen to events
Register compendium packs
Add automation hooks
Call external APIs if granted
```

A plugin should not be able to:

```text
Read secrets without permission
Modify actors without permission
Delete scenes without permission
Access arbitrary server files
Steal auth tokens
Exfiltrate campaign data silently
Bypass audit logs
```

## 16.2 Plugin manifest

```json
{
  "id": "weather-and-travel",
  "name": "Weather and Travel",
  "version": "0.1.0",
  "author": "Example Author",
  "license": "MIT",
  "compatibleCore": ">=0.1.0",
  "entrypoints": {
    "client": "./dist/client.js",
    "server": "./dist/server.js"
  },
  "permissions": {
    "read": [
      "campaign.public",
      "scene.active",
      "journal.public"
    ],
    "write": [
      "chat.message",
      "journal.draft"
    ],
    "network": [
      "api.weather.example"
    ]
  },
  "ui": {
    "panels": [
      {
        "id": "weather-panel",
        "title": "Weather",
        "location": "right-sidebar"
      }
    ]
  }
}
```

## 16.3 Plugin API examples

```ts
openTabletop.plugins.register({
  id: "weather-and-travel",
  activate(ctx) {
    ctx.ui.registerPanel({
      id: "weather-panel",
      title: "Weather",
      render: WeatherPanel
    });

    ctx.chat.registerCommand({
      command: "/weather",
      description: "Generate local weather",
      handler: async (args) => {
        const scene = await ctx.scene.getActive();
        await ctx.chat.send({
          content: `Weather for ${scene.name}: cloudy with cold wind.`,
          visibility: "public"
        });
      }
    });
  }
});
```

## 16.4 Plugin registry

Initial plugin registry can be simple:

```text
GitHub-backed package index
Signed manifest
Manual install by URL
Admin approval required
```

Later:

```text
Marketplace
Ratings
Verified publishers
Dependency resolution
Revenue sharing
Content licensing controls
```

---

# 17. Compendium and content system

## 17.1 Compendium entities

```text
CompendiumPack
CompendiumActor
CompendiumItem
CompendiumSpell
CompendiumTable
CompendiumJournal
CompendiumScene
```

## 17.2 Content boundaries

The open-source project should ship only:

```text
Original sample content
Public-domain content
Open-licensed content
SRD-compatible content where legally allowed
```

Do **not** bundle proprietary game content.

## 17.3 Import/export

Support:

```text
Campaign export
World export
Scene export
Actor export
Item export
Journal export
Compendium pack export
Plugin export
System export
```

Use a portable format:

```text
JSON for metadata
Binary assets in archive
Manifest file
Checksums
Versioned schema
```

Example:

```text
my-campaign.ottx
  manifest.json
  campaign.json
  scenes/
  actors/
  items/
  journals/
  assets/
  compendia/
  ai-memory/
  audit-log.json
```

---

# 18. AI system overview

The AI system should be built as a **permissioned assistant platform**, not a chatbot bolted onto the side.

## 18.1 AI modes

```text
GM Prep Assistant
GM Live Assistant
Encounter Designer
Campaign Librarian
Session Recapper
Rules Helper
NPC Improviser
Player Assistant
Module Developer Assistant
System Builder Assistant
```

## 18.2 AI design rule

```text
The AI can read only what it has permission to read.
The AI can write only drafts.
The AI can apply changes only after approval.
The AI must distinguish canon from suggestion.
```

## 18.3 AI features for MVP

```text
Encounter design
Encounter balancing
Session recap
Campaign search
Campaign memory extraction
NPC generation
Journal draft generation
Rules lookup against approved sources
Plugin/system development assistant
```

---

# 19. Codex App Server integration

## 19.1 Role of Codex App Server

Use Codex App Server as the rich-client integration layer for assistant workflows where its thread model, streaming events, approvals, skills, and tool flow are valuable.

OpenAI’s docs say app-server supports bidirectional JSON-RPC-style communication, with stdio as the default transport and experimental WebSocket support. They also warn that non-loopback WebSocket listeners can allow unauthenticated connections by default during rollout, so remote exposure needs explicit WebSocket auth. ([OpenAI Developers][1])

That means our implementation should default to:

```text
stdio for local/dev integration
loopback WebSocket only for local desktop-style use
server-managed auth for hosted use
no unauthenticated remote WebSocket exposure
```

## 19.2 Important constraint

Codex App Server is developer/product-integration oriented. It is great for:

```text
Rich assistant panel
Threaded assistant sessions
Approvals
Streaming events
Skill invocation
Dev assistant workflows
Module generation
Plugin generation
Rules-system scaffolding
```

For pure in-game LLM calls, we should still keep a generic AI Gateway. That lets us use Codex where it fits and regular model APIs or local models where they fit better.

## 19.3 Adapter architecture

```text
ai-providers/
  codex-app-server/
    CodexAppServerProvider.ts
    CodexThreadBridge.ts
    CodexEventMapper.ts
    CodexApprovalBridge.ts
    CodexSkillRegistry.ts
    CodexTransportStdio.ts
    CodexTransportWebSocket.ts
```

## 19.4 Codex event bridge

Map Codex events into VTT AI events.

```text
Codex item/agentMessage/delta
  -> ai.message.delta

Codex item/completed
  -> ai.item.completed

Codex item/tool/call
  -> ai.tool.requested

Codex approval request
  -> ai.approval.requested

Codex file change proposal
  -> ai.proposal.created
```

Codex App Server has explicit approval flows for command execution and file changes, and it can send server-initiated JSON-RPC approval requests to the client. ([OpenAI Developers][1]) We should mirror that for VTT state changes: proposed scene edits, journal edits, actor patches, encounter creation, and memory updates all become approval requests.

## 19.5 Codex dynamic tools

Codex App Server supports dynamic tool call flows as experimental APIs. ([OpenAI Developers][1]) We should use them carefully and wrap them with our own stable interface.

Example VTT dynamic tools:

```text
campaign.search
campaign.getActiveScene
actor.get
actor.search
journal.search
encounter.design
encounter.balance
proposal.create
memory.extractFacts
rules.lookup
dice.probability
```

## 19.6 Codex Skills

OpenAI’s docs describe Codex Skills as directories containing a required `SKILL.md` file plus optional scripts, references, and assets; skills can be repository-scoped under `.agents/skills`. ([OpenAI Developers][2]) That maps perfectly to tabletop workflows.

Create these built-in skills:

```text
.agents/skills/encounter-designer
.agents/skills/campaign-librarian
.agents/skills/session-recap
.agents/skills/vtt-module-builder
.agents/skills/rules-system-builder
.agents/skills/plugin-reviewer
```

Example:

```text
.agents/skills/encounter-designer/
  SKILL.md
  references/
    encounter-pacing.md
    terrain-design.md
    action-economy.md
  scripts/
    estimate-difficulty.ts
```

## 19.7 Codex Plugins and MCP

Codex customization supports project guidance, memories, skills, MCP, and subagents; the docs describe MCP as the way to connect Codex to external tools and context providers. ([OpenAI Developers][3]) Codex plugins can also bundle skills, app integrations, and MCP servers. ([OpenAI Developers][4])

So we should build:

```text
OpenTabletop MCP Server
```

It exposes campaign-safe tools to Codex:

```text
tools:
  campaign.search
  campaign.readSummary
  scene.readActive
  actor.read
  encounter.createDraft
  journal.createDraft
  proposal.submit
  memory.queueFacts

resources:
  campaign://{campaignId}/public-summary
  campaign://{campaignId}/gm-notes
  rules://{systemId}/srd
  scene://{sceneId}/summary

prompts:
  encounter-design
  session-recap
  npc-generate
  rules-lookup
```

---

# 20. AI Gateway

## 20.1 Purpose

The AI Gateway is the central control point for:

```text
Provider selection
Prompt construction
Permission filtering
Tool authorization
Context retrieval
Memory retrieval
Proposal generation
Audit logging
Rate limiting
Cost tracking
Redaction
```

## 20.2 AI Gateway request lifecycle

```text
1. User opens assistant.
2. Client sends prompt and selected context.
3. AI Gateway checks user permissions.
4. AI Gateway builds context package.
5. AI Gateway redacts forbidden data.
6. AI Gateway starts provider thread.
7. Provider streams response.
8. Provider may request tools.
9. AI Gateway validates tool permission.
10. Tool returns scoped result.
11. AI creates draft/proposal.
12. GM reviews and approves/rejects.
13. Approved proposal applies through normal API.
14. All actions are logged.
```

## 20.3 AI context package

```json
{
  "campaign": {
    "id": "camp_123",
    "name": "Greyford Campaign",
    "system": "example-fantasy"
  },
  "user": {
    "id": "usr_123",
    "role": "gm"
  },
  "visibility": {
    "includeGmSecrets": true,
    "includePlayerSecrets": false,
    "includePrivateNotes": false
  },
  "selectedContext": {
    "activeScene": true,
    "partySummary": true,
    "recentChat": true,
    "campaignMemory": true,
    "rules": true
  }
}
```

## 20.4 AI audit log

```json
{
  "id": "ai_log_123",
  "campaignId": "camp_123",
  "threadId": "ai_thread_123",
  "userId": "usr_123",
  "provider": "codex-app-server",
  "mode": "encounter-designer",
  "inputSummary": "Asked for level 4 forest ambush",
  "toolsUsed": [
    "campaign.search",
    "encounter.balance",
    "proposal.create"
  ],
  "proposalIds": [
    "prop_123"
  ],
  "createdAt": "2026-05-01T18:00:00.000Z"
}
```

---

# 21. AI encounter design

## 21.1 Encounter Builder UI

The GM sees:

```text
Encounter Builder

Party:
  Level:
  Number of players:
  Current condition:
  Available resources:

Tone:
  Heroic
  Gritty
  Horror
  Tactical
  Weird
  Comedic

Environment:
  Forest
  Dungeon
  City
  Ship
  Road
  Ruins
  Custom

Constraints:
  No undead
  Use SRD only
  Avoid flying enemies
  Include social option
  Include noncombat objective

Difficulty:
  Easy
  Medium
  Hard
  Deadly
  Custom

Buttons:
  Generate encounter
  Balance existing encounter
  Make encounter more dynamic
  Create scene draft
  Create journal draft
  Create tokens draft
```

## 21.2 Encounter output

```text
Encounter Name
Summary
Intended Difficulty
Enemies
Terrain
Tactics
Round Events
Scaling Options
Treasure
Clues
Read-Aloud Text
GM Notes
Safety/Risk Notes
```

## 21.3 Encounter proposal

When the GM clicks “Create Draft,” the AI generates:

```text
Proposal:
  Create Encounter
  Create Journal Entry
  Create Token Group
  Create Optional Scene Notes
  Create Optional Loot Table
```

The GM can approve all or individual changes.

## 21.4 Encounter balance engine

Use deterministic logic first, LLM second.

```text
Deterministic:
  Party size
  Party level
  Monster count
  Action economy
  Expected damage
  Effective HP
  Save DCs
  Terrain risk
  Enemy mobility
  Control effects

LLM:
  Tactical advice
  Narrative adjustments
  Pacing risks
  Thematic alternatives
```

The AI should not be the only balance engine. It should explain and adjust.

---

# 22. Campaign memory and information management

## 22.1 Memory categories

```text
Canon fact
Rumor
Secret
NPC profile
Location profile
Faction profile
Quest hook
Unresolved thread
Character goal
Session summary
Timeline event
Retconned fact
AI suggestion
```

## 22.2 Memory object

```json
{
  "id": "mem_123",
  "campaignId": "camp_123",
  "type": "npc_fact",
  "subject": "Vessa Thorn",
  "text": "Vessa Thorn secretly funds the Lantern Rebellion.",
  "visibility": "gm_only",
  "status": "approved",
  "source": {
    "type": "session_summary",
    "id": "summary_12"
  },
  "confidence": 0.92,
  "createdBy": "ai",
  "approvedBy": "usr_gm",
  "createdAt": "2026-05-01T18:00:00.000Z"
}
```

## 22.3 Memory approval queue

After a session recap, the AI says:

```text
I found 12 possible campaign facts.

Approve:
[ ] Vessa Thorn secretly funds the Lantern Rebellion.
[ ] The party promised to return to Greyford within three days.
[ ] Torren owes the river spirit a favor.
[ ] The Duke's men are transporting prisoners north.
```

Nothing becomes canon until approved.

## 22.4 Campaign search

Example GM prompt:

```text
What loose plot threads involve Vessa Thorn?
```

Assistant response:

```text
Known approved facts:
1. Vessa Thorn runs the Greyford apothecary.
2. She secretly funds the Lantern Rebellion.
3. Mira believes Vessa owes her a favor.
4. Vessa's brother may be imprisoned under Blackstone Keep.

Unresolved hooks:
1. The party has not discovered who funds the rebellion.
2. The Duke's tax collectors are suspicious of Vessa.
3. The river spirit hinted that Vessa is hiding a family debt.

Possible next moves:
1. Vessa asks the party to smuggle medicine.
2. The Duke raids the apothecary.
3. Mira calls in the favor at a bad time.
```

The assistant must label:

```text
Approved fact
Rumor
GM secret
AI suggestion
Unknown
```

---

# 23. Session recap system

## 23.1 Inputs

```text
Chat log
Dice log
Combat log
Manual GM notes
Scene transitions
Journal updates
Token movement highlights
Player-submitted notes
```

## 23.2 Outputs

```text
Player-facing recap
GM-only recap
Timeline events
NPC changes
Faction changes
Unresolved hooks
Loot gained
XP/milestone notes
Character-specific notes
Memory approval queue
Next-session prep suggestions
```

## 23.3 Recap workflow

```text
1. GM clicks “Generate recap.”
2. AI reads permitted session data.
3. AI creates draft recap.
4. GM edits.
5. GM publishes player recap.
6. AI extracts memory candidates.
7. GM approves/rejects memory facts.
8. Approved facts update campaign memory.
```

---

# 24. Rules lookup

## 24.1 Rule sources

Rules lookup should be source-controlled.

```text
Open SRD content
User-uploaded rules docs
Homebrew rules
Campaign-specific rulings
System module rules
```

## 24.2 Important rule

The AI should not pretend it knows copyrighted books or proprietary rules text unless the user provided licensed content.

Assistant should answer from:

```text
Approved rules sources
Uploaded documents
Open content
Campaign rulings
```

## 24.3 Rules answer format

```text
Answer
Source
Confidence
Related ruling
GM override option
```

---

# 25. Proposal system

This is one of the most important architecture pieces.

## 25.1 Proposal types

```text
Create scene
Update scene
Create actor
Patch actor
Create item
Create encounter
Create journal entry
Update memory
Install plugin
Enable automation
Reveal handout
```

## 25.2 Proposal lifecycle

```text
draft
pending_review
approved
applied
rejected
reverted
```

## 25.3 Proposal API

```text
GET    /api/v1/proposals
POST   /api/v1/proposals
GET    /api/v1/proposals/{proposalId}
PATCH  /api/v1/proposals/{proposalId}
POST   /api/v1/proposals/{proposalId}/approve
POST   /api/v1/proposals/{proposalId}/apply
POST   /api/v1/proposals/{proposalId}/reject
POST   /api/v1/proposals/{proposalId}/revert
```

## 25.4 Proposal patch format

Use JSON Patch or custom operations.

Example:

```json
{
  "title": "Create Moonbridge Ambush",
  "changes": [
    {
      "op": "create",
      "resource": "encounter",
      "data": {
        "name": "Moonbridge Ambush",
        "difficulty": "medium",
        "summary": "A tactical forest ambush around a broken bridge."
      }
    },
    {
      "op": "create",
      "resource": "journal",
      "data": {
        "title": "Moonbridge Ambush GM Notes",
        "visibility": "gm_only",
        "body": "The goblins want to delay the party, not die here."
      }
    }
  ]
}
```

---

# 26. Security model

## 26.1 Threats

```text
Malicious plugins
Malicious system modules
Prompt injection through campaign notes
AI leaking GM secrets
Players accessing private notes
Compromised API tokens
Exfiltration through plugin network access
Cross-campaign data leakage
Asset upload abuse
XSS in journals/chat
CSRF
Unauthorized WebSocket events
```

## 26.2 Mitigations

```text
Strict permission manifests
Plugin sandboxing
Content Security Policy
HTML sanitization
Signed plugins
Scoped API tokens
Rate limiting
Audit logs
Separate GM/player visibility paths
AI context redaction
Secret-aware retrieval
Proposal-based writes
No direct DB access for plugins
No direct DB access for AI
```

## 26.3 AI-specific security

```text
Treat campaign text as untrusted input.
Treat plugin text as untrusted input.
Treat uploaded rules docs as untrusted input.
Never let retrieved text override system/developer instructions.
Never let AI apply destructive actions without approval.
Redact GM-only data from player assistant contexts.
Log all tool calls.
```

---

# 27. Hosting model

## 27.1 Self-hosted

Provide:

```text
Docker Compose
PostgreSQL
Redis
MinIO
API server
Web client
Worker
AI gateway
Optional local LLM adapter
```

## 27.2 Hosted

Offer later:

```text
Managed campaigns
Managed storage
Managed plugin registry
Managed AI gateway
Backups
Custom domains
Team/org accounts
```

## 27.3 Deployment files

```text
infra/docker/docker-compose.yml
infra/docker/.env.example
infra/helm/
infra/terraform/
```

## 27.4 Self-hosted defaults

```text
AI disabled by default
Telemetry disabled by default
Plugin install requires admin approval
Backups configurable
Data export always available
```

---

# 28. AI privacy settings

Campaign-level settings:

```json
{
  "ai": {
    "enabled": true,
    "provider": "codex-app-server",
    "allowCloudModels": true,
    "allowLocalModels": true,
    "allowPlayerAssistants": false,
    "includeRecentChat": "gm_approved",
    "includeGmNotes": true,
    "includePlayerPrivateNotes": false,
    "includeCharacterSheets": "owned_or_gm",
    "memoryRequiresApproval": true,
    "proposalRequiredForWrites": true,
    "auditLogEnabled": true
  }
}
```

Player-level settings:

```json
{
  "ai": {
    "allowPersonalAssistant": true,
    "sharePrivateNotesWithAi": false,
    "allowCharacterSheetContext": true
  }
}
```

---

# 29. Development roadmap

No fake dates. This is the build order.

---

## Phase 0: Project foundation

### Goal

Create the repo, governance, architecture, CI, and minimal server/client skeleton.

### Deliverables

```text
Monorepo initialized
License files
README
CONTRIBUTING
CODE_OF_CONDUCT
SECURITY
GOVERNANCE
AGENTS.md
Docker Compose
API server skeleton
Web app skeleton
Database package
Auth package
Basic CI
Lint/test/build pipeline
Architecture docs
```

### Key tickets

```text
Create monorepo
Set up pnpm workspaces
Set up Turborepo
Set up TypeScript config
Set up Fastify API app
Set up React/Vite web app
Set up PostgreSQL schema migrations
Set up Redis connection
Set up Docker Compose
Set up OpenAPI generation
Set up Vitest
Set up Playwright
Write architecture overview
```

### Definition of done

```text
Developer can clone repo, run one command, open web app, hit API healthcheck, run tests.
```

---

## Phase 1: Core campaign model

### Goal

Users can create campaigns, invite members, and manage basic campaign data.

### Deliverables

```text
User auth
Campaign CRUD
Campaign membership
Role-based permissions
Audit log
Basic dashboard
API client package
```

### Key tickets

```text
Implement users table
Implement sessions/auth
Implement campaign table
Implement campaign members table
Implement roles
Implement permission checks
Implement audit log table
Implement campaign dashboard
Implement campaign settings
Generate API client
```

### Definition of done

```text
A GM can create a campaign, invite a player, assign a role, and both users see permission-correct data.
```

---

## Phase 2: Scenes, maps, and assets

### Goal

A GM can upload a map, create a scene, and view it on a canvas.

### Deliverables

```text
Asset upload
Object storage
Scene CRUD
Canvas renderer
Grid support
Map background
Pan/zoom
Scene list
Active scene selection
```

### Key tickets

```text
Implement asset upload API
Implement asset storage abstraction
Implement scenes table
Implement scene API
Implement web scene canvas
Implement pan/zoom
Implement square grid
Implement grid settings
Implement active scene state
Implement scene sidebar
```

### Definition of done

```text
A GM can upload a map, create a scene, set grid size, activate the scene, and players can view it.
```

---

## Phase 3: Tokens and realtime movement

### Goal

Multiple users can see and move tokens in realtime.

### Deliverables

```text
Token CRUD
Token layer
Realtime WebSocket gateway
Token movement events
Selection tools
Permissions for token ownership
Basic undo
```

### Key tickets

```text
Implement WebSocket auth
Implement realtime campaign rooms
Implement token table
Implement token API
Render tokens on scene
Implement drag movement
Broadcast token movement
Implement token ownership
Implement GM token controls
Implement token context menu
Implement undo for token movement
```

### Definition of done

```text
GM and player can join the same scene, move owned tokens, and see updates live.
```

---

## Phase 4: Dice and chat

### Goal

Users can roll dice, chat, whisper, and see roll history.

### Deliverables

```text
Dice parser
Dice roller
Chat messages
Roll messages
Whispers
GM rolls
Chat commands
Realtime chat
```

### Key tickets

```text
Implement dice parser
Implement dice roller
Implement dice result model
Implement chat table
Implement chat API
Implement chat WebSocket events
Implement /roll command
Implement /w command
Implement /gmroll command
Render roll cards
Add roll visibility permissions
```

### Definition of done

```text
A player can roll from chat, whisper another player, and make a private GM roll.
```

---

## Phase 5: Actors, items, and basic sheets

### Goal

Users can create actors and items and open basic sheets.

### Deliverables

```text
Actor CRUD
Item CRUD
Actor ownership
Basic generic sheet
Token linked to actor
Actor image
HP/resource tracking
```

### Key tickets

```text
Implement actor table
Implement item table
Implement actor API
Implement item API
Implement actor permissions
Implement generic actor sheet
Implement generic item sheet
Link token to actor
Implement actor directory
Implement item directory
```

### Definition of done

```text
A GM can create a character, assign it to a player, place its token, and the player can update allowed sheet fields.
```

---

## Phase 6: Journals, handouts, and compendium basics

### Goal

The GM can manage notes, secrets, handouts, and reusable content.

### Deliverables

```text
Journal CRUD
Folder/tree organization
Visibility controls
Handout sharing
Compendium pack model
Basic import/export for compendium entries
```

### Key tickets

```text
Implement journal table
Implement journal API
Implement rich text editor
Implement journal folders
Implement journal visibility
Implement share-to-players flow
Implement compendium table
Implement compendium entry table
Implement compendium browser
```

### Definition of done

```text
GM can write private notes, reveal a handout, and drag an actor/item from a compendium.
```

---

## Phase 7: Combat tracker and encounters

### Goal

The GM can run turn-based combat.

### Deliverables

```text
Encounter model
Combat model
Initiative tracker
Round tracking
Turn advancement
Token-to-combatant linking
Basic encounter creation
```

### Key tickets

```text
Implement encounter table
Implement combat table
Implement combatant table
Implement initiative rolling
Implement combat tracker UI
Implement next/previous turn
Implement round counter
Implement encounter builder UI
Implement add tokens to encounter
```

### Definition of done

```text
GM can select tokens, create encounter, roll initiative, and run turns.
```

---

## Phase 8: Fog, walls, and lighting MVP

### Goal

Scenes support basic exploration and visibility.

### Deliverables

```text
Manual fog
Fog reveal/hide
Wall drawing
Token vision
Basic light source
Player-specific visibility
```

### Key tickets

```text
Implement fog layer
Implement fog data model
Implement reveal brush
Implement hide brush
Implement wall model
Implement wall drawing tool
Implement line-of-sight calculation
Implement token vision radius
Implement light source rendering
```

### Definition of done

```text
Players can only see revealed/visible areas according to fog and basic walls.
```

---

## Phase 9: System SDK

### Goal

Game systems can define actor schemas, item schemas, sheets, dice formulas, and automation hooks.

### Deliverables

```text
System manifest
Schema loader
Sheet registration
Dice formula registration
System hooks
Example fantasy system
System install flow
```

### Key tickets

```text
Define system manifest schema
Implement system registry
Implement schema validation
Implement sheet registration API
Implement dice formula registration
Implement client system loader
Implement server system loader
Build example system
Write system SDK docs
```

### Definition of done

```text
A developer can create a simple rules system with a custom character sheet and install it.
```

---

## Phase 10: Plugin SDK

### Goal

Third-party developers can build plugins safely.

### Deliverables

```text
Plugin manifest
Plugin registry
Plugin permission model
Client plugin runtime
Server plugin runtime
Plugin API bridge
Example plugins
Plugin docs
```

### Key tickets

```text
Define plugin manifest schema
Implement plugin install API
Implement plugin permissions
Implement client sandbox
Implement server worker runtime
Implement plugin event hooks
Implement plugin UI panels
Implement plugin chat commands
Implement plugin proposal creation
Build example plugin
Write plugin SDK docs
```

### Definition of done

```text
A developer can build a plugin that adds a panel, listens to token movement, and posts a chat message with permission.
```

---

## Phase 11: Import/export and portability

### Goal

Campaign data is portable.

### Deliverables

```text
Campaign export archive
Campaign import
Actor export/import
Scene export/import
Compendium export/import
Asset manifest
Schema versioning
Migration support
```

### Key tickets

```text
Define .ottx archive format
Implement export service
Implement import service
Implement asset checksums
Implement schema version manifest
Implement import conflict resolver
Implement export UI
Implement import UI
```

### Definition of done

```text
A GM can export a campaign, import it into a fresh instance, and retain scenes, actors, journals, assets, and permissions.
```

---

## Phase 12: AI Gateway foundation

### Goal

The platform has a safe, provider-agnostic AI layer.

### Deliverables

```text
AI Gateway app
AI provider interface
AI thread model
AI tool registry
Permission-filtered context builder
AI audit log
Proposal integration
OpenAI provider adapter
Local/custom provider adapter placeholder
```

### Key tickets

```text
Create ai-gateway app
Define AI provider interface
Implement AI thread table
Implement AI message table
Implement AI tool call table
Implement AI audit log
Implement context builder
Implement permission redaction
Implement proposal tool
Implement provider config
Implement streaming response API
Implement AI panel MVP
```

### Definition of done

```text
GM can ask an AI assistant a campaign question and receive a permission-filtered answer with logged tool calls.
```

---

## Phase 13: Codex App Server adapter

### Goal

Codex App Server powers rich assistant workflows where appropriate.

### Deliverables

```text
Codex provider package
Transport abstraction
Stdio transport
Loopback WebSocket transport
Thread bridge
Event mapper
Approval bridge
Skill registry
Dynamic tool bridge
Codex security config docs
```

### Key tickets

```text
Implement CodexAppServerProvider
Implement stdio process launcher
Implement JSON-RPC client
Implement initialize flow
Implement thread/start bridge
Implement turn/start bridge
Map Codex streaming events to AI events
Map Codex approval requests to proposal UI
Implement dynamic tool bridge
Implement skills/list integration
Implement Codex provider settings UI
Write Codex integration docs
```

### Definition of done

```text
GM can start a Codex-backed assistant thread from the VTT, stream responses, approve proposed VTT changes, and invoke an encounter-design skill.
```

---

## Phase 14: AI encounter designer MVP

### Goal

AI can design and balance encounters, then create reviewable drafts.

### Deliverables

```text
Encounter designer UI
Encounter design tool
Encounter balance tool
Encounter proposal creation
Journal draft creation
Token draft creation
Encounter design skill
```

### Key tickets

```text
Build encounter designer form
Implement party summary context
Implement rules/system context
Implement encounter.design tool
Implement encounter.balance tool
Implement proposal output schema
Implement journal draft tool
Implement token draft tool
Create encounter-designer skill
Add encounter proposal review UI
```

### Definition of done

```text
GM can ask for an encounter, receive a structured design, and approve creation of encounter notes and token drafts.
```

---

## Phase 15: AI campaign memory MVP

### Goal

AI can summarize sessions and extract campaign facts for GM approval.

### Deliverables

```text
Session recap tool
Memory fact model
Memory approval queue
Campaign search tool
Campaign librarian skill
Session recap skill
Memory UI
```

### Key tickets

```text
Implement memory fact table
Implement memory API
Implement memory approval queue
Implement session recap tool
Implement memory extraction tool
Implement campaign.search tool
Implement source citation metadata
Implement memory visibility model
Create campaign-librarian skill
Create session-recap skill
Build memory UI
```

### Definition of done

```text
GM can generate a recap, approve extracted facts, and later ask campaign-memory questions.
```

---

## Phase 16: Dev assistant for modules/plugins

### Goal

Codex helps developers build systems and plugins.

### Deliverables

```text
Module builder assistant
Plugin builder assistant
System scaffolder
Plugin scaffolder
SDK docs integration
Code generation proposals
Test generation helper
```

Codex CLI is useful here because OpenAI describes it as a local coding agent that can read, change, and run code in the selected directory, and the CLI is open source. ([OpenAI Developers][5])

### Key tickets

```text
Create vtt-module-builder skill
Create rules-system-builder skill
Create plugin-reviewer skill
Implement scaffold-system command
Implement scaffold-plugin command
Implement SDK docs retrieval
Implement code proposal review flow
Implement generated test templates
```

### Definition of done

```text
A developer can ask the assistant to scaffold a game system or plugin and receive reviewable generated files.
```

---

## Phase 17: Beta hardening

### Goal

The platform is usable by real groups.

### Deliverables

```text
Performance pass
Security pass
Accessibility pass
Load tests
Plugin review tooling
Backup/restore
Better docs
Public demo campaign
Contributor onboarding
```

### Key tickets

```text
Run load tests for realtime scenes
Optimize token rendering
Optimize fog rendering
Add DB indexes
Add rate limits
Add CSP
Add XSS tests
Add permission tests
Add plugin sandbox tests
Add AI redaction tests
Add backup command
Add restore command
Write GM quickstart
Write developer quickstart
Write self-hosting guide
```

### Definition of done

```text
External users can self-host, run sessions, build plugins, and report bugs against documented behavior.
```

---

# 30. MVP definition

The actual MVP should be brutally focused.

## MVP must include

```text
Auth
Campaigns
Scenes
Maps
Tokens
Realtime token movement
Dice
Chat
Actors
Basic sheets
Journals
Combat tracker
Basic fog
Public REST API
WebSocket API
API docs
Export/import
Plugin manifest
System manifest
AI Gateway
Codex App Server adapter
Encounter designer
Session recap
Campaign memory approval queue
Self-hosted Docker Compose
```

## MVP can skip

```text
Marketplace payments
Video/audio
Mobile app
Advanced lighting
3D dice
Dynamic sound
Every rules system
Full D&D automation
Complex compendium marketplace
Native desktop app
```

---

# 31. First 25 engineering tickets

This is where I would actually start.

```text
1. Create monorepo with pnpm and Turborepo.
2. Add apps/web, apps/api, apps/worker, apps/ai-gateway.
3. Add packages/core, packages/database, packages/api-contracts.
4. Add Docker Compose with PostgreSQL, Redis, MinIO.
5. Add shared TypeScript config.
6. Add Fastify API healthcheck.
7. Add React/Vite web health page.
8. Add database migration system.
9. Create User, Campaign, CampaignMember tables.
10. Implement auth/session model.
11. Implement campaign CRUD API.
12. Generate OpenAPI docs.
13. Generate typed API client.
14. Build campaign dashboard.
15. Add scene table and scene API.
16. Add asset upload API.
17. Add basic canvas renderer.
18. Add map upload and map display.
19. Add token table and token API.
20. Add token rendering and drag movement.
21. Add WebSocket gateway.
22. Broadcast token movement events.
23. Add dice parser package.
24. Add chat table/API/UI.
25. Add AI Gateway skeleton with provider interface.
```

---

# 32. First 10 AI tickets

```text
1. Define AI provider interface.
2. Define AI thread/message/tool-call tables.
3. Implement AI permission context builder.
4. Implement AI audit logging.
5. Implement proposal model and proposal API.
6. Implement basic OpenAI/custom provider adapter.
7. Implement Codex App Server JSON-RPC client.
8. Implement Codex stdio transport.
9. Implement AI streaming response endpoint.
10. Create encounter-designer skill and wire it into the assistant panel.
```

---

# 33. First 10 plugin/system tickets

```text
1. Define plugin manifest JSON schema.
2. Define system manifest JSON schema.
3. Implement system registry.
4. Implement actor schema validation.
5. Implement generic actor sheet.
6. Implement sheet registration API.
7. Implement plugin install API.
8. Implement plugin permission model.
9. Implement client plugin sandbox.
10. Build one example plugin and one example system.
```

---

# 34. Contributor structure

## 34.1 Workstreams

```text
Core backend
Frontend/canvas
Realtime infrastructure
Rules/system SDK
Plugin SDK
AI Gateway
Codex integration
Security/privacy
Docs/community
DevOps/self-hosting
```

## 34.2 Maintainer roles

```text
Core maintainer
Frontend maintainer
Backend maintainer
Plugin ecosystem maintainer
AI maintainer
Security maintainer
Docs maintainer
Release manager
```

## 34.3 Governance

Create:

```text
GOVERNANCE.md
Maintainer nomination process
RFC process
Security disclosure process
Plugin review policy
Code of conduct
Release policy
```

## 34.4 RFCs to write first

```text
RFC-001: Core architecture
RFC-002: API-first contract
RFC-003: Plugin permission model
RFC-004: System SDK design
RFC-005: AI Gateway and proposal model
RFC-006: Codex App Server integration
RFC-007: Campaign export format
RFC-008: Licensing and content policy
```

---

# 35. Testing strategy

## 35.1 Unit tests

```text
Dice parser
Permission checks
Schema validation
Proposal application
Event reducers
AI redaction
Plugin manifest validation
System manifest validation
```

## 35.2 Integration tests

```text
Campaign CRUD
Scene CRUD
Token movement
Chat messages
Actor updates
Journal visibility
Plugin install
AI tool calls
Proposal approval
Export/import
```

## 35.3 E2E tests

```text
Create campaign
Invite player
Create scene
Upload map
Move token
Roll dice
Send whisper
Start combat
Generate AI encounter
Approve proposal
Export campaign
```

## 35.4 Security tests

```text
Player cannot read GM notes
Player cannot move unowned token
Plugin cannot access undeclared permission
AI cannot read excluded context
AI cannot apply proposal without approval
WebSocket rejects unauthorized user
Journal HTML sanitization blocks XSS
```

---

# 36. Performance targets

Initial practical targets:

```text
Scene supports 100 tokens smoothly.
Scene supports 10 concurrent users.
Chat latency feels realtime.
Token movement updates under normal network conditions.
Campaign export works for asset-heavy campaigns.
Fog and lighting do not destroy frame rate on common maps.
```

Later targets:

```text
500+ tokens
Large maps
Large compendia
Multiple active scenes
High-volume actual-play tables
Hosted multi-tenant scaling
```

---

# 37. Documentation plan

## 37.1 User docs

```text
Getting started as GM
Getting started as player
Creating a campaign
Creating a scene
Adding tokens
Using journals
Running combat
Using AI encounter builder
Using session recap
Exporting your campaign
Self-hosting guide
```

## 37.2 Developer docs

```text
API overview
Authentication
REST API
WebSocket API
Plugin SDK
System SDK
Character sheet development
Compendium development
AI tool development
Codex integration
MCP server integration
Testing plugins
Publishing plugins
```

## 37.3 Contributor docs

```text
Repo setup
Architecture overview
Coding standards
Testing guide
Release process
RFC process
Security process
```

---

# 38. Major risks

## 38.1 Scope explosion

Risk:

```text
Trying to support every game, every automation, every sheet, every lighting feature immediately.
```

Mitigation:

```text
Build a generic platform first.
Ship one example system.
Make advanced automation plugin-driven.
```

## 38.2 Plugin security

Risk:

```text
Plugins become a malware vector.
```

Mitigation:

```text
Permission manifests
Sandboxing
Audit logs
Signed packages
Admin approval
No direct DB access
```

## 38.3 AI leaking secrets

Risk:

```text
Player assistant sees GM-only notes.
```

Mitigation:

```text
Permission-filtered retrieval
Visibility labels
Context redaction
AI audit logs
Tests for secret boundaries
```

## 38.4 Codex App Server mismatch

Risk:

```text
Codex App Server is useful but not ideal for every in-game AI flow.
```

Mitigation:

```text
AI Gateway provider abstraction
Codex as one adapter
Generic OpenAI/local/custom adapters
No hard dependency
```

## 38.5 Legal content issues

Risk:

```text
People expect proprietary D&D content bundled.
```

Mitigation:

```text
Ship only open/original content
Make content packs separate
Require license metadata
Document content policy
```

---

# 39. The concrete build order I would follow

The most sane order is:

```text
1. Repo foundation
2. Auth/campaigns
3. Scenes/maps/assets
4. Tokens/realtime
5. Dice/chat
6. Actors/items/sheets
7. Journals/handouts
8. Combat/encounters
9. Fog/walls/basic lighting
10. Public API hardening
11. System SDK
12. Plugin SDK
13. Export/import
14. AI Gateway
15. Codex App Server adapter
16. Encounter designer
17. Session recap
18. Campaign memory
19. Dev assistant
20. Beta hardening
```

This avoids the trap of building AI before the game state exists. The AI needs campaign data, actors, journals, encounters, and proposals to be useful.

---

# 40. The actual north-star product

The final product should feel like this:

```text
GM opens campaign.
Players join.
GM activates scene.
Tokens move in realtime.
Dice and chat work.
Character sheets are system-defined.
Journals and handouts are permissioned.
Plugins can extend everything.
Developers have real APIs.
Campaign data can be exported.
AI can help prep, summarize, search, and draft.
Codex can help build modules and run rich assistant workflows.
Nothing important happens without permission.
```

The one-sentence version:

> **OpenTabletop Engine is an open-source, self-hostable, API-first VTT platform with a secure plugin ecosystem and a permissioned AI copilot for encounter design, campaign memory, session prep, and module development.**

[1]: https://developers.openai.com/codex/app-server "App Server – Codex | OpenAI Developers"
[2]: https://developers.openai.com/codex/skills "Agent Skills – Codex | OpenAI Developers"
[3]: https://developers.openai.com/codex/concepts/customization "Customization – Codex | OpenAI Developers"
[4]: https://developers.openai.com/codex/plugins "Plugins – Codex | OpenAI Developers"
[5]: https://developers.openai.com/codex/cli "CLI – Codex | OpenAI Developers"
