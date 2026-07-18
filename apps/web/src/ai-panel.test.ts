import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { aiAgentReadinessPresentation } from "./ai-readiness.js";
import { aiStudioProviderActionAvailable, aiStudioReadiness, type AiStudioReadinessPolicy } from "./ai-panel.js";

const configuredPolicy: AiStudioReadinessPolicy = {
  enabled: true,
  status: "enabled",
  readinessIssues: [],
  provider: {
    id: "codex-app-server",
    label: "Codex App Server",
    configured: true,
    status: "configured",
    message: "Codex App Server is configured. Connectivity and authentication are checked when AI work starts."
  }
};

describe("AI Studio availability", () => {
  it("exposes AI Studio through the permission-gated workspace navigation", () => {
    const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
    expect(appSource).toContain('...(canUseAiStudioWorkspace ? [{ id: "ai" as const, label: "AI Studio"');
  });

  it("does not present loading, missing-provider, or disabled policy states as ready", () => {
    expect(aiStudioReadiness(undefined, "loading")).toMatchObject({ providerBackedActionsAvailable: false, label: "Checking AI configuration" });
    expect(aiStudioReadiness({ ...configuredPolicy, provider: { ...configuredPolicy.provider!, configured: false, status: "unavailable", message: "Configure Codex app-server." } }, "loaded")).toMatchObject({ providerBackedActionsAvailable: false, label: "AI provider unavailable" });
    expect(aiStudioReadiness({ ...configuredPolicy, enabled: false, status: "disabled" }, "loaded")).toMatchObject({ providerBackedActionsAvailable: false, label: "AI disabled" });
  });

  it("calls a configured provider configured without claiming connectivity was preflighted", () => {
    expect(aiStudioReadiness(configuredPolicy, "loaded")).toEqual({
      providerBackedActionsAvailable: true,
      label: "AI configured",
      detail: configuredPolicy.provider?.message,
      statusClass: "completed"
    });
  });

  it("gates provider-backed actions on both capability and effective AI readiness", () => {
    const unavailable = aiStudioReadiness({ ...configuredPolicy, status: "unsafe_configuration", readinessIssues: ["Campaign AI policy must be explicitly reviewed."] }, "loaded");
    const available = aiStudioReadiness(configuredPolicy, "loaded");

    expect(aiStudioProviderActionAvailable(true, unavailable)).toBe(false);
    expect(aiStudioProviderActionAvailable(false, available)).toBe(false);
    expect(aiStudioProviderActionAvailable(true, available)).toBe(true);
  });

  it("uses effective readiness for every provider-backed creation and replay control", () => {
    const source = readFileSync(resolve(__dirname, "ai-panel.tsx"), "utf8");
    expect(source).toContain("disabled={!providerActionAvailable(props.canRecapSession)}");
    expect(source).toContain("disabled={!providerActionAvailable(props.canGenerateMap)}");
    expect(source).toContain("disabled={!providerActionAvailable(props.canGenerateToken)}");
    expect(source).toContain("disabled={!providerActionAvailable(props.canGenerateTokenBatch)}");
    expect(source).toContain("disabled={!providerActionAvailable(props.canDraftEncounter)}");
    expect(source).toContain("disabled={!providerActionAvailable(props.canPropose)}");
  });
});

describe("AI Agent availability", () => {
  it("replaces ready labels and disables the composer when effective AI readiness is unavailable", () => {
    const readiness = aiStudioReadiness({
      ...configuredPolicy,
      status: "unsafe_configuration",
      readinessIssues: ["Campaign AI policy must be explicitly reviewed."]
    }, "loaded");

    expect(aiAgentReadinessPresentation(readiness, false, 0, "Agent ready")).toEqual({
      headerStatus: "AI configuration required",
      pillLabel: "Unavailable",
      composerDisabled: true
    });
  });

  it("keeps truthful ready and working states when provider-backed actions are available", () => {
    const readiness = aiStudioReadiness(configuredPolicy, "loaded");

    expect(aiAgentReadinessPresentation(readiness, false, 0, "Agent ready")).toEqual({
      headerStatus: "Agent ready",
      pillLabel: "Ready",
      composerDisabled: false
    });
    expect(aiAgentReadinessPresentation(readiness, true, 0, "Agent working")).toEqual({
      headerStatus: "Agent working",
      pillLabel: "Working",
      composerDisabled: true
    });
  });

  it("wires the floating panel labels, submit paths, and inputs to effective readiness without blocking proposal review", () => {
    const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
    expect(appSource).toContain("useAiStudioReadiness(props.localDemo ? undefined : props.campaignId)");
    expect(appSource).toContain("<strong>{readinessPresentation.headerStatus}</strong>");
    expect(appSource).toContain('<span className="ai-agent-status-pill">{readinessPresentation.pillLabel}</span>');
    expect(appSource).toContain('aria-label="AI Agent availability"');
    expect(appSource).toContain("if (!readinessPresentation.composerDisabled) props.onSend();");
    expect(appSource).toContain("disabled={readinessPresentation.composerDisabled}");
    expect(appSource).toContain("disabled={readinessPresentation.composerDisabled || !props.prompt.trim()}");
    expect(appSource).toContain("if (readinessPresentation.composerDisabled || initialPromptFocusCompleteRef.current) return;");
    expect(appSource).toContain("initialPromptFocusCompleteRef.current = true;");
    expect(appSource).toContain('disabled={!props.canApply} onClick={() => props.onApply(proposal)}');
  });
});
