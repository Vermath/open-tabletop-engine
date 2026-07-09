import { describe, expect, it, vi } from "vitest";
import { createRelayTable, hostTokenHash, MemoryRateLimiter, relayLimits, relayTableStatus, verifyHostToken, verifyHostTokenHash } from "./relay-core.js";
import { selectRelayWebSocketProtocol } from "./index.js";

describe("relay core", () => {
  it("creates high-entropy table credentials with a 12 hour ttl", () => {
    const now = Date.parse("2026-07-05T12:00:00.000Z");
    const table = createRelayTable({ nowMs: now, publicBaseUrl: "https://share.open-tabletop.org" });

    expect(table.slug).toMatch(/^tbl_[a-z0-9_-]{22,}$/);
    expect(table.hostToken).toMatch(/^ott_host_[a-z0-9_-]{43,}$/);
    expect(table.publicUrl).toBe(`https://share.open-tabletop.org/t/${table.slug}`);
    expect(Date.parse(table.expiresAt) - now).toBe(12 * 60 * 60 * 1000);
  });

  it("uses constant-time host token verification and reports expiry", async () => {
    const table = createRelayTable({ nowMs: 1000, publicBaseUrl: "https://share.open-tabletop.org" });
    await expect(verifyHostToken(table.hostToken, table.hostToken)).resolves.toBe(true);
    await expect(verifyHostToken(`${table.hostToken}x`, table.hostToken)).resolves.toBe(false);
    await expect(verifyHostTokenHash(table.hostToken, await hostTokenHash(table.hostToken))).resolves.toBe(true);
    await expect(verifyHostTokenHash(`${table.hostToken}x`, await hostTokenHash(table.hostToken))).resolves.toBe(false);

    expect(relayTableStatus({ slug: table.slug, expiresAt: new Date(500).toISOString(), hostConnected: false }, 1000)).toEqual({
      slug: table.slug,
      hostConnected: false,
      expired: true,
      expiresAt: new Date(500).toISOString()
    });
  });

  it("bounds relay request sizes and connection counts", () => {
    expect(relayLimits.maxRequestBodyBytes).toBeLessThanOrEqual(10 * 1024 * 1024);
    expect(relayLimits.maxClientWebSocketsPerTable).toBeGreaterThanOrEqual(16);
    expect(vi.isFakeTimers()).toBe(false);
  });

  it("rate-limits noisy relay callers by bounded time window", () => {
    const limiter = new MemoryRateLimiter({ windowMs: 1000, maxRequests: 2 });
    expect(limiter.check("ip:1", 0)).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.check("ip:1", 100)).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.check("ip:1", 200)).toMatchObject({ allowed: false, remaining: 0, retryAfterMs: 800 });
    expect(limiter.check("ip:1", 1000)).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("selects the stable realtime protocol from the player's offered protocols", () => {
    expect(selectRelayWebSocketProtocol("otte.v1, otte.auth.ots_test")).toBe("otte.v1");
    expect(selectRelayWebSocketProtocol("custom.v2, otte.auth.ots_test")).toBe("custom.v2");
    expect(selectRelayWebSocketProtocol(null)).toBeUndefined();
  });
});
