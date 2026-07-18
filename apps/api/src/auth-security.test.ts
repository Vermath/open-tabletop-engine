import { describe, expect, it } from "vitest";
import {
  BoundedPasswordVerifier,
  LoginAttemptThrottle,
  hashPasswordAsync,
  loginThrottleConfigFromEnv,
  proxyClientIdentity,
  trustedProxyHopsFromEnv,
  verifyPasswordAsync,
  type PasswordVerificationResult,
} from "./auth-security.js";

describe("authentication security helpers", () => {
  it("hashes and verifies scrypt passwords asynchronously", async () => {
    const hash = await hashPasswordAsync("correct horse battery staple");
    expect(hash).toMatch(/^scrypt:[^:]+:[^:]+$/);
    await expect(verifyPasswordAsync("correct horse battery staple", hash)).resolves.toEqual({ status: "match", ok: true });
    await expect(verifyPasswordAsync("wrong", hash)).resolves.toEqual({ status: "mismatch", ok: false });
    await expect(verifyPasswordAsync("anything", "scrypt:bad:AA")).resolves.toEqual({ status: "invalid_hash", ok: false });
  });

  it("bounds concurrent password work and rejects excess queue pressure", async () => {
    const releases: Array<() => void> = [];
    const verify = () => new Promise<PasswordVerificationResult>((resolve) => {
      releases.push(() => resolve({ status: "match", ok: true }));
    });
    const verifier = new BoundedPasswordVerifier({ maxConcurrent: 1, maxQueue: 1, maxQueueWaitMs: 5_000, verify });
    const first = verifier.verify("one", "hash");
    const second = verifier.verify("two", "hash");
    await expect(verifier.verify("three", "hash")).resolves.toEqual({ status: "saturated", ok: false });
    expect(verifier.status()).toMatchObject({ active: 1, queued: 1 });
    releases.shift()!();
    await expect(first).resolves.toEqual({ status: "match", ok: true });
    await Promise.resolve();
    releases.shift()!();
    await expect(second).resolves.toEqual({ status: "match", ok: true });
    expect(verifier.status()).toMatchObject({ completedVerifications: 2, saturationCount: 1, queueTimeoutCount: 0, failureCount: 0 });
  });

  it("shares the same bounded capacity across password hashing and verification", async () => {
    const releases: Array<() => void> = [];
    const verifier = new BoundedPasswordVerifier({
      maxConcurrent: 1,
      maxQueue: 1,
      maxQueueWaitMs: 5_000,
      hash: () => new Promise<string>((resolve) => releases.push(() => resolve("scrypt:salt:hash"))),
      verify: async () => ({ status: "match", ok: true }),
    });
    const first = verifier.hash("first password");
    const second = verifier.verify("second password", "stored");
    await expect(verifier.hash("third password")).resolves.toEqual({ status: "saturated" });
    releases.shift()!();
    await expect(first).resolves.toEqual({ status: "hashed", hash: "scrypt:salt:hash" });
    await expect(second).resolves.toEqual({ status: "match", ok: true });
    expect(verifier.status()).toMatchObject({ active: 0, queued: 0, completedHashes: 1, completedVerifications: 1, saturationCount: 1 });
  });

  it("uses only explicitly trusted right-most proxy hops", () => {
    expect(proxyClientIdentity({ remoteAddress: "10.0.0.5", forwardedFor: "198.51.100.4", trustedProxyHops: 0 })).toEqual({
      ip: "10.0.0.5", source: "socket", forwardedChainValid: true,
    });
    expect(proxyClientIdentity({ remoteAddress: "10.0.0.5", forwardedFor: "6.6.6.6, 203.0.113.9", trustedProxyHops: 1 })).toEqual({
      ip: "203.0.113.9", source: "forwarded", forwardedChainValid: true,
    });
    expect(proxyClientIdentity({ remoteAddress: "10.0.0.5", forwardedFor: ["203.0.113.9", "198.51.100.4"], trustedProxyHops: 1 })).toEqual({
      ip: "10.0.0.5", source: "socket", forwardedChainValid: false,
    });
  });

  it("limits both distributed account attacks and network-wide abuse", () => {
    const throttle = new LoginAttemptThrottle({
      windowMs: 60_000,
      accountMaxAttempts: 2,
      networkMaxAttempts: 3,
      accountNetworkMaxAttempts: 2,
      maxBuckets: 100,
    });
    expect(throttle.consume({ account: "victim@example.test", network: "203.0.113.1" }, 1_000).allowed).toBe(true);
    expect(throttle.consume({ account: "victim@example.test", network: "203.0.113.2" }, 1_001).allowed).toBe(true);
    expect(throttle.consume({ account: "victim@example.test", network: "203.0.113.3" }, 1_002)).toMatchObject({ allowed: false, limitedBy: ["account"] });

    const networkThrottle = new LoginAttemptThrottle({
      windowMs: 60_000,
      accountMaxAttempts: 20,
      networkMaxAttempts: 2,
      accountNetworkMaxAttempts: 20,
      maxBuckets: 100,
    });
    networkThrottle.consume({ account: "one@example.test", network: "203.0.113.20" }, 2_000);
    networkThrottle.consume({ account: "two@example.test", network: "203.0.113.20" }, 2_001);
    expect(networkThrottle.consume({ account: "three@example.test", network: "203.0.113.20" }, 2_002)).toMatchObject({ allowed: false, limitedBy: ["network"] });
    expect(networkThrottle.status()).toMatchObject({ consumedAttempts: 3, limitedAttempts: 1, maxBuckets: 100 });
  });

  it("bounds environment configuration", () => {
    expect(trustedProxyHopsFromEnv({ OTTE_TRUSTED_PROXY_HOPS: "99" })).toBe(8);
    expect(loginThrottleConfigFromEnv({ OTTE_LOGIN_RATE_LIMIT_WINDOW_SECONDS: "2", OTTE_LOGIN_RATE_LIMIT_PAIR_MAX: "3" })).toMatchObject({
      windowMs: 2_000,
      accountNetworkMaxAttempts: 3,
    });
  });
});
