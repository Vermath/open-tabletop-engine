import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Runs the nginx configuration renderer the web container uses, in its
 * `--print` mode, to check the headers it would write for a call provider.
 * Skipped where there is no POSIX shell (the container always has one).
 */
const script = fileURLToPath(new URL("../../../infra/docker/render-web-nginx-config.sh", import.meta.url));
const hasShell = process.platform !== "win32" && spawnSync("sh", ["-c", "exit 0"]).status === 0;

function render(env: Record<string, string>) {
  const result = spawnSync("sh", [script, "--print"], { env: { PATH: process.env.PATH ?? "", ...env }, encoding: "utf8" });
  const values = Object.fromEntries(result.stdout.split("\n").filter(Boolean).map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
  return { status: result.status, stderr: result.stderr.trim(), values };
}

describe.skipIf(!hasShell)("web nginx configuration renderer", () => {
  it("allows no third-party frame and no camera or microphone by default", () => {
    expect(render({})).toEqual({
      status: 0, stderr: "",
      values: { OTTE_ASSET_CDN_CONNECT_SOURCE: "", OTTE_CALL_FRAME_DIRECTIVE: "", OTTE_WEB_PERMISSIONS_POLICY: "camera=(), geolocation=(), microphone=()" },
    });
  });

  it("allows only the configured call provider's origin", () => {
    const rendered = render({ OTTE_CALL_EMBED_URL: "https://meet.example.org:8443/otte-{room}?lang=en#config.prejoinPageEnabled=true" });
    expect(rendered.status).toBe(0);
    expect(rendered.values.OTTE_CALL_FRAME_DIRECTIVE).toBe("; frame-src 'self' https://meet.example.org:8443");
    expect(rendered.values.OTTE_WEB_PERMISSIONS_POLICY).toBe('camera=(self "https://meet.example.org:8443"), geolocation=(), microphone=(self "https://meet.example.org:8443"), display-capture=(self "https://meet.example.org:8443")');
    expect(rendered.values.OTTE_ASSET_CDN_CONNECT_SOURCE).toBe("");
  });

  it("keeps the asset CDN and the call provider independent", () => {
    const rendered = render({ OTTE_ASSET_CDN_BASE_URL: "https://assets.example.org/otte", OTTE_CALL_EMBED_URL: "https://meet.example.org/{room}" });
    expect(rendered.values.OTTE_ASSET_CDN_CONNECT_SOURCE).toBe(" https://assets.example.org");
    expect(rendered.values.OTTE_CALL_FRAME_DIRECTIVE).toBe("; frame-src 'self' https://meet.example.org");
    expect(rendered.values.OTTE_CALL_FRAME_DIRECTIVE).not.toContain("assets.example.org");
  });

  it.each([
    ["plain HTTP on a public host", "http://meet.example.org/{room}", "must use HTTPS outside loopback development"],
    ["another scheme", "javascript:alert(1)", "must be an absolute HTTPS URL"],
    ["a relative URL", "/call/{room}", "must be an absolute HTTPS URL"],
    ["the room in the host", "https://{room}.example.org/", "must have a credential-free, non-wildcard host"],
    ["embedded credentials", "https://user:pass@meet.example.org/{room}", "must have a credential-free, non-wildcard host"],
    ["a wildcard host", "https://*.example.org/{room}", "must have a credential-free, non-wildcard host"],
    ["header injection", "https://meet.example.org\"; script-src *; x=\"/{room}", "must have a credential-free, non-wildcard host"],
    ["an out-of-range port", "https://meet.example.org:99999/{room}", "port is outside the valid range"],
  ])("refuses to start with %s", (_label, url, message) => {
    const rendered = render({ OTTE_CALL_EMBED_URL: url });
    expect(rendered.status).toBe(1);
    expect(rendered.stderr).toContain(`OTTE_CALL_EMBED_URL ${message}`);
    expect(rendered.values).toEqual({});
  });

  it("allows plain HTTP on loopback for development", () => {
    expect(render({ OTTE_CALL_EMBED_URL: "http://127.0.0.1:8443/{room}" }).values.OTTE_CALL_FRAME_DIRECTIVE).toBe("; frame-src 'self' http://127.0.0.1:8443");
  });
});
