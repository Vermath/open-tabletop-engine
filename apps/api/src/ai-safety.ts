import type {
  AiCampaignPolicy,
  AiContextScope,
  AiSourceReference,
  Campaign
} from "@open-tabletop/core";

export const DEFAULT_AI_PROVIDER_DISCLOSURE =
  "Permission-filtered campaign data in the selected scopes is transmitted to the configured AI provider. Local retention controls do not delete provider-held data.";

export interface AiInstallationPolicy {
  enabled: boolean;
  status: "enabled" | "disabled" | "unsafe_configuration";
  contextScopes: AiContextScope[];
  providerTransmissionDisclosure: string;
  retentionDays: number;
  explicitlyConfigured: boolean;
  readinessIssues: string[];
}

export interface EffectiveAiPolicy {
  installation: AiInstallationPolicy;
  campaign: AiCampaignPolicy;
  enabled: boolean;
  status: "enabled" | "disabled" | "unsafe_configuration";
  contextScopes: AiContextScope[];
  retentionDays: number;
  legacyDefault: boolean;
  readinessIssues: string[];
}

export function resolveAiInstallationPolicy(
  env: NodeJS.ProcessEnv = process.env,
  nodeEnv = env.NODE_ENV
): AiInstallationPolicy {
  const production = nodeEnv === "production";
  const enabledValue = parseBoolean(env.OTTE_AI_ENABLED);
  const contextScopes = parseContextScopes(env.OTTE_AI_CONTEXT_SCOPES);
  const retentionDays = parseRetentionDays(env.OTTE_AI_RETENTION_DAYS);
  const disclosure = env.OTTE_AI_PROVIDER_TRANSMISSION_DISCLOSURE?.trim();
  const explicitlyConfigured = enabledValue === false || (
    enabledValue !== undefined &&
    contextScopes !== undefined &&
    retentionDays !== undefined &&
    Boolean(disclosure)
  );
  const readinessIssues: string[] = [];
  if (production && enabledValue === undefined) readinessIssues.push("OTTE_AI_ENABLED must be explicitly configured in production.");
  if (production && enabledValue !== false && contextScopes === undefined) readinessIssues.push("OTTE_AI_CONTEXT_SCOPES must be explicitly configured in production.");
  if (production && enabledValue !== false && retentionDays === undefined) readinessIssues.push("OTTE_AI_RETENTION_DAYS must be explicitly configured in production.");
  if (production && enabledValue !== false && !disclosure) readinessIssues.push("OTTE_AI_PROVIDER_TRANSMISSION_DISCLOSURE must be explicitly configured in production.");
  const unsafe = readinessIssues.length > 0;
  const enabled = !unsafe && (enabledValue ?? !production);
  return {
    enabled,
    status: unsafe ? "unsafe_configuration" : enabled ? "enabled" : "disabled",
    contextScopes: contextScopes ?? ["public", "gm_private"],
    providerTransmissionDisclosure: disclosure ?? DEFAULT_AI_PROVIDER_DISCLOSURE,
    retentionDays: retentionDays ?? 30,
    explicitlyConfigured,
    readinessIssues
  };
}

export function resolveEffectiveAiPolicy(
  campaign: Campaign,
  installation = resolveAiInstallationPolicy(),
  nodeEnv = process.env.NODE_ENV
): EffectiveAiPolicy {
  const legacyDefault = campaign.aiPolicy === undefined;
  const campaignPolicy: AiCampaignPolicy = campaign.aiPolicy ?? {
    enabled: nodeEnv !== "production",
    status: nodeEnv !== "production" ? "enabled" : "disabled",
    contextScopes: ["public", "gm_private"],
    providerTransmissionDisclosure: installation.providerTransmissionDisclosure,
    retentionDays: installation.retentionDays,
    revision: 0
  };
  const readinessIssues = [...installation.readinessIssues];
  if (nodeEnv === "production" && legacyDefault) {
    readinessIssues.push("Campaign AI policy must be explicitly reviewed before production use.");
  }
  const allowed = campaignPolicy.contextScopes.filter((scope) => installation.contextScopes.includes(scope));
  const enabled = installation.enabled && campaignPolicy.enabled && readinessIssues.length === 0;
  return {
    installation,
    campaign: campaignPolicy,
    enabled,
    status: readinessIssues.length > 0 ? "unsafe_configuration" : enabled ? "enabled" : "disabled",
    contextScopes: allowed,
    retentionDays: Math.min(installation.retentionDays, campaignPolicy.retentionDays),
    legacyDefault,
    readinessIssues
  };
}

export function validateAiContextScopes(
  requested: readonly AiContextScope[],
  policy: EffectiveAiPolicy
): { ok: true; scopes: AiContextScope[] } | { ok: false; code: "ai_disabled" | "ai_policy_unsafe" | "ai_context_scope_denied"; message: string } {
  if (policy.status === "unsafe_configuration") {
    return { ok: false, code: "ai_policy_unsafe", message: policy.readinessIssues.join(" ") };
  }
  if (!policy.enabled) return { ok: false, code: "ai_disabled", message: "AI is disabled by installation or campaign policy." };
  const scopes = [...new Set(requested)];
  const denied = scopes.find((scope) => !policy.contextScopes.includes(scope));
  if (denied) {
    return {
      ok: false,
      code: "ai_context_scope_denied",
      message: `AI context scope ${denied} is not enabled by installation and campaign policy.`
    };
  }
  return { ok: true, scopes };
}

export function aiRetentionExpiresAt(startedAt: string, retentionDays: number): string {
  return new Date(Date.parse(startedAt) + retentionDays * 86_400_000).toISOString();
}

export function normalizeAiCampaignPolicyInput(
  input: unknown,
  current: AiCampaignPolicy,
  userId: string,
  now: string
): { ok: true; policy: AiCampaignPolicy } | { ok: false; message: string } {
  if (!isRecord(input)) return { ok: false, message: "AI policy body must be a JSON object." };
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision !== current.revision) {
    return { ok: false, message: `AI policy revision conflict; expected ${current.revision}.` };
  }
  if (typeof input.enabled !== "boolean") return { ok: false, message: "enabled must be a boolean." };
  if (!Array.isArray(input.contextScopes) || input.contextScopes.some((scope) => scope !== "public" && scope !== "gm_private")) {
    return { ok: false, message: "contextScopes must contain only public or gm_private." };
  }
  const contextScopes = [...new Set(input.contextScopes as AiContextScope[])];
  if (!Number.isInteger(input.retentionDays) || (input.retentionDays as number) < 1 || (input.retentionDays as number) > 3650) {
    return { ok: false, message: "retentionDays must be an integer from 1 to 3650." };
  }
  const disclosure = typeof input.providerTransmissionDisclosure === "string" ? input.providerTransmissionDisclosure.trim() : "";
  if (!disclosure || disclosure.length > 1000) {
    return { ok: false, message: "providerTransmissionDisclosure must be 1-1000 characters." };
  }
  return {
    ok: true,
    policy: {
      enabled: input.enabled,
      status: input.enabled ? "enabled" : "disabled",
      contextScopes,
      providerTransmissionDisclosure: disclosure,
      retentionDays: input.retentionDays as number,
      revision: current.revision + 1,
      updatedByUserId: userId,
      updatedAt: now
    }
  };
}

export function annotateAiToolOutput(toolName: string, output: unknown): { output: unknown; sources: AiSourceReference[] } {
  if (!isRecord(output)) return { output, sources: [] };
  const sources = aiSourcesFromToolOutput(toolName, output);
  if (sources.length === 0) return { output, sources };
  return {
    output: {
      ...output,
      aiDataBoundary: sources.every((source) => source.trust === "authoritative_open_rules")
        ? "authoritative_data"
        : "untrusted_data",
      aiSources: sources
    },
    sources
  };
}

function aiSourcesFromToolOutput(toolName: string, output: Record<string, unknown>): AiSourceReference[] {
  if (toolName === "read_compendium") {
    const systemId = stringValue(output.systemId) ?? "unknown-system";
    return recordArray(output.entries).flatMap((entry) => {
      const id = stringValue(entry.id);
      const title = stringValue(entry.name);
      if (!id || !title) return [];
      const provenance = isRecord(entry.provenance) ? entry.provenance : undefined;
      const sourceKind = provenance ? stringValue(provenance.sourceKind) : undefined;
      const authoritative = sourceKind === "srd";
      return [{
        id: `compendium:${systemId}:${id}`,
        kind: authoritative ? "official_open_rules" : "campaign_note",
        title,
        locator: `compendium:${systemId}:${id}`,
        provenance: provenance
          ? {
              sourceName: stringValue(provenance.sourceName) ?? systemId,
              sourceVersion: stringValue(provenance.sourceVersion),
              contentVersion: stringValue(provenance.contentVersion),
              license: stringValue(provenance.license)
            }
          : { sourceName: systemId },
        visibility: "public",
        trust: authoritative ? "authoritative_open_rules" : "untrusted_campaign_content"
      } satisfies AiSourceReference];
    });
  }
  if (toolName === "search_campaign") {
    const rules: Partial<Record<string, { kind: AiSourceReference["kind"]; prefix: string; trust?: AiSourceReference["trust"] }>> = {
      world: { kind: "campaign_note", prefix: "world" },
      scene: { kind: "scene", prefix: "scene" },
      actor: { kind: "actor", prefix: "actor" },
      item: { kind: "item", prefix: "item" },
      journal: { kind: "campaign_note", prefix: "journal" },
      handout: { kind: "campaign_note", prefix: "handout" },
      encounter: { kind: "campaign_note", prefix: "encounter" },
      memory: { kind: "campaign_canon", prefix: "memory", trust: "reviewed_canon" },
      chat: { kind: "chat", prefix: "chat" },
      roll: { kind: "roll", prefix: "roll" }
    };
    return recordArray(output.results).flatMap((entry) => {
      const id = stringValue(entry.id);
      const title = stringValue(entry.title);
      const rule = rules[stringValue(entry.type) ?? ""];
      if (!id || !title || !rule) return [];
      return [sourceReference({
        id,
        title,
        prefix: rule.prefix,
        kind: rule.kind,
        visibility: stringValue(entry.visibility),
        trust: rule.trust
      })];
    });
  }
  if (toolName === "search_memory") {
    return recordArray(output.memories).flatMap((entry) => {
      const id = stringValue(entry.id);
      if (!id) return [];
      return [sourceReference({
        id,
        title: stringValue(entry.subject) ?? "Reviewed campaign memory",
        prefix: "memory",
        kind: "campaign_canon",
        visibility: stringValue(entry.visibility),
        trust: "reviewed_canon",
        locator: `ai-memory:${id}`
      })];
    });
  }
  if (toolName === "read_ai_activity") {
    return recordArray(output.memory).flatMap((entry) => {
      const id = stringValue(entry.id);
      if (!id) return [];
      const approved = entry.approved === true || entry.status === "approved";
      return [sourceReference({
        id,
        title: stringValue(entry.subject) ?? (approved ? "Reviewed campaign memory" : "Campaign memory draft"),
        prefix: "memory",
        kind: approved ? "campaign_canon" : "campaign_note",
        visibility: stringValue(entry.visibility),
        trust: approved ? "reviewed_canon" : "untrusted_campaign_content",
        locator: `ai-memory:${id}`
      })];
    });
  }
  const mapping: Record<string, { field: string; kind: AiSourceReference["kind"]; prefix: string }> = {
    read_world: { field: "worlds", kind: "campaign_note", prefix: "world" },
    read_journal: { field: "entries", kind: "campaign_note", prefix: "journal" },
    read_handout: { field: "handouts", kind: "campaign_note", prefix: "handout" },
    read_chat: { field: "messages", kind: "chat", prefix: "chat" },
    read_roll: { field: "rolls", kind: "roll", prefix: "roll" },
    read_scene: { field: "scenes", kind: "scene", prefix: "scene" },
    read_encounter: { field: "encounters", kind: "campaign_note", prefix: "encounter" },
    read_campaign_session: { field: "sessions", kind: "campaign_note", prefix: "campaign-session" },
    read_actor: { field: "actors", kind: "actor", prefix: "actor" },
    read_item: { field: "items", kind: "item", prefix: "item" }
  };
  const rule = mapping[toolName];
  if (!rule) return [];
  return recordArray(output[rule.field]).flatMap((entry) => {
    const id = stringValue(entry.id);
    const title = stringValue(entry.title) ?? stringValue(entry.name) ?? stringValue(entry.label) ?? id;
    if (!id || !title) return [];
    const visibilityValue = stringValue(entry.visibility);
    const canonical = toolName === "read_journal" && entry.canonStatus === "canonical";
    return [{
      id: `${rule.prefix}:${id}`,
      kind: canonical ? "campaign_canon" : rule.kind,
      title,
      locator: `${rule.prefix}:${id}${typeof entry.revision === "number" ? `@revision:${entry.revision}` : ""}`,
      visibility: visibilityValue === "gm_only" || visibilityValue === "whisper" ? "gm_private" : "public",
      trust: canonical ? "reviewed_canon" : "untrusted_campaign_content"
    } satisfies AiSourceReference];
  });
}

function sourceReference(input: {
  id: string;
  title: string;
  prefix: string;
  kind: AiSourceReference["kind"];
  visibility?: string;
  trust?: AiSourceReference["trust"];
  locator?: string;
}): AiSourceReference {
  return {
    id: `${input.prefix}:${input.id}`,
    kind: input.kind,
    title: input.title,
    locator: input.locator ?? `${input.prefix}:${input.id}`,
    visibility: input.visibility === "gm_only" || input.visibility === "whisper" ? "gm_private" : "public",
    trust: input.trust ?? "untrusted_campaign_content"
  };
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (["1", "true", "yes", "on"].includes(value.trim().toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.trim().toLowerCase())) return false;
  return undefined;
}

function parseContextScopes(value: string | undefined): AiContextScope[] | undefined {
  if (value === undefined) return undefined;
  const scopes = [...new Set(value.split(",").map((scope) => scope.trim()).filter(Boolean))];
  if (scopes.some((scope) => scope !== "public" && scope !== "gm_private")) return undefined;
  return scopes as AiContextScope[];
}

function parseRetentionDays(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/.test(value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 3650 ? parsed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
