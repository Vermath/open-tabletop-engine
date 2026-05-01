# AI Gateway

The AI layer is provider-agnostic. `packages/ai-core` defines:

- provider interface
- streaming event types
- tool definitions
- permission-filtered context builder
- local echo provider for development

The API endpoint `POST /api/v1/campaigns/{campaignId}/ai/threads` creates a thread and returns an assistant response. The web client wraps assistant output in a reviewable proposal before applying campaign changes.

Planned providers include OpenAI-compatible HTTP, local model endpoints, and a Codex App Server adapter.
