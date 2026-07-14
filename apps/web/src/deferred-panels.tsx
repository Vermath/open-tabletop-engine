import { lazy } from "react";

/**
 * Explicit importers make direct-navigation coverage possible without eagerly
 * pulling every operator tool into the initial tabletop bundle.
 */
export const nonAiPanelImporters = {
  actor: () => import("./actor-panel.js"),
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

export const LazyActorPanel = lazy(async () => ({ default: (await nonAiPanelImporters.actor()).ActorPanel }));
export const LazyCampaignWebhooksPanel = lazy(async () => ({ default: (await nonAiPanelImporters.campaignWebhooks()).CampaignWebhooksPanel }));
export const LazyCompendiumPanel = lazy(async () => ({ default: (await nonAiPanelImporters.compendium()).CompendiumPanel }));
export const LazyCompatibilityPanel = lazy(async () => ({ default: (await nonAiPanelImporters.compatibility()).CompatibilityPanel }));
export const LazyContentImportPanel = lazy(async () => ({ default: (await nonAiPanelImporters.contentImport()).ContentImportPanel }));
export const LazyControlledCreaturesPanel = lazy(async () => ({ default: (await nonAiPanelImporters.controlledCreatures()).ControlledCreaturesPanel }));
export const LazyDndCharacterReviewPanel = lazy(async () => ({ default: (await nonAiPanelImporters.dndCharacterReview()).DndCharacterReviewPanel }));
export const LazyDndCustomContentPanel = lazy(async () => ({ default: (await nonAiPanelImporters.dndCustomContent()).DndCustomContentPanel }));
export const LazyDndInventoryCommercePanel = lazy(async () => ({ default: (await nonAiPanelImporters.dndInventoryCommerce()).DndInventoryCommercePanel }));
export const LazySdkPanel = lazy(async () => ({ default: (await nonAiPanelImporters.sdk()).SdkPanel }));
