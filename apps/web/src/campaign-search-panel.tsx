import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "./api.js";
import { errorMessage, formatDateTime, formatNumber } from "./sheet-format.js";
import type { WorldAtlasWorld } from "./world-atlas-panel.js";

export type CampaignSearchResultType =
  | "world"
  | "scene"
  | "actor"
  | "item"
  | "journal"
  | "handout"
  | "encounter"
  | "memory"
  | "chat"
  | "roll";

export interface CampaignSearchResult {
  type: CampaignSearchResultType;
  id: string;
  title: string;
  snippet: string;
  updatedAt: string;
  worldId?: string;
  visibility?: string;
  score: number;
}

export interface CampaignSearchInput {
  query: string;
  type: CampaignSearchResultType | "all";
  worldId: string;
  limit?: number;
}

export interface CampaignSearchDestination {
  workspace: "live" | "prep";
  tab: "actors" | "worlds" | "handouts" | "journal" | "memory" | "chat" | "combat";
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
  { id: "roll", label: "Rolls" }
];

export function campaignSearchPath(campaignId: string, input: CampaignSearchInput): string {
  const params = new URLSearchParams({ q: input.query.trim(), limit: String(input.limit ?? 50) });
  if (input.type !== "all") params.set("types", input.type);
  if (input.worldId) params.set("worldId", input.worldId);
  return `/api/v1/campaigns/${encodeURIComponent(campaignId)}/search?${params.toString()}`;
}

export function campaignSearchTypeLabel(type: CampaignSearchResultType): string {
  return campaignSearchTypeOptions.find((option) => option.id === type)?.label.replace(/s$/, "") ?? type;
}

export function campaignSearchDestination(type: CampaignSearchResultType): CampaignSearchDestination {
  if (type === "world") return { workspace: "prep", tab: "worlds" };
  if (type === "scene" || type === "actor" || type === "item") return { workspace: "prep", tab: "actors" };
  if (type === "journal") return { workspace: "prep", tab: "journal" };
  if (type === "handout") return { workspace: "live", tab: "handouts" };
  if (type === "memory") return { workspace: "prep", tab: "memory" };
  if (type === "encounter") return { workspace: "live", tab: "combat" };
  return { workspace: "live", tab: "chat" };
}

export function searchCampaignRecords(campaignId: string, input: CampaignSearchInput, signal?: AbortSignal): Promise<CampaignSearchResult[]> {
  return apiGet<CampaignSearchResult[]>(campaignSearchPath(campaignId, input), { signal });
}

export function CampaignSearchPanel(props: {
  campaignId: string;
  worlds: WorldAtlasWorld[];
  onOpenResult(result: CampaignSearchResult): void;
  request?: typeof searchCampaignRecords;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<CampaignSearchInput["type"]>("all");
  const [worldId, setWorldId] = useState("");
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
  }, [normalizedQuery, props.campaignId, request, type, worldId]);

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
            <div role="listitem" key={`${result.type}:${result.id}`}>
              <button className="campaign-search-result" type="button" onClick={() => props.onOpenResult(result)}>
                <span className="campaign-search-result-type">{campaignSearchTypeLabel(result.type)}</span>
                <strong>{result.title}</strong>
                <span className="campaign-search-result-snippet">{result.snippet || "No preview available"}</span>
                <small>
                  {result.worldId && worldNames.get(result.worldId) ? `${worldNames.get(result.worldId)} · ` : ""}
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
