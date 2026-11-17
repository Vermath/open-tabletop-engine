import type { Scene } from "@open-tabletop/core";
import { Check, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, type Snapshot } from "./api.js";
import { isStaleWriteError, sharedMutationIdempotencyKey, staleDraftPreservedMessage } from "./shared-mutation.js";

export type SceneDelegationPermission = "scene.read" | "scene.update";

export interface SceneDelegation {
  userId: string;
  permissions: SceneDelegationPermission[];
}

interface SceneDelegationListResult {
  sceneId: string;
  updatedAt: string;
  delegations: SceneDelegation[];
}

interface SceneDelegationUpdateResult extends SceneDelegation {
  sceneId: string;
  updatedAt: string;
}

interface SceneDelegationPanelProps {
  scene: Scene;
  members: Snapshot["members"];
  currentUserId: string;
  onSceneChange(scene: Scene): void;
  onStatus(message: string): void;
}

export function normalizeSceneDelegationPermissions(read: boolean, update: boolean): SceneDelegationPermission[] {
  return update ? ["scene.read", "scene.update"] : read ? ["scene.read"] : [];
}

export function sceneDelegationChanged(base: readonly SceneDelegationPermission[], draft: readonly SceneDelegationPermission[]): boolean {
  return normalizeSceneDelegationPermissions(base.includes("scene.read"), base.includes("scene.update")).join("|") !== normalizeSceneDelegationPermissions(draft.includes("scene.read"), draft.includes("scene.update")).join("|");
}

function delegationPath(sceneId: string): string {
  return `/api/v1/scenes/${encodeURIComponent(sceneId)}/delegations`;
}

function memberDelegationPath(sceneId: string, userId: string): string {
  return `${delegationPath(sceneId)}/${encodeURIComponent(userId)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "Scene access could not be updated.";
}

function delegationMap(delegations: readonly SceneDelegation[]): Record<string, SceneDelegationPermission[]> {
  return Object.fromEntries(delegations.map((delegation) => [delegation.userId, [...delegation.permissions]]));
}

export function SceneDelegationPanel({ scene, members, currentUserId, onSceneChange, onStatus }: SceneDelegationPanelProps) {
  const [delegations, setDelegations] = useState<SceneDelegation[]>([]);
  const [drafts, setDrafts] = useState<Record<string, SceneDelegationPermission[]>>({});
  const [updatedAt, setUpdatedAt] = useState(scene.updatedAt);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [busyUserId, setBusyUserId] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const activeMembers = useMemo(() => members.filter((member) => member.active !== false && member.user.id !== currentUserId), [currentUserId, members]);
  const baseByUserId = useMemo(() => delegationMap(delegations), [delegations]);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");
    setError("");
    void apiGet<SceneDelegationListResult>(delegationPath(scene.id), { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setDelegations(result.delegations);
        setDrafts(delegationMap(result.delegations));
        setUpdatedAt(result.updatedAt);
        setLoadState("ready");
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setError(errorMessage(failure));
        setLoadState("error");
      });
    return () => controller.abort();
  }, [scene.id, reloadVersion]);

  function setPermission(userId: string, permission: SceneDelegationPermission, checked: boolean) {
    setDrafts((current) => {
      const existing = current[userId] ?? baseByUserId[userId] ?? [];
      if (permission === "scene.update") return { ...current, [userId]: normalizeSceneDelegationPermissions(existing.includes("scene.read") || checked, checked) };
      return { ...current, [userId]: normalizeSceneDelegationPermissions(checked, checked && existing.includes("scene.update")) };
    });
  }

  async function save(userId: string) {
    const permissions = drafts[userId] ?? baseByUserId[userId] ?? [];
    const idempotencyKey = sharedMutationIdempotencyKey(`scene-delegation:${scene.id}:${userId}`, updatedAt, permissions);
    setBusyUserId(userId);
    setError("");
    try {
      const result = await apiPatch<SceneDelegationUpdateResult>(memberDelegationPath(scene.id, userId), { permissions, expectedUpdatedAt: updatedAt }, { idempotencyKey });
      const nextDelegations = [...delegations.filter((delegation) => delegation.userId !== userId), ...(result.permissions.length > 0 ? [{ userId, permissions: result.permissions }] : [])];
      const nextPermissions = { ...(scene.permissions ?? {}) };
      if (result.permissions.length > 0) nextPermissions[userId] = result.permissions;
      else delete nextPermissions[userId];
      setDelegations(nextDelegations);
      setDrafts((current) => ({ ...current, [userId]: result.permissions }));
      setUpdatedAt(result.updatedAt);
      onSceneChange({ ...scene, updatedAt: result.updatedAt, permissions: Object.keys(nextPermissions).length > 0 ? nextPermissions : undefined });
      const member = activeMembers.find((candidate) => candidate.user.id === userId);
      onStatus(`${member?.user.displayName ?? "Member"} scene access updated`);
    } catch (failure) {
      if (isStaleWriteError(failure)) {
        try {
          const [currentScene, currentDelegations] = await Promise.all([
            apiGet<Scene>(`/api/v1/scenes/${encodeURIComponent(scene.id)}`),
            apiGet<SceneDelegationListResult>(delegationPath(scene.id)),
          ]);
          setDelegations(currentDelegations.delegations);
          setUpdatedAt(currentDelegations.updatedAt);
          onSceneChange(currentScene);
          setError(staleDraftPreservedMessage);
          onStatus(staleDraftPreservedMessage);
          return;
        } catch (reloadError) {
          setError(`${staleDraftPreservedMessage} Latest access reload failed: ${errorMessage(reloadError)}`);
          return;
        }
      }
      setError(errorMessage(failure));
    } finally {
      setBusyUserId("");
    }
  }

  return (
    <section className="account-box scene-delegation-panel" aria-labelledby={`scene-delegation-title-${scene.id}`}>
      <div className="operator-heading">
        <div>
          <span className="section-title">Scene access</span>
          <h3 id={`scene-delegation-title-${scene.id}`}>Delegation for {scene.name}</h3>
        </div>
        <ShieldCheck size={18} aria-hidden="true" />
      </div>
      <p className="account-summary">Grant access to this scene only. Campaign-wide permissions still apply and cannot be removed here.</p>
      {loadState === "loading" && <p className="panel-status" role="status">Loading scene access...</p>}
      {loadState === "error" && <button className="ghost-button" type="button" onClick={() => setReloadVersion((version) => version + 1)}><RefreshCw size={14} /> Retry scene access</button>}
      {loadState === "ready" && activeMembers.length === 0 && <p className="empty-state compact">No other active campaign members.</p>}
      {loadState === "ready" && activeMembers.length > 0 && (
        <div className="scene-delegation-list" role="list" aria-label="Scene member delegations">
          {activeMembers.map((member) => {
            const base = baseByUserId[member.user.id] ?? [];
            const draft = drafts[member.user.id] ?? base;
            const changed = sceneDelegationChanged(base, draft);
            const busy = busyUserId === member.user.id;
            const campaignWide = member.permissions.includes("scene.update") ? "Campaign-wide edit access" : member.permissions.includes("scene.read") ? "Campaign-wide view access" : "No campaign-wide scene access";
            return (
              <article key={member.user.id} role="listitem">
                <div>
                  <strong>{member.user.displayName || member.user.email}</strong>
                  <span>{member.role} · {campaignWide}</span>
                </div>
                <label className="inline-check"><input type="checkbox" checked={draft.includes("scene.read")} onChange={(event) => setPermission(member.user.id, "scene.read", event.target.checked)} /><span>View</span></label>
                <label className="inline-check"><input type="checkbox" checked={draft.includes("scene.update")} onChange={(event) => setPermission(member.user.id, "scene.update", event.target.checked)} /><span>Edit</span></label>
                <button className="ghost-button" type="button" disabled={!changed || busy} onClick={() => void save(member.user.id)}><Check size={14} /> {busy ? "Saving..." : changed ? "Save access" : "Saved"}</button>
              </article>
            );
          })}
        </div>
      )}
      {error && <p className="creator-error" role="alert">{error}</p>}
    </section>
  );
}
