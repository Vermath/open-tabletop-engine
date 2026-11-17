import type { AiCampaignPolicy, AiContextScope, AiMemoryFact, AiThread, AiToolCall, MapAsset, Proposal, Token } from "@open-tabletop/core";
import { Activity, Bot, Boxes, Check, Crosshair, FileText, Image as ImageIcon, Map as MapIcon, RefreshCw, RotateCcw, ScrollText, Shield, Swords, Timer, X } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { apiGet, apiPatch, apiPost, assetBlobUrl, type AiUsageSummary, type EncounterPlanInfo, type Snapshot } from "./api.js";
import { aiStudioProviderActionAvailable, aiStudioReadiness, useAiStudioReadiness, type AiStudioReadiness, type AiStudioReadinessPolicy } from "./ai-readiness.js";
import { aiToolCallErrorCode } from "./admin-panel-utils.js";
import { MetricTile } from "./metric-tile.js";
import { proposalQueueAction, proposalReviewActionLabel } from "./proposal-review.js";
import { formatCost, formatDateTime, formatDuration, formatNumber, formatTime, recordValue, titleCaseLabel } from "./sheet-format.js";
type AiPanelView = "create" | "review" | "memory" | "operations";
type AiIntentId = "encounter" | "map" | "tokenBatch" | "selectedToken" | "recap" | "memory";

interface AiGenerationJob {
  id: string;
  kind: "map" | "token" | "tokenBatch";
  label: string;
  detail?: string;
}

export { aiStudioProviderActionAvailable, aiStudioReadiness } from "./ai-readiness.js";
export type { AiStudioReadiness, AiStudioReadinessPolicy } from "./ai-readiness.js";

export function AiPanel(props: { campaignId?: string; canManagePolicy: boolean; prompt: string; setPrompt(value: string): void; askAi(): void; mapPrompt: string; setMapPrompt(value: string): void; generateMapAsset(): void; tokenPrompt: string; setTokenPrompt(value: string): void; generateTokenAsset(): void; generateSceneTokenAssets(): void; generationJobs: AiGenerationJob[]; selectedSceneName?: string; selectedTokenId?: string; selectedTokenName?: string; tokenOptions: Token[]; selectToken(tokenId: string): void; tokenArtMissingCount: number; tokenArtPendingCount: number; replayAiThread(thread: AiThread): void; retryAiToolCall(toolCall: AiToolCall): void; recapSession(): void; extractMemory(): void; activeSystemName?: string; encounterPlan?: EncounterPlanInfo; planEncounter(): void; proposals: Proposal[]; records: ProposalRecordCollections; memory: AiMemoryFact[]; aiThreads: AiThread[]; aiUsage?: AiUsageSummary; aiToolCalls: AiToolCall[]; approveAndApply(proposal: Proposal): void; rejectProposal(proposal: Proposal): void; revertProposal(proposal: Proposal): Promise<void>; approveMemory(fact: AiMemoryFact): void; deleteMemory(fact: AiMemoryFact): void; canDraftEncounter: boolean; canPropose: boolean; canRecapSession: boolean; canApply: boolean; canRevert: boolean; canPlanEncounter: boolean; canGenerateMap: boolean; canGenerateToken: boolean; canGenerateTokenBatch: boolean }) {
  const readiness = useAiStudioReadiness(props.campaignId);
  const providerActionAvailable = (capabilityAvailable: boolean) => aiStudioProviderActionAvailable(capabilityAvailable, readiness);
  const [activeView, setActiveView] = useState<AiPanelView>("create");
  const [activeIntent, setActiveIntent] = useState<AiIntentId>("encounter");
  const [proposalStatusFilter, setProposalStatusFilter] = useState<Proposal["status"] | "all">("all");
  const [proposalSearch, setProposalSearch] = useState("");
  const proposalSearchTerm = proposalSearch.trim().toLowerCase();
  const filteredProposals = props.proposals.filter((proposal) => {
    if (proposalStatusFilter !== "all" && proposal.status !== proposalStatusFilter) return false;
    if (!proposalSearchTerm) return true;
    return [proposal.title, proposal.summary, proposal.status, proposal.createdByType, proposal.changesJson.map((change) => `${change.entity} ${change.action}`).join(" ")].some((value) => value.toLowerCase().includes(proposalSearchTerm));
  });
  const orderedProposals = [...filteredProposals].sort((left, right) => proposalStatusSort(left.status) - proposalStatusSort(right.status) || right.updatedAt.localeCompare(left.updatedAt));
  const pendingCount = props.proposals.filter((proposal) => proposal.status === "pending").length;
  const approvedCount = props.proposals.filter((proposal) => proposal.status === "approved").length;
  const appliedCount = props.proposals.filter((proposal) => proposal.status === "applied").length;
  const rejectedCount = props.proposals.filter((proposal) => proposal.status === "rejected").length;
  const reviewCount = pendingCount + approvedCount;
  const memoryPendingCount = props.memory.filter((fact) => !fact.approvedByUserId).length;
  const staleReviewCount = props.proposals.filter((proposal) => (proposal.status === "pending" || proposal.status === "approved") && Date.now() - new Date(proposal.updatedAt).getTime() > 24 * 60 * 60 * 1000).length;
  const failedThreads = props.aiThreads.filter((thread) => thread.status === "failed");
  const retryableToolCalls = props.aiToolCalls.filter((call) => call.status === "failed" && call.retry === undefined && (aiToolCallErrorCode(call.output) === "tool_failed" || aiToolCallErrorCode(call.output) === "stale_tool_call"));
  const failedThreadCount = failedThreads.length;
  const failedToolCount = props.aiToolCalls.filter((call) => call.status === "failed").length;
  const operationsAttentionCount = failedThreadCount + retryableToolCalls.length + staleReviewCount;
  const recentAssetProposals = props.proposals
    .flatMap((proposal) => proposalAssetPreviews(proposal).map((asset) => ({ proposal, asset })))
    .filter(({ proposal }) => proposal.status === "pending" || proposal.status === "approved")
    .sort((left, right) => right.proposal.updatedAt.localeCompare(left.proposal.updatedAt))
    .slice(0, 4);
  const tokenArtStatus = props.tokenArtMissingCount === 0
    ? `${formatNumber(props.tokenArtPendingCount)} pending`
    : `${formatNumber(props.tokenArtMissingCount)} missing${props.tokenArtPendingCount > 0 ? ` / ${formatNumber(props.tokenArtPendingCount)} pending` : ""}`;
  const tokenArtSummaryCount = props.tokenArtMissingCount > 0 ? props.tokenArtMissingCount : props.tokenArtPendingCount;
  const tokenArtSummaryLabel = props.tokenArtMissingCount > 0 ? "missing art" : "pending art";
  const isGeneratingMap = props.generationJobs.some((job) => job.kind === "map");
  const isGeneratingSelectedToken = props.generationJobs.some((job) => job.kind === "token");
  const isGeneratingTokenBatch = props.generationJobs.some((job) => job.kind === "tokenBatch");
  const intentOptions = [
    { id: "encounter", label: "Encounter + Scene", detail: "Draft a reviewable encounter and table setup.", icon: <Swords size={16} />, disabled: !providerActionAvailable(props.canDraftEncounter) },
    { id: "map", label: "Generate Map", detail: "Create raster battlemap art for the selected scene.", icon: <MapIcon size={16} />, disabled: !providerActionAvailable(props.canGenerateMap) },
    { id: "tokenBatch", label: "Missing Token Art", detail: "Generate art for every scene token missing imagery.", icon: <Boxes size={16} />, disabled: !providerActionAvailable(props.canGenerateTokenBatch) },
    { id: "selectedToken", label: "Selected Token Art", detail: "Generate art for the currently selected token.", icon: <ImageIcon size={16} />, disabled: !providerActionAvailable(props.canGenerateToken) },
    { id: "recap", label: "Session Recap", detail: "Draft a recap proposal from current session context.", icon: <ScrollText size={16} />, disabled: !providerActionAvailable(props.canRecapSession) },
    { id: "memory", label: "Extract Memory", detail: "Queue campaign memory facts for review.", icon: <FileText size={16} />, disabled: !providerActionAvailable(props.canPropose) }
  ] satisfies Array<{ id: AiIntentId; label: string; detail: string; icon: React.ReactNode; disabled: boolean }>;
  const activeIntentOption = intentOptions.find((intent) => intent.id === activeIntent) ?? intentOptions[0]!;
  const activeIntentClass = activeIntent === "tokenBatch" ? "token-batch" : activeIntent === "selectedToken" ? "selected-token" : activeIntent;
  return (
    <div className="panel-stack ai-workspace">
      <header className="ai-command-header">
        <div>
          <div className="section-title">Permissioned AI</div>
          <h2>AI Workspace</h2>
        </div>
        <div className="ai-status-strip" aria-label="AI status summary">
          <span><strong>{formatNumber(reviewCount)}</strong> review</span>
          <span><strong>{formatNumber(tokenArtSummaryCount)}</strong> {tokenArtSummaryLabel}</span>
          <span><strong>{formatNumber(failedToolCount)}</strong> failed</span>
        </div>
      </header>

      <div className={`ai-trust-note ai-availability-${readiness.statusClass}`} role="status" aria-label="AI availability">
        <Shield size={15} />
        <span><strong>{readiness.label}.</strong> {readiness.detail}</span>
      </div>

      <nav className="ai-view-tabs" aria-label="AI workspace views">
        <button className={`tab ${activeView === "create" ? "active" : ""}`} type="button" onClick={() => setActiveView("create")}>
          <Bot size={14} /> Create
        </button>
        <button className={`tab ${activeView === "review" ? "active" : ""}`} type="button" onClick={() => setActiveView("review")}>
          <Check size={14} /> Review <span className="ai-tab-count">{formatNumber(reviewCount)}</span>
        </button>
        <button className={`tab ${activeView === "memory" ? "active" : ""}`} type="button" onClick={() => setActiveView("memory")}>
          <FileText size={14} /> Memory <span className="ai-tab-count">{formatNumber(memoryPendingCount)}</span>
        </button>
        <button className={`tab ${activeView === "operations" ? "active" : ""}`} type="button" onClick={() => setActiveView("operations")}>
          <Activity size={14} /> Ops <span className="ai-tab-count">{formatNumber(operationsAttentionCount)}</span>
        </button>
      </nav>

      {props.generationJobs.length > 0 && (
        <div className="ai-generation-strip" role="status" aria-live="polite">
          {props.generationJobs.map((job) => (
            <span key={job.id}>
              <RefreshCw size={14} /> {job.label}{job.detail ? `: ${job.detail}` : ""}
            </span>
          ))}
        </div>
      )}

      {activeView === "create" && (
        <section className={`ai-view-panel ai-create-workflow ai-create-intent-${activeIntentClass}`} aria-label="AI creation workflow">
          <section className="operator-section ai-intent-panel" aria-label="AI intent selection">
            <div className="operator-heading">
              <div>
                <div className="section-title">Intent</div>
                <p className="account-summary">Choose what Codex should prepare.</p>
              </div>
              <Bot size={16} />
            </div>
            <div className="ai-intent-grid">
              {intentOptions.map((intent) => (
                <button className={activeIntent === intent.id ? "ai-intent-card active" : "ai-intent-card"} disabled={intent.disabled} key={intent.id} type="button" onClick={() => setActiveIntent(intent.id)}>
                  {intent.icon}
                  <span>
                    <strong>{intent.label}</strong>
                    <small>{intent.detail}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="operator-section ai-target-panel" aria-label="AI generation targets">
            <div className="operator-heading">
              <div>
                <div className="section-title">Targets</div>
                <p className="account-summary">{activeIntentOption.label}</p>
              </div>
              <Crosshair size={16} />
            </div>
            <div className="metric-grid">
              <MetricTile label="Scene" value={props.selectedSceneName ?? "No scene"} />
              <MetricTile label="Selected token" value={props.selectedTokenName ?? "No token"} />
              <MetricTile label="Missing art" value={formatNumber(props.tokenArtMissingCount)} />
              <MetricTile label="Pending art" value={formatNumber(props.tokenArtPendingCount)} />
            </div>
            <div className="ai-trust-note">
              <Shield size={15} />
              <span>Generated content is stored as asset/proposal work and does not mutate the campaign until review is applied.</span>
            </div>
          </section>

          <section className="operator-section ai-prompt-card" aria-label="AI encounter tools">
            <div className="operator-heading">
              <div>
                <div className="section-title">Encounter</div>
                <p className="account-summary">Reviewable proposals only</p>
              </div>
              <Bot size={16} />
            </div>
            <label className="ai-field">
              Prompt
              <textarea aria-label="AI prompt" value={props.prompt} onChange={(event) => props.setPrompt(event.target.value)} />
            </label>
            <div className="button-row ai-action-row">
              <button className="primary-button" type="button" onClick={props.askAi} disabled={!providerActionAvailable(props.canDraftEncounter)}>
                <Bot size={16} /> Draft Encounter
              </button>
              <button className="ghost-button" type="button" onClick={props.recapSession} disabled={!providerActionAvailable(props.canRecapSession)}>
                <ScrollText size={16} /> Recap Session
              </button>
              <button className="ghost-button" type="button" onClick={props.extractMemory} disabled={!providerActionAvailable(props.canPropose)}>
                <FileText size={16} /> Extract Memory
              </button>
            </div>
          </section>

          <section className="operator-section ai-planning-panel" aria-label="AI encounter planning">
            <div className="operator-heading">
              <div>
                <div className="section-title">Planning</div>
                <p className="account-summary">{props.activeSystemName ? `${props.activeSystemName} encounter support` : "No active rules system"}</p>
              </div>
              <Swords size={16} />
            </div>
            <button className="ghost-button wide" type="button" onClick={props.planEncounter} disabled={!props.canPlanEncounter}>
              <Swords size={16} /> Plan Encounter
            </button>
            {props.encounterPlan ? (
              <div className="metric-grid">
                <MetricTile label="Difficulty" value={`${titleCaseLabel(props.encounterPlan.difficulty)} encounter`} />
                <MetricTile label="Threat" value={`${props.encounterPlan.threatBudget}/${props.encounterPlan.partyRating}`} />
              </div>
            ) : (
              <div className="empty-state compact">No encounter plan generated in this session.</div>
            )}
          </section>

          <section className="operator-section ai-assets-panel" aria-label="AI asset generation">
            <div className="operator-heading">
              <div>
                <div className="section-title">Assets</div>
                <p className="account-summary">Map and token art proposals</p>
              </div>
              <ImageIcon size={16} />
            </div>
            {recentAssetProposals.length > 0 && (
              <section className="ai-generated-preview" aria-label="Recently generated asset previews">
                <div className="operator-heading">
                  <div>
                    <div className="section-title">Generated Art</div>
                    <p className="account-summary">Pending review, visible before applying</p>
                  </div>
                  <strong>{formatNumber(recentAssetProposals.length)}</strong>
                </div>
                <div className="ai-generated-preview-grid">
                  {recentAssetProposals.map(({ proposal, asset }) => (
                    <article className="ai-generated-preview-card" key={`${proposal.id}-${asset.id}`}>
                      <ProposalAssetPreview asset={asset} />
                      <div className="ai-generated-preview-meta">
                        <span>{proposal.status}</span>
                        <strong>{proposal.title}</strong>
                      </div>
                      <div className="button-row ai-action-row">
                        <button className="ghost-button" type="button" onClick={() => props.approveAndApply(proposal)} disabled={!props.canApply}>
                          <Check size={15} /> Apply
                        </button>
                        <button className="ghost-button" type="button" onClick={() => props.rejectProposal(proposal)} disabled={!props.canApply}>
                          <X size={15} /> Reject
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
            <div className="ai-asset-grid">
              <section className="ai-asset-task ai-map-asset-task" aria-label="Map generation">
                <div className="operator-heading">
                  <strong>Map</strong>
                  <span>{props.selectedSceneName ?? "No scene"}</span>
                </div>
                <label className="ai-field">
                  Prompt
                  <textarea aria-label="AI map generation prompt" value={props.mapPrompt} onChange={(event) => props.setMapPrompt(event.target.value)} />
                </label>
                <button className="ghost-button wide" type="button" onClick={props.generateMapAsset} disabled={!providerActionAvailable(props.canGenerateMap)}>
                  <MapIcon size={16} /> {isGeneratingMap ? "Generating Map" : "Generate Map"}
                </button>
              </section>

              <section className="ai-asset-task ai-token-asset-task" aria-label="Token art generation">
                <div className="operator-heading">
                  <strong>Token Art</strong>
                  <span>{tokenArtStatus}</span>
                </div>
                <label className="ai-field">
                  Prompt
                  <textarea aria-label="AI token generation prompt" value={props.tokenPrompt} onChange={(event) => props.setTokenPrompt(event.target.value)} />
                </label>
                <label className="ai-field">
                  Target
                  <select aria-label="AI token generation target" value={props.selectedTokenId ?? ""} onChange={(event) => props.selectToken(event.target.value)} disabled={props.tokenOptions.length === 0}>
                    <option value="">No token</option>
                    {props.tokenOptions.map((token) => (
                      <option value={token.id} key={token.id}>
                        {token.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="ai-target-row">
                  <span>Selected</span>
                  <strong>{props.selectedTokenName ?? "No token"}</strong>
                </div>
                <div className="button-row ai-action-row">
                  <button className="ghost-button" type="button" onClick={props.generateTokenAsset} disabled={!providerActionAvailable(props.canGenerateToken)}>
                    <ImageIcon size={16} /> {isGeneratingSelectedToken ? "Generating Token Art" : "Generate Token Art"}
                  </button>
                  <button className="ghost-button" type="button" onClick={props.generateSceneTokenAssets} disabled={!providerActionAvailable(props.canGenerateTokenBatch)}>
                    <Boxes size={16} /> {isGeneratingTokenBatch ? "Generating Missing Art" : "Generate Missing Art"}
                  </button>
                </div>
              </section>
            </div>
          </section>

          <section className="operator-section ai-review-toolbar" aria-label="AI proposal review queue">
            <div className="operator-heading">
              <div>
                <div className="section-title">Review Queue</div>
                <p className="account-summary">Pending and approved proposals</p>
              </div>
              <strong>{formatNumber(reviewCount)}</strong>
            </div>
            <div className="metric-grid">
              <MetricTile label="Pending" value={formatNumber(pendingCount)} />
              <MetricTile label="Approved" value={formatNumber(approvedCount)} />
              <MetricTile label="Applied" value={formatNumber(appliedCount)} />
              <MetricTile label="Rejected" value={formatNumber(rejectedCount)} />
            </div>
            <button className="ghost-button wide" type="button" onClick={() => setActiveView("review")}>
              <Check size={16} /> Open Review
            </button>
          </section>
        </section>
      )}

      {activeView === "review" && (
        <section className="ai-view-panel" aria-label="AI proposal review queue">
          <section className="operator-section ai-review-toolbar">
            <div className="operator-heading">
              <div>
                <div className="section-title">Review Queue</div>
                <p className="account-summary">Apply permission: {props.canApply ? "available" : "missing"}</p>
              </div>
              <strong>{formatNumber(orderedProposals.length)}/{formatNumber(props.proposals.length)}</strong>
            </div>
            <div className="metric-grid">
              <MetricTile label="Pending" value={formatNumber(pendingCount)} />
              <MetricTile label="Approved" value={formatNumber(approvedCount)} />
              <MetricTile label="Applied" value={formatNumber(appliedCount)} />
              <MetricTile label="Rejected" value={formatNumber(rejectedCount)} />
            </div>
            <div className="admin-form-grid">
              <label>
                Status
                <select aria-label="Proposal status filter" value={proposalStatusFilter} onChange={(event) => setProposalStatusFilter(event.target.value as Proposal["status"] | "all")}>
                  <option value="all">All proposals</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="applied">Applied</option>
                  <option value="rejected">Rejected</option>
                  <option value="draft">Draft</option>
                  <option value="reverted">Reverted</option>
                </select>
              </label>
              <label>
                Search
                <input aria-label="Proposal search" value={proposalSearch} onChange={(event) => setProposalSearch(event.target.value)} placeholder="title, summary, entity" />
              </label>
            </div>
          </section>
          <section className="ai-proposal-list" aria-label="Proposal history">
            {orderedProposals.length === 0 ? (
              <div className="empty-state compact">No proposals match the current filters.</div>
            ) : (
              orderedProposals.map((proposal) => (
                <AiProposalReviewCard
                  canApply={props.canApply}
                  key={proposal.id}
                  proposal={proposal}
                  records={props.records}
                  onApply={props.approveAndApply}
                  onReject={props.rejectProposal}
                  onRevert={props.revertProposal}
                  canRevert={props.canRevert}
                />
              ))
            )}
          </section>
        </section>
      )}

      {activeView === "memory" && (
        <section className="ai-view-panel ai-memory-list" aria-label="AI memory facts">
          {props.memory.length === 0 ? (
            <div className="empty-state compact">No AI memory facts recorded.</div>
          ) : (
            props.memory.map((fact) => (
              <article className="proposal ai-memory-card" key={fact.id}>
                <span>{fact.approvedByUserId ? "approved memory" : "pending memory"}</span>
                <p>{fact.text}</p>
                <div className="metric-row">
                  <span>Visibility</span>
                  <strong>{fact.visibility}</strong>
                </div>
                <div className="metric-row">
                  <span>Source</span>
                  <strong>{fact.sourceIds.length ? fact.sourceIds.join(", ") : "manual"}</strong>
                </div>
                <div className="metric-row">
                  <span>Approval</span>
                  <strong>{fact.approvedByUserId ?? "pending review"}</strong>
                </div>
                <div className="button-row ai-action-row">
                  {!fact.approvedByUserId && (
                    <button className="ghost-button" type="button" onClick={() => props.approveMemory(fact)} disabled={!props.canApply}>
                      <Check size={15} /> Approve
                    </button>
                  )}
                  <button className="ghost-button" type="button" onClick={() => props.deleteMemory(fact)} disabled={!props.canApply}>
                    <X size={15} /> Delete
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      )}

      {activeView === "operations" && (
        <section className="ai-view-panel" aria-label="AI operations and recovery">
          {props.campaignId && <AiPolicyPanel campaignId={props.campaignId} canManage={props.canManagePolicy} />}
          {props.canPropose && <AiOperationsPanel summary={props.aiUsage} threads={props.aiThreads} toolCalls={props.aiToolCalls} />}
          <section className="operator-section" aria-label="AI recovery controls">
            <div className="operator-heading">
              <div>
                <div className="section-title">Recovery</div>
                <p className="account-summary">{formatNumber(failedThreadCount)} failed threads, {formatNumber(failedToolCount)} failed tools, {formatNumber(staleReviewCount)} stale reviews</p>
              </div>
              <RotateCcw size={15} />
            </div>
            {failedThreads.length === 0 && retryableToolCalls.length === 0 ? (
              <div className="empty-state compact">No retryable AI failures.</div>
            ) : (
              <div className="operator-list">
                {failedThreads.slice(0, 3).map((thread) => (
                  <div className="operator-row tool-call-row" key={`failed-thread-${thread.id}`}>
                    <span>{thread.title}</span>
                    <strong>{thread.providerError ?? "provider failed"}</strong>
                    <button className="ghost-button" type="button" onClick={() => props.replayAiThread(thread)} disabled={!providerActionAvailable(props.canPropose)}>
                      <RotateCcw size={14} /> Replay
                    </button>
                  </div>
                ))}
                {retryableToolCalls.slice(0, 4).map((toolCall) => (
                  <div className="operator-row tool-call-row" key={`retry-tool-${toolCall.id}`}>
                    <span>{toolCall.toolName}</span>
                    <strong>{aiToolCallErrorCode(toolCall.output) ?? "retryable failure"}</strong>
                    <button className="ghost-button" type="button" onClick={() => props.retryAiToolCall(toolCall)} disabled={!props.canPropose}>
                      <RefreshCw size={14} /> Retry
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </section>
      )}
    </div>
  );
}

function AiProposalReviewCard(props: { proposal: Proposal; records: ProposalRecordCollections; canApply: boolean; canRevert: boolean; onApply(proposal: Proposal): void; onReject(proposal: Proposal): void; onRevert(proposal: Proposal): Promise<void> }) {
  const generatedAssets = proposalAssetPreviews(props.proposal);
  const queueAction = proposalQueueAction(props.proposal);
  const affectedEntities = [...new Set(props.proposal.changesJson.map((change) => change.entity))];
  const revertable = props.proposal.status === "applied" && Boolean(props.proposal.inverseChangesJson?.length && props.proposal.revertGuardsJson?.length);
  const [revertArmed, setRevertArmed] = useState(false);
  const [reverting, setReverting] = useState(false);
  return (
    <article className="proposal ai-proposal-card">
      <div className="operator-heading">
        <span>{revertable ? "applied · revertable with stale-state guards" : props.proposal.status}</span>
        <strong>{formatNumber(props.proposal.changesJson.length)} changes</strong>
      </div>
      <h3>{props.proposal.title}</h3>
      {generatedAssets.length > 0 && (
        <div className="ai-proposal-asset-strip" aria-label={`${props.proposal.title} generated asset previews`}>
          {generatedAssets.map((asset) => (
            <ProposalAssetPreview asset={asset} key={asset.id} />
          ))}
        </div>
      )}
      <p>{props.proposal.summary}</p>
      <p className="account-summary">Affected entities: {affectedEntities.join(", ") || "none"}</p>
      <details className="proposal-detail">
        <summary>Review details</summary>
        <ProposalDiffPreview proposal={props.proposal} records={props.records} />
        <ProposalTimeline proposal={props.proposal} />
      </details>
      {queueAction === "review" && (
        <div className="button-row ai-action-row">
          <button className="ghost-button" type="button" onClick={() => props.onApply(props.proposal)} disabled={!props.canApply}>
            <Check size={15} /> {proposalReviewActionLabel(props.proposal)}
          </button>
          <button className="ghost-button" type="button" onClick={() => props.onReject(props.proposal)} disabled={!props.canApply}>
            <X size={15} /> Reject
          </button>
        </div>
      )}
      {queueAction === "revert" && (
        <div className="button-row ai-action-row">
          {revertArmed ? (
            <>
              <button className="danger-button" type="button" onClick={() => { setReverting(true); void props.onRevert(props.proposal).finally(() => setReverting(false)); }} disabled={!props.canRevert || reverting}>
                <RotateCcw size={15} /> {reverting ? "Reverting…" : "Confirm revert"}
              </button>
              <button className="ghost-button" type="button" disabled={reverting} onClick={() => setRevertArmed(false)}>Cancel</button>
            </>
          ) : (
            <button className="ghost-button" type="button" onClick={() => setRevertArmed(true)} disabled={!props.canRevert || !revertable} title={props.canRevert ? "Restore previous records only if every affected entity still matches its post-apply stale-state guard" : "Revert requires AI apply permission and a persisted campaign"}>
              <RotateCcw size={15} /> Revert applied changes
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function proposalStatusSort(status: Proposal["status"]): number {
  if (status === "pending") return 0;
  if (status === "approved") return 1;
  if (status === "draft") return 2;
  if (status === "applied") return 3;
  if (status === "rejected") return 4;
  return 5;
}

type ProposalTimelineEvent = {
  key: string;
  label: string;
  detail: string;
  at?: string;
  status?: Proposal["status"];
};

function ProposalTimeline(props: { proposal: Proposal }) {
  const events = proposalTimelineEvents(props.proposal);
  return (
    <section className="proposal-timeline" aria-label={`${props.proposal.title} proposal timeline`}>
      <div className="section-title">Review Timeline</div>
      <ol className="proposal-timeline-list">
        {events.map((event) => (
          <li className="proposal-timeline-event" key={event.key}>
            <div>
              <strong>{event.label}</strong>
              <p>{event.detail}</p>
            </div>
            <span className={event.status ? `status-pill ${event.status}` : "proposal-timeline-time"}>{event.at ? formatDateTime(event.at) : event.status ?? "linked"}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function proposalTimelineEvents(proposal: Proposal): ProposalTimelineEvent[] {
  const entities = [...new Set(proposal.changesJson.map((change) => change.entity))];
  const changeSummary = `${formatNumber(proposal.changesJson.length)} ${proposal.changesJson.length === 1 ? "change" : "changes"}${entities.length > 0 ? ` across ${entities.join(", ")}` : ""}`;
  if (proposal.history && proposal.history.length > 0) {
    const historyEvents = proposal.history
      .slice()
      .sort((left, right) => left.at.localeCompare(right.at))
      .map((entry, index): ProposalTimelineEvent => ({
        key: `history-${index}-${entry.action}`,
        label: titleCaseLabel(entry.action),
        detail: proposalHistoryDetail(entry, changeSummary),
        at: entry.at,
        status: entry.status
      }));
    if (proposal.sourceId) {
      historyEvents.splice(1, 0, {
        key: "source",
        label: "Linked source",
        detail: `${proposal.createdByType === "ai" ? "AI" : titleCaseLabel(proposal.createdByType)} source ${proposal.sourceId}.`
      });
    }
    historyEvents.push({
      key: "current",
      label: `Current ${proposal.status}`,
      detail: proposalReviewDetail(proposal, changeSummary),
      at: proposal.updatedAt,
      status: proposal.status
    });
    return historyEvents;
  }
  const events: ProposalTimelineEvent[] = [
    {
      key: "created",
      label: "Created",
      detail: `${titleCaseLabel(proposal.createdByType)}${proposal.createdByUserId ? ` by ${proposal.createdByUserId}` : ""} submitted ${changeSummary}.`,
      at: proposal.createdAt
    }
  ];

  if (proposal.sourceId) {
    events.push({
      key: "source",
      label: "Linked source",
      detail: `${proposal.createdByType === "ai" ? "AI" : titleCaseLabel(proposal.createdByType)} source ${proposal.sourceId}.`
    });
  }

  if (proposal.approvedByUserId) {
    events.push({
      key: "approved",
      label: "Approved",
      detail: `Approved by ${proposal.approvedByUserId}${proposal.status === "approved" ? "." : "; exact approval time is superseded by the current status update."}`,
      at: proposal.status === "approved" ? proposal.updatedAt : undefined,
      status: "approved"
    });
  }

  events.push({
    key: "current",
    label: `Current ${proposal.status}`,
    detail: proposalReviewDetail(proposal, changeSummary),
    at: proposal.updatedAt,
    status: proposal.status
  });
  return events;
}

function proposalHistoryDetail(entry: NonNullable<Proposal["history"]>[number], changeSummary: string): string {
  const actor = entry.actorUserId ? `${titleCaseLabel(entry.actorType)} ${entry.actorUserId}` : titleCaseLabel(entry.actorType);
  const transition = entry.previousStatus ? `${entry.previousStatus} to ${entry.status}` : entry.status;
  const note = entry.note ? ` ${entry.note}` : "";
  if (entry.action === "created") return `${actor} created a ${transition} review with ${changeSummary}.${note}`;
  if (entry.action === "applied") return `${actor} applied ${changeSummary} to campaign state.${note}`;
  if (entry.action === "rejected") return `${actor} rejected the proposal from ${transition}; campaign state was unchanged.${note}`;
  return `${actor} moved the proposal from ${transition}.${note}`;
}

function proposalReviewDetail(proposal: Proposal, changeSummary: string): string {
  const lastUpdated = new Date(proposal.updatedAt).getTime();
  const ageHours = Number.isFinite(lastUpdated) ? Math.floor((Date.now() - lastUpdated) / (60 * 60 * 1000)) : 0;
  if ((proposal.status === "pending" || proposal.status === "approved") && ageHours >= 24) {
    return `Needs GM attention; ${changeSummary} waiting for ${formatNumber(Math.floor(ageHours / 24))} days.`;
  }
  if (proposal.status === "applied") return `Applied after review; ${changeSummary} committed to campaign state.`;
  if (proposal.status === "rejected") return `Rejected after review; ${changeSummary} left campaign state unchanged.`;
  if (proposal.status === "approved") return `Approved and waiting to apply; ${changeSummary}.`;
  return `Awaiting review; ${changeSummary}.`;
}

type ProposalChange = Proposal["changesJson"][number];
export type ProposalRecordCollections = Pick<Snapshot, "campaigns" | "scenes" | "tokens" | "actors" | "items" | "journals" | "chat" | "rolls" | "diceMacros" | "encounters" | "combats" | "assets" | "fogPresets">;
type ProposalComparableRecord = ProposalRecordCollections[keyof ProposalRecordCollections][number];

function ProposalDiffPreview(props: { proposal: Proposal; records: ProposalRecordCollections }) {
  const changes = props.proposal.changesJson;
  return (
    <section className="proposal-diff" aria-label={`${props.proposal.title} review diff`}>
      <div className="section-title">Review Diff</div>
      {changes.length === 0 ? (
        <div className="empty-state compact">No structured changes.</div>
      ) : (
        <div className="proposal-change-list">
          {changes.map((change, index) => (
            <ProposalChangePreview change={change} index={index} key={`${props.proposal.id}-${index}`} records={props.records} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProposalChangePreview(props: { change: ProposalChange; index: number; records: ProposalRecordCollections }) {
  const existing = proposalExistingRecord(props.records, props.change);
  const entries = Object.entries(props.change.data).slice(0, 8);
  const generatedAsset = proposalAssetPreview(props.change);
  return (
    <div className="proposal-change">
      <div className="operator-row">
        <strong>{props.change.entity} {props.change.action}</strong>
        <span>{props.change.id ?? "new record"}</span>
      </div>
      <dl>
        {entries.map(([key, value]) => (
          <div key={key}>
            <dt>{titleCaseLabel(key)}</dt>
            <dd>{formatProposalValue(value)}</dd>
          </div>
        ))}
      </dl>
      {generatedAsset && <ProposalAssetPreview asset={generatedAsset} />}
      {props.change.action !== "create" && (
        <ProposalExistingComparison change={props.change} existing={existing} entries={entries} index={props.index} />
      )}
    </div>
  );
}

function ProposalAssetPreview(props: { asset: MapAsset }) {
  const [deliveryUrl, setDeliveryUrl] = useState<string | undefined>(() => (props.asset.url.startsWith("/api/v1/assets/") ? undefined : assetBlobUrl(props.asset)));
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPreviewFailed(false);
    if (!props.asset.url.startsWith("/api/v1/assets/")) {
      setDeliveryUrl(assetBlobUrl(props.asset));
      return () => {
        cancelled = true;
      };
    }
    setDeliveryUrl(undefined);
    apiPost<{ url: string; expiresAt: string }>(`/api/v1/assets/${props.asset.id}/delivery-url`, { expiresInSeconds: 300, disposition: "inline" })
      .then((delivery) => {
        if (!cancelled) setDeliveryUrl(delivery.url);
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewFailed(true);
          setDeliveryUrl(undefined);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [props.asset.id, props.asset.url]);

  return (
    <figure className="proposal-asset-preview">
      {deliveryUrl ? (
        <img
          src={deliveryUrl}
          alt={`${props.asset.name} generated asset preview`}
          onError={() => {
            setPreviewFailed(true);
            setDeliveryUrl(undefined);
          }}
        />
      ) : (
        <div className="proposal-asset-preview-placeholder">{previewFailed ? "Preview unavailable" : "Preparing preview"}</div>
      )}
      <figcaption>{props.asset.name} | {props.asset.mimeType} | {formatNumber(props.asset.sizeBytes)} bytes</figcaption>
    </figure>
  );
}

function proposalAssetPreview(change: ProposalChange): MapAsset | undefined {
  if (change.entity !== "asset" || change.action !== "create") return undefined;
  const data = change.data;
  if (
    typeof data.id !== "string" ||
    typeof data.campaignId !== "string" ||
    typeof data.name !== "string" ||
    typeof data.url !== "string" ||
    typeof data.mimeType !== "string" ||
    typeof data.sizeBytes !== "number" ||
    !isGeneratedAssetPreviewMime(data.mimeType)
  ) {
    return undefined;
  }
  return data as unknown as MapAsset;
}

function proposalAssetPreviews(proposal: Proposal): MapAsset[] {
  return proposal.changesJson.map(proposalAssetPreview).filter((asset): asset is MapAsset => Boolean(asset));
}

function isGeneratedAssetPreviewMime(mimeType: string): boolean {
  return mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/webp";
}

function ProposalExistingComparison(props: { change: ProposalChange; existing?: ProposalComparableRecord; entries: Array<[string, unknown]>; index: number }) {
  if (!props.change.id) return <p className="proposal-comparison-note">No target id supplied for existing-record comparison.</p>;
  if (!props.existing) return <p className="proposal-comparison-note">Existing {props.change.entity} record is not loaded in this campaign snapshot.</p>;
  return (
    <div className="proposal-comparison" aria-label={`${props.change.entity} ${props.index + 1} existing comparison`}>
      <div className="section-title">Existing Comparison</div>
      <dl>
        {props.entries.map(([key, proposed]) => (
          <div key={key}>
            <dt>{titleCaseLabel(key)}</dt>
            <dd>
              <span>Current</span>
              <strong>{formatProposalValue(recordValue(props.existing)[key])}</strong>
            </dd>
            <dd>
              <span>Proposed</span>
              <strong>{formatProposalValue(proposed)}</strong>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function proposalExistingRecord(records: ProposalRecordCollections, change: ProposalChange): ProposalComparableRecord | undefined {
  if (!change.id) return undefined;
  switch (change.entity) {
    case "campaign":
      return records.campaigns.find((item) => item.id === change.id);
    case "scene":
      return records.scenes.find((item) => item.id === change.id);
    case "token":
      return records.tokens.find((item) => item.id === change.id);
    case "actor":
      return records.actors.find((item) => item.id === change.id);
    case "item":
      return records.items.find((item) => item.id === change.id);
    case "journal":
      return records.journals.find((item) => item.id === change.id);
    case "chat":
      return records.chat.find((item) => item.id === change.id);
    case "roll":
      return records.rolls.find((item) => item.id === change.id);
    case "diceMacro":
      return records.diceMacros.find((item) => item.id === change.id);
    case "encounter":
      return records.encounters.find((item) => item.id === change.id);
    case "combat":
      return records.combats.find((item) => item.id === change.id);
    case "asset":
      return records.assets.find((item) => item.id === change.id);
    case "fogPreset":
      return records.fogPresets.find((item) => item.id === change.id);
    default:
      return undefined;
  }
}

function formatProposalValue(value: unknown): string {
  if (value === null || value === undefined) return "empty";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.length === 0 ? "[]" : value.map(formatProposalValue).join(", ");
  return JSON.stringify(value);
}

interface EffectiveAiPolicyView {
  enabled: boolean;
  status: "enabled" | "disabled" | "unsafe_configuration";
  contextScopes: AiContextScope[];
  retentionDays: number;
  legacyDefault: boolean;
  readinessIssues: string[];
  campaign: AiCampaignPolicy;
  installation: {
    enabled: boolean;
    status: "enabled" | "disabled" | "unsafe_configuration";
    providerTransmissionDisclosure: string;
  };
  provider?: AiStudioReadinessPolicy["provider"];
}

interface AiPrivacyView {
  dryRun: boolean;
  categories: { aiThreads: number; aiToolCalls: number; aiEvaluations: number };
  preserved: { approvedCanonMemory: number; proposals: number; auditLogs: number };
  providerDeletion: "not_requested_or_verified";
}

function AiPolicyPanel(props: { campaignId: string; canManage: boolean }) {
  const [policy, setPolicy] = useState<EffectiveAiPolicyView>();
  const [draft, setDraft] = useState<AiCampaignPolicy>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [privacy, setPrivacy] = useState<AiPrivacyView>();
  const [clearArmed, setClearArmed] = useState(false);

  const load = async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const next = await apiGet<EffectiveAiPolicyView>(`/api/v1/campaigns/${encodeURIComponent(props.campaignId)}/ai/policy`, { signal });
      setPolicy(next);
      setDraft(next.campaign);
    } catch (loadError) {
      if (!signal?.aborted) setError(loadError instanceof Error ? loadError.message : "AI policy could not be loaded.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [props.campaignId]);

  const save = async () => {
    if (!draft || !policy || !props.canManage) return;
    setSaving(true);
    setError("");
    try {
      const next = await apiPatch<EffectiveAiPolicyView>(
        `/api/v1/campaigns/${encodeURIComponent(props.campaignId)}/ai/policy`,
        {
          expectedRevision: policy.campaign.revision,
          enabled: draft.enabled,
          contextScopes: draft.contextScopes,
          providerTransmissionDisclosure: draft.providerTransmissionDisclosure,
          retentionDays: draft.retentionDays
        },
        { idempotencyKey: crypto.randomUUID() }
      );
      setPolicy(next);
      setDraft(next.campaign);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "AI policy could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const previewPrivacy = async () => {
    setSaving(true);
    setError("");
    try {
      setPrivacy(await apiPost<AiPrivacyView>(`/api/v1/campaigns/${encodeURIComponent(props.campaignId)}/ai/privacy/preview`, { mode: "all", limit: 1000 }));
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "AI retention preview failed.");
    } finally {
      setSaving(false);
    }
  };

  const clearLocalHistory = async () => {
    if (!clearArmed) return;
    setSaving(true);
    setError("");
    try {
      setPrivacy(await apiPost<AiPrivacyView>(
        `/api/v1/campaigns/${encodeURIComponent(props.campaignId)}/ai/privacy/prune`,
        { mode: "all", limit: 1000, dryRun: false, confirmation: "CLEAR_AI_OPERATIONAL_HISTORY" },
        { idempotencyKey: crypto.randomUUID() }
      ));
      setClearArmed(false);
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "AI operational history could not be cleared.");
    } finally {
      setSaving(false);
    }
  };

  const toggleScope = (scope: AiContextScope, enabled: boolean) => {
    if (!draft) return;
    setDraft({
      ...draft,
      contextScopes: enabled ? [...new Set([...draft.contextScopes, scope])] : draft.contextScopes.filter((candidate) => candidate !== scope)
    });
  };

  return (
    <section className="operator-section" aria-label="AI safety and privacy policy" aria-busy={loading || saving}>
      <div className="operator-heading">
        <div>
          <div className="section-title">Safety & Privacy</div>
          <p className="account-summary">{policy ? `${policy.provider?.status === "configured" ? policy.status : "provider unavailable"} · local retention ${policy.retentionDays} days` : "Loading policy"}</p>
        </div>
        <Shield size={15} />
      </div>
      {loading && <div className="empty-state compact" role="status">Loading AI policy…</div>}
      {error && (
        <div className="empty-state compact" role="alert">
          {error} <button className="ghost-button" type="button" onClick={() => void load()}>Retry</button>
        </div>
      )}
      {policy && draft && (
        <>
          {(policy.status !== "enabled" || policy.provider?.status !== "configured") && (
            <div className="ai-trust-note ai-availability-failed" role="status">
              <Shield size={15} />
              <span>{policy.provider?.status !== "configured" ? policy.provider?.message ?? "No live AI provider configuration was reported by the server." : policy.status === "unsafe_configuration" ? policy.readinessIssues.join(" ") : "AI calls are disabled by installation or campaign policy."}</span>
            </div>
          )}
          <p className="account-summary">{policy.provider?.message ?? "AI provider configuration could not be confirmed."}</p>
          <p>{policy.installation.providerTransmissionDisclosure}</p>
          <p className="account-summary">This controls OpenTabletop's local operational history only. Provider-side retention or deletion is separate and is not claimed here.</p>
          <div className="admin-form-grid">
            <label>
              Campaign AI
              <select aria-label="Campaign AI status" value={draft.enabled ? "enabled" : "disabled"} disabled={!props.canManage || saving} onChange={(event) => setDraft({ ...draft, enabled: event.target.value === "enabled", status: event.target.value === "enabled" ? "enabled" : "disabled" })}>
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
            <label>
              Local retention days
              <input aria-label="AI local retention days" type="number" min={1} max={3650} value={draft.retentionDays} disabled={!props.canManage || saving} onChange={(event) => setDraft({ ...draft, retentionDays: Number(event.target.value) })} />
            </label>
          </div>
          <fieldset disabled={!props.canManage || saving}>
            <legend>Provider context scopes</legend>
            <label><input type="checkbox" checked={draft.contextScopes.includes("public")} onChange={(event) => toggleScope("public", event.target.checked)} /> Public campaign context</label>
            <label><input type="checkbox" checked={draft.contextScopes.includes("gm_private")} onChange={(event) => toggleScope("gm_private", event.target.checked)} /> GM-private context</label>
          </fieldset>
          <label className="ai-field">
            Provider transmission disclosure
            <textarea aria-label="AI provider transmission disclosure" value={draft.providerTransmissionDisclosure} disabled={!props.canManage || saving} onChange={(event) => setDraft({ ...draft, providerTransmissionDisclosure: event.target.value })} />
          </label>
          <div className="button-row ai-action-row">
            <button className="primary-button" type="button" disabled={!props.canManage || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save policy"}</button>
            <button className="ghost-button" type="button" disabled={!props.canManage || saving} onClick={() => void previewPrivacy()}>Preview local history</button>
          </div>
          {privacy && (
            <div className="ai-trust-note" role="status">
              <span>{privacy.categories.aiThreads} threads, {privacy.categories.aiToolCalls} tool calls, and {privacy.categories.aiEvaluations} evaluations selected. {privacy.preserved.approvedCanonMemory} approved canon memories and {privacy.preserved.proposals} proposals are preserved.</span>
            </div>
          )}
          {props.canManage && (
            <div className="button-row ai-action-row">
              {clearArmed ? (
                <>
                  <button className="danger-button" type="button" disabled={saving} onClick={() => void clearLocalHistory()}>Confirm local history clear</button>
                  <button className="ghost-button" type="button" disabled={saving} onClick={() => setClearArmed(false)}>Cancel</button>
                </>
              ) : (
                <button className="ghost-button" type="button" disabled={saving} onClick={() => setClearArmed(true)}>Clear local operational history…</button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function AiOperationsPanel(props: { summary?: AiUsageSummary; threads: AiThread[]; toolCalls: AiToolCall[] }) {
  const summary = props.summary;
  const recentThreads = props.threads.slice(0, 4);
  const recentToolCalls = props.toolCalls.slice(0, 5);
  const usage = summary?.usage;
  return (
    <section className="operator-section" aria-label="AI operations">
      <div className="operator-heading">
        <div className="section-title">Operator Signals</div>
        <Activity size={15} />
      </div>
      <div className="metric-grid">
        <MetricTile label="Threads" value={formatNumber(summary?.threadCount ?? props.threads.length)} />
        <MetricTile label="Failures" value={formatNumber(summary?.failedThreadCount)} />
        <MetricTile label="Retries" value={formatNumber(summary?.retryAttempts)} />
        <MetricTile label="Tokens" value={formatNumber(usage?.totalTokens)} />
        <MetricTile label="Cost" value={formatCost(usage?.estimatedCostUsd)} />
        <MetricTile label="Tools" value={formatNumber(summary?.toolCallCount ?? props.toolCalls.length)} />
      </div>
      {summary && summary.providers.length > 0 && (
        <div className="operator-list">
          {summary.providers.map((provider) => (
            <div className="operator-row" key={provider.provider}>
              <span>{provider.provider}</span>
              <strong>{formatNumber(provider.usage.totalTokens)} tokens</strong>
            </div>
          ))}
        </div>
      )}
      <div className="operator-list">
        <div className="operator-heading">
          <div className="section-title">Recent Threads</div>
          <Timer size={15} />
        </div>
        {recentThreads.length === 0 ? (
          <div className="empty-state compact">No AI threads.</div>
        ) : (
          recentThreads.map((thread) => (
            <article className="operator-item" key={thread.id}>
              <div className="operator-row">
                <span className={`status-pill ${thread.status ?? "running"}`}>{thread.status ?? "running"}</span>
                <strong>{formatDuration(thread.durationMs)}</strong>
              </div>
              <h3>{thread.title}</h3>
              <p>{thread.provider} - {formatTime(thread.startedAt)}</p>
              <div className="operator-row">
                <span>{formatNumber(thread.usage?.totalTokens)} tokens</span>
                <span>{formatCost(thread.usage?.estimatedCostUsd)}</span>
              </div>
              <AiThreadSources thread={thread} />
            </article>
          ))
        )}
      </div>
      <div className="operator-list">
        <div className="section-title">Tool Calls</div>
        {recentToolCalls.length === 0 ? (
          <div className="empty-state compact">No tool calls.</div>
        ) : (
          recentToolCalls.map((toolCall) => (
            <div className="operator-row tool-call-row" key={toolCall.id}>
              <span>{toolCall.toolName}</span>
              <strong>{toolCall.status} - {formatDuration(toolCall.durationMs)}</strong>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function AiThreadSources(props: { thread: AiThread }) {
  const sources = props.thread.sources ?? [];
  const citations = props.thread.citations ?? [];
  const verified = citations.filter((citation) => citation.status === "verified").length;
  const unsupported = citations.filter((citation) => citation.status === "unsupported").length;
  const untrusted = sources.filter((source) => source.trust === "untrusted_campaign_content").length;
  if (sources.length === 0 && citations.length === 0 && !(props.thread.citationWarnings?.length)) return null;
  return (
    <section aria-label={`${props.thread.title} sources and citations`}>
      <div className="button-row ai-action-row" aria-label="Citation status badges">
        <span className="status-pill completed">{verified} verified citations</span>
        {unsupported > 0 && <span className="status-pill failed">{unsupported} unsupported</span>}
        {untrusted > 0 && <span className="status-pill running">{untrusted} untrusted data sources</span>}
      </div>
      {(props.thread.citationWarnings ?? []).map((warning) => (
        <p className="account-summary" role="alert" key={warning.code}>{warning.message}</p>
      ))}
      {sources.length > 0 && (
        <details className="proposal-detail">
          <summary>Sources and provenance ({sources.length})</summary>
          <ul>
            {sources.map((source) => (
              <li key={source.id}>
                <strong>{source.title}</strong> — {titleCaseLabel(source.kind)} · {titleCaseLabel(source.trust)}
                {source.provenance && <span> · {source.provenance.sourceName}{source.provenance.contentVersion ? ` ${source.provenance.contentVersion}` : ""}{source.provenance.license ? ` · ${source.provenance.license}` : ""}</span>}
                {source.locator && <code> {source.locator}</code>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
