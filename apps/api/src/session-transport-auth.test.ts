import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSessionCookieHeader,
  cookieSessionBearerMarker,
  cookieSessionMutationOrigin,
  sessionCookieHeader,
  sessionCredentialFromRequest,
  urlSessionTokenDiagnostic,
  urlSessionTokenPolicy,
} from "./session-transport-auth.js";

describe("session transport authentication", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses explicit credential precedence without putting first-party websocket tokens in the URL", () => {
    expect(sessionCredentialFromRequest("/api/v1/realtime?campaignId=camp_demo", {
      authorization: "Bearer ots_bearer",
      "x-session-token": "ots_header",
      cookie: "otte_session=ots_cookie",
      "sec-websocket-protocol": "otte.v1, otte.auth.ots_protocol",
    })).toEqual({ status: "valid", source: "authorization", token: "ots_bearer", deprecated: false });

    expect(sessionCredentialFromRequest("/api/v1/realtime?campaignId=camp_demo", {
      "sec-websocket-protocol": "otte.v1, otte.auth.ots_protocol",
    })).toEqual({ status: "valid", source: "websocket-subprotocol", token: "ots_protocol", deprecated: false });
  });

  it("fails closed for malformed or duplicate values at the selected source", () => {
    expect(sessionCredentialFromRequest(undefined, { authorization: "Bearer" })).toEqual({ status: "invalid", source: "authorization", reason: "malformed" });
    expect(sessionCredentialFromRequest(undefined, { "x-session-token": ["ots_one", "ots_two"] })).toEqual({ status: "invalid", source: "x-session-token", reason: "duplicate" });
    expect(sessionCredentialFromRequest(undefined, { cookie: "otte_session=ots_one; otte_session=ots_two" })).toEqual({ status: "invalid", source: "cookie", reason: "duplicate" });
    expect(sessionCredentialFromRequest(undefined, { "sec-websocket-protocol": "otte.auth.ots_one, otte.auth.ots_two" })).toEqual({ status: "invalid", source: "websocket-subprotocol", reason: "duplicate" });
    expect(sessionCredentialFromRequest("/asset?sessionToken=one&sessionToken=two", {})).toEqual({ status: "invalid", source: "query", reason: "duplicate" });
  });

  it("keeps legacy query credentials measurable in compatibility mode and blocks them by policy", () => {
    const compatibility = urlSessionTokenPolicy({ OTTE_URL_SESSION_TOKEN_MODE: "compatibility" });
    expect(sessionCredentialFromRequest("/asset?sessionToken=ots_legacy", {}, compatibility)).toEqual({
      status: "valid",
      source: "query",
      token: "ots_legacy",
      deprecated: true,
    });
    expect(urlSessionTokenDiagnostic("/asset?sessionToken=ots_legacy", compatibility)).toEqual({ status: "deprecated", policy: compatibility });

    const disabled = urlSessionTokenPolicy({ OTTE_URL_SESSION_TOKEN_MODE: "disabled" });
    expect(sessionCredentialFromRequest("/asset?sessionToken=ots_legacy", {}, disabled)).toEqual({ status: "invalid", source: "query", reason: "disabled" });
    expect(urlSessionTokenDiagnostic("/asset?sessionToken=ots_legacy", disabled)).toEqual({ status: "blocked", policy: disabled });
  });

  it("disables URL session tokens by default in production and requires explicit compatibility", () => {
    expect(urlSessionTokenPolicy({ NODE_ENV: "production" })).toEqual({ mode: "disabled", configuredValueValid: true });
    expect(urlSessionTokenPolicy({ NODE_ENV: "production", OTTE_URL_SESSION_TOKEN_MODE: "compatibility" })).toEqual({ mode: "compatibility", configuredValueValid: true });
    expect(urlSessionTokenPolicy({ NODE_ENV: "development" })).toEqual({ mode: "compatibility", configuredValueValid: true });
  });

  it("treats an unknown explicit policy as disabled", () => {
    expect(urlSessionTokenPolicy({ OTTE_URL_SESSION_TOKEN_MODE: "typo" })).toEqual({ mode: "disabled", configuredValueValid: false });
  });

  it("issues HttpOnly bounded cookies and clears them with matching attributes", () => {
    expect(sessionCookieHeader("ots value", { secure: true, maxAgeSeconds: 3_600 })).toBe(
      "__Host-otte_session=ots%20value; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600; Secure",
    );
    expect(clearSessionCookieHeader({ secure: true })).toBe(
      "__Host-otte_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure",
    );
  });

  it("prefers host cookies and ignores plain cookie tossing in secure production mode", () => {
    expect(sessionCredentialFromRequest(undefined, { cookie: "otte_session=ots_plain; __Host-otte_session=ots_host" })).toEqual({
      status: "valid", source: "cookie", token: "ots_host", deprecated: false,
    });
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCredentialFromRequest(undefined, { cookie: "otte_session=ots_tossed" })).toEqual({ status: "none" });
    expect(sessionCredentialFromRequest(undefined, { cookie: "otte_session=ots_tossed; __Host-otte_session=ots_secure" })).toEqual({
      status: "valid", source: "cookie", token: "ots_secure", deprecated: false,
    });
  });

  it("treats the cookie migration marker as non-credential data", () => {
    expect(sessionCredentialFromRequest(undefined, {
      authorization: `Bearer ${cookieSessionBearerMarker}`,
      cookie: "otte_session=ots_cookie",
    })).toEqual({ status: "valid", source: "cookie", token: "ots_cookie", deprecated: false });
  });

  it("requires same-origin evidence for cookie-authenticated mutations", () => {
    const credential = sessionCredentialFromRequest(undefined, { cookie: "otte_session=ots_cookie" });
    expect(cookieSessionMutationOrigin("POST", credential, { origin: "https://table.example.test" }, ["https://table.example.test"])).toEqual({ ok: true });
    expect(cookieSessionMutationOrigin("PATCH", credential, { origin: "https://evil.example.test" }, ["https://table.example.test"])).toEqual({ ok: false, reason: "cross_origin" });
    expect(cookieSessionMutationOrigin("DELETE", credential, { "sec-fetch-site": "same-origin" }, ["https://table.example.test"])).toEqual({ ok: true });
    expect(cookieSessionMutationOrigin("POST", credential, {}, ["https://table.example.test"])).toEqual({ ok: false, reason: "missing_origin" });
    expect(cookieSessionMutationOrigin("GET", credential, {}, [])).toEqual({ ok: true });
  });});
