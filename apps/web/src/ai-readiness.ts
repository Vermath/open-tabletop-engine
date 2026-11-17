import { useEffect, useState } from "react";
import { apiGet } from "./api.js";

export interface AiStudioReadinessPolicy {
  enabled: boolean;
  status: "enabled" | "disabled" | "unsafe_configuration";
  readinessIssues: string[];
  provider?: {
    id: string;
    label: string;
    configured: boolean;
    status: "configured" | "unavailable";
    message: string;
  };
}

export interface AiStudioReadiness {
  providerBackedActionsAvailable: boolean;
  label: string;
  detail: string;
  statusClass: "completed" | "failed" | "running";
}

export function aiStudioReadiness(policy: AiStudioReadinessPolicy | undefined, state: "loading" | "loaded" | "error" | "no_campaign", error = ""): AiStudioReadiness {
  if (state === "no_campaign") return { providerBackedActionsAvailable: false, label: "AI unavailable", detail: "Select a campaign to inspect its AI configuration.", statusClass: "failed" };
  if (state === "loading") return { providerBackedActionsAvailable: false, label: "Checking AI configuration", detail: "Provider and campaign policy status are loading.", statusClass: "running" };
  if (state === "error" || !policy) return { providerBackedActionsAvailable: false, label: "AI status unavailable", detail: error || "Provider and campaign policy status could not be confirmed.", statusClass: "failed" };
  if (policy.provider?.status !== "configured") return { providerBackedActionsAvailable: false, label: "AI provider unavailable", detail: policy.provider?.message ?? "No live AI provider configuration was reported by the server.", statusClass: "failed" };
  if (policy.status === "unsafe_configuration") return { providerBackedActionsAvailable: false, label: "AI configuration required", detail: policy.readinessIssues.join(" ") || "AI policy configuration is incomplete.", statusClass: "failed" };
  if (!policy.enabled) return { providerBackedActionsAvailable: false, label: "AI disabled", detail: "AI calls are disabled by installation or campaign policy. Review Safety & Privacy in Ops.", statusClass: "failed" };
  return { providerBackedActionsAvailable: true, label: "AI configured", detail: policy.provider.message, statusClass: "completed" };
}

export function aiStudioProviderActionAvailable(capabilityAvailable: boolean, readiness: Pick<AiStudioReadiness, "providerBackedActionsAvailable">): boolean {
  return capabilityAvailable && readiness.providerBackedActionsAvailable;
}

export function useAiStudioReadiness(campaignId: string | undefined): AiStudioReadiness {
  const [state, setState] = useState<{
    campaignId?: string;
    policy?: AiStudioReadinessPolicy;
    loading: boolean;
    error: string;
  }>({ loading: Boolean(campaignId), error: "" });

  useEffect(() => {
    if (!campaignId) {
      setState({ loading: false, error: "" });
      return;
    }
    const controller = new AbortController();
    setState({ campaignId, loading: true, error: "" });
    apiGet<AiStudioReadinessPolicy>(`/api/v1/campaigns/${encodeURIComponent(campaignId)}/ai/policy`, { signal: controller.signal })
      .then((policy) => {
        if (!controller.signal.aborted) setState({ campaignId, policy, loading: false, error: "" });
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setState({ campaignId, loading: false, error: loadError instanceof Error ? loadError.message : "AI configuration could not be loaded." });
      });
    return () => controller.abort();
  }, [campaignId]);

  if (!campaignId) return aiStudioReadiness(undefined, "no_campaign");
  if (state.campaignId !== campaignId || state.loading) return aiStudioReadiness(undefined, "loading");
  if (state.error) return aiStudioReadiness(undefined, "error", state.error);
  return aiStudioReadiness(state.policy, "loaded");
}

export function aiAgentReadinessPresentation(readiness: AiStudioReadiness, busy: boolean, proposalCount: number, operationStatus: string): {
  headerStatus: string;
  pillLabel: string;
  composerDisabled: boolean;
} {
  return {
    headerStatus: busy || readiness.providerBackedActionsAvailable ? operationStatus : readiness.label,
    pillLabel: busy
      ? "Working"
      : proposalCount > 0
        ? `${proposalCount} ${proposalCount === 1 ? "proposal" : "proposals"}`
        : readiness.providerBackedActionsAvailable
          ? "Ready"
          : readiness.statusClass === "running"
            ? "Checking"
            : "Unavailable",
    composerDisabled: busy || !readiness.providerBackedActionsAvailable
  };
}
