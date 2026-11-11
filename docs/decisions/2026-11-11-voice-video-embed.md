# Voice and video: embed a provider, off by default

Date: 2026-11-11
Status: adopted

## Decision

OpenTabletop does not build or host media transport. Voice and video are offered by embedding a provider the operator already runs or trusts (Jitsi Meet, LiveKit Meet, or any room page that works in a frame) in a call panel in the web client.

The feature is off unless the operator sets `OTTE_CALL_EMBED_URL`. Nothing from the provider is requested until a user chooses to join.

## Why

Tables expect to talk while they play, and leaving the tab for a call is a common reason a table keeps a second tool open. Building an SFU, TURN and recording is a product in its own right and would put media traffic and its failure modes inside the tabletop server. Embedding gives the in-app experience while every hard part stays with software built for it.

Off by default keeps the project's privacy stance: a fresh install talks to nothing but itself.

## How it works

- The operator sets a room URL template. `{room}` becomes an HMAC of the campaign id under `OTTE_CALL_ROOM_SECRET`, so each campaign gets a stable room that cannot be guessed from its id, and the provider never sees an OpenTabletop identifier.
- `GET /api/v1/campaigns/{campaignId}/call` returns the room to callers with `campaign.read`, or `enabled: false`.
- The web server allows the provider's origin, and only it, in `frame-src`, and delegates camera, microphone and screen capture to it. Without the setting those headers are unchanged.
- The client shows **Join call** among the rail utilities, asks once per provider before loading it, and frames the room with `sandbox`, no referrer and device permissions only.

Operator documentation: `docs/deployment/audio-video-integrations.md`.

## Not done here

- No media transport, TURN, recording or transcription.
- No provider tokens. A provider that needs a signed token per user needs a token service; that would be a separate, explicit decision.
- No presence, mute state or moderation shared between the provider and the table.
- The user's display name is not passed to the provider.
- Speech-to-text and session transcripts are a separate decision.

## Revisit when

A provider integration needs tokens, or there is demand for showing who is speaking on tokens or in the party list.
