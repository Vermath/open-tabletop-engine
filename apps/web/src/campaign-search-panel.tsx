import type { CampaignSearchMatchKind, CampaignSearchResult, CampaignSearchResultType, CampaignSearchSourceKind } from "@open-tabletop/core";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "./api.js";
import { errorMessage, formatDateTime, formatNumber } from "./sheet-format.js";
import type { WorldAtlasWorld } from "./world-atlas-panel.js";

export type { CampaignSearchResult, CampaignSearchResultType } from "@open-tabletop/core";

export interface CampaignSearchInput {
  query: string;
  type: CampaignSearchResultType | "all";
  worldId: string;
  limit?: number;
  offset?: number;
}

export interface CampaignSearchDestination {
  workspace: "live" | "prep";
  tab: "actors" | "compendium" | "worlds" | "handouts" | "journal" | "memory" | "chat" | "combat";
}

const renderedCampaignSearchAnchorTypes = new Set<CampaignSearchResultType>(["journal", "handout", "memory", "chat", "roll"]);

export function campaignSearchAnchorId(type: CampaignSearchResultType, id: string): string {
  return `campaign-search-${type}-${encodeURIComponent(id)}`;
}

export function campaignSearchTypeHasRenderedAnchor(type: CampaignSearchResultType): boolean {
  return renderedCampaignSearchAnchorTypes.has(type);
}

export function campaignSearchItemActorId(items: Array<{ id: string; actorId?: string }>, itemId: string): string | undefined {
  return items.find((item) => item.id === itemId)?.actorId;
}

export const campaignSearchTypeOptions: Array<{ id: CampaignSearchResultType | "all"; label: string }> = [
  { id: "all", label: "Everything" },
  { id: "world", label: "Worlds" },
  { id: "scene", label: "Scenes" },
  { id: "actor", label: "Actors" },
  { id: "item", label: "Items" },
  { id: "journal", label: "Journals" },
  { id: "handout", label: "Handouts" },
  { id: "encounter", label: "Encounters" },
  { id: "memory", label: "Canon" },
  { id: "chat", label: "Chat" },
  { id: "roll", label: "Rolls" },
  { id: "compendium", label: "Rules" }
];

export function campaignSearchPath(campaignId: string, input: CampaignSearchInput): string {
  const params = new URLSearchParams({ q: input.query.trim(), limit: String(input.limit ?? 50) });
  if (input.type !== "all") params.set("types", input.type);
  if (input.worldId) params.set("worldId", input.worldId);
  if (input.offset) params.set("offset", String(input.offset));
  return `/api/v1/campaigns/${encodeURIComponent(campaignId)}/search?${params.toString()}`;
}

export function campaignSearchTypeLabel(type: CampaignSearchResultType): string {
  return campaignSearchTypeOptions.find((option) => option.id === type)?.label.replace(/s$/, "") ?? type;
}

export function campaignSearchDestination(type: CampaignSearchResultType): CampaignSearchDestination {
  if (type === "compendium") return { workspace: "live", tab: "compendium" };
  if (type === "world") return { workspace: "prep", tab: "worlds" };
  if (type === "scene" || type === "actor" || type === "item") return { workspace: "prep", tab: "actors" };
  if (type === "journal") return { workspace: "prep", tab: "journal" };
  if (type === "handout") return { workspace: "live", tab: "handouts" };
  if (type === "memory") return { workspace: "prep", tab: "memory" };
  if (type === "encounter") return { workspace: "live", tab: "combat" };
  return { workspace: "live", tab: "chat" };
}

export function campaignSearchMatchLabel(match: CampaignSearchMatchKind): string {
  if (match === "exact_id") return "Exact ID";
  if (match === "exact_name" || match === "normalized_name") return "Exact name";
  if (match === "prefix") return "Name prefix";
  if (match === "fuzzy") return "Close name";
  return match === "title" ? "Name match" : "Content match";
}

export function campaignSearchSourceLabel(source: CampaignSearchSourceKind): string {
  if (source === "actor_instance") return "Actor-owned instance";
  if (source === "srd") return "Bundled SRD";
  if (source === "bundled") return "Bundled system";
  if (source === "homebrew") return "Campaign homebrew";
  return "Campaign record";
}

export function searchCampaignRecords(campaignId: string, input: CampaignSearchInput, signal?: AbortSignal): Promise<CampaignSearchResult[]> {
  return apiGet<CampaignSearchResult[]>(campaignSearchPath(campaignId, input), { signal });
}

export function CampaignSearchPanel(props: {
  campaignId: string;
  worlds: WorldAtlasWorld[];
  onOpenResult(result: CampaignSearchResult): void;
  request?: typeof searchCampaignRecords;
  revision?: number;
  storageKey?: string;
}) {
  const restored = readCampaignSearchState(props.storageKey);
  const [query, setQuery] = useState(restored.query);
  const [type, setType] = useState<CampaignSearchInput["type"]>(restored.type);
  const [worldId, setWorldId] = useState(restored.worldId);
  const [results, setResults] = useState<CampaignSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = props.request ?? searchCampaignRecords;
  const normalizedQuery = query.trim();
  const worldNames = useMemo(() => new Map(props.worlds.map((world) => [world.id, world.name])), [props.worlds]);

  useEffect(() => {
    if (!normalizedQuery) {
      setResults([]);
      setLoading(false);
      setError("");
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = window.setTimeout(() => {
      request(props.campaignId, { query: normalizedQuery, type, worldId }, controller.signal)
        .then((nextResults) => {
          if (!controller.signal.aborted) setResults(nextResults);
        })
        .catch((reason) => {
          if (!controller.signal.aborted) {
            setResults([]);
            setError(errorMessage(reason));
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedQuery, props.campaignId, props.revision, request, type, worldId]);

  useEffect(() => {
    if (!props.storageKey || typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(props.storageKey, JSON.stringify({ query, type, worldId }));
    } catch {
      // Search remains usable when browser storage is unavailable.
    }
  }, [props.storageKey, query, type, worldId]);

  return (
    <section className="panel-stack lore-panel campaign-search-panel" aria-label="Campaign Search">
      <div className="lore-panel-heading">
        <div>
          <div className="section-title">Campaign Search</div>
          <h2>Find anything at the table</h2>
        </div>
        <Search size={20} aria-hidden="true" />
      </div>
      <p className="account-summary">Search only returns records this seat is allowed to read.</p>
      <div className="lore-filter-grid">
        <label className="lore-search-field span-full">
          <Search size={14} aria-hidden="true" />
          <span className="sr-only">Search this campaign</span>
          <input autoComplete="off" aria-label="Search this campaign" value={query} placeholder="NPC, clue, item, message, or roll" onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label>
          <span>Record type</span>
          <select aria-label="Campaign search record type" value={type} onChange={(event) => setType(event.target.value as CampaignSearchInput["type"])}>
            {campaignSearchTypeOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <label>
          <span>World</span>
          <select aria-label="Campaign search world" value={worldId} onChange={(event) => setWorldId(event.target.value)}>
            <option value="">All worlds</option>
            {props.worlds.map((world) => <option key={world.id} value={world.id}>{world.name}</option>)}
          </select>
        </label>
      </div>

      <div className="lore-list-heading" aria-live="polite">
        <span>{loading ? "Searching" : error ? "Search failed" : normalizedQuery ? "Results" : "Ready"}</span>
        <strong>{formatNumber(results.length)}</strong>
      </div>
      {error && <div className="lore-load-state error" role="alert">{error}</div>}
      {!normalizedQuery ? (
        <div className="empty-state compact">Enter a name, phrase, dice formula, or result.</div>
      ) : !loading && !error && results.length === 0 ? (
        <div className="empty-state compact">No visible campaign records match this search.</div>
      ) : (
        <div className="campaign-search-results" role="list" aria-label="Campaign search results" aria-busy={loading}>
          {results.map((result) => (
            <div role="listitem" key={`${result.type}:${result.target.systemId ?? ""}:${result.id}`}>
              <button className="campaign-search-result" type="button" onClick={() => props.onOpenResult(result)}>
                <span className="campaign-search-result-badges">
                  <span className="campaign-search-result-type">{campaignSearchTypeLabel(result.type)}</span>
                  <span>{campaignSearchMatchLabel(result.matchKind)}</span>
                  <span>{campaignSearchSourceLabel(result.target.sourceKind)}</span>
                </span>
                <strong>{result.title}</strong>
                <span className="campaign-search-result-snippet">{result.snippet || "No preview available"}</span>
                <small>
                  {result.worldId && worldNames.get(result.worldId) ? `${worldNames.get(result.worldId)} · ` : ""}
                  {result.target.systemId ? `${result.target.systemId} · ` : ""}
                  {result.visibility ? `${result.visibility.replaceAll("_", " ")} · ` : ""}
                  {formatDateTime(result.updatedAt)}
                </small>
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function readCampaignSearchState(storageKey: string | undefined): { query: string; type: CampaignSearchInput["type"]; worldId: string } {
  const fallback = { query: "", type: "all" as const, worldId: "" };
  if (!storageKey || typeof window === "undefined") return fallback;
  try {
    const value = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "null") as Record<string, unknown> | null;
    const type = typeof value?.type === "string" && campaignSearchTypeOptions.some((option) => option.id === value.type) ? value.type as CampaignSearchInput["type"] : "all";
    return { query: typeof value?.query === "string" ? value.query : "", type, worldId: typeof value?.worldId === "string" ? value.worldId : "" };
  } catch {
    return fallback;
  }
}
