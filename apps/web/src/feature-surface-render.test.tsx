import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CampaignMemoryPanel } from "./campaign-memory-panel.js";
import { HandoutLibraryPanel } from "./handout-library-panel.js";
import { HitDiceRestCard } from "./hit-dice-rest-card.js";
import { SessionDeskPanel } from "./session-desk-panel.js";
import { WorldAtlasPanel } from "./world-atlas-panel.js";
import type { Actor } from "@open-tabletop/core";
import type { CampaignSessionInfo } from "./api.js";

const noop = vi.fn();
const refreshNoop = vi.fn(async () => undefined);

describe("feature-surface states and permissions", () => {
  it("renders World Atlas loading and empty states without mutation controls for readers", () => {
    const html = renderToStaticMarkup(
      <WorldAtlasPanel
        campaignId="camp-1"
        campaignUpdatedAt="2026-01-01T00:00:00.000Z"
        worlds={[]}
        worldRecords={[]}
        worldRelations={[]}
        scenes={[]}
        selectedWorldId="all"
        canCreate={false}
        canUpdateWorld={false}
        canAssignScenes={false}
        canDelete={false}
        loadState="loading"
        onWorldsChange={noop}
        onWorldRecordsChange={noop}
        onWorldRelationsChange={noop}
        onSelectWorld={noop}
        onSceneUpdated={noop}
        onRefreshSharedState={refreshNoop}
        onStatus={noop}
      />
    );
    expect(html).toContain("Loading worlds");
    expect(html).toContain("No scenes in this view");
    expect(html).not.toContain("Add a world");
  });

  it("renders a retryable Handout Library load error and hides authoring controls for readers", () => {
    const html = renderToStaticMarkup(
      <HandoutLibraryPanel
        campaignId="camp-1"
        campaignUpdatedAt="2026-01-01T00:00:00.000Z"
        currentUserId="usr-1"
        handouts={[]}
        worlds={[]}
        members={[]}
        actors={[]}
        assets={[]}
        canCreate={false}
        canUpdate={false}
        canDelete={false}
        loadState="error"
        loadError="Handouts could not be loaded: offline"
        onRetryLoad={noop}
        onHandoutsChange={noop}
        onRefreshSharedState={refreshNoop}
        onStatus={noop}
      />
    );
    expect(html).toContain("Handouts could not be loaded: offline");
    expect(html).toContain("Retry");
    expect(html).toContain("No handouts match this view");
    expect(html).not.toContain("aria-label=\"Create handout\"");
  });

  it("renders empty canon and session views without GM-only controls", () => {
    const memory = renderToStaticMarkup(
      <CampaignMemoryPanel campaignId="camp-1" facts={[]} canCreate={false} canReview={false} onFactsChange={noop} onExtract={noop} onStatus={noop} />
    );
    const sessions = renderToStaticMarkup(
      <SessionDeskPanel campaignId="camp-1" sessions={[]} scenes={[]} encounters={[]} canManage={false} canStart={false} onSessionsChange={noop} onSceneActivated={noop} onStatus={noop} />
    );
    expect(memory).toContain("No established facts match this search");
    expect(memory).not.toContain("Add fact");
    expect(memory.match(/role="tab"/g)).toHaveLength(1);
    expect(sessions).toContain("No sessions planned yet");
    expect(sessions).not.toContain("aria-label=\"Plan session\"");
  });

  it("preserves native button semantics for handout and session list rows", () => {
    const handout = renderToStaticMarkup(
      <HandoutLibraryPanel
        campaignId="camp-1"
        campaignUpdatedAt="2026-01-01T00:00:00.000Z"
        currentUserId="usr-1"
        handouts={[{
          id: "handout-1",
          campaignId: "camp-1",
          title: "Vault warning",
          body: "Keep out.",
          visibility: "public",
          visibleToUserIds: [],
          visibleToActorIds: [],
          assetIds: [],
          tags: [],
          readByUserIds: [],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }]}
        worlds={[]}
        members={[]}
        actors={[]}
        assets={[]}
        canCreate={false}
        canUpdate={false}
        canDelete={false}
        onHandoutsChange={noop}
        onRefreshSharedState={refreshNoop}
        onStatus={noop}
      />
    );
    const sessions = renderToStaticMarkup(
      <SessionDeskPanel
        campaignId="camp-1"
        sessions={[{ id: "session-1", campaignId: "camp-1", status: "planned", title: "Vault", number: 1, agenda: "", notes: "", sceneIds: [], encounterIds: [], createdBy: "usr-1", updatedBy: "usr-1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } satisfies CampaignSessionInfo]}
        scenes={[]}
        encounters={[]}
        canManage={false}
        canStart={false}
        onSessionsChange={noop}
        onSceneActivated={noop}
        onStatus={noop}
      />
    );

    expect(handout).toMatch(/role="listitem"><button[^>]*class="handout-list-item"/);
    expect(sessions).toMatch(/role="listitem"><button[^>]*class="session-desk-row/);
    expect(handout).not.toMatch(/<button[^>]*role="listitem"/);
    expect(sessions).not.toMatch(/<button[^>]*role="listitem"/);
  });

  it("renders read-only world fields for readers and a lone hit-die pool", () => {
    const world = renderToStaticMarkup(
      <WorldAtlasPanel
        campaignId="camp-1"
        campaignUpdatedAt="2026-01-01T00:00:00.000Z"
        worlds={[{ id: "world-1", campaignId: "camp-1", name: "Ashen Coast", description: "Stormy", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }]}
        worldRecords={[]}
        worldRelations={[]}
        scenes={[]}
        selectedWorldId="world-1"
        canCreate={false}
        canUpdateWorld={false}
        canAssignScenes={false}
        canDelete={false}
        onWorldsChange={noop}
        onWorldRecordsChange={noop}
        onWorldRelationsChange={noop}
        onSelectWorld={noop}
        onSceneUpdated={noop}
        onRefreshSharedState={refreshNoop}
        onStatus={noop}
      />
    );
    const recovery = renderToStaticMarkup(
      <HitDiceRestCard
        actor={{ id: "actor-1", name: "Mira", data: { hitDicePools: [{ className: "Wizard", size: "d6", current: 1, max: 2 }] } } as unknown as Actor}
        canRest={true}
        onRest={noop}
      />
    );

    expect(world).toMatch(/aria-label="World name"[^>]*readOnly/);
    expect(world).toMatch(/aria-label="World description"[^>]*readOnly/);
    expect(recovery).toContain("Wizard");
    expect(recovery).toContain("1/2d6");
    expect(recovery).toContain('aria-label="Wizard hit dice to spend"');
    expect(recovery).toContain("zero-die short rest still restores eligible short-rest resources");
  });
});
