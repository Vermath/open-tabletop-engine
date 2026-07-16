import { describe, expect, it } from "vitest";
import { sessionCredentialFromRequest, urlSessionTokenDiagnostic, urlSessionTokenPolicy } from "./session-transport-auth.js";

describe("session transport authentication", () => {
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

  it("treats an unknown explicit policy as disabled", () => {
    expect(urlSessionTokenPolicy({ OTTE_URL_SESSION_TOKEN_MODE: "typo" })).toEqual({ mode: "disabled", configuredValueValid: false });
  });
});
