import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CallConsentNotice,
  CallFrame,
  CallLauncher,
  callConsentStorageKey,
  callFramePermissions,
  callFrameSandbox,
  hasCallConsent,
  nextCallStage,
  rememberCallConsent,
  validatedCampaignCall,
  type CampaignCall
} from "./call-panel.js";

const here = dirname(fileURLToPath(import.meta.url));
const source = (name: string) => readFileSync(resolve(here, name), "utf8");
const call: CampaignCall = { provider: "Guild Jitsi", origin: "https://meet.example.test", host: "meet.example.test", url: "https://meet.example.test/otte-0123456789abcdef" };

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, values };
}

describe("what the client will embed", () => {
  it("accepts an HTTPS room on the origin the server named", () => {
    expect(validatedCampaignCall({ enabled: true, provider: "Guild Jitsi", origin: "https://meet.example.test", url: "https://meet.example.test/otte-0123456789abcdef" })).toEqual(call);
    expect(validatedCampaignCall({ enabled: true, provider: "Meet", origin: "https://meet.example.test:8443", url: "https://meet.example.test:8443/r/abc?lang=en#config.x=1" })).toEqual({
      provider: "Meet", origin: "https://meet.example.test:8443", host: "meet.example.test:8443", url: "https://meet.example.test:8443/r/abc?lang=en#config.x=1",
    });
  });

  it("is nothing when the server says the call is off", () => {
    expect(validatedCampaignCall({ enabled: false })).toBeNull();
    expect(validatedCampaignCall({ enabled: false, provider: "Meet", origin: "https://meet.example.test", url: "https://meet.example.test/x" })).toBeNull();
    for (const empty of [null, undefined, "", 0, [], {}]) expect(validatedCampaignCall(empty)).toBeNull();
  });

  it.each([
    ["a room on a different origin than the one named", { origin: "https://meet.example.test", url: "https://evil.example.test/otte" }],
    ["a different port than the one named", { origin: "https://meet.example.test", url: "https://meet.example.test:8443/otte" }],
    ["plain HTTP on a public host", { origin: "http://meet.example.test", url: "http://meet.example.test/otte" }],
    ["a script URL", { origin: "null", url: "javascript:alert(document.cookie)" }],
    ["a data URL", { origin: "null", url: "data:text/html,<script>alert(1)</script>" }],
    ["a relative URL", { origin: "https://meet.example.test", url: "/otte" }],
    ["embedded credentials", { origin: "https://meet.example.test", url: "https://user:pass@meet.example.test/otte" }],
    ["a missing origin", { url: "https://meet.example.test/otte" }],
    ["a non-string URL", { origin: "https://meet.example.test", url: { href: "https://meet.example.test/otte" } }],
  ])("refuses %s", (_label, fields) => {
    expect(validatedCampaignCall({ enabled: true, provider: "Meet", ...fields })).toBeNull();
  });

  it("allows loopback HTTP for development and names an unnamed provider by host", () => {
    expect(validatedCampaignCall({ enabled: true, origin: "http://127.0.0.1:8443", url: "http://127.0.0.1:8443/room" })).toMatchObject({ provider: "127.0.0.1", host: "127.0.0.1:8443" });
    expect(validatedCampaignCall({ enabled: true, provider: "   ", origin: "https://meet.example.test", url: "https://meet.example.test/x" })?.provider).toBe("meet.example.test");
    expect(validatedCampaignCall({ enabled: true, provider: "x".repeat(200), origin: "https://meet.example.test", url: "https://meet.example.test/x" })?.provider).toHaveLength(40);
  });
});

describe("joining", () => {
  it("asks before the first join and goes straight in once this browser has agreed", () => {
    expect(nextCallStage("closed", "toggle", false)).toBe("asking");
    expect(nextCallStage("asking", "confirm", true)).toBe("joined");
    expect(nextCallStage("closed", "toggle", true)).toBe("joined");
  });

  it("never joins without a choice to", () => {
    expect(nextCallStage("closed", "confirm", true)).toBe("closed");
    expect(nextCallStage("closed", "dismiss", true)).toBe("closed");
    expect(nextCallStage("asking", "dismiss", false)).toBe("closed");
  });

  it("leaves or closes on a second press of the launcher", () => {
    expect(nextCallStage("joined", "toggle", true)).toBe("closed");
    expect(nextCallStage("asking", "toggle", false)).toBe("closed");
    expect(nextCallStage("joined", "dismiss", true)).toBe("closed");
  });

  it("remembers agreement per provider origin", () => {
    const storage = memoryStorage();
    expect(hasCallConsent("https://meet.example.test", storage)).toBe(false);
    rememberCallConsent("https://meet.example.test", storage);
    expect(storage.values.get(callConsentStorageKey("https://meet.example.test"))).toBe("granted");
    expect(hasCallConsent("https://meet.example.test", storage)).toBe(true);
    expect(hasCallConsent("https://other.example.test", storage)).toBe(false);
  });

  it("asks again when storage is unavailable or throws", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(hasCallConsent("https://meet.example.test", broken)).toBe(false);
    expect(() => rememberCallConsent("https://meet.example.test", broken)).not.toThrow();
    expect(hasCallConsent("https://meet.example.test", undefined)).toBe(false);
  });
});

describe("call controls", () => {
  it("shows a join control that names the provider, and a leave control once joined", () => {
    const closed = renderToStaticMarkup(<CallLauncher call={call} stage="closed" onToggle={() => undefined} />);
    expect(closed).toContain("Join call");
    expect(closed).toContain('aria-label="Join call"');
    expect(closed).toContain('class="ai-agent-toggle call-launcher"');
    expect(closed).toContain('aria-pressed="false"');
    expect(closed).toContain('title="Join call (Guild Jitsi)"');
    const joined = renderToStaticMarkup(<CallLauncher call={call} stage="joined" onToggle={() => undefined} />);
    expect(joined).toContain('aria-label="Leave call"');
    expect(joined).toContain('class="ai-agent-toggle call-launcher active"');
    expect(joined).toContain('aria-pressed="true"');
  });

  it("tells the person where the call runs before anything loads", () => {
    const notice = renderToStaticMarkup(<CallConsentNotice call={call} onJoin={() => undefined} onDismiss={() => undefined} />);
    expect(notice).toContain("Guild Jitsi");
    expect(notice).toContain("meet.example.test");
    expect(notice).toContain("this server does not carry or record them");
    expect(notice).toContain("Join call");
    expect(notice).toContain("Not now");
    expect(notice).not.toContain("<iframe");
    expect(notice).not.toContain(call.url);
  });

  it("frames the room with device access only, no referrer, and no way to navigate this page", () => {
    const frame = renderToStaticMarkup(<CallFrame call={call} />);
    expect(frame).toContain(`src="${call.url}"`);
    expect(frame).toContain('title="Guild Jitsi call"');
    expect(frame).toContain('referrerPolicy="no-referrer"');
    expect(frame).toContain(`allow="${callFramePermissions}"`);
    expect(frame).toContain(`sandbox="${callFrameSandbox}"`);
    expect(callFramePermissions).toBe("camera; microphone; display-capture; fullscreen; autoplay");
    expect(callFrameSandbox.split(" ").sort()).toEqual(["allow-forms", "allow-popups", "allow-popups-to-escape-sandbox", "allow-same-origin", "allow-scripts"]);
    expect(callFrameSandbox).not.toMatch(/allow-top-navigation|allow-downloads|allow-modals/);
  });
});

describe("how the call is wired", () => {
  const panel = source("call-panel.tsx");

  it("creates the frame only in the joined stage", () => {
    expect(panel).toContain("{joined ? <CallFrame call={props.call} /> : <CallConsentNotice");
    expect(panel.match(/<iframe/g)).toHaveLength(1);
    expect(panel).toContain("{stage !== \"closed\" && createPortal(");
  });

  it("asks this server for the room and nothing else", () => {
    expect(panel).toContain("apiGet(`/api/v1/campaigns/${encodeURIComponent(id)}/call`, { signal })");
    expect(panel).not.toMatch(/\bfetch\(/);
    expect(panel).not.toMatch(/https?:\/\//);
    expect(panel).not.toMatch(/sessionHeaders|authorization|otte:userId|document\.cookie/i);
  });

  it("is mounted once, among the rail utilities, outside anything a workspace mode hides", () => {
    const app = source("App.tsx");
    expect(app.match(/<CampaignCallControl /g)).toHaveLength(1);
    const mount = app.indexOf("<CampaignCallControl campaignId={campaignId} />");
    expect(mount).toBeGreaterThan(app.indexOf('aria-label="Soundboard"'));
    expect(mount).toBeLessThan(app.indexOf('<section className="party-rail" aria-label="Party">'));
    // The line before it closes the Soundboard's own condition, so the control is not inside one.
    expect(app.slice(0, mount).trimEnd().endsWith(")}")).toBe(true);
  });

  it("does not pull the API contract package into the browser bundle", () => {
    expect(panel).not.toContain("@open-tabletop/api-contracts");
  });
});
