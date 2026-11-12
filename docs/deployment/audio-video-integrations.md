# Audio and Video Integrations

OpenTabletop Engine does not proxy voice or video traffic in v1. Keep realtime tabletop state, dice, chat, assets, AI, plugins, and archives in OpenTabletop, and hand audio/video to a dedicated RTC provider.

There are two ways to do that: share a room link (below), or let the web client embed your provider in a call panel ([Embedded Call Panel](#embedded-call-panel)). Both keep media and provider credentials outside OpenTabletop.

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

## Embedded Call Panel

The web client can show a **Join call** control and open your provider's room in a movable panel beside the table. It is off by default: with nothing configured there is no control, no extra request, and no change to the security headers.

It works with any provider whose room page may be shown in a frame and that needs no token from OpenTabletop, for example a self-hosted Jitsi Meet or LiveKit Meet deployment. Providers that forbid framing (Discord, Zoom, Google Meet) only work as shared links.

### Configure

| Variable | Set on | Purpose |
| --- | --- | --- |
| `OTTE_CALL_EMBED_URL` | API and web server | Room URL. `{room}` is replaced with an opaque per-campaign room name. Without `{room}`, every campaign shares the one room. |
| `OTTE_CALL_ROOM_SECRET` | API | Required when the URL uses `{room}`. At least 32 characters; generate one with `openssl rand -base64 48`. |
| `OTTE_CALL_PROVIDER_NAME` | API | Name shown to users. Defaults to the provider's host name. |

```bash
OTTE_CALL_EMBED_URL=https://meet.example.com/otte-{room}
OTTE_CALL_ROOM_SECRET=<48 random bytes, base64>
OTTE_CALL_PROVIDER_NAME=Jitsi
```

The URL must be HTTPS (plain HTTP is accepted only for loopback development), must not contain credentials or a wildcard, and may use `{room}` in the path, query or fragment but not in the host. `{room}` is the only placeholder. With Docker Compose, set the variables in `.env`; they are passed to both services. The web server refuses to start with an invalid URL. The API treats an invalid or incomplete configuration as off and logs `Call embed is off: <reason>`.

### What users see

A campaign member gets a **Join call** button among the rail utilities. The first time, a notice names the provider and its host and says that voice and video go directly to it; the provider loads only after they choose **Join call**. That choice is remembered per provider in the browser, so later joins take one click. The panel can be dragged, resized, minimised (double-click its header), opened in a new tab, and closed, which leaves the call. Changing workspace mode does not end the call; reloading the page or switching campaign does.

### What is shared with the provider

- The room URL. The room name is an HMAC of the campaign id under `OTTE_CALL_ROOM_SECRET`: the same for every member of a campaign, different between campaigns, and not derivable from the campaign id without the secret.
- Nothing else from OpenTabletop: no session token, user id, display name, campaign id or referrer. Users type their own name in the provider.
- Whatever the user's browser sends to the provider directly once they join (IP address, the media itself).

### Security boundary

- `GET /api/v1/campaigns/{campaignId}/call` returns the room only to someone with `campaign.read` on that campaign.
- The web server adds the provider's origin, and only that origin, to `frame-src` in the content security policy, and delegates `camera`, `microphone` and `display-capture` to it in `Permissions-Policy`. The provider is never allowed as a script or connection source.
- The client embeds a room only if it is on the origin the server named, and frames it with `sandbox` (no top-level navigation), `referrerpolicy="no-referrer"`, and camera, microphone, screen-capture, fullscreen and autoplay permissions only.
- Anyone who knows a room URL can join that room as far as OpenTabletop is concerned. Use the provider's own lobby, passcode or authentication for access control, as described under [Identity Boundary](#identity-boundary).
- Rotating `OTTE_CALL_ROOM_SECRET` moves every campaign to a new room.

### If you run your own reverse proxy

The bundled web server and the Docker web image set the headers for you. If you serve the web bundle another way, add the provider's origin to `frame-src` and to `Permissions-Policy` yourself. `sh infra/docker/render-web-nginx-config.sh --print` shows the exact values for the current environment.

### Limits

- Not verified against a specific provider release; check that your provider's room page loads in a frame and that its join flow works inside the panel's sandbox.
- No moderation, recording, presence or mute state is read from or sent to the provider.
- The desktop host application does not set these headers yet.

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

- Built-in WebRTC mesh or SFU hosting. The embedded call panel shows your provider; it is not a media stack.
- Minting provider tokens or signing users in to the provider.
- Recording storage or transcript ingestion from RTC providers.
- Provider-side moderation, kick/ban, or waiting-room controls inside OpenTabletop.
- Automatic calendar sync.
- Sharing OpenTabletop bearer tokens with audio/video providers.
