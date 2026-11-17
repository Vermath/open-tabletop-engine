import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContentImportPanel } from "./content-import-panel.js";

const source = readFileSync(resolve(__dirname, "content-import-panel.tsx"), "utf8");
const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");

type ContentImportPanelProps = Parameters<typeof ContentImportPanel>[0];

function renderPanel(overrides: Partial<ContentImportPanelProps> = {}) {
  const props: ContentImportPanelProps = {
    assets: [],
    assetSearch: "",
    setAssetSearch: () => undefined,
    assetFolder: "",
    setAssetFolder: () => undefined,
    assetTags: "",
    setAssetTags: () => undefined,
    assetStatus: "",
    onRetryFailedAssetUpload: async () => undefined,
    onDismissFailedAssetUpload: () => undefined,
    lifecycleReason: "",
    setLifecycleReason: () => undefined,
    onUploadAsset: async () => undefined,
    onSetSceneBackground: async () => undefined,
    onPlaceAssetToken: async () => undefined,
    onUpdateAssetMetadata: async () => undefined,
    onUpdateAssetLifecycle: async () => undefined,
    onCreateAssetDeliveryUrl: async () => undefined,
    imports: [],
    kind: "journal",
    setKind: () => undefined,
    name: "",
    setName: () => undefined,
    body: "",
    setBody: () => undefined,
    status: "",
    onPreview: async () => undefined,
    onAnalyzePdf: async () => undefined,
    onApply: async () => undefined,
    onRollback: async () => undefined,
    onDelete: async () => undefined,
    canManage: true,
    canProposeAiChanges: true,
    canCreateAsset: true,
    canUpdateScene: true,
    canCreateToken: true,
    ...overrides
  };
  return renderToStaticMarkup(createElement(ContentImportPanel, props));
}

function elementOpeningTag(html: string, marker: string) {
  const markerIndex = html.indexOf(marker);
  expect(markerIndex).toBeGreaterThanOrEqual(0);
  const start = html.lastIndexOf("<", markerIndex);
  const end = html.indexOf(">", start);
  return html.slice(start, end + 1);
}

describe("ContentImportPanel PDF import controls", () => {
  it("exposes a PDF upload path for AI-assisted content import", () => {
    expect(source).toContain("onAnalyzePdf");
    expect(source).toContain('accept="application/pdf"');
    expect(source).toContain("Analyze PDF");
    expect(source).toContain("Codex PDF");
  });

  it("uses both API-required permissions from the shared App permission state", () => {
    expect(appSource).toContain('canManage={hasPermission("campaign.update")} canProposeAiChanges={hasPermission("ai.proposeChanges")}');
  });

  it("disables PDF selection and analysis with an explanation without AI proposal permission", () => {
    const reason = "Codex PDF analysis requires ai.proposeChanges permission.";
    const html = renderPanel({ canManage: true, canProposeAiChanges: false });
    const pdfInput = elementOpeningTag(html, 'id="content-import-pdf-upload"');
    const chooseButton = elementOpeningTag(html, reason);

    expect(pdfInput).toContain('disabled=""');
    expect(chooseButton).toContain('disabled=""');
    expect(html.match(new RegExp(reason.replaceAll(".", "\\."), "g"))).toHaveLength(3);
  });

  it("enables PDF selection when both required permissions are present", () => {
    const html = renderPanel({ canManage: true, canProposeAiChanges: true });
    const pdfInput = elementOpeningTag(html, 'id="content-import-pdf-upload"');
    const chooseButton = elementOpeningTag(html, 'title="Choose a PDF for Codex analysis"');

    expect(pdfInput).not.toContain("disabled");
    expect(chooseButton).not.toContain("disabled");
    expect(html).not.toContain("Codex PDF analysis requires");
  });

  it("binds background file selection to the named selected scene", () => {
    expect(source).toContain("`Upload background for ${props.selectedScene.name}`");
    expect(source).toContain("`Upload background file for ${props.selectedScene.name}`");
    expect(source).toContain("data-scene-id={props.selectedScene?.id}");
    expect(source).toContain("disabled={!props.canCreateAsset || !props.canUpdateScene || !props.selectedScene}");
  });
});
