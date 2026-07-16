import { RefreshCw } from "lucide-react";
import { Component, lazy, Suspense, type ReactNode } from "react";

/**
 * Explicit importers make direct-navigation coverage possible without eagerly
 * pulling every operator tool into the initial tabletop bundle.
 */
export const deferredPanelImporters = {
  admin: () => import("./admin-panel.js"),
  ai: () => import("./ai-panel.js"),
  actor: () => import("./actor-panel.js"),
  campaignMemory: () => import("./campaign-memory-panel.js"),
  campaignWebhooks: () => import("./campaign-webhooks-panel.js"),
  compendium: () => import("./compendium-panel.js"),
  compatibility: () => import("./compatibility-panel.js"),
  contentImport: () => import("./content-import-panel.js"),
  controlledCreatures: () => import("./controlled-creatures-panel.js"),
  dndCharacterReview: () => import("./dnd-character-review-panel.js"),
  dndCustomContent: () => import("./dnd-custom-content-panel.js"),
  dndInventoryCommerce: () => import("./dnd-inventory-commerce-panel.js"),
  sdk: () => import("./sdk-panel.js")
} as const;

/** Backward-compatible name for direct-navigation tests and consumers. */
export const nonAiPanelImporters = deferredPanelImporters;

export const LazyAdminPanel = lazy(async () => ({ default: (await deferredPanelImporters.admin()).AdminPanel }));
export const LazyAiPanel = lazy(async () => ({ default: (await deferredPanelImporters.ai()).AiPanel }));
export const LazyActorPanel = lazy(async () => ({ default: (await deferredPanelImporters.actor()).ActorPanel }));
export const LazyCampaignMemoryPanel = lazy(async () => ({ default: (await deferredPanelImporters.campaignMemory()).CampaignMemoryPanel }));
export const LazyCampaignWebhooksPanel = lazy(async () => ({ default: (await deferredPanelImporters.campaignWebhooks()).CampaignWebhooksPanel }));
export const LazyCompendiumPanel = lazy(async () => ({ default: (await deferredPanelImporters.compendium()).CompendiumPanel }));
export const LazyCompatibilityPanel = lazy(async () => ({ default: (await deferredPanelImporters.compatibility()).CompatibilityPanel }));
export const LazyContentImportPanel = lazy(async () => ({ default: (await deferredPanelImporters.contentImport()).ContentImportPanel }));
export const LazyControlledCreaturesPanel = lazy(async () => ({ default: (await deferredPanelImporters.controlledCreatures()).ControlledCreaturesPanel }));
export const LazyDndCharacterReviewPanel = lazy(async () => ({ default: (await deferredPanelImporters.dndCharacterReview()).DndCharacterReviewPanel }));
export const LazyDndCustomContentPanel = lazy(async () => ({ default: (await deferredPanelImporters.dndCustomContent()).DndCustomContentPanel }));
export const LazyDndInventoryCommercePanel = lazy(async () => ({ default: (await deferredPanelImporters.dndInventoryCommerce()).DndInventoryCommercePanel }));
export const LazySdkPanel = lazy(async () => ({ default: (await deferredPanelImporters.sdk()).SdkPanel }));

interface DeferredPanelBoundaryProps {
  label: string;
  children: ReactNode;
}

export class DeferredPanelErrorBoundary extends Component<DeferredPanelBoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render() {
    if (this.state.failed) {
      return (
        <div className="empty-state" role="alert">
          <p>The {this.props.label} could not be loaded.</p>
          <button className="ghost-button" type="button" onClick={() => window.location.reload()}>Reload workspace</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function DeferredPanel({ label, children }: DeferredPanelBoundaryProps) {
  return (
    <DeferredPanelErrorBoundary label={label}>
      <Suspense fallback={<div className="deferred-panel-fallback" role="status" aria-live="polite"><RefreshCw className="spin" size={16} aria-hidden="true" /> Loading {label}...</div>}>
        {children}
      </Suspense>
    </DeferredPanelErrorBoundary>
  );
}
