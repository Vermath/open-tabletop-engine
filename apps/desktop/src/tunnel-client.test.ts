import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { chunkBufferForTunnel, localRequestHeaders, localWebSocketProtocols, readResponseBodyChunks } from "./tunnel-client.js";

describe("desktop relay tunnel client", () => {
  it("splits local HTTP response bodies into bounded tunnel frames", () => {
    const body = Buffer.from("abcdefghij");

    expect(chunkBufferForTunnel(body, 4).map((chunk) => chunk.toString("utf8"))).toEqual(["abcd", "efgh", "ij"]);
  });

  it("rejects responses that exceed the configured relay response cap", async () => {
    const response = new Response("abcdef");

    await expect(readResponseBodyChunks(response, 5)).rejects.toThrow("Relay response exceeds 5 bytes");
  });

  it("rejects declared oversize responses before reading the body", async () => {
    const response = new Response("ok", { headers: { "content-length": "999" } });

    await expect(readResponseBodyChunks(response, 5)).rejects.toThrow("Relay response exceeds 5 bytes");
  });

  it("forwards websocket protocols through the constructor instead of spoofing handshake headers", () => {
    const headers = {
      authorization: "Bearer legacy",
      "sec-websocket-key": "relay-generated-key",
      "sec-websocket-protocol": "otte.v1, otte.auth.ots_test, invalid protocol",
      "sec-websocket-version": "13"
    };

    expect(localWebSocketProtocols(headers)).toEqual(["otte.v1", "otte.auth.ots_test"]);
    expect(localRequestHeaders(headers)).toEqual({ authorization: "Bearer legacy" });
  });
});
