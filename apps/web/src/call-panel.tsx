import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Grip, Hand, Phone, PhoneOff, X } from "lucide-react";
import { apiGet } from "./api.js";
import { useMovablePanel } from "./movable-panel.js";
import "./call-panel.css";

/**
 * Optional voice and video. The server operator configures a provider; this
 * client shows a "Join call" control for it and embeds the provider's room in
 * a movable panel. Nothing from the provider is requested until the person
 * chooses to join, and the provider's frame is given no access to this page.
 */
export interface CampaignCall {
  provider: string;
  origin: string;
  host: string;
  url: string;
}

const maximumProviderNameLength = 40;
/** What the embedded provider may do. It may not navigate this page, and it gets no other device or storage access from us. */
export const callFrameSandbox = "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox";
export const callFramePermissions = "camera; microphone; display-capture; fullscreen; autoplay";

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * Checks the server's answer before anything is embedded. The client frames a
 * URL only if it is HTTPS (or loopback HTTP in development), carries no
 * credentials, and belongs to the origin the server named.
 */
export function validatedCampaignCall(response: unknown): CampaignCall | null {
  if (!response || typeof response !== "object") return null;
  const { enabled, provider, origin, url } = response as Record<string, unknown>;
  if (enabled !== true || typeof url !== "string" || typeof origin !== "string") return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopbackHost(parsed.hostname))) return null;
  if (parsed.username || parsed.password || parsed.origin !== origin) return null;
  const name = typeof provider === "string" ? provider.trim().slice(0, maximumProviderNameLength) : "";
  return { provider: name || parsed.hostname, origin: parsed.origin, host: parsed.host, url: parsed.href };
}

export function callConsentStorageKey(origin: string): string {
  return `otte:callConsent:${origin}`;
}

type ConsentStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): ConsentStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** True once this browser's user has agreed to open this provider. Agreement is per provider origin. */
export function hasCallConsent(origin: string, storage: ConsentStorage | undefined = browserStorage()): boolean {
  try {
    return storage?.getItem(callConsentStorageKey(origin)) === "granted";
  } catch {
    return false;
  }
}

export function rememberCallConsent(origin: string, storage: ConsentStorage | undefined = browserStorage()): void {
  try {
    storage?.setItem(callConsentStorageKey(origin), "granted");
  } catch {
    /* Storage unavailable: ask again next time. */
  }
}

export type CallStage = "closed" | "asking" | "joined";

/** Joining asks first unless this browser has already agreed to this provider. */
export function nextCallStage(stage: CallStage, action: "toggle" | "confirm" | "dismiss", consented: boolean): CallStage {
  if (action === "confirm") return stage === "asking" ? "joined" : stage;
  if (action === "dismiss") return "closed";
  if (stage !== "closed") return "closed";
  return consented ? "joined" : "asking";
}

/** Loads the campaign's call room. Any failure means the feature is simply absent. */
export function useCampaignCall(campaignId: string, load: (campaignId: string, signal: AbortSignal) => Promise<unknown> = (id, signal) => apiGet(`/api/v1/campaigns/${encodeURIComponent(id)}/call`, { signal })): CampaignCall | null {
  const [call, setCall] = useState<CampaignCall | null>(null);
  useEffect(() => {
    setCall(null);
    if (!campaignId) return;
    const controller = new AbortController();
    load(campaignId, controller.signal).then(
      (response) => { if (!controller.signal.aborted) setCall(validatedCampaignCall(response)); },
      () => { if (!controller.signal.aborted) setCall(null); }
    );
    return () => controller.abort();
    // Reload only when the campaign changes; `load` is a stable request function.
  }, [campaignId]);
  return call;
}

export function CallLauncher(props: { call: CampaignCall; stage: CallStage; onToggle(): void }) {
  const joined = props.stage === "joined";
  const label = joined ? "Leave call" : "Join call";
  return (
    <button className={props.stage === "closed" ? "ai-agent-toggle call-launcher" : "ai-agent-toggle call-launcher active"} type="button" aria-label={label} aria-pressed={joined} aria-expanded={props.stage !== "closed"} title={`${label} (${props.call.provider})`} onClick={props.onToggle}>
      {joined ? <PhoneOff size={16} aria-hidden="true" /> : <Phone size={16} aria-hidden="true" />}
      <span className="ai-agent-toggle-label ai-agent-toggle-label-full">{label}</span>
      <span className="ai-agent-toggle-label ai-agent-toggle-label-compact" aria-hidden="true">Call</span>
    </button>
  );
}

export function CallConsentNotice(props: { call: CampaignCall; onJoin(): void; onDismiss(): void }) {
  return (
    <div className="call-consent" role="group" aria-label={`Join the ${props.call.provider} call`}>
      <p><strong>{props.call.provider}</strong> is a separate service at <code>{props.call.host}</code>.</p>
      <p>Joining opens it inside this panel. Your voice and video go straight to it; this server does not carry or record them. It will ask to use your microphone and camera.</p>
      <div className="button-row">
        <button className="primary-button" type="button" onClick={props.onJoin}>Join call</button>
        <button className="ghost-button" type="button" onClick={props.onDismiss}>Not now</button>
      </div>
    </div>
  );
}

/** The provider's room. Rendered only once the person has joined. */
export function CallFrame(props: { call: CampaignCall }) {
  return (
    <iframe
      className="call-frame"
      title={`${props.call.provider} call`}
      src={props.call.url}
      allow={callFramePermissions}
      sandbox={callFrameSandbox}
      referrerPolicy="no-referrer"
    />
  );
}

function CallPanel(props: { call: CampaignCall; stage: Exclude<CallStage, "closed">; onJoin(): void; onClose(): void }) {
  const panel = useMovablePanel(
    () => ({ x: Math.max(8, (typeof window === "undefined" ? 1280 : window.innerWidth) - 440), y: 72 }),
    { width: 420, height: 340 },
    { minWidth: 300, minHeight: 220 }
  );
  const joined = props.stage === "joined";
  return (
    <aside className="call-panel movable-panel" aria-label={`${props.call.provider} call`} style={panel.style} {...panel.panelProps}>
      <header className="call-panel-header floating-panel-header" title="Drag panel. Double-click to minimise; the call keeps running." {...panel.dragHandleProps}>
        <Hand className="floating-panel-drag-icon" size={14} aria-hidden="true" />
        <div className="call-panel-title">
          <span className="section-title">Call</span>
          <strong>{props.call.provider}</strong>
        </div>
        {joined && <a className="icon-button" href={props.call.url} target="_blank" rel="noopener noreferrer" aria-label="Open the call in a new tab" title="Open in a new tab"><ExternalLink size={15} aria-hidden="true" /></a>}
        <button className="icon-button" type="button" aria-label={joined ? "Leave call" : "Close call panel"} title={joined ? "Leave call" : "Close"} onClick={props.onClose}>
          {joined ? <PhoneOff size={16} aria-hidden="true" /> : <X size={17} aria-hidden="true" />}
        </button>
      </header>
      {joined ? <CallFrame call={props.call} /> : <CallConsentNotice call={props.call} onJoin={props.onJoin} onDismiss={props.onClose} />}
      <button className="floating-panel-resize-handle" type="button" aria-label="Resize call panel" title="Resize panel" {...panel.resizeHandleProps}>
        <Grip size={13} aria-hidden="true" />
      </button>
    </aside>
  );
}

/**
 * The call control for the rail's utilities, beside the AI Agent and the
 * Soundboard. It is mounted in every workspace mode so that switching modes
 * does not end a call. Renders nothing unless the operator has configured a
 * provider for this server.
 */
export function CampaignCallControl(props: { campaignId: string }) {
  const call = useCampaignCall(props.campaignId);
  const [stage, setStage] = useState<CallStage>("closed");
  useEffect(() => setStage("closed"), [props.campaignId, call?.url]);
  if (!call) return null;
  return (
    <>
      <CallLauncher call={call} stage={stage} onToggle={() => setStage((current) => nextCallStage(current, "toggle", hasCallConsent(call.origin)))} />
      {stage !== "closed" && createPortal(
        <CallPanel
          call={call}
          stage={stage}
          onJoin={() => { rememberCallConsent(call.origin); setStage((current) => nextCallStage(current, "confirm", true)); }}
          onClose={() => setStage("closed")}
        />,
        document.body
      )}
    </>
  );
}
