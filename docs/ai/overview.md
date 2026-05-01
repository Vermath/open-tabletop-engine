# AI Gateway

The AI layer is provider-agnostic. `packages/ai-core` defines:

- provider interface
- streaming event types
- typed tool definitions
- permission-filtered context builder
- local echo provider for development
- OpenAI Responses API provider adapter

The API endpoint `POST /api/v1/campaigns/{campaignId}/ai/threads` creates a thread and returns an assistant response. The web client wraps assistant output in a reviewable proposal before applying campaign changes.

AI MVP endpoints also include:

- `POST /api/v1/campaigns/{campaignId}/ai/encounter-design`
- `POST /api/v1/campaigns/{campaignId}/ai/session-recap`
- `GET|POST /api/v1/campaigns/{campaignId}/ai/memory`
- `POST /api/v1/campaigns/{campaignId}/ai/memory/extract`
- `GET /api/v1/campaigns/{campaignId}/ai/tool-calls`
- `POST /api/v1/ai/memory/{factId}/approve`

Provider packages include the local echo provider, the OpenAI Responses API adapter, and `@open-tabletop/codex-app-server-provider`, which defines the Codex App Server JSON-RPC transport bridge and maps Codex events into OpenTabletop AI provider events.

Configure `OTTE_AI_PROVIDER=openai-responses` to use the OpenAI adapter. It reads `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-5-mini`), `OPENAI_BASE_URL` (default `https://api.openai.com/v1`), `OPENAI_ORGANIZATION`, and `OPENAI_PROJECT`. The adapter sends permission-filtered campaign context in the Responses request instructions, maps typed OpenTabletop AI tools to function tools, and maps returned function calls back to OpenTabletop tool events.

AI thread tools currently include:

- `create_proposal` for generic GM-approved campaign changes.
- `draft_encounter` for encounter proposal drafts.
- `create_memory` for queued memory facts.
- `roll_dice` for campaign dice rolls posted to chat.
- `read_compendium` for permission-safe rules compendium lookups.

Every tool is checked against the human caller's campaign permissions before execution. Started and completed tool calls are persisted, and GMs can inspect them through `GET /api/v1/campaigns/{campaignId}/ai/tool-calls`.
