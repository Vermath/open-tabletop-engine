import type {
  CampaignWebhookDeliveryStatus,
  CampaignWebhookEnvelopeEventType,
  CampaignWebhookEventType,
} from "@open-tabletop/core";
import { Check, Clipboard, KeyRound, RefreshCw, Send, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from "./api.js";

export interface CampaignWebhooksPanelProps {
  campaignId: string;
  campaignUpdatedAt: string;
  onCampaignUpdatedAt?(updatedAt: string): void;
  onStatus?(message: string): void;
}

interface WebhookDraft {
  name: string;
  url: string;
  eventTypes: CampaignWebhookEventType[];
  enabled: boolean;
}

interface RevealedSecret {
  webhookId: string;
  webhookName: string;
  value: string;
  source: "created" | "rotated";
}

interface MutationAttempt {
  fingerprint: string;
  idempotencyKey: string;
}

interface CampaignWebhookDeliveryInfo {
  id: string;
  campaignId: string;
  webhookId: string;
  eventId: string;
  eventType: CampaignWebhookEnvelopeEventType;
  occurredAt: string;
  resourceType?: string;
  resourceId?: string;
  attempt: number;
  status: CampaignWebhookDeliveryStatus;
  responseStatus?: number;
  responseBytes?: number;
  durationMs?: number;
  deliveredAt?: string;
  failedAt?: string;
  errorCode?: string;
  retryOfDeliveryId?: string;
  initiatedByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

interface CampaignWebhookInfo {
  id: string;
  campaignId: string;
  name: string;
  url: string;
  eventTypes: CampaignWebhookEventType[];
  enabled: boolean;
  secretConfigured: boolean;
  secretHint: string;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
  latestDelivery?: CampaignWebhookDeliveryInfo;
}

interface CampaignWebhookListResult {
  items: CampaignWebhookInfo[];
  supportedEventTypes: CampaignWebhookEventType[];
}

interface CampaignWebhookSecretResult {
  webhook: CampaignWebhookInfo;
  signingSecret?: string;
  signingSecretAlreadyShown?: boolean;
  campaignUpdatedAt?: string;
}

export const campaignWebhookPaths = {
  collection: (campaignId: string) =>
    `/api/v1/campaigns/${encodeURIComponent(campaignId)}/webhooks`,
  webhook: (campaignId: string, webhookId: string) =>
    `/api/v1/campaigns/${encodeURIComponent(campaignId)}/webhooks/${encodeURIComponent(webhookId)}`,
  disable: (campaignId: string, webhookId: string) =>
    `${campaignWebhookPaths.webhook(campaignId, webhookId)}/disable`,
  rotateSecret: (campaignId: string, webhookId: string) =>
    `${campaignWebhookPaths.webhook(campaignId, webhookId)}/rotate-secret`,
  deliveries: (campaignId: string, webhookId: string) =>
    `${campaignWebhookPaths.webhook(campaignId, webhookId)}/deliveries`,
  test: (campaignId: string, webhookId: string) =>
    `${campaignWebhookPaths.webhook(campaignId, webhookId)}/test`,
  retry: (campaignId: string, webhookId: string, deliveryId: string) =>
    `${campaignWebhookPaths.deliveries(campaignId, webhookId)}/${encodeURIComponent(deliveryId)}/retry`,
};

export function campaignWebhookErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      return "This webhook changed after it was loaded. Reload the list, review the current configuration, and try again.";
    }
    if (error.status === 422) {
      return error.message || "The webhook target or event selection was rejected.";
    }
    if (error.status === 403) return "You no longer have permission to manage campaign webhooks.";
    if (error.status === 404) return "This webhook or delivery no longer exists. Reload the list.";
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

export function CampaignWebhooksPanel({
  campaignId,
  campaignUpdatedAt,
  onCampaignUpdatedAt,
  onStatus,
}: CampaignWebhooksPanelProps) {
  const [result, setResult] = useState<CampaignWebhookListResult | null>(null);
  const [loadVersion, setLoadVersion] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [createDraft, setCreateDraft] = useState<WebhookDraft>({
    name: "",
    url: "",
    eventTypes: ["campaign.updated"],
    enabled: true,
  });
  const [editingId, setEditingId] = useState("");
  const [editDraft, setEditDraft] = useState<WebhookDraft | null>(null);
  const [busyAction, setBusyAction] = useState("");
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [deleteConfirmationId, setDeleteConfirmationId] = useState("");
  const [rotationConfirmationId, setRotationConfirmationId] = useState("");
  const [revealedSecret, setRevealedSecret] = useState<RevealedSecret | null>(null);
  const [secretCopyStatus, setSecretCopyStatus] = useState("");
  const [selectedLedgerId, setSelectedLedgerId] = useState("");
  const [deliveryVersion, setDeliveryVersion] = useState(0);
  const [deliveries, setDeliveries] = useState<CampaignWebhookDeliveryInfo[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");
  const attemptsRef = useRef<Record<string, MutationAttempt>>({});

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    apiGet<CampaignWebhookListResult>(campaignWebhookPaths.collection(campaignId), {
      signal: controller.signal,
    })
      .then((next) => {
        if (controller.signal.aborted) return;
        setResult(next);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(campaignWebhookErrorMessage(error));
        setLoading(false);
      });
    return () => controller.abort();
  }, [campaignId, loadVersion]);

  useEffect(() => {
    setEditingId("");
    setEditDraft(null);
    setDeleteConfirmationId("");
    setRotationConfirmationId("");
    setRevealedSecret(null);
    setSelectedLedgerId("");
    setDeliveries([]);
    setActionErrors({});
    attemptsRef.current = {};
  }, [campaignId]);

  useEffect(() => {
    if (!selectedLedgerId) {
      setDeliveries([]);
      setDeliveryError("");
      setDeliveriesLoading(false);
      return;
    }
    const controller = new AbortController();
    setDeliveries([]);
    setDeliveriesLoading(true);
    setDeliveryError("");
    apiGet<CampaignWebhookDeliveryInfo[]>(
      `${campaignWebhookPaths.deliveries(campaignId, selectedLedgerId)}?limit=50`,
      { signal: controller.signal },
    )
      .then((next) => {
        if (controller.signal.aborted) return;
        setDeliveries(next);
        setDeliveriesLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setDeliveryError(campaignWebhookErrorMessage(error));
        setDeliveriesLoading(false);
      });
    return () => controller.abort();
  }, [campaignId, deliveryVersion, selectedLedgerId]);

  const supportedEventTypes = result?.supportedEventTypes ?? createDraft.eventTypes;

  function replaceWebhook(webhook: CampaignWebhookInfo) {
    setResult((current) =>
      current
        ? {
            ...current,
            items: current.items.some((item) => item.id === webhook.id)
              ? current.items.map((item) => (item.id === webhook.id ? webhook : item))
              : [...current.items, webhook],
          }
        : current,
    );
  }

  function setLocalError(scope: string, message: string) {
    setActionErrors((current) => ({ ...current, [scope]: message }));
  }

  function clearLocalError(scope: string) {
    setActionErrors((current) => {
      if (!current[scope]) return current;
      const next = { ...current };
      delete next[scope];
      return next;
    });
  }

  function mutationKey(scope: string, fingerprint: string) {
    const existing = attemptsRef.current[scope];
    if (existing?.fingerprint === fingerprint) return existing.idempotencyKey;
    const attempt = {
      fingerprint,
      idempotencyKey: `campaign-webhook:${scope}:${window.crypto.randomUUID()}`,
    };
    attemptsRef.current[scope] = attempt;
    return attempt.idempotencyKey;
  }

  function finishMutation(scope: string) {
    delete attemptsRef.current[scope];
    setBusyAction("");
    clearLocalError(scope);
  }

  async function createWebhook() {
    const scope = "create";
    if (!createDraft.name.trim() || !createDraft.url.trim() || createDraft.eventTypes.length === 0) {
      setLocalError(scope, "Name, HTTPS endpoint URL, and at least one event are required.");
      return;
    }
    const payload = {
      name: createDraft.name.trim(),
      url: createDraft.url.trim(),
      eventTypes: createDraft.eventTypes,
      enabled: createDraft.enabled,
      expectedCampaignUpdatedAt: campaignUpdatedAt,
    };
    const fingerprint = JSON.stringify(payload);
    setBusyAction(scope);
    clearLocalError(scope);
    try {
      const response = await apiPost<CampaignWebhookSecretResult>(
        campaignWebhookPaths.collection(campaignId),
        payload,
        { idempotencyKey: mutationKey(scope, fingerprint) },
      );
      replaceWebhook(response.webhook);
      if (response.campaignUpdatedAt) onCampaignUpdatedAt?.(response.campaignUpdatedAt);
      if (response.signingSecret) {
        setRevealedSecret({
          webhookId: response.webhook.id,
          webhookName: response.webhook.name,
          value: response.signingSecret,
          source: "created",
        });
        setSecretCopyStatus("");
      } else if (response.signingSecretAlreadyShown) {
        setLocalError(
          scope,
          "This safe retry cannot show the original signing secret again. Rotate the secret if it was not stored.",
        );
      }
      setCreateDraft({ name: "", url: "", eventTypes: ["campaign.updated"], enabled: true });
      delete attemptsRef.current[scope];
      setBusyAction("");
      onStatus?.("Campaign webhook created");
    } catch (error) {
      setLocalError(scope, campaignWebhookErrorMessage(error));
      setBusyAction("");
    }
  }

  function beginEditing(webhook: CampaignWebhookInfo) {
    setEditingId(webhook.id);
    setEditDraft({
      name: webhook.name,
      url: webhook.url,
      eventTypes: [...webhook.eventTypes],
      enabled: webhook.enabled,
    });
    setDeleteConfirmationId("");
    setRotationConfirmationId("");
    clearLocalError(webhook.id);
  }

  async function saveWebhook(webhook: CampaignWebhookInfo) {
    if (!editDraft || editingId !== webhook.id) return;
    const scope = `edit:${webhook.id}`;
    if (!editDraft.name.trim() || !editDraft.url.trim() || editDraft.eventTypes.length === 0) {
      setLocalError(webhook.id, "Name, endpoint URL, and at least one event are required.");
      return;
    }
    const payload = {
      name: editDraft.name.trim(),
      url: editDraft.url.trim(),
      eventTypes: editDraft.eventTypes,
      enabled: editDraft.enabled,
      expectedUpdatedAt: webhook.updatedAt,
    };
    setBusyAction(scope);
    clearLocalError(webhook.id);
    try {
      const updated = await apiPatch<CampaignWebhookInfo>(
        campaignWebhookPaths.webhook(campaignId, webhook.id),
        payload,
        { idempotencyKey: mutationKey(scope, JSON.stringify(payload)) },
      );
      replaceWebhook(updated);
      setEditingId("");
      setEditDraft(null);
      finishMutation(scope);
      onStatus?.(`Webhook ${updated.name} updated`);
    } catch (error) {
      setLocalError(webhook.id, campaignWebhookErrorMessage(error));
      setBusyAction("");
    }
  }

  async function disableWebhook(webhook: CampaignWebhookInfo) {
    const scope = `disable:${webhook.id}`;
    const payload = { expectedUpdatedAt: webhook.updatedAt };
    setBusyAction(scope);
    clearLocalError(webhook.id);
    try {
      const updated = await apiPost<CampaignWebhookInfo>(
        campaignWebhookPaths.disable(campaignId, webhook.id),
        payload,
        { idempotencyKey: mutationKey(scope, JSON.stringify(payload)) },
      );
      replaceWebhook(updated);
      finishMutation(scope);
      onStatus?.(`Webhook ${updated.name} disabled`);
    } catch (error) {
      setLocalError(webhook.id, campaignWebhookErrorMessage(error));
      setBusyAction("");
    }
  }

  async function rotateSecret(webhook: CampaignWebhookInfo) {
    const scope = `rotate:${webhook.id}`;
    const payload = { expectedUpdatedAt: webhook.updatedAt };
    setBusyAction(scope);
    clearLocalError(webhook.id);
    try {
      const response = await apiPost<CampaignWebhookSecretResult>(
        campaignWebhookPaths.rotateSecret(campaignId, webhook.id),
        payload,
        { idempotencyKey: mutationKey(scope, JSON.stringify(payload)) },
      );
      replaceWebhook(response.webhook);
      setRotationConfirmationId("");
      if (response.signingSecret) {
        setRevealedSecret({
          webhookId: response.webhook.id,
          webhookName: response.webhook.name,
          value: response.signingSecret,
          source: "rotated",
        });
        setSecretCopyStatus("");
      } else if (response.signingSecretAlreadyShown) {
        setLocalError(
          webhook.id,
          "This safe retry cannot show the replacement secret again. Rotate once more only if the new secret was lost.",
        );
      }
      finishMutation(scope);
      onStatus?.(`Signing secret rotated for ${response.webhook.name}`);
    } catch (error) {
      setLocalError(webhook.id, campaignWebhookErrorMessage(error));
      setBusyAction("");
    }
  }

  async function deleteWebhook(webhook: CampaignWebhookInfo) {
    const scope = `delete:${webhook.id}`;
    const payload = { expectedUpdatedAt: webhook.updatedAt };
    setBusyAction(scope);
    clearLocalError(webhook.id);
    try {
      await apiDelete<{ webhook: CampaignWebhookInfo; deleted: true }>(
        campaignWebhookPaths.webhook(campaignId, webhook.id),
        {
          body: payload,
          idempotencyKey: mutationKey(scope, JSON.stringify(payload)),
        },
      );
      setResult((current) =>
        current ? { ...current, items: current.items.filter((item) => item.id !== webhook.id) } : current,
      );
      if (selectedLedgerId === webhook.id) setSelectedLedgerId("");
      if (revealedSecret?.webhookId === webhook.id) setRevealedSecret(null);
      setDeleteConfirmationId("");
      finishMutation(scope);
      onStatus?.(`Webhook ${webhook.name} deleted`);
    } catch (error) {
      setLocalError(webhook.id, campaignWebhookErrorMessage(error));
      setBusyAction("");
    }
  }

  async function queueTest(webhook: CampaignWebhookInfo) {
    const scope = `test:${webhook.id}`;
    const payload = { expectedUpdatedAt: webhook.updatedAt };
    setBusyAction(scope);
    clearLocalError(webhook.id);
    try {
      await apiPost<CampaignWebhookDeliveryInfo>(
        campaignWebhookPaths.test(campaignId, webhook.id),
        payload,
        { idempotencyKey: mutationKey(scope, JSON.stringify(payload)) },
      );
      setSelectedLedgerId(webhook.id);
      setDeliveryVersion((version) => version + 1);
      finishMutation(scope);
      onStatus?.(`Test delivery queued for ${webhook.name}`);
    } catch (error) {
      setLocalError(webhook.id, campaignWebhookErrorMessage(error));
      setBusyAction("");
    }
  }

  async function retryDelivery(webhook: CampaignWebhookInfo, delivery: CampaignWebhookDeliveryInfo) {
    const scope = `retry:${delivery.id}`;
    const payload = { expectedUpdatedAt: webhook.updatedAt };
    setBusyAction(scope);
    setDeliveryError("");
    try {
      await apiPost<CampaignWebhookDeliveryInfo>(
        campaignWebhookPaths.retry(campaignId, webhook.id, delivery.id),
        payload,
        { idempotencyKey: mutationKey(scope, JSON.stringify(payload)) },
      );
      setDeliveryVersion((version) => version + 1);
      finishMutation(scope);
      onStatus?.(`Retry queued for ${webhook.name}`);
    } catch (error) {
      setDeliveryError(campaignWebhookErrorMessage(error));
      setBusyAction("");
    }
  }

  async function copySecret() {
    if (!revealedSecret) return;
    if (!navigator.clipboard?.writeText) {
      setSecretCopyStatus("Clipboard access is unavailable. Select the secret and copy it manually.");
      return;
    }
    try {
      await navigator.clipboard.writeText(revealedSecret.value);
      setSecretCopyStatus("Copied. Store it in the receiver's secret manager now.");
    } catch {
      setSecretCopyStatus("Copy was blocked. Select the secret and copy it manually.");
    }
  }

  return (
    <section className="account-box campaign-webhooks-panel" aria-labelledby="campaign-webhooks-title">
      <div className="webhook-panel-heading">
        <div>
          <div className="section-title" id="campaign-webhooks-title">Outbound Webhooks</div>
          <p className="account-summary">
            Send signed, metadata-only campaign events to a receiver you control. Webhooks never accept inbound campaign mutations.
          </p>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Reload campaign webhooks"
          title="Reload webhooks"
          disabled={loading}
          onClick={() => setLoadVersion((version) => version + 1)}
        >
          <RefreshCw className={loading ? "spin" : undefined} size={15} />
        </button>
      </div>

      {revealedSecret && (
        <div className="webhook-secret-callout" role="alert" aria-live="assertive">
          <div className="webhook-callout-title"><KeyRound size={16} /> Signing secret shown once</div>
          <p>
            {revealedSecret.source === "rotated" ? "The old secret is invalid now. " : ""}
            Copy this secret for <strong>{revealedSecret.webhookName}</strong>, store it in the receiver's secret manager, then test delivery. It cannot be recovered or listed later.
          </p>
          <div className="webhook-secret-copy-row">
            <input
              aria-label={`One-time signing secret for ${revealedSecret.webhookName}`}
              readOnly
              spellCheck={false}
              value={revealedSecret.value}
              onFocus={(event) => event.currentTarget.select()}
            />
            <button className="primary-button" type="button" onClick={() => void copySecret()}>
              <Clipboard size={15} /> Copy secret
            </button>
            <button className="ghost-button" type="button" onClick={() => { setRevealedSecret(null); setSecretCopyStatus(""); }}>
              <X size={15} /> Dismiss
            </button>
          </div>
          {secretCopyStatus && <p className="webhook-copy-status" role="status">{secretCopyStatus}</p>}
        </div>
      )}

      <details className="webhook-create-drawer">
        <summary><KeyRound size={15} /> Create webhook</summary>
        <form
          className="webhook-form"
          aria-busy={busyAction === "create"}
          onSubmit={(event) => { event.preventDefault(); void createWebhook(); }}
        >
          <label>
            <span>Name</span>
            <input
              maxLength={80}
              value={createDraft.name}
              placeholder="Session archive receiver"
              onChange={(event) => setCreateDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label>
            <span>HTTPS endpoint URL</span>
            <input
              type="url"
              maxLength={2048}
              value={createDraft.url}
              placeholder="https://hooks.example.com/open-tabletop"
              onChange={(event) => setCreateDraft((current) => ({ ...current, url: event.target.value }))}
            />
          </label>
          <p className="account-summary">
            Production targets must use HTTPS and cannot contain credentials, query strings, fragments, local hosts, or private network addresses. The server resolves and validates the target before every delivery.
          </p>
          <EventTypePicker
            idPrefix="create-webhook"
            eventTypes={supportedEventTypes}
            selected={createDraft.eventTypes}
            onChange={(eventTypes) => setCreateDraft((current) => ({ ...current, eventTypes }))}
          />
          <label className="inline-check">
            <input
              type="checkbox"
              checked={createDraft.enabled}
              onChange={(event) => setCreateDraft((current) => ({ ...current, enabled: event.target.checked }))}
            />
            <span>Enable deliveries immediately</span>
          </label>
          {actionErrors.create && <p className="admin-status" role="alert">{actionErrors.create}</p>}
          <button className="ghost-button wide" type="submit" disabled={busyAction !== "" || loading}>
            {busyAction === "create" ? <RefreshCw className="spin" size={15} /> : <Check size={15} />}
            {busyAction === "create" ? "Creating..." : "Create webhook"}
          </button>
        </form>
      </details>

      {loadError && (
        <div className="webhook-inline-error" role="alert">
          <p>{loadError}</p>
          <button className="ghost-button" type="button" onClick={() => setLoadVersion((version) => version + 1)}>Retry load</button>
        </div>
      )}
      {loading && !result && <p className="account-summary" role="status">Loading campaign webhooks...</p>}
      {!loading && result?.items.length === 0 && <p className="account-summary">No outbound webhooks are configured.</p>}

      <div className="webhook-list">
        {result?.items.map((webhook) => {
          const editing = editingId === webhook.id && editDraft;
          const ledgerOpen = selectedLedgerId === webhook.id;
          return (
            <article className="webhook-card" key={webhook.id} aria-labelledby={`webhook-title-${webhook.id}`}>
              <div className="webhook-card-heading">
                <div>
                  <h3 id={`webhook-title-${webhook.id}`}>{webhook.name}</h3>
                  <div className="webhook-url">{webhook.url}</div>
                </div>
                <span className={`webhook-status webhook-status-${webhook.enabled ? "enabled" : "disabled"}`}>
                  {webhook.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              <dl className="webhook-summary-grid">
                <div><dt>Events</dt><dd>{webhook.eventTypes.length}</dd></div>
                <div><dt>Secret</dt><dd>{webhook.secretConfigured ? `Configured (${webhook.secretHint})` : "Missing"}</dd></div>
                <div><dt>Updated</dt><dd>{formatWebhookDate(webhook.updatedAt)}</dd></div>
                <div><dt>Latest</dt><dd>{webhook.latestDelivery ? webhook.latestDelivery.status : "No deliveries"}</dd></div>
              </dl>

              {editing && (
                <form className="webhook-form webhook-edit-form" onSubmit={(event) => { event.preventDefault(); void saveWebhook(webhook); }}>
                  <label>
                    <span>Name</span>
                    <input maxLength={80} value={editDraft.name} onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })} />
                  </label>
                  <label>
                    <span>HTTPS endpoint URL</span>
                    <input type="url" maxLength={2048} value={editDraft.url} onChange={(event) => setEditDraft({ ...editDraft, url: event.target.value })} />
                  </label>
                  <EventTypePicker
                    idPrefix={`edit-webhook-${webhook.id}`}
                    eventTypes={supportedEventTypes}
                    selected={editDraft.eventTypes}
                    onChange={(eventTypes) => setEditDraft({ ...editDraft, eventTypes })}
                  />
                  <label className="inline-check">
                    <input type="checkbox" checked={editDraft.enabled} onChange={(event) => setEditDraft({ ...editDraft, enabled: event.target.checked })} />
                    <span>Enabled</span>
                  </label>
                  <div className="button-row">
                    <button className="primary-button" type="submit" disabled={busyAction !== ""}>Save webhook</button>
                    <button className="ghost-button" type="button" disabled={busyAction !== ""} onClick={() => { setEditingId(""); setEditDraft(null); }}>Cancel</button>
                  </div>
                </form>
              )}

              {actionErrors[webhook.id] && <p className="admin-status" role="alert">{actionErrors[webhook.id]}</p>}
              <div className="webhook-actions" aria-label={`Actions for ${webhook.name}`}>
                <button className="ghost-button" type="button" disabled={busyAction !== "" || Boolean(editing)} onClick={() => beginEditing(webhook)}>Edit</button>
                {webhook.enabled && (
                  <button className="ghost-button" type="button" disabled={busyAction !== ""} onClick={() => void disableWebhook(webhook)}>Disable</button>
                )}
                <button className="ghost-button" type="button" title="Queue a manual diagnostic delivery, including while automatic delivery is disabled" disabled={busyAction !== ""} onClick={() => void queueTest(webhook)}>
                  <Send size={14} /> Test
                </button>
                <button className="ghost-button" type="button" disabled={busyAction !== ""} onClick={() => { setRotationConfirmationId(webhook.id); setDeleteConfirmationId(""); }}>
                  <KeyRound size={14} /> Rotate secret
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  aria-expanded={ledgerOpen}
                  disabled={busyAction !== ""}
                  onClick={() => setSelectedLedgerId(ledgerOpen ? "" : webhook.id)}
                >
                  {ledgerOpen ? "Hide deliveries" : "Deliveries"}
                </button>
                <button className="ghost-button danger-button" type="button" disabled={busyAction !== ""} onClick={() => { setDeleteConfirmationId(webhook.id); setRotationConfirmationId(""); }}>
                  <Trash2 size={14} /> Delete
                </button>
              </div>

              {rotationConfirmationId === webhook.id && (
                <div className="webhook-confirmation" role="group" aria-label={`Confirm secret rotation for ${webhook.name}`}>
                  <p>Rotation invalidates the current secret immediately. Update the receiver with the new one-time secret before testing.</p>
                  <div className="button-row">
                    <button className="primary-button" type="button" disabled={busyAction !== ""} onClick={() => void rotateSecret(webhook)}>Confirm rotation</button>
                    <button className="ghost-button" type="button" disabled={busyAction !== ""} onClick={() => setRotationConfirmationId("")}>Cancel</button>
                  </div>
                </div>
              )}
              {deleteConfirmationId === webhook.id && (
                <div className="webhook-confirmation danger-zone" role="group" aria-label={`Confirm deletion of ${webhook.name}`}>
                  <p>Delete <strong>{webhook.name}</strong>? This stops future deliveries and cannot be undone.</p>
                  <div className="button-row">
                    <button className="ghost-button danger-button" type="button" disabled={busyAction !== ""} onClick={() => void deleteWebhook(webhook)}>Confirm delete</button>
                    <button className="ghost-button" type="button" disabled={busyAction !== ""} onClick={() => setDeleteConfirmationId("")}>Cancel</button>
                  </div>
                </div>
              )}

              {ledgerOpen && (
                <DeliveryLedger
                  webhook={webhook}
                  deliveries={deliveries}
                  loading={deliveriesLoading}
                  error={deliveryError}
                  busyAction={busyAction}
                  onReload={() => setDeliveryVersion((version) => version + 1)}
                  onRetry={(delivery) => void retryDelivery(webhook, delivery)}
                />
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function EventTypePicker({
  idPrefix,
  eventTypes,
  selected,
  onChange,
}: {
  idPrefix: string;
  eventTypes: CampaignWebhookEventType[];
  selected: CampaignWebhookEventType[];
  onChange(eventTypes: CampaignWebhookEventType[]): void;
}) {
  const selectedSet = new Set(selected);
  return (
    <fieldset className="webhook-event-picker">
      <legend>Event subscriptions ({selected.length} selected)</legend>
      <div className="button-row">
        <button className="ghost-button" type="button" onClick={() => onChange([...eventTypes])}>Select all</button>
        <button className="ghost-button" type="button" onClick={() => onChange([])}>Clear</button>
      </div>
      <div className="webhook-event-grid">
        {eventTypes.map((eventType) => {
          const id = `${idPrefix}-${eventType.replace(/[^a-zA-Z0-9]+/g, "-")}`;
          return (
            <label className="inline-check" htmlFor={id} key={eventType}>
              <input
                id={id}
                type="checkbox"
                checked={selectedSet.has(eventType)}
                onChange={(event) => onChange(
                  event.target.checked
                    ? [...selected, eventType]
                    : selected.filter((candidate) => candidate !== eventType),
                )}
              />
              <span>{eventType}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function DeliveryLedger({
  webhook,
  deliveries,
  loading,
  error,
  busyAction,
  onReload,
  onRetry,
}: {
  webhook: CampaignWebhookInfo;
  deliveries: CampaignWebhookDeliveryInfo[];
  loading: boolean;
  error: string;
  busyAction: string;
  onReload(): void;
  onRetry(delivery: CampaignWebhookDeliveryInfo): void;
}) {
  return (
    <div className="webhook-delivery-ledger" aria-label={`Delivery ledger for ${webhook.name}`}>
      <div className="webhook-ledger-heading">
        <strong>Delivery ledger</strong>
        <button className="icon-button" type="button" aria-label={`Reload deliveries for ${webhook.name}`} disabled={loading} onClick={onReload}>
          <RefreshCw className={loading ? "spin" : undefined} size={14} />
        </button>
      </div>
      <p className="account-summary">Metadata only; request bodies, response bodies, headers, and secrets are never stored here.</p>
      {error && <p className="admin-status" role="alert">{error}</p>}
      {loading && <p className="account-summary" role="status">Loading deliveries...</p>}
      {!loading && deliveries.length === 0 && <p className="account-summary">No delivery attempts yet.</p>}
      {deliveries.length > 0 && (
        <div className="webhook-ledger-table-wrap">
          <table className="webhook-ledger-table">
            <caption className="sr-only">Newest 50 delivery attempts for {webhook.name}</caption>
            <thead><tr><th>Event</th><th>Status</th><th>Attempt</th><th>Transport</th><th>Created</th><th>Action</th></tr></thead>
            <tbody>
              {deliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td><code>{delivery.eventType}</code>{delivery.retryOfDeliveryId ? <small>Retry of {delivery.retryOfDeliveryId}</small> : null}</td>
                  <td><span className={`webhook-status webhook-delivery-${delivery.status}`}>{delivery.status}</span></td>
                  <td>{delivery.attempt}</td>
                  <td>{deliveryTransportSummary(delivery)}</td>
                  <td>{formatWebhookDate(delivery.createdAt)}</td>
                  <td>
                    {delivery.status === "failed" ? (
                      <button className="ghost-button" type="button" title="Queue a manual diagnostic retry, including while automatic delivery is disabled" disabled={busyAction !== ""} onClick={() => onRetry(delivery)}>
                        Retry
                      </button>
                    ) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function deliveryTransportSummary(delivery: CampaignWebhookDeliveryInfo): string {
  const parts = [
    delivery.responseStatus ? `HTTP ${delivery.responseStatus}` : undefined,
    delivery.durationMs !== undefined ? `${delivery.durationMs} ms` : undefined,
    delivery.responseBytes !== undefined ? `${delivery.responseBytes} B` : undefined,
    delivery.errorCode,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" / ") || "Pending";
}

function formatWebhookDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}
