import type { Proposal } from "@open-tabletop/core";
import { ApiError } from "./api.js";
import { errorMessage, recordValue, stringValue, titleCaseLabel } from "./sheet-format.js";

export interface AiAgentMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  proposalIds?: string[];
  progress?: string;
  reasoning?: string[];
  activity?: string[];
  streaming?: boolean;
}

export interface AiAgentProviderEvent {
  type: string;
  proposalId?: string;
  delta?: string;
  content?: string;
  message?: string;
  summaryIndex?: number;
  toolName?: string;
}

export interface AiAgentRealtimeEvent {
  type?: string;
  campaignId?: string;
  actorUserId?: string;
  targetId?: string;
  payload?: Record<string, unknown>;
}

export interface CodexAuthStart {
  type: "chatgpt" | "chatgptDeviceCode";
  loginId?: string;
  authUrl?: string;
  verificationUrl?: string;
  userCode?: string;
}

export function isSessionAuthError(error: unknown): boolean {
  const message = errorMessage(error);
  if (error instanceof ApiError && error.status === 401) return true;
  return /unauthorized|missing session token|invalid session token|session token expired/i.test(message);
}

export function isProposalNotFoundError(error: unknown): boolean {
  if (error instanceof ApiError && error.status === 404 && /proposal not found/i.test(error.message)) return true;
  return /proposal not found/i.test(errorMessage(error));
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function codexAuthPromptFromError(error: unknown): CodexAuthStart | undefined {
  if (!(error instanceof ApiError)) return undefined;
  const body = recordValue(error.body);
  if (body.error !== "codex_auth_required") return undefined;
  const auth = recordValue(body.codexAuth);
  const type = auth.type === "chatgptDeviceCode" ? "chatgptDeviceCode" : auth.type === "chatgpt" ? "chatgpt" : undefined;
  if (!type) return undefined;
  return {
    type,
    loginId: stringValue(auth.loginId),
    authUrl: stringValue(auth.authUrl),
    verificationUrl: stringValue(auth.verificationUrl),
    userCode: stringValue(auth.userCode)
  };
}

export function reasoningTracesFromEvents(events: AiAgentProviderEvent[]): string[] {
  const streamed = new Map<number, string>();
  const completed: string[] = [];
  for (const event of events) {
    if (event.type === "reasoning.delta" && typeof event.delta === "string") {
      const index = typeof event.summaryIndex === "number" && Number.isFinite(event.summaryIndex) ? event.summaryIndex : 0;
      streamed.set(index, `${streamed.get(index) ?? ""}${event.delta}`);
    }
    if (event.type === "reasoning.completed" && typeof event.content === "string" && event.content.trim()) completed.push(event.content.trim());
  }
  const traces = [...streamed.entries()].sort(([left], [right]) => left - right).map(([, trace]) => trace.trim()).filter(Boolean);
  const completedTraces: string[] = [];
  for (const trace of completed) if (!completedTraces.includes(trace)) completedTraces.push(trace);
  return (completedTraces.length > 0 ? completedTraces : traces).slice(0, 12);
}

export function appendReasoningDelta(reasoning: string[] | undefined, index: number, delta: string): string[] {
  const next = [...(reasoning ?? [])];
  const safeIndex = Math.max(0, Math.floor(index));
  while (next.length <= safeIndex) next.push("");
  next[safeIndex] = `${next[safeIndex] ?? ""}${delta}`;
  return next.slice(0, 12);
}

export function completedReasoningTraces(reasoning: string[] | undefined, content: string): string[] {
  const summary = content.trim();
  if (!summary) return reasoning ?? [];
  return [summary, ...(reasoning ?? []).map((trace) => trace.trim()).filter((trace) => trace && trace !== summary)].slice(0, 12);
}

export function activityTracesFromEvents(events: AiAgentProviderEvent[]): string[] {
  const entries: string[] = [];
  for (const event of events) {
    if (event.type === "activity.reported" && typeof event.message === "string") {
      const message = event.message.trim();
      if (message && entries.at(-1) !== message) entries.push(message);
    }
    const progress = aiAgentProviderToolProgressText(event);
    if (progress && entries.at(-1) !== progress) entries.push(progress);
  }
  return entries.slice(-24);
}

export function appendAiAgentActivity(activity: string[] | undefined, message: string): string[] {
  const entry = message.trim();
  if (!entry) return activity ?? [];
  const next = [...(activity ?? [])];
  if (next.at(-1) !== entry) next.push(entry);
  return next.slice(-24);
}

export function aiAgentToolProgressText(event: AiAgentRealtimeEvent): string | undefined {
  if (event.type !== "ai.tool.started" && event.type !== "ai.tool.completed") return undefined;
  const payload = event.payload;
  const toolName = typeof payload?.toolName === "string" ? payload.toolName.trim() : "";
  if (!toolName) return undefined;
  return aiAgentToolProgressTextFor(toolName, event.type === "ai.tool.started" ? "started" : payload?.status === "failed" ? "failed" : "completed");
}

export function upsertAiAgentMessage(messages: AiAgentMessage[], next: AiAgentMessage): AiAgentMessage[] {
  const index = messages.findIndex((message) => message.id === next.id);
  if (index === -1) return [...messages, next];
  const previous = messages[index];
  if (!previous) return [...messages, next];
  const copy = [...messages];
  copy[index] = { ...previous, ...next, proposalIds: next.proposalIds ?? previous.proposalIds, reasoning: next.reasoning ?? previous.reasoning, activity: next.activity ?? previous.activity };
  return copy;
}

export function sceneIdToOpenAfterProposalApply(proposal: Proposal): string | undefined {
  return updatedSceneIdFromProposal(proposal) ?? createdSceneIdFromProposal(proposal);
}

export function openCodexAuthPrompt(auth: CodexAuthStart): boolean {
  const url = auth.authUrl ?? auth.verificationUrl;
  if (!url) return false;
  return Boolean(window.open(url, "_blank", "noopener,noreferrer"));
}

function aiAgentProviderToolProgressText(event: AiAgentProviderEvent): string | undefined {
  if (event.type !== "tool.started" && event.type !== "tool.completed") return undefined;
  const toolName = typeof event.toolName === "string" ? event.toolName.trim() : "";
  if (!toolName) return undefined;
  return aiAgentToolProgressTextFor(toolName, event.type === "tool.started" ? "started" : "completed");
}

function aiAgentToolProgressTextFor(toolName: string, status: "started" | "completed" | "failed"): string {
  const label = aiAgentToolProgressLabel(toolName);
  return status === "started" ? `${label}...` : status === "failed" ? `${label} failed; continuing.` : `${label} complete.`;
}

function aiAgentToolProgressLabel(toolName: string): string {
  const labels: Record<string, string> = {
    capture_board_view: "Checking the board view",
    create_proposal: "Creating proposal",
    draft_actor_token_roster: "Creating missing actors and tokens",
    draft_encounter: "Building encounter",
    draft_scene: "Creating scene",
    draft_token_update: "Placing tokens",
    generate_map_asset: "Generating map art",
    generate_token_asset: "Generating token art",
    modify_asset_image: "Editing image asset",
    get_proposal: "Checking proposal",
    read_board_state: "Reading board state",
    read_scene: "Reading scene",
    read_token: "Reading token",
    read_asset: "Reading asset",
    draft_actor_update: "Updating actor",
    use_actor_action: "Resolving actor action"
  };
  return labels[toolName] ?? titleCaseLabel(toolName.replace(/^draft_/, "").replace(/_/g, " "));
}

function updatedSceneIdFromProposal(proposal: Proposal): string | undefined {
  for (const change of proposal.changesJson) if (change.entity === "scene" && change.action === "update" && typeof change.id === "string" && change.id.trim()) return change.id;
  return undefined;
}

function createdSceneIdFromProposal(proposal: Proposal): string | undefined {
  for (const change of proposal.changesJson) {
    if (change.entity !== "scene" || change.action !== "create") continue;
    const data = recordValue(change.data);
    if (typeof data.id === "string" && data.id.trim()) return data.id;
  }
  return undefined;
}
