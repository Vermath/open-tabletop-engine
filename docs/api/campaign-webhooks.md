# Campaign Webhooks

Campaign webhooks are outbound, campaign-scoped notifications for integrations operated by the campaign owner. They are not an inbound command API and cannot mutate campaign state. The stable `1.0` envelope contains bounded identifiers and event metadata only; it never embeds arbitrary chat, dice, journal, AI, imported-content, or other user-authored payloads.

All management routes require an authenticated caller with `campaign.update`. Every mutation also requires an `Idempotency-Key` for one logical human-confirmed action and an exact campaign or webhook revision. A stale revision returns `409` before mutation.

## Routes

| Method | Route | Result |
| --- | --- | --- |
| `GET` | `/api/v1/campaigns/{campaignId}/webhooks` | Public configuration and supported event types; never a secret. |
| `POST` | `/api/v1/campaigns/{campaignId}/webhooks` | Creates a subscription. A fresh `201` shows the signing secret once. |
| `PATCH` | `/api/v1/campaigns/{campaignId}/webhooks/{webhookId}` | Updates name, target, events, or enabled state. |
| `POST` | `/api/v1/campaigns/{campaignId}/webhooks/{webhookId}/disable` | Stops automatic event delivery. |
| `DELETE` | `/api/v1/campaigns/{campaignId}/webhooks/{webhookId}` | Deletes the subscription. |
| `POST` | `/api/v1/campaigns/{campaignId}/webhooks/{webhookId}/rotate-secret` | Immediately invalidates the old secret and shows the replacement once. |
| `GET` | `/api/v1/campaigns/{campaignId}/webhooks/{webhookId}/deliveries?limit=50` | Newest-first metadata-only ledger, bounded to `1..100`. |
| `POST` | `/api/v1/campaigns/{campaignId}/webhooks/{webhookId}/test` | Queues a signed `webhook.test` delivery and returns `202`. |
| `POST` | `/api/v1/campaigns/{campaignId}/webhooks/{webhookId}/deliveries/{deliveryId}/retry` | Queues a new attempt for one failed delivery and returns `202`. |

Create uses `expectedCampaignUpdatedAt`; all subscription-specific writes use `expectedUpdatedAt`. The create and rotation responses deliberately have two replay-safe variants:

- A fresh response contains `signingSecret`.
- A replay contains `signingSecretAlreadyShown: true` and does not expose the secret again.

If a one-time secret was not stored, rotate it. Do not repeatedly retry creation expecting the original plaintext to reappear.

Disabling a subscription stops automatic event dispatch. An authorized operator may still queue an explicit test or retry against an otherwise unchanged disabled subscription for diagnostics. Update, rotation, disable, or deletion invalidates queued work that captured older configuration, so stale queued work cannot send to an old URL or with an old secret.

## Delivery format

The sender posts `application/json` with these headers:

```text
User-Agent: OpenTabletop-Webhook/1.0
X-Open-Tabletop-Event-Id: <event id>
X-Open-Tabletop-Timestamp: <Unix seconds>
X-Open-Tabletop-Signature: v1=<64 lowercase hexadecimal characters>
```

The signature is HMAC-SHA256 over the exact UTF-8 bytes of:

```text
<timestamp>.<raw request body>
```

Example envelope:

```json
{
  "version": "1.0",
  "eventId": "evt_01",
  "eventType": "scene.updated",
  "occurredAt": "2026-07-13T18:30:00.000Z",
  "campaignId": "cmp_01",
  "resource": {
    "type": "scene",
    "id": "scn_01"
  }
}
```

The `resource` field is optional. Consumers must tolerate additional event names only after they appear in the published supported-event list; the envelope version changes for incompatible semantics.

## Safe Node.js verification example

Capture the raw request bytes before a JSON body parser changes spacing or encoding. Reject stale timestamps before doing application work, validate the signature shape, and compare fixed-length byte buffers with `timingSafeEqual`.

```js
import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_SKEW_SECONDS = 5 * 60;

export function verifyOpenTabletopWebhook({
  rawBody,
  timestampHeader,
  signatureHeader,
  signingSecret,
  nowSeconds = Math.floor(Date.now() / 1000),
}) {
  if (!Buffer.isBuffer(rawBody)) return false;
  if (!/^\d{10}$/.test(timestampHeader ?? "")) return false;

  const timestamp = Number(timestampHeader);
  if (!Number.isSafeInteger(timestamp)) return false;
  if (Math.abs(nowSeconds - timestamp) > MAX_SKEW_SECONDS) return false;

  const match = /^v1=([a-f0-9]{64})$/.exec(signatureHeader ?? "");
  if (!match) return false;

  const signedBytes = Buffer.concat([
    Buffer.from(`${timestampHeader}.`, "utf8"),
    rawBody,
  ]);
  const expected = createHmac("sha256", signingSecret)
    .update(signedBytes)
    .digest();
  const received = Buffer.from(match[1], "hex");

  return received.length === expected.length && timingSafeEqual(received, expected);
}
```

After verification, parse the body, require `version === "1.0"`, and verify that the envelope `eventId` equals `X-Open-Tabletop-Event-Id`. Atomically record `eventId` in a deduplication store before side effects, because delivery is at least once and retries receive a new delivery id for the same event. Return a `2xx` quickly and move slow work to your own queue.

## Receiver and secret safety

- Store signing secrets in a receiver secret manager, never source control, browser storage, logs, analytics, or error traces.
- Treat rotation as immediate invalidation. Update the receiver before sending a test.
- Enforce a small raw-body limit and an application timeout at the receiver.
- Reject missing, malformed, or stale signature headers before JSON parsing or side effects.
- Never log the signature header or raw body. Even though the v1 envelope is metadata-only, identifiers may still be operationally sensitive.
- Deduplicate by `eventId`; do not use delivery order as campaign truth.
- Use the authenticated REST API and its normal permission/revision checks for any separate operator-approved write. A webhook delivery itself grants no authority to mutate OpenTabletop.

OpenTabletop validates outbound targets before saving and delivery. Production targets require HTTPS; credentials, query strings, fragments, loopback/private/special-use addresses, redirects, oversized bodies, oversized responses, and slow responses are rejected or bounded by the sender.
