# AI Gateway

The AI layer is provider-agnostic. `packages/ai-core` defines:

- provider interface
- streaming event types
- typed tool definitions
- permission-filtered context builder
- local echo provider for development
- OpenAI Responses API provider adapter

The API endpoint `POST /api/v1/campaigns/{campaignId}/ai/threads` creates a thread and returns an assistant response. `GET /api/v1/campaigns/{campaignId}/ai/threads` gives GMs the campaign's AI thread status history, and `GET /api/v1/campaigns/{campaignId}/ai/usage` aggregates operational usage by provider. The web AI panel shows GM-only operational rollups, recent threads, provider usage, and recent tool calls. The web client wraps assistant output in a reviewable proposal before applying campaign changes.

AI MVP endpoints also include:

- `GET /api/v1/campaigns/{campaignId}/ai/threads`
- `GET /api/v1/campaigns/{campaignId}/ai/usage`
- `POST /api/v1/campaigns/{campaignId}/ai/encounter-design`
- `POST /api/v1/campaigns/{campaignId}/ai/session-recap`
- `GET|POST /api/v1/campaigns/{campaignId}/ai/memory`
- `POST /api/v1/campaigns/{campaignId}/ai/memory/extract`
- `GET /api/v1/campaigns/{campaignId}/ai/tool-calls`
- `POST /api/v1/ai/memory/{factId}/approve`

Provider packages include the local echo provider, the OpenAI Responses API adapter, and `@open-tabletop/codex-app-server-provider`, which defines the Codex App Server JSON-RPC transport bridge and maps Codex events into OpenTabletop AI provider events.

Configure `OTTE_AI_PROVIDER=openai-responses` to use the OpenAI adapter. It reads `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-5-mini`), `OPENAI_BASE_URL` (default `https://api.openai.com/v1`), `OPENAI_ORGANIZATION`, and `OPENAI_PROJECT`. The adapter sends permission-filtered campaign context in the Responses request instructions, maps typed OpenTabletop AI tools to function tools, maps returned function calls back to OpenTabletop tool events, and maps provider-reported token usage into thread usage metrics. Provider calls retry once before any event is emitted by default; set `OTTE_AI_PROVIDER_RETRY_ATTEMPTS` from `0` to `3` to adjust that pre-event retry budget. Set `OTTE_AI_INPUT_TOKEN_COST_USD_PER_1K` and `OTTE_AI_OUTPUT_TOKEN_COST_USD_PER_1K` to calculate estimated costs from provider-reported token usage.

AI thread tools currently include:

- `create_proposal` for generic GM-approved campaign changes.
- `draft_encounter` for encounter proposal drafts.
- `draft_journal_entry` for journal-entry proposal drafts.
- `draft_scene` for scene proposal drafts.
- `draft_token_update` for token update proposal drafts.
- `draft_actor_update` for actor update proposal drafts.
- `create_memory` for queued memory facts.
- `roll_dice` for campaign dice rolls posted to chat.
- `read_compendium` for permission-safe rules compendium lookups.

Every tool is checked against the human caller's campaign permissions before execution. The provider only receives tool definitions whose declared permissions are already available to the caller, and execution-time checks still enforce the same requirements if a stale or malicious provider emits an unavailable tool call. Proposal-backed campaign edit tools require `ai.proposeChanges` plus the underlying edit permission, and the generic `create_proposal` tool rejects proposal changes whose underlying edit permission is missing. Tool inputs are validated against each tool's required schema before side effects run, so malformed provider function-call arguments are returned as failed tool outputs instead of default-valued campaign mutations. Started, completed, and failed tool calls are persisted with completion durations, and GMs can inspect them through `GET /api/v1/campaigns/{campaignId}/ai/tool-calls`. Threads persist operational status fields including `running`, `completed`, or `failed`, start/end timestamps, duration, retry attempts, event count, tool-call count, prompt/context/response character counts, provider token usage, estimated cost when rates are configured, and provider error text when a provider call fails.
