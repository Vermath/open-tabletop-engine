# Audio and Video Integrations

OpenTabletop Engine does not proxy voice or video traffic in v1. Keep realtime tabletop state, dice, chat, assets, AI, plugins, and archives in OpenTabletop, and hand audio/video to a dedicated RTC provider.

## Supported Handoff Pattern

Use an external room provider such as Discord, Zoom, Google Meet, Jitsi, LiveKit, or a hosted WebRTC/SFU service. Share the room URL through one of the existing campaign-safe surfaces:

- Public or player-specific journal entry for standing campaign room links.
- Public chat message for session-start links.
- GM-only chat or GM-only journal entry for prep links.
- Invite or onboarding handout text for first-session instructions.
- Plugin command output for a provider-specific helper, as long as the plugin only emits reviewed chat/output and does not mutate campaign state directly.

Do not store provider secrets, moderator keys, recording links, or long-lived room admin URLs in public journal entries or chat. Use the provider dashboard or secret manager for those values.

## Identity Boundary

OpenTabletop authentication and provider authentication are separate boundaries.

- OIDC/SCIM can provision OpenTabletop users and roles, but it does not automatically grant access to a third-party meeting room.
- Prefer provider-side waiting rooms, passcodes, host controls, or domain restrictions for audio/video access.
- If the RTC provider supports OIDC/SAML, configure it independently against the same identity provider rather than reusing OpenTabletop bearer tokens.
- When posting room links, choose journal/chat visibility that matches the table audience.

## Deployment Boundary

Do not route media through the OpenTabletop API process. For self-hosted deployments:

- Terminate TLS for OpenTabletop and the RTC provider separately.
- Keep OpenTabletop websocket traffic on the documented API origin.
- Put TURN/STUN/SFU ports, DNS, and certificates under the RTC provider or separate media infrastructure.
- Monitor RTC health in the provider tooling, not the OpenTabletop job ledger.

If embedding a provider UI is added later, implement it as a web-client integration with explicit allowlisted origins, clear user consent, and no access to OpenTabletop session tokens from the embedded frame.

## Provider Notes

Discord:
- Best fit for community campaigns that already use a server.
- Share channel or event links through a player-visible journal entry.
- Use Discord roles for voice permissions.

Zoom or Google Meet:
- Best fit for scheduled games with calendar invites.
- Store the attendee link in a player-visible handout.
- Keep host keys and recording management outside OpenTabletop.

Jitsi:
- Best fit for lightweight self-hosted or public-room handoff.
- Use room passcodes and lobby controls when available.
- If self-hosting, manage Jitsi persistence, TURN, and certificates independently.

LiveKit or another SFU:
- Best fit for custom hosted RTC.
- Treat room creation tokens as secrets.
- A plugin may generate a reviewed handoff message, but token minting should happen in a separate trusted service.

## Operational Checklist

Before a production session:

- Confirm the room URL works for a player account, not just the GM.
- Confirm audio/video access does not require OpenTabletop server-admin permissions.
- Confirm the room link is visible only to intended campaign members.
- Confirm the provider's recording, moderation, and retention settings match the table policy.
- Confirm the OpenTabletop session remains usable if the RTC provider is down.

## Explicit Non-Goals for v1

- Built-in WebRTC mesh or SFU hosting.
- Recording storage or transcript ingestion from RTC providers.
- Provider-side moderation, kick/ban, or waiting-room controls inside OpenTabletop.
- Automatic calendar sync.
- Sharing OpenTabletop bearer tokens with audio/video providers.
